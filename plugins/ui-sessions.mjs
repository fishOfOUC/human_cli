import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fail, errorData } from '../core/errors.mjs';

export class ConfigUiSessions extends EventEmitter {
  constructor(service, { pollMs = 250, retryMs = 1000 } = {}) {
    super(); this.service = service; this.pollMs = pollMs; this.retryMs = retryMs; this.records = new Map();
    this.reconcile = () => {
      for (const record of this.records.values()) {
        if (!this.active(record)) continue;
        const request = service.get(record.requestId), tool = request.tools.find((item) => item.id === record.toolId);
        if (request.status !== 'pending' || request.version !== record.version) void this.close(record.key);
        else if (!record.applying && JSON.stringify(tool?.config) !== record.baseConfig) this.fail(record, Object.assign(new Error('配置已在其他操作中变更，请重新打开。'), { code: 'E_UI_STALE' }));
      }
    };
    service.on('change', this.reconcile);
  }
  active(record) { return this.records.get(record.key) === record && !record.abort.signal.aborted; }
  snapshot(key) {
    const record = this.records.get(key);
    return record ? { toolId: record.toolId, phase: record.phase, error: record.error || null, savedAt: record.savedAt || null, connected: Boolean(record.page) && !record.fatal } : null;
  }
  publish(record) { if (this.records.get(record.key) === record) this.emit('change', record.key); }
  async open(key, requestId, toolId, { theme = 'light' } = {}) {
    const existing = this.records.get(key);
    if (existing?.toolId === toolId && this.active(existing)) return existing;
    await this.close(key);
    const request = this.service.pending(requestId), tool = request.tools.find((item) => item.id === toolId);
    fail(tool, 'E_TOOL', '工具不存在。');
    fail(tool.state !== 'running', 'E_RUNNING', '工具运行中，请完成后再打开设置。');
    fail(this.service.plugins.get(tool.plugin).manifest.configUi?.type === 'web', 'E_UI_UNSUPPORTED', '该插件没有自定义网页配置。');
    const record = { key, requestId, toolId, pluginId: tool.plugin, sessionId: randomUUID(), version: request.version, baseConfig: JSON.stringify(tool.config), phase: 'opening', abort: new AbortController() };
    this.records.set(key, record); this.publish(record);
    try {
      record.page = await this.service.plugins.openConfigUi(tool.plugin, { sessionId: record.sessionId, config: structuredClone(tool.config), request: { id: request.id, title: request.title }, theme }, { signal: record.abort.signal });
      if (!this.active(record)) { void this.release(record); return record; }
      record.phase = 'ready'; this.publish(record); void this.poll(record);
    } catch (error) { if (this.active(record)) this.fail(record, error); }
    return record;
  }
  async processSubmission(record, submission) {
    const payload = JSON.stringify(submission.config);
    if (record.last?.id === submission.id) fail(record.last.payload === payload, 'E_UI_PROTOCOL', '同一个配置提交 ID 不能更换内容。');
    else {
      let resolution;
      try {
        const request = this.service.pending(record.requestId, record.version), tool = request.tools.find((item) => item.id === record.toolId);
        fail(JSON.stringify(tool.config) === record.baseConfig, 'E_UI_STALE', '配置已经变更，请重新打开。');
        fail(this.active(record), 'E_UI_CLOSED', '配置页已经关闭。');
        record.applying = true;
        const changed = this.service.configure(record.requestId, record.toolId, submission.config);
        const config = changed.tools.find((item) => item.id === record.toolId).config;
        record.baseConfig = JSON.stringify(config);
        resolution = { submissionId: submission.id, accepted: true, config };
      } catch (error) { resolution = { submissionId: submission.id, accepted: false, error: { code: error.code || 'E_CONFIG', message: error.message } }; }
      finally { record.applying = false; }
      record.last = { id: submission.id, payload, resolution, savedAt: resolution.accepted ? new Date().toISOString() : null };
    }
    if (!this.active(record)) return;
    await this.service.plugins.resolveConfigUi(record.pluginId, record.sessionId, record.last.resolution, { signal: record.abort.signal });
    if (!this.active(record)) return;
    record.phase = 'ready'; record.error = record.last.resolution.error || null;
    if (record.last.resolution.accepted) record.savedAt = record.last.savedAt;
    this.publish(record);
  }
  async poll(record) {
    while (this.active(record)) {
      let delay = this.pollMs;
      try {
        const status = await this.service.plugins.configUiStatus(record.pluginId, record.sessionId, { signal: record.abort.signal });
        if (!this.active(record)) break;
        if (status.state === 'closed') { await this.close(record.key); break; }
        if (status.state === 'submitted') await this.processSubmission(record, status.submission);
        else if (status.state === 'saved' && record.last?.resolution.accepted && record.savedAt !== record.last.savedAt) { record.savedAt = record.last.savedAt; record.phase = 'ready'; record.error = null; this.publish(record); }
        else if (record.phase === 'error') { record.phase = 'ready'; record.error = null; this.publish(record); }
      } catch (error) {
        if (!this.active(record)) break;
        if (['E_SPI_CONNECTION', 'E_SPI_HTTP', 'E_SPI_REMOTE'].includes(error.code)) {
          record.phase = 'error'; record.error = errorData(error); this.publish(record); delay = this.retryMs;
        } else { this.fail(record, error); break; }
      }
      await new Promise((done) => {
        const finish = () => { clearTimeout(timer); record.abort.signal.removeEventListener('abort', finish); done(); };
        const timer = setTimeout(finish, delay);
        record.abort.signal.addEventListener('abort', finish, { once: true }); if (record.abort.signal.aborted) finish();
      });
    }
  }
  release(record) { return this.service.plugins.closeConfigUi(record.pluginId, record.sessionId).catch(() => {}); }
  fail(record, error) { record.phase = 'error'; record.error = errorData(error); record.fatal = true; record.abort.abort(); this.publish(record); void this.release(record); }
  async close(key) {
    const record = this.records.get(key); if (!record) return;
    this.records.delete(key); record.abort.abort(); this.emit('change', key);
    await this.release(record);
  }
  async shutdown() { this.service.off('change', this.reconcile); await Promise.all([...this.records.keys()].map((key) => this.close(key))); }
}
