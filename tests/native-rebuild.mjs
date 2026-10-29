// UI migration acceptance. Only this application's DOM/windows are controlled.
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { startAcceptanceProvider } from './fixtures/acceptance-plugins.mjs';
import { resizeFromEdge, resizeEdges } from '../desktop/geometry.mjs';
import { png } from './helpers.mjs';

const output = resolve('.qa', `rebuild-${randomUUID().slice(0, 8)}`);
process.env.HUMAN_CLI_DATA_DIR = join(output, 'data');
process.env.HUMAN_CLI_TEST_HIDDEN = '1';
mkdirSync(join(process.env.HUMAN_CLI_DATA_DIR, 'plugins'), { recursive: true });
const provider = await startAcceptanceProvider();
writeFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'plugins/providers.json'), JSON.stringify({ version: 1, providers: [{ id: 'acceptance', url: provider.url, token: provider.token }] }));
const desktop = await import('../desktop/main.mjs');
const checks = [], errors = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check) { for (let i = 0; i < 150; i++) { const value = await check(); if (value) return value; await sleep(40); } throw new Error('Rebuild acceptance timed out'); }
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
async function run() {
  try {
    await desktop.ready;
    check('No home window was introduced by the UI migration', BrowserWindow.getAllWindows().length === 0);
    const runtime = JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'runtime.json'), 'utf8'));
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(runtime.url + path, { method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
    };
    const request = await api('/requests', 'POST', {
      title: '三种插件验收', agent: '本机验收', project: '仅本地测试', description: '逐项确认，然后把结果留在这里。',
      steps: ['网页：右键配置，左键执行', '简单：修改表单后保存', '无需配置：直接左键执行'],
      plugins: [{ id: 'web', plugin: 'acceptance.web' }, { id: 'simple', plugin: 'acceptance.simple' }, { id: 'plain', plugin: 'acceptance.none', side: 'left' }],
    });
    const win = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === request.id));
    const js = (code) => win.webContents.executeJavaScript(code, true);
    await until(() => !win.webContents.isLoading() && js('Boolean(document.querySelector("#reply"))'));
    win.webContents.on('render-process-gone', (_event, info) => errors.push(info.reason));
    check('Original compact native window size is retained', Math.abs(win.getBounds().width - 380) <= 2 && Math.abs(win.getBounds().height - 360) <= 2);
    check('Only the reply action remains; waiting status replaces the secondary completion button', await js('document.querySelector(".note-footer .waiting-label").textContent==="等待你的反馈" && document.querySelectorAll(".note-footer button").length===1 && !document.querySelector("[data-action=only],.request-meta,.bottom-status,.resize-handle") && document.querySelectorAll("[data-resize-edge]").length===8'));
    const empty = await api('/requests', 'POST', { title: '空回复直接完成', plugins: [] });
    const imageOnly = await api('/requests', 'POST', { title: '只附图片也能完成', plugins: [] });
    check('AI content replaces prototype fixture data', await js('document.querySelector(".description").textContent === "逐项确认，然后把结果留在这里。" && document.querySelectorAll("[data-step]").length === 3'));
    await js('document.querySelector("[data-step]").click()');
    await until(async () => (await api(`/requests/${request.id}`)).checks.includes(0));
    check('Progress bar and animated checkbox reflect durable request checks', await js('document.querySelector("#progress-copy").textContent.startsWith("1 / 3") && document.querySelector("[role=progressbar]").getAttribute("aria-valuenow")==="1" && document.querySelector(".check-row").classList.contains("done")'));
    await js('document.querySelector("#reply").value="重构界面的真实回复";document.querySelector("#reply").dispatchEvent(new Event("input",{bubbles:true}))');
    await until(() => js('document.querySelector("#draft-state").textContent==="草稿已保存"'));
    check('Draft saved label is backed by persisted host data', (await api(`/requests/${request.id}`)).reply === '重构界面的真实回复');
    await js('document.querySelector("#tool-plain").click()');
    await until(async () => (await api(`/requests/${request.id}`)).tools[2].state === 'success');
    check('Left-side plugin executes without navigation or lost reply', await js('document.querySelector("#shared-panel").dataset.pane==="note" && document.querySelector("#reply").value==="重构界面的真实回复" && document.querySelector(".bookmark-rail.left #tool-plain").classList.contains("success")'));
    await js('document.querySelector("#tool-simple").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,button:2}))');
    await js('document.querySelector(".tool-settings summary").click();document.querySelector("#config-message").value="表单迁移成功";document.querySelector(".tool-settings-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
    await until(async () => (await api(`/requests/${request.id}`)).tools[1].config.message === '表单迁移成功');
    await js('document.querySelector("#tool-simple").click()');
    await until(async () => (await api(`/requests/${request.id}`)).tools[1].output?.text.includes('表单迁移成功'));
    check('Rebuilt generic settings save through IPC and execution uses them', await js('document.querySelector("#shared-panel").dataset.pane==="simple"'));
    await js('document.querySelector("#nav-settings").click()');
    await js('document.querySelector("[data-action=motion]").click()');
    await until(() => js('document.documentElement.classList.contains("motion-off")'));
    check('Motion switch persists a real preference', JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'state.json'), 'utf8')).preferences.motion === false);
    const capture = async (name) => { await until(() => js('!document.querySelector(".note-toast").classList.contains("visible")')); await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await sleep(60); const image = await win.webContents.capturePage(); writeFileSync(join(output, name), image.toPNG()); return image; };
    for (const theme of ['light', 'paper', 'sage', 'dark']) {
      await js(`document.querySelector('[data-theme=${theme}]').click();document.querySelector('#nav-note').click()`);
      await until(() => js(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`));
      const image = await capture(`${theme}.png`), size = image.getSize(), bitmap = image.toBitmap();
      const alpha = (x, y) => bitmap[(y * size.width + x) * 4 + 3];
      check(`${theme} theme keeps transparent wings and visible completion controls`, alpha(5, 5) === 0 && alpha(size.width - 5, 5) === 0 && await js('(()=>{const r=document.querySelector("[data-action=complete]").getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && r.right<=innerWidth})()'));
      if (theme !== 'dark') await js('document.querySelector("#nav-settings").click()');
    }
    win.setBounds({ ...win.getBounds(), width: 340, height: 300 }); await sleep(100);
    check('Minimum size keeps reply and completion controls inside paper', await js('(()=>{const paper=document.querySelector(".paper").getBoundingClientRect(),reply=document.querySelector("#reply").getBoundingClientRect(),button=document.querySelector("[data-action=complete]").getBoundingClientRect();return reply.height>0 && button.bottom<=paper.bottom && button.right<=paper.right})()'));
    win.setBounds({ ...win.getBounds(), width: 620, height: 580 }); await capture('expanded.png');
    // Inject DIP cursor positions only in this test process; no global pointer moves.
    const cursor = screen.getCursorScreenPoint;
    let pointer;
    screen.getCursorScreenPoint = () => pointer;
    try {
      const area = screen.getPrimaryDisplay().workArea;
      for (const edge of resizeEdges) {
        win.setBounds({ x: area.x + 60, y: area.y + 60, width: 440, height: 400 });
        const start = win.getBounds();
        const hit = await js(`(()=>{const r=document.querySelector('[data-resize-edge=${edge}]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
        pointer = { x: start.x + hit.x, y: start.y + hit.y };
        win.webContents.focus();
        win.webContents.sendInputEvent({ type: 'mouseMove', ...hit });
        win.webContents.sendInputEvent({ type: 'mouseDown', ...hit, button: 'left', clickCount: 1 });
        await until(() => Boolean(win.resizeSession));
        pointer = { x: pointer.x + 24, y: pointer.y + 16 };
        win.webContents.sendInputEvent({ type: 'mouseMove', x: hit.x + 24, y: hit.y + 16, modifiers: ['leftButtonDown'] });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: hit.x + 24, y: hit.y + 16, button: 'left', clickCount: 1 });
        await until(() => !win.resizeSession);
        const expected = resizeFromEdge(start, edge, 24, 16), actual = win.getBounds();
        check(`Native ${edge} edge gesture updates bounds through real IPC`, Object.keys(expected).every((key) => Math.abs(expected[key] - actual[key]) <= 1));
      }
      await js("window.humanCli.beginResize('e')");
      screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), ['workArea']);
      check('Display changes invalidate drag coordinates before restoring visible window bounds', !win.resizeSession);
    } finally { screen.getCursorScreenPoint = cursor; }
    await api(`/requests/${request.id}`, 'PATCH', { version: 1, patch: { steps: ['更新后的步骤 <img src=x onerror=alert(1)>'], title: 'AI 更新后的任务' } });
    await until(() => js('document.querySelector("h1").textContent==="AI 更新后的任务"'));
    check('AI updates reset progress, preserve draft and escape task HTML', await js('document.querySelector("#reply").value==="重构界面的真实回复" && document.querySelector("#progress-copy").textContent.startsWith("0 / 1") && !document.querySelector(".checklist img")'));
    await js('document.querySelector("[data-action=complete]").click()');
    await until(() => win.isDestroyed());
    const completed = await api(`/requests/${request.id}`);
    check('Completion still destroys the note after saving its reply', completed.status === 'completed' && completed.result.reply === '重构界面的真实回复' && existsReply(completed));
    const emptyWin = BrowserWindow.getAllWindows().find((w) => w.requestId === empty.id);
    await until(() => !emptyWin.webContents.isLoading() && emptyWin.webContents.executeJavaScript('Boolean(document.querySelector("#reply"))'));
    await emptyWin.webContents.executeJavaScript('document.querySelector("[data-action=complete]").click()', true);
    await until(() => emptyWin.isDestroyed());
    check('One reply button completes an empty reply without a confirmation page', (await api(`/requests/${empty.id}`)).result.reply === '已完成');
    const imageWin = BrowserWindow.getAllWindows().find((w) => w.requestId === imageOnly.id);
    await until(() => !imageWin.webContents.isLoading() && imageWin.webContents.executeJavaScript('Boolean(document.querySelector("#reply"))'));
    await imageWin.webContents.executeJavaScript(`window.humanCli.addImage({name:'只有图片.png',mime:'image/png',bytes:new Uint8Array(${JSON.stringify([...png])})})`, true);
    await imageWin.webContents.executeJavaScript('document.querySelector("[data-action=complete]").click()', true);
    await until(() => imageWin.isDestroyed());
    check('Empty text does not discard attached images when replying', (await api(`/requests/${imageOnly.id}`)).result.images.length === 1);
    check('Renderer stays alive throughout migration interactions', errors.length === 0);
    writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
    console.log(`REBUILD REPORT ${join(output, 'report.json')}`);
  } catch (error) {
    console.error(error); process.exitCode = 1;
    writeFileSync(join(output, 'failure.json'), JSON.stringify({ checks, error: error.stack, errors }, null, 2));
  } finally {
    provider.server.closeAllConnections(); provider.server.close();
    if (process.exitCode) app.once('will-quit', () => app.exit(process.exitCode));
    app.quit();
  }
}
function existsReply(request) { return JSON.parse(readFileSync(request.cache.replyPath, 'utf8')).reply === request.result.reply; }
void run();
