// Native acceptance entry. It runs in Electron, uses its real IPC/worker/capture path,
// and never sends global mouse or keyboard input. Keep this file out of release packages.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const output = resolve('.qa', `native-${randomUUID().slice(0, 8)}`);
mkdirSync(output, { recursive: true }); process.env.HUMAN_CLI_DATA_DIR = join(output, 'data');
const checks = [], errors = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(70); }
  throw new Error('Native acceptance timed out');
}
async function ready(win) { if (win.webContents.isLoading()) await once(win.webContents, 'did-finish-load'); await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector("h1"))')); }
let client;
async function runAcceptance() {
try {
  const desktop = await import('../desktop/main.mjs');
  await desktop.ready;
  const runtime = JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'runtime.json'), 'utf8'));
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(runtime.url + path, { method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
  };
  const home = BrowserWindow.getAllWindows().find((w) => !w.requestId); await ready(home);
  const js = (win, code) => win.webContents.executeJavaScript(code, true);
  const capture = async (win, name) => {
    // DOM updates may precede Chromium's composited frame. Capture the painted state.
    await js(win, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await sleep(100);
    writeFileSync(join(output, name), (await win.webContents.capturePage()).toPNG());
  };
  check('Idle desktop waits for AI and has no New note action', await js(home, 'document.querySelector("h1").textContent.includes("AI") && !document.body.textContent.includes("新便签")'));
  const request = await api('/requests', 'POST', { title: '原生验收：请帮我确认界面', agent: '测试 AI', steps: ['确认主题', '截图后回复'], plugins: [{ id: 'capture', plugin: 'human.screenshot', config: { delayMs: 0, display: 'primary', autoAttach: true } }, { id: 'diagnostics', plugin: 'human.diagnostics', config: {} }] });
  const win = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === request.id)); await ready(win);
  win.webContents.on('render-process-gone', (_event, info) => errors.push(info.reason));
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  check('AI request opens a real compact native topmost window', win.isAlwaysOnTop() && Math.abs(win.getBounds().width - 380) <= 10 && Math.abs(win.getBounds().height - 360) <= 10);
  await js(win, 'document.querySelector("#reply").value="原生验收已完成";document.querySelector("#reply").dispatchEvent(new Event("input",{bubbles:true}))');
  await until(async () => (await api(`/requests/${request.id}`)).reply === '原生验收已完成');
  check('User reply draft persists through real preload IPC', true);
  let hiddenDuringCapture = false; win.on('hide', () => { hiddenDuringCapture = true; });
  await js(win, 'document.querySelector("#tool-capture").click()');
  await until(async () => ['success', 'error'].includes((await api(`/requests/${request.id}`)).tools[0].state));
  const captured = await api(`/requests/${request.id}`);
  check('Real screenshot worker hides notes and attaches an actual PNG', captured.tools[0].state === 'success' && captured.images.length === 1 && hiddenDuringCapture);
  check('Sidebar execution leaves current note and draft in place', await js(win, 'document.querySelector("#shared-panel").dataset.pane==="note" && document.querySelector("#reply").value==="原生验收已完成"'));
  check('Notes restore after screenshot', win.isVisible());
  await js(win, 'document.querySelector("#tool-capture").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,button:2}))');
  check('Right click opens retained real screenshot result', await js(win, 'document.querySelector("#shared-panel").dataset.pane==="capture" && Boolean(document.querySelector(".capture-preview img"))'));
  await js(win, 'document.querySelector("[data-pane=settings]").click()');
  await js(win, 'document.querySelector("[data-theme=dark]").click()');
  await until(() => js(win, 'document.documentElement.dataset.theme==="dark"'));
  check('Dark theme applies and persists', JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'state.json'), 'utf8')).preferences.theme === 'dark');
  await js(win, 'document.querySelector(".pin-control").click()'); await until(() => !win.isAlwaysOnTop());
  check('Pin toggle changes the native always-on-top flag', !win.isAlwaysOnTop());
  await js(win, 'document.querySelector(".pin-control").click()'); await until(() => win.isAlwaysOnTop());
  await js(win, 'document.querySelector("[data-theme=sage]").click()');
  await until(() => js(win, 'document.documentElement.dataset.theme==="sage"'));
  check('Theme change propagates to all native notes', await js(home, 'document.documentElement.dataset.theme==="sage"'));
  await js(win, 'document.querySelector("#nav-note").click()');
  // Exercise actual renderer file, paste and drop handlers, not service internals.
  await js(win, `(async()=>{const r=await fetch(${JSON.stringify(captured.images[0].url)});const blob=await r.blob();window.__testImage=blob;const dt=new DataTransfer();dt.items.add(new File([blob],'上传验收.png',{type:'image/png'}));const input=document.querySelector('#image-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(async () => (await api(`/requests/${request.id}`)).images.length === 2);
  check('Image upload crosses real IPC and persists a second attachment', true);
  await js(win, `(()=>{const dt=new DataTransfer();dt.items.add(new File([window.__testImage],'粘贴验收.png',{type:'image/png'}));document.querySelector('#reply').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()`);
  await until(async () => (await api(`/requests/${request.id}`)).images.length === 3);
  check('Image paste handler persists through real IPC', true);
  await js(win, `(()=>{const dt=new DataTransfer();dt.items.add(new File([window.__testImage],'拖入验收.png',{type:'image/png'}));document.querySelector('.paper').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`);
  await until(async () => (await api(`/requests/${request.id}`)).images.length === 4);
  check('Image drop handler persists through real IPC', true);
  await js(win, 'document.querySelector("#tool-diagnostics").click()');
  await until(async () => (await api(`/requests/${request.id}`)).tools[1].state === 'success');
  check('Environment plugin produces real OS and display data', (await api(`/requests/${request.id}`)).tools[1].output.text.includes('displays'));
  client = new Client({ name: 'native-acceptance', version: '1' });
  const mcpTransport = new StdioClientTransport({ command: 'node', args: [resolve('adapters/mcp.mjs')], env: { ...process.env, HUMAN_CLI_NO_AUTOSTART: '1' }, stderr: 'pipe' });
  mcpTransport.stderr?.on('data', (chunk) => console.error(`MCP STDERR: ${chunk}`));
  await client.connect(mcpTransport);
  const waiting = client.callTool({ name: 'human_wait', arguments: { requestId: request.id } });
  await js(win, 'document.querySelector("[data-action=complete]").click()');
  const result = await waiting;
  let metadata = JSON.parse(result.content[0].text), receivedImages = result.content.filter((c) => c.type === 'image');
  while (metadata.imagePage?.nextOffset !== null && metadata.imagePage?.nextOffset !== undefined) {
    const page = await client.callTool({ name: 'human_wait', arguments: { requestId: request.id, imageOffset: metadata.imagePage.nextOffset } });
    metadata = JSON.parse(page.content[0].text); receivedImages.push(...page.content.filter((c) => c.type === 'image'));
  }
  check('Native user completion returns real images to MCP client', !result.isError && receivedImages.length === 4 && result.content[0].text.includes('原生验收已完成'));
  const logs = JSON.parse((await client.callTool({ name: 'human_logs', arguments: {} })).content[0].text);
  const cached = logs.entries.find((entry) => entry.id === request.id);
  const cachedReply = JSON.parse(readFileSync(cached.cache.replyPath, 'utf8'));
  check('Native reply is recoverable through logs and local image files without acknowledgement', cachedReply.reply === '原生验收已完成' && cachedReply.images.length === 4 && readFileSync(cachedReply.images[0].path).length > 100);
  await capture(win, 'completed.png');
  win.setBounds({ ...win.getBounds(), x: win.getBounds().x - 30, width: 410, height: 390 }); await sleep(350);
  const remembered = JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'state.json'), 'utf8')).geometry.bounds;
  check('Native move and resize are persisted on a stable DPI grid', Math.abs(remembered.width - win.getBounds().width) <= 2 && Math.abs(remembered.height - win.getBounds().height) <= 2);
  const second = await api('/requests', 'POST', { title: '检查位置恢复' });
  const secondWin = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === second.id)); await ready(secondWin);
  check('Next AI request reuses saved size', Math.abs(secondWin.getBounds().width - remembered.width) <= 1 && Math.abs(secondWin.getBounds().height - remembered.height) <= 1);
  await js(secondWin, 'document.querySelector("[data-action=hide]").click()');
  await sleep(100); check('User close hides without cancelling AI request', !secondWin.isVisible() && (await api(`/requests/${second.id}`)).status === 'pending');
  await api(`/requests/${second.id}/cancel`, 'POST', { reason: '验收结束' });
  await until(() => js(secondWin, 'document.querySelector("h1").textContent.includes("取消")'));
  check('AI cancellation reaches native note state', await js(secondWin, 'document.querySelector("h1").textContent.includes("取消")'));
  const offline = await api('/requests', 'POST', { title: '离线回复处理验收', plugins: [] });
  const offlineWin = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === offline.id)); await ready(offlineWin);
  await js(offlineWin, 'document.querySelector("#reply").value="这份回复先保存在本机";document.querySelector("#reply").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-action=complete]").click()');
  await until(async () => (await api(`/requests/${offline.id}`)).status === 'completed');
  await until(() => js(offlineWin, 'document.querySelector("h1").textContent==="回复已保存"'));
  check('Disconnected reply is saved locally with no receipt or delivery status', (await api(`/requests/${offline.id}`)).cache.state === 'saved' && !await js(offlineWin, 'document.body.textContent.includes("确认收到") || document.body.textContent.includes("待交付")'));
  await capture(offlineWin, 'cached-reply.png');
  await js(offlineWin, 'document.querySelector("[data-action=discard-reply]").click()');
  await js(offlineWin, 'document.querySelector("#nav-note").click()');
  check('Discard requires explicit confirmation and can be abandoned', (await api(`/requests/${offline.id}`)).result.reply === '这份回复先保存在本机');
  await js(offlineWin, 'document.querySelector("[data-action=discard-reply]").click()');
  await until(() => js(offlineWin, 'Boolean(document.querySelector("[data-action=confirm-discard]"))'));
  await js(offlineWin, 'document.querySelector("[data-action=confirm-discard]").click()');
  await until(async () => (await api(`/requests/${offline.id}`)).cache.state === 'discarded');
  const discarded = await api(`/requests/${offline.id}`);
  check('User discard clears queued reply without AI cancellation', discarded.result === null && discarded.reply === '' && discarded.status === 'completed' && !discarded.cancelReason);
  const discardedResult = await client.callTool({ name: 'human_wait', arguments: { requestId: offline.id } });
  check('AI receives only discarded marker after user discards queued reply', JSON.parse(discardedResult.content[0].text).status === 'reply_discarded' && !JSON.stringify(discardedResult).includes('先保存在本机'));
  await capture(offlineWin, 'discarded.png');
  check('No native renderer errors', errors.length === 0);
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(`NATIVE REPORT ${join(output, 'report.json')}`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ checks, error: error.stack, errors }, null, 2));
} finally { if (client) await client.close(); if (process.exitCode) app.once('will-quit', () => app.exit(process.exitCode)); app.quit(); }
}
void runAcceptance();
