import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { restoreBounds, stableBounds } from './geometry.mjs';

export class WindowManager {
  constructor(root, store) { this.root = root; this.store = store; this.windows = new Map(); this.quitting = false; this.captureActive = false; }
  open(requestId) {
    if (!requestId || this.store.data.requests[requestId]?.status !== 'pending') return null;
    const key = requestId;
    if (this.windows.has(key)) { const win = this.windows.get(key); if (win.isMinimized()) win.restore(); win.show(); return win; }
    const bounds = restoreBounds(this.store.data.geometry, screen.getAllDisplays(), screen.getPrimaryDisplay().id);
    let restoring = true;
    const win = new BrowserWindow({
      ...bounds, minWidth: 340, minHeight: 300, frame: false, transparent: true, resizable: true, thickFrame: false,
      alwaysOnTop: this.store.data.preferences.pinned, show: false, backgroundColor: '#00000000', title: 'human_cli 接力便签',
      webPreferences: { preload: join(this.root, 'desktop', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
    });
    win.requestId = requestId; this.windows.set(key, win);
    // Applying DIP bounds explicitly avoids Windows' initial frameless sizing adjustment.
    win.setBounds(bounds);
    win.loadURL(`human-cli-app://ui/index.html${requestId ? `?request=${requestId}` : ''}`);
    win.once('ready-to-show', () => {
      if (process.env.HUMAN_CLI_TEST_HIDDEN !== '1') win.showInactive();
      // Windows may adjust the initial frame on the first DPI-aware show. Correct
      // the observed delta; do not persist that transient OS adjustment as a resize.
      let requested = { ...bounds };
      for (let i = 0; i < 3; i++) {
        const actual = win.getBounds();
        if (actual.width === bounds.width && actual.height === bounds.height) break;
        requested = { ...requested, width: requested.width + bounds.width - actual.width, height: requested.height + bounds.height - actual.height };
        win.setBounds(requested);
      }
      restoring = false;
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.on('close', (event) => { if (!this.quitting) { event.preventDefault(); win.minimize(); } });
    win.on('closed', () => { clearTimeout(saveTimer); this.windows.delete(key); });
    let saveTimer;
    const persistGeometry = () => {
      if (restoring || win.isDestroyed() || win.isMinimized() || win.isMaximized() || this.captureActive) return;
      const normal = win.getNormalBounds(), display = screen.getDisplayMatching(normal);
      this.store.data.geometry = { bounds: stableBounds(normal, display.scaleFactor), displayId: display.id, workArea: display.workArea, scaleFactor: display.scaleFactor };
      this.store.save();
    };
    win.flushGeometry = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persistGeometry(); } };
    const saveGeometry = () => {
      if (restoring) return;
      clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; persistGeometry(); }, 180);
    };
    win.on('move', saveGeometry); win.on('resize', saveGeometry);
    return win;
  }
  finish(requestId) {
    const win = this.windows.get(requestId); if (!win || win.isDestroyed()) return;
    win.flushGeometry();
    win.hide();
    // Let the completion IPC response leave before destroying its sender.
    setImmediate(() => { if (!win.isDestroyed()) win.destroy(); });
  }
  forSender(sender) { return [...this.windows.values()].find((win) => win.webContents === sender && !win.isDestroyed()); }
  displayChanged() {
    for (const win of this.windows.values()) {
      const display = screen.getDisplayMatching(win.getBounds());
      win.setBounds(restoreBounds({ bounds: win.getBounds(), displayId: display.id }, screen.getAllDisplays(), screen.getPrimaryDisplay().id));
    }
  }
  async withoutNotes(action) {
    if (this.captureActive) throw new Error('另一个截图正在进行，请稍后重试。');
    this.captureActive = true;
    const visible = [...this.windows.values()].filter((win) => win.isVisible());
    const focused = visible.find((win) => win.isFocused());
    try { for (const win of visible) win.hide(); await new Promise((r) => setTimeout(r, 200)); return await action(); }
    finally { this.captureActive = false; for (const win of visible) if (!win.isDestroyed()) win.showInactive(); if (focused && !focused.isDestroyed()) focused.focus(); }
  }
  shutdown() { this.quitting = true; for (const win of this.windows.values()) win.destroy(); }
}
