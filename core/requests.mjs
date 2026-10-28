import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createSchema, updateSchema, themes } from './schemas.mjs';
import { fail, errorData } from './errors.mjs';
import { RequestCache } from './cache.mjs';
import { validateReplyText } from './plugin-output.mjs';

export class RequestService extends EventEmitter {
  constructor(store, attachments, plugins) {
    super(); this.setMaxListeners(100); this.store = store; this.attachments = attachments; this.plugins = plugins; this.running = new Map(); this.waiters = new Map(); this.cache = new RequestCache(store, attachments);
    const builtinId = (id) => /^relay\.(screenshot|clipboard|open-url|diagnostics)$/.test(id) ? id.replace('relay.', 'human.') : id;
    for (const [id, config] of Object.entries(store.data.pluginDefaults)) if (builtinId(id) !== id) {
      store.data.pluginDefaults[builtinId(id)] ??= config; delete store.data.pluginDefaults[id];
    }
    for (const request of Object.values(store.data.requests)) {
      request.replyNotes ||= [];
      for (const tool of request.tools) tool.plugin = builtinId(tool.plugin);
      // Upgrade old delivery receipts to a plain local cache. No receipt is needed.
      request.cache ||= request.delivery?.state === 'discarded' ? { state: 'discarded', discardedAt: request.delivery.discardedAt } : request.result ? { state: 'saved', savedAt: request.result.completedAt } : { state: 'not_ready' };
      delete request.delivery;
      for (const tool of request.tools) if (tool.state === 'running') {
        tool.state = 'error'; tool.error = { code: 'E_INTERRUPTED', message: '上次运行因程序退出中断，请重新执行。' };
      }
      this.cache.sync(request);
    }
    store.save();
  }
  get(id) { const r = this.store.data.requests[id]; fail(r, 'E_REQUEST', '请求不存在。', 404); return r; }
  pending(id, version) {
    const r = this.get(id); fail(r.status === 'pending', 'E_REQUEST_CLOSED', '请求已结束，不能再修改。', 409);
    if (version !== undefined) fail(r.version === version, 'E_VERSION', 'AI 已更新请求，请确认最新内容后再完成。', 409);
    return r;
  }
  changed(request, event = 'updated') { request.updatedAt = new Date().toISOString(); this.store.save(); this.cache.sync(request); this.emit('change', { id: request.id, event }); return this.snapshot(request.id); }
  create(input) {
    const data = createSchema.parse(input);
    if (data.idempotencyKey) {
      const existing = Object.values(this.store.data.requests).find((r) => r.idempotencyKey === data.idempotencyKey);
      if (existing) return this.snapshot(existing.id);
    }
    const bindings = data.plugins || [{ id: 'capture', plugin: 'human.screenshot', config: {} }];
    fail(new Set(bindings.map((b) => b.id)).size === bindings.length, 'E_PLUGIN_BINDING', '同一请求内的按钮 ID 不能重复。');
    const tools = bindings.map((binding) => {
      const definition = this.plugins.get(binding.plugin);
      const config = this.plugins.validateConfig(binding.plugin, { ...this.store.data.pluginDefaults[binding.plugin], ...binding.config });
      return { id: binding.id, plugin: binding.plugin, side: binding.side || definition.manifest.side, config, state: 'idle', output: null, error: null };
    });
    const request = {
      ...data, plugins: undefined, id: randomUUID(), version: 1, status: 'pending',
      checks: [], reply: '', replyNotes: [], images: [], diagnostics: [], tools, result: null, cache: { state: 'not_ready' },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.store.data.requests[request.id] = request;
    return this.changed(request, 'created');
  }
  update(id, patch, version) {
    const r = this.pending(id, version), data = updateSchema.parse(patch);
    Object.assign(r, data); if (data.steps) r.checks = [];
    r.version++; this.abortRuns(id); return this.changed(r, 'instructions');
  }
  cancel(id, reason = '') {
    const r = this.pending(id); r.status = 'cancelled'; r.version++; r.cancelReason = String(reason).slice(0, 2000);
    this.abortRuns(id); return this.changed(r, 'cancelled');
  }
  draft(id, { reply, checks }) {
    const r = this.pending(id);
    if (reply !== undefined) { fail(typeof reply === 'string' && reply.length <= 30000, 'E_REPLY', '回复不能超过 30000 字符。'); r.reply = reply; }
    if (checks !== undefined) { fail(Array.isArray(checks) && checks.every((n) => Number.isInteger(n) && n >= 0 && n < r.steps.length), 'E_CHECKS', '无效的步骤编号。'); r.checks = [...new Set(checks)]; }
    return this.changed(r, 'draft');
  }
  addImage(id, file) {
    const r = this.pending(id); fail(r.images.length < 8, 'E_IMAGE_LIMIT', '每张便签最多附 8 张图片。');
    fail(file.mime?.startsWith('image/'), 'E_IMAGE_TYPE', '请选择图片。');
    const attachment = this.attachments.add(id, file); r.images.push(attachment.id);
    this.changed(r, 'attachment'); return attachment;
  }
  attach(id, attachmentId) {
    const r = this.pending(id), a = this.attachments.forRequest(attachmentId, id);
    fail(a.mime.startsWith('image/'), 'E_IMAGE_TYPE', '该结果不是图片。');
    if (!r.images.includes(a.id)) { fail(r.images.length < 8, 'E_IMAGE_LIMIT', '每张便签最多附 8 张图片。'); r.images.push(a.id); }
    return this.changed(r, 'attachment');
  }
  removeAttachment(id, attachmentId) { const r = this.pending(id); r.images = r.images.filter((a) => a !== attachmentId); return this.changed(r, 'attachment'); }
  attachError(id, toolId) {
    const r = this.pending(id), tool = r.tools.find((t) => t.id === toolId);
    fail(tool?.error, 'E_NO_ERROR', '该工具没有错误。');
    r.diagnostics = r.diagnostics.filter((d) => d.toolId !== toolId);
    let name = tool.plugin;
    try { name = this.plugins.get(tool.plugin).manifest.name; } catch {}
    r.diagnostics.push({ toolId, name, ...tool.error });
    return this.changed(r, 'attachment');
  }
  removeError(id, toolId) { const r = this.pending(id); r.diagnostics = r.diagnostics.filter((d) => d.toolId !== toolId); return this.changed(r, 'attachment'); }
  removeReplyNote(id, toolId) { const r = this.pending(id); r.replyNotes = r.replyNotes.filter((note) => note.toolId !== toolId); return this.changed(r, 'attachment'); }
  complete(id, { version, only = false, reply, checks }) {
    const r = this.pending(id, version);
    if (reply !== undefined || checks !== undefined) this.draft(id, { reply, checks });
    const combined = [r.reply.trim(), ...r.replyNotes.map((note) => note.text)].filter(Boolean).join('\n');
    fail(only || combined.length <= 30000, 'E_REPLY', '回复及附言合计不能超过 30000 字符，请精简后再完成。');
    r.status = 'completed'; r.version++;
    r.result = { requestId: id, status: 'completed', reply: only ? '已完成' : combined || '已完成', images: only ? [] : [...r.images], diagnostics: only ? [] : structuredClone(r.diagnostics), completedAt: new Date().toISOString() };
    r.cache = { state: 'saved', savedAt: r.result.completedAt };
    this.abortRuns(id); return this.changed(r, 'completed');
  }
  discardReply(id, version) {
    const r = this.get(id);
    fail(r.status === 'completed' && r.cache?.state === 'saved', 'E_REPLY_STATE', '没有可丢弃的缓存回复。', 409);
    fail(r.version === version, 'E_VERSION', '便签已变更，请重新确认。', 409);
    r.reply = ''; r.replyNotes = []; r.images = []; r.diagnostics = []; r.result = null;
    r.cache = { state: 'discarded', discardedAt: new Date().toISOString() };
    this.changed(r, 'discarded'); this.attachments.cleanupDiscarded();
    return this.snapshot(id);
  }
  snapshot(id) {
    const r = structuredClone(this.get(id));
    r.cache = { ...r.cache, ...this.cache.location(r) };
    r.receiver = { waiting: (this.waiters.get(id)?.size || 0) > 0 };
    r.images = r.images.map((a) => this.attachments.view(this.attachments.get(a)));
    r.tools = r.tools.map((tool) => {
      let manifest;
      try { manifest = this.plugins.get(tool.plugin).manifest; }
      catch { manifest = { id: tool.plugin, name: '插件未安装', icon: 'puzzle', description: `找不到 ${tool.plugin}，请恢复插件后重启。`, configSchema: { type: 'object', properties: {} } }; }
      return { ...tool, manifest, output: tool.output ? { ...tool.output, attachments: (tool.output.attachments || []).map((a) => this.attachments.view(this.attachments.get(a))) } : null };
    });
    if (r.result) r.result.images = r.result.images.map((a) => this.attachments.view(this.attachments.get(a)));
    return r;
  }
  list() { return Object.values(this.store.data.requests).map((r) => { const { id, title, agent, status, createdAt, updatedAt, version } = r; return { id, title, agent, status, cache: { ...r.cache, ...this.cache.location(r) }, createdAt, updatedAt, version }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)); }
  logs({ limit = 50, offset = 0 } = {}) {
    fail(Number.isInteger(limit) && limit >= 1 && limit <= 200 && Number.isInteger(offset) && offset >= 0, 'E_LOG_PAGE', '日志分页参数无效。');
    const entries = this.list();
    return { cacheDirectory: this.cache.root, total: entries.length, entries: entries.slice(offset, offset + limit), nextOffset: offset + limit < entries.length ? offset + limit : null };
  }
  async wait(id, signal) {
    const r = this.get(id); if (r.status !== 'pending') return this.snapshot(id);
    return new Promise((resolve, reject) => {
      const key = randomUUID();
      if (!this.waiters.has(id)) this.waiters.set(id, new Set());
      this.waiters.get(id).add(key);
      const cleanup = () => {
        this.off('change', onChange); signal?.removeEventListener('abort', disconnected);
        this.waiters.get(id)?.delete(key); if (!this.waiters.get(id)?.size) this.waiters.delete(id);
        this.emit('connection', { id });
      };
      const done = () => { cleanup(); resolve(this.snapshot(id)); };
      const disconnected = () => { cleanup(); reject(Object.assign(new Error('等待连接已断开；请求和本地回复仍然保留。'), { code: 'E_WAIT_DISCONNECTED' })); };
      const onChange = (event) => { if (event.id === id && this.get(id).status !== 'pending') done(); };
      this.on('change', onChange); signal?.addEventListener('abort', disconnected, { once: true });
      this.emit('connection', { id });
      if (signal?.aborted) disconnected();
    });
  }
  preferences(patch) {
    if (patch.theme !== undefined) fail(themes.includes(patch.theme), 'E_THEME', '未知主题。');
    if (patch.pinned !== undefined) fail(typeof patch.pinned === 'boolean', 'E_PIN', '置顶值必须为布尔值。');
    Object.assign(this.store.data.preferences, { ...(patch.theme !== undefined ? { theme: patch.theme } : {}), ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}) });
    this.store.save(); this.emit('preferences', this.store.data.preferences); return this.store.data.preferences;
  }
  configure(id, toolId, config) {
    const r = this.pending(id), tool = r.tools.find((t) => t.id === toolId);
    fail(tool, 'E_TOOL', '工具不存在。'); fail(tool.state !== 'running', 'E_RUNNING', '工具运行时不能修改配置。');
    tool.config = this.plugins.validateConfig(tool.plugin, config);
    this.store.data.pluginDefaults[tool.plugin] = structuredClone(tool.config);
    return this.changed(r, 'config');
  }
  async run(id, toolId) {
    const r = this.pending(id), tool = r.tools.find((t) => t.id === toolId);
    fail(tool, 'E_TOOL', '工具不存在。');
    if (tool.state === 'running') return this.snapshot(id);
    const runId = randomUUID(), version = r.version;
    const abort = new AbortController(), runKey = `${id}/${toolId}`; this.running.set(runKey, abort);
    tool.runId = runId; tool.state = 'running'; tool.error = null; this.changed(r, 'tool');
    try {
      const output = await this.plugins.execute(tool.plugin, { request: { id, title: r.title, agent: r.agent, project: r.project }, config: structuredClone(tool.config) }, { signal: abort.signal, runId });
      if (r.status !== 'pending' || r.version !== version) throw Object.assign(new Error('请求已结束或被 AI 更新，本次运行结果未附入回复。'), { code: 'E_REQUEST_CHANGED' });
      const replyText = validateReplyText(output.replyText)?.trim();
      if (tool.config.autoAttach === true) fail(r.images.length + (output.attachments || []).filter((a) => a.mime?.startsWith('image/')).length <= 8, 'E_IMAGE_LIMIT', '回复最多附 8 张图片，请移除一张后重新截图。');
      const attachments = (output.attachments || []).map((a) => this.attachments.add(id, a).id);
      tool.output = { text: output.text || '', ...(replyText ? { replyText } : {}), attachments, completedAt: new Date().toISOString() };
      if (tool.config.autoAttach === true) for (const attachmentId of attachments) {
        if (r.images.length < 8 && this.attachments.get(attachmentId).mime.startsWith('image/')) r.images.push(attachmentId);
      }
      if (tool.config.autoAttach === true && replyText) {
        r.replyNotes = r.replyNotes.filter((note) => note.toolId !== toolId);
        r.replyNotes.push({ toolId, text: replyText });
      }
      tool.state = 'success';
    } catch (error) { tool.state = 'error'; tool.error = errorData(error); }
    finally { this.running.delete(runKey); }
    this.changed(r, 'tool'); return this.snapshot(id);
  }
  abortRuns(requestId) { for (const [key, abort] of this.running) if (key.startsWith(`${requestId}/`)) abort.abort(); }
}
