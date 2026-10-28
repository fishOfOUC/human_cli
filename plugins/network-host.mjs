import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { readFileSync, existsSync } from 'node:fs';
import { fail } from '../core/errors.mjs';
import { SPI_VERSION, rpc, decodeOutput, validateEndpoint } from './spi-rpc.mjs';

export function readProviders(path) {
  if (!existsSync(path)) return [];
  const config = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  fail(config.version === 1 && Array.isArray(config.providers), 'E_SPI_CONFIG', 'providers.json 需要 version: 1 和 providers 数组。');
  return config.providers.filter((p) => p.enabled !== false).map((p) => {
    fail(typeof p.id === 'string' && /^[a-z][a-z0-9.-]{0,127}$/.test(p.id), 'E_SPI_CONFIG', '服务提供者需要有效 id。');
    validateEndpoint(p.url); fail(p.token === undefined || typeof p.token === 'string', 'E_SPI_CONFIG', 'token 必须为字符串。');
    return { id: p.id, url: p.url, token: p.token };
  });
}
export class NetworkPluginHost {
  constructor(providers, { pollMs = 200, rpcTimeoutMs = 10000 } = {}) {
    this.providers = providers; this.pollMs = pollMs; this.rpcTimeoutMs = rpcTimeoutMs;
    this.definitions = new Map(); this.loadErrors = []; this.ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
  }
  async initialize() {
    const discovered = await Promise.allSettled(this.providers.map((p) => rpc(p, 'spi.describe', {}, { timeoutMs: this.rpcTimeoutMs })));
    for (let i = 0; i < discovered.length; i++) {
      const provider = this.providers[i], response = discovered[i];
      try {
        if (response.status !== 'fulfilled') throw response.reason;
        fail(response.value.spiVersion === SPI_VERSION && Array.isArray(response.value.plugins), 'E_SPI_VERSION', '不兼容的 SPI 版本或插件目录。');
        fail(response.value.plugins.length <= 100, 'E_SPI_CATALOG', '单个 SPI 服务最多提供 100 个插件。');
        for (const manifest of response.value.plugins) {
          fail(manifest.apiVersion === 1 && /^[a-z][a-z0-9.-]{0,127}$/.test(manifest.id), 'E_SPI_MANIFEST', '插件缺少有效 id 或 apiVersion。');
          fail(typeof manifest.name === 'string' && manifest.name.length <= 60 && ['left', 'right'].includes(manifest.side) && manifest.configSchema?.type === 'object', 'E_SPI_MANIFEST', '无效插件清单。');
          fail(!this.definitions.has(manifest.id), 'E_PLUGIN_DUPLICATE', `插件 ID 重复：${manifest.id}`);
          const clean = { apiVersion: 1, id: manifest.id, name: manifest.name, version: String(manifest.version || '1'), description: String(manifest.description || ''), icon: manifest.icon || 'puzzle', side: manifest.side, configSchema: manifest.configSchema, providerId: provider.id };
          this.definitions.set(clean.id, { manifest: clean, provider, validate: this.ajv.compile(clean.configSchema) });
        }
      } catch (error) { this.loadErrors.push({ folder: provider.id, message: error.message }); }
    }
    return this;
  }
  get(id) { const definition = this.definitions.get(id); fail(definition, 'E_PLUGIN_MISSING', `SPI 服务未提供插件：${id}`, 404); return definition; }
  list() { return [...this.definitions.values()].map((d) => d.manifest); }
  validateConfig(id, config) {
    const definition = this.get(id), result = structuredClone(config);
    fail(definition.validate(result), 'E_PLUGIN_CONFIG', `插件配置无效：${this.ajv.errorsText(definition.validate.errors)}`);
    return result;
  }
  async execute(id, context, { signal, runId = randomUUID() } = {}) {
    const { provider } = this.get(id), options = { signal, timeoutMs: this.rpcTimeoutMs };
    let finished = false;
    try {
      await rpc(provider, 'spi.start', { runId, pluginId: id, ...context }, options);
      while (true) {
        const job = await rpc(provider, 'spi.status', { runId }, options);
        fail(job.runId === runId, 'E_SPI_PROTOCOL', 'SPI 运行 ID 不匹配。');
        if (job.state === 'completed') { const output = decodeOutput(job.output); finished = true; return output; }
        if (job.state === 'failed' || job.state === 'cancelled') throw Object.assign(new Error(job.error?.message || 'SPI 任务已取消。'), { code: job.error?.code || 'E_SPI_CANCELLED', details: job.error?.details });
        fail(job.state === 'running', 'E_SPI_PROTOCOL', 'SPI 返回未知运行状态。');
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(Object.assign(new Error('请求已变更，运行已停止。'), { code: 'E_REQUEST_CHANGED' })); };
          const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, this.pollMs);
          signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
        });
      }
    } finally {
      // A lost connection cannot change a human request. Cancellation is scoped
      // to this plugin job; final output has already been copied into local state.
      if (!finished) await rpc(provider, 'spi.cancel', { runId }, { timeoutMs: Math.min(1000, this.rpcTimeoutMs) }).catch(() => {});
      await rpc(provider, 'spi.forget', { runId }, { timeoutMs: Math.min(1000, this.rpcTimeoutMs) }).catch(() => {});
    }
  }
}
