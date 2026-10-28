import { Worker } from 'node:worker_threads';
import { readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import Ajv from 'ajv';
import { fail } from '../core/errors.mjs';

const permissions = ['screen.capture', 'clipboard.read', 'clipboard.write', 'shell.openUrl', 'system.info'];
export class PluginHost {
  constructor(roots, capabilities, { timeoutMs = 30000 } = {}) {
    this.definitions = new Map(); this.capabilities = capabilities; this.timeoutMs = timeoutMs;
    this.ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
    this.loadErrors = [];
    for (const root of roots) if (existsSync(root)) for (const folder of readdirSync(root, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      try { this.load(resolve(root, folder.name)); } catch (error) { this.loadErrors.push({ folder: folder.name, message: error.message }); }
    }
  }
  load(directory) {
    const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
    fail(manifest.apiVersion === 1 && /^[a-z][a-z0-9.-]{0,127}$/.test(manifest.id), 'E_PLUGIN_MANIFEST', '插件必须声明 apiVersion: 1 和有效的 id。');
    fail(typeof manifest.name === 'string' && manifest.name.length <= 60 && typeof manifest.entry === 'string', 'E_PLUGIN_MANIFEST', '插件缺少名称或入口。');
    fail(!this.definitions.has(manifest.id), 'E_PLUGIN_DUPLICATE', `插件 ID 重复：${manifest.id}`);
    fail(['left', 'right'].includes(manifest.side), 'E_PLUGIN_MANIFEST', '插件 side 必须为 left 或 right。');
    fail(Array.isArray(manifest.permissions) && manifest.permissions.every((p) => permissions.includes(p)), 'E_PLUGIN_PERMISSION', '插件包含不支持的宿主能力。');
    fail(manifest.configSchema?.type === 'object', 'E_PLUGIN_SCHEMA', 'configSchema 必须为 object。');
    const entry = realpathSync(resolve(directory, manifest.entry));
    const rel = relative(realpathSync(directory), entry);
    fail(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'E_PLUGIN_ENTRY', '插件入口必须位于插件目录内。');
    const validate = this.ajv.compile(manifest.configSchema);
    this.definitions.set(manifest.id, { manifest: { ...manifest, icon: manifest.icon || 'puzzle' }, entry, validate });
  }
  get(id) { const plugin = this.definitions.get(id); fail(plugin, 'E_PLUGIN_MISSING', `未安装插件：${id}`, 404); return plugin; }
  list() { return [...this.definitions.values()].map((p) => p.manifest); }
  validateConfig(id, config) {
    const plugin = this.get(id), copy = structuredClone(config);
    fail(plugin.validate(copy), 'E_PLUGIN_CONFIG', `插件配置无效：${this.ajv.errorsText(plugin.validate.errors)}`);
    return copy;
  }
  execute(id, context, { signal } = {}) {
    const plugin = this.get(id);
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { entry: plugin.entry, context }, execArgv: [] });
      let settled = false;
      const finish = (error, output) => {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); worker.terminate().catch(() => {});
        if (error) reject(error); else resolve(output);
      };
      const timer = setTimeout(() => finish(Object.assign(new Error(`插件运行超过 ${this.timeoutMs / 1000} 秒。`), { code: 'E_PLUGIN_TIMEOUT' })), this.timeoutMs);
      const onAbort = () => finish(Object.assign(new Error('请求已更新或结束，运行已停止。'), { code: 'E_REQUEST_CHANGED' }));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      worker.on('message', async (message) => {
        if (settled) return;
        if (message.type === 'capability') {
          try {
            fail(plugin.manifest.permissions.includes(message.method), 'E_PLUGIN_PERMISSION', `插件未声明能力：${message.method}`);
            fail(typeof this.capabilities[message.method] === 'function', 'E_PLUGIN_CAPABILITY', `当前宿主不支持：${message.method}`);
            const result = await this.capabilities[message.method](message.args, context);
            if (!settled) worker.postMessage({ type: 'capability-result', id: message.id, result });
          } catch (error) { if (!settled) worker.postMessage({ type: 'capability-result', id: message.id, error: { code: error.code, message: error.message } }); }
        } else if (message.type === 'result') {
          const output = message.output;
          if (!output || typeof output.text !== 'string' || output.text.length > 100000 || !Array.isArray(output.attachments || []) || (output.attachments || []).length > 8) finish(new Error('插件结果必须包含 text 字符串和最多 8 个附件。'));
          else finish(null, output);
        } else if (message.type === 'error') finish(Object.assign(new Error(message.error.message), message.error));
      });
      worker.on('error', (error) => finish(error));
      worker.on('exit', (code) => { if (!settled) finish(new Error(`插件提前退出（${code}）。`)); });
    });
  }
}
