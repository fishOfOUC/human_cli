// Native test control channel; excluded from every release. No global input.
import { app, BrowserWindow, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runtimePath } from '../../core/paths.mjs';

const windows = () => BrowserWindow.getAllWindows().map((w) => ({ requestId: w.requestId, visible: w.isVisible(), minimized: w.isMinimized() }));
app.on('browser-window-created', (_event, win) => {
  win.once('ready-to-show', () => process.send?.({ event: 'window', requestId: win.requestId }));
});
app.on('before-quit', () => process.send?.({ event: 'exiting', windows: windows() }));
process.on('message', async ({ id, action, requestId, text }) => {
  try {
    const win = BrowserWindow.getAllWindows().find((w) => w.requestId === requestId);
    let value;
    if (action === 'windows') value = windows();
    else if (action === 'draft') value = await win.webContents.executeJavaScript(`document.querySelector('#reply').value=${JSON.stringify(text)};document.querySelector('#reply').dispatchEvent(new Event('input',{bubbles:true}));true`);
    else if (action === 'complete') value = await win.webContents.executeJavaScript("document.querySelector('[data-action=complete]').click();true");
    else if (action === 'close') { win.close(); value = true; }
    else if (action === 'minimize') { win.minimize(); value = true; }
    else if (action === 'restore') { win.restore(); value = true; }
    else if (action === 'resize') { win.setBounds({ ...win.getBounds(), width: 420, height: 390 }); value = { bounds: win.getBounds(), scaleFactor: screen.getDisplayMatching(win.getBounds()).scaleFactor }; }
    else if (action === 'capture') { writeFileSync(join(process.env.HUMAN_CLI_DATA_DIR, '..', 'pending-note.png'), (await win.webContents.capturePage()).toPNG()); value = true; }
    else throw new Error('Unknown native test action');
    process.send?.({ id, value });
  } catch (error) { process.send?.({ id, error: error.message }); }
});
async function run() {
  const desktop = await import('../../desktop/main.mjs'); await desktop.ready;
  process.send?.({ event: 'ready', runtime: JSON.parse(readFileSync(runtimePath(), 'utf8')), windows: windows() });
}
void run().catch((error) => { console.error(error); app.exit(1); });
