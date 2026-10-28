import { WebContentsView, session } from 'electron';
import { EventEmitter } from 'node:events';
import { ConfigUiSessions } from '../plugins/ui-sessions.mjs';
import { fail } from '../core/errors.mjs';

const pagePolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

export class ConfigUiManager extends EventEmitter {
  constructor(service) {
    super(); this.service = service; this.sessions = new ConfigUiSessions(service); this.windows = new Map(); this.views = new Map(); this.bounds = new Map();
    this.sessions.on('change', (key) => {
      const record = this.sessions.records.get(key);
      if (!record || record.fatal) this.disposeView(key);
      this.emit('change', this.windows.get(key));
    });
  }
  snapshot(win) {
    const status = this.sessions.snapshot(win.id); if (!status) return null;
    const loaded = Boolean(this.views.get(win.id)?.loaded);
    return { ...status, connected: status.connected && loaded, loading: !status.error && !loaded };
  }
  async open(win, toolId, bounds) {
    this.windows.set(win.id, win); this.setBounds(win, toolId, bounds);
    if (!win.configUiRegistered) {
      win.configUiRegistered = true;
      win.on('close', () => { void this.close(win); });
      win.on('closed', () => { void this.close(win); this.windows.delete(win.id); this.bounds.delete(win.id); });
    }
    const record = await this.sessions.open(win.id, win.requestId, toolId, { theme: this.service.store.data.preferences.theme });
    if (!this.sessions.active(record) || !record.page || win.isDestroyed() || this.views.has(win.id)) return this.snapshot(win);
    const partition = session.fromPartition(`human-cli-config-${record.sessionId}`, { cache: false });
    partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    partition.setPermissionCheckHandler(() => false);
    partition.on('will-download', (event) => event.preventDefault());
    partition.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try { allowed = new URL(details.url).origin === record.page.origin; } catch {}
      callback({ cancel: !allowed });
    });
    partition.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [pagePolicy], 'Referrer-Policy': ['no-referrer'] } }));
    const view = new WebContentsView({ webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, disableDialogs: true, spellcheck: false } });
    const entry = { view, record, partition, loaded: false };
    this.views.set(win.id, entry);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('content-bounds-updated', (event) => event.preventDefault());
    view.webContents.on('destroyed', () => {
      if (this.sessions.active(record)) this.sessions.fail(record, Object.assign(new Error('插件配置页面已关闭，请重新打开。'), { code: 'E_UI_CLOSED' }));
    });
    const navigation = (event, url) => {
      try {
        const target = new URL(typeof url === 'string' ? url : event.url), base = record.page.path.replace(/\/$/, '');
        if (target.origin !== record.page.origin || (target.pathname !== record.page.path && !target.pathname.startsWith(base + '/'))) event.preventDefault();
      } catch { event.preventDefault(); }
    };
    view.webContents.on('will-navigate', navigation);
    view.webContents.on('will-redirect', navigation);
    view.webContents.on('will-frame-navigate', navigation);
    view.webContents.on('render-process-gone', (_event, details) => {
      if (this.sessions.active(record)) this.sessions.fail(record, Object.assign(new Error(`插件配置页面已退出：${details.reason}`), { code: 'E_UI_RENDERER' }));
    });
    view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3 && this.sessions.active(record)) this.sessions.fail(record, Object.assign(new Error(`配置页面加载失败：${description}`), { code: 'E_UI_LOAD' }));
    });
    view.webContents.on('did-navigate', (_event, _url, code) => {
      if (code >= 400 && this.sessions.active(record)) this.sessions.fail(record, Object.assign(new Error(`配置页面加载失败：HTTP ${code}`), { code: 'E_UI_LOAD' }));
    });
    win.contentView.addChildView(view); this.layout(win);
    try {
      await view.webContents.loadURL(record.page.url);
      if (this.sessions.active(record) && this.views.get(win.id) === entry) { entry.loaded = true; this.layout(win); this.emit('change', win); }
    }
    catch (error) { if (this.sessions.active(record)) this.sessions.fail(record, Object.assign(new Error(`配置页面加载失败：${error.message}`), { code: 'E_UI_LOAD' })); }
    return this.snapshot(win);
  }
  setBounds(win, toolId, value) {
    if (value === null) { this.bounds.delete(win.id); this.views.get(win.id)?.view.setVisible(false); return; }
    fail(value && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])), 'E_UI_BOUNDS', '无效配置界面区域。');
    this.bounds.set(win.id, { toolId, value }); this.layout(win);
  }
  layout(win) {
    const entry = this.views.get(win.id), rect = this.bounds.get(win.id);
    if (!entry || win.isDestroyed()) return;
    if (!rect || rect.toolId !== entry.record.toolId) { entry.view.setVisible(false); return; }
    const [width, height] = win.getContentSize(), x = Math.max(30, Math.round(rect.value.x)), y = Math.max(32, Math.round(rect.value.y));
    const bounds = { x, y, width: Math.max(0, Math.min(Math.round(rect.value.width), width - x - 30)), height: Math.max(0, Math.min(Math.round(rect.value.height), height - y - 36)) };
    entry.view.setBounds(bounds); entry.view.setVisible(entry.loaded && bounds.width > 0 && bounds.height > 0);
  }
  disposeView(key) {
    const entry = this.views.get(key); if (!entry) return;
    this.views.delete(key);
    const win = this.windows.get(key);
    if (win && !win.isDestroyed()) win.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    entry.partition.webRequest.onBeforeRequest(null); entry.partition.webRequest.onHeadersReceived(null);
    void entry.partition.clearStorageData().catch(() => {});
  }
  close(win) { const closing = this.sessions.close(win.id); this.disposeView(win.id); return closing; }
  async shutdown() { await this.sessions.shutdown(); for (const key of this.views.keys()) this.disposeView(key); }
}
