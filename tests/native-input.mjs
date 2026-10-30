// Exercise Chromium's real composition state, without global mouse/keyboard input.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('.qa', `input-${Date.now()}`);
mkdirSync(output, { recursive: true });
process.env.HUMAN_CLI_DATA_DIR = join(output, 'data');
process.env.HUMAN_CLI_CACHE_DIR = join(output, 'cache');
process.env.HUMAN_CLI_TEST_HIDDEN = '1';
const checks = [], errors = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
async function until(fn) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await sleep(25); }
  throw new Error('Input acceptance timed out');
}

async function run() {
  try {
    const desktop = await import('../desktop/main.mjs'); await desktop.ready;
    const runtime = JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'runtime.json')));
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(runtime.url + path, { method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
    };
    const request = await api('/requests', 'POST', { title: '中文输入验收', plugins: [] });
    const win = await until(() => BrowserWindow.getAllWindows().find(w => w.requestId === request.id));
    const js = source => win.webContents.executeJavaScript(source, true);
    const snapshot = () => api(`/requests/${request.id}`);
    await until(() => !win.webContents.isLoading() && js('Boolean(document.querySelector("#reply"))'));
    win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
    let topCalls = 0;
    const setTop = win.setAlwaysOnTop.bind(win);
    win.setAlwaysOnTop = (...args) => { topCalls++; return setTop(...args); };
    await js(`(() => {
      window.original = document.querySelector('#reply'); window.composer = original.closest('.composer');
      window.trace = []; window.states = 0; window.removals = 0;
      window.humanCli.onState(() => states++);
      new MutationObserver(records => { for (const r of records) for (const n of r.removedNodes) if (n === original || n.contains?.(original) || n === composer || n.contains?.(composer)) removals++; }).observe(document.querySelector('.note-body'), { childList: true, subtree: true });
      for (const name of ['focusout','compositionstart','compositionupdate','compositionend','input']) document.addEventListener(name, e => {
        if (e.target.matches('[data-text-block]')) trace.push({ name, trusted: e.isTrusted, composing: e.isComposing, text: e.target.value });
      }, true);
      original.focus();
    })()`);
    win.webContents.debugger.attach('1.3');
    const cdp = (method, params) => win.webContents.debugger.sendCommand(method, params);
    const compose = text => cdp('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    const insert = text => cdp('Input.insertText', { text });
    for (const char of 'abc') {
      await insert(char);
      await sleep(350);
    }
    check('Slow typing saves all letters without disconnecting editor or composer', (await snapshot()).reply === 'abc' && await js('original === document.querySelector("#reply") && composer === document.querySelector(".composer") && removals === 0 && !trace.some(e => e.name === "focusout")'));
    check('Draft saves do not repeat native always-on-top changes', topCalls === 0);
    await js('original.setSelectionRange(1,2)');
    await api(`/requests/${request.id}`, 'PATCH', { patch: { title: '更新后的任务' }, version: (await snapshot()).version });
    await until(() => js('document.querySelector("h1").textContent === "更新后的任务"'));
    check('Instruction updates retain the same focused editor and selection', await js('original === document.activeElement && original.selectionStart === 1 && original.selectionEnd === 2 && removals === 0'));

    const other = await api('/requests', 'POST', { title: '另一张便签', plugins: [] });
    const otherWin = await until(() => BrowserWindow.getAllWindows().find(w => w.requestId === other.id));
    const otherJs = source => otherWin.webContents.executeJavaScript(source, true);
    await until(() => !otherWin.webContents.isLoading() && otherJs('Boolean(document.querySelector("#reply"))'));
    await otherJs('window.states = 0; window.humanCli.onState(() => states++); true');
    await js('states = 0');
    await api(`/requests/${other.id}`, 'PATCH', { patch: { title: '另一张便签已更新' }, version: other.version });
    await sleep(100);
    check('Other request updates are not broadcast to this editor', await js('states === 0'));
    await js('original.focus(); original.setSelectionRange(0, original.value.length)');
    await insert('');
    await until(async () => (await snapshot()).reply === '');
    await sleep(50);
    check('This editor draft is not broadcast to the other note', await otherJs('states === 1'));

    await js('trace = []; original.focus()');
    await compose('ni');
    await sleep(400);
    check('Uncommitted pinyin is not persisted after the autosave interval', (await snapshot()).reply === '' && await js('original.value === "ni" && original === document.activeElement && removals === 0'));
    await compose('nihao');
    await sleep(350);
    check('Composition survives a pause with one native session and no duplicated pinyin', await js('original.value === "nihao" && trace.filter(e => e.name === "compositionstart").length === 1 && trace.some(e => e.name === "input" && e.composing && e.trusted) && !trace.some(e => e.name === "focusout")'));
    await js(`for (const key of ['Escape','Enter']) original.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: key === 'Enter', isComposing: true, bubbles: true }));
      original.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));`);
    check('Escape and submit shortcuts leave active composition pending', (await snapshot()).status === 'pending' && await js('original.isConnected && original.value === "nihao" && !trace.some(e => e.name === "focusout")'));
    await api(`/requests/${request.id}`, 'PATCH', { patch: { title: '选词期间更新的任务' }, version: (await snapshot()).version });
    await js('window.humanCli.preferences({ theme: "dark" })');
    await sleep(100);
    check('External updates are deferred during composition', await js('document.querySelector("h1").textContent === "更新后的任务" && document.documentElement.dataset.theme !== "dark" && original === document.activeElement'));
    await insert('你好');
    await until(async () => (await snapshot()).reply === '你好');
    await until(() => js('document.querySelector("h1").textContent === "选词期间更新的任务" && document.documentElement.dataset.theme === "dark"'));
    check('Commit persists Chinese and applies deferred state without replacing editor', await js('original.value === "你好" && original === document.activeElement && removals === 0 && trace.filter(e => e.name === "compositionend").length === 1 && !trace.some(e => e.name === "focusout")'));
    check('Theme preferences reach every pending note', await otherJs('document.documentElement.dataset.theme === "dark"'));

    // Upload completes while the following text block has a native composition.
    await js(`(() => {
      original.focus(); original.setSelectionRange(original.value.length, original.value.length);
      const file = { name: '现场说明.txt', type: 'text/plain', size: 1, arrayBuffer: () => new Promise(done => window.resolveFile = done) };
      const e = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'dataTransfer', { value: { files: [file], types: ['Files'] } }); original.dispatchEvent(e);
    })()`);
    await until(() => js('Boolean(window.resolveFile) && document.activeElement === [...document.querySelectorAll("[data-text-block]")].at(-1)'));
    await js('window.afterFile = document.activeElement; trace = [];');
    await compose('zhong');
    await js('resolveFile(new Uint8Array([1]).buffer)');
    await sleep(450);
    check('Upload callbacks preserve the composing text block and defer visual changes', await js('afterFile === document.activeElement && afterFile.value === "zhong" && document.querySelector(".reply-attachment").textContent.includes("正在保存") && !trace.some(e => e.name === "focusout")'));
    await insert('中文');
    await until(async () => (await snapshot()).content.some(b => b.type === 'file') && (await snapshot()).reply.includes('中文'));
    check('Upload settles after commit with ordered text/file/text and stable textarea', (await snapshot()).content.map(b => b.type).join(',') === 'text,file,text' && await js('afterFile === document.activeElement && afterFile.isConnected && !document.querySelector(".reply-attachment").textContent.includes("正在保存") && !trace.some(e => e.name === "focusout")'));
    await insert('A'); await sleep(350);
    check('Autosave in a multi-block reply preserves the textarea and attachment', (await snapshot()).reply.includes('中文A') && await js('afterFile === document.activeElement && afterFile.isConnected'));
    await compose('quxiao'); await sleep(300); await compose('');
    await sleep(350);
    check('Cancelling composition does not persist temporary pinyin', !(await snapshot()).reply.includes('quxiao') && await js('afterFile.value === "中文A"'));
    await js('afterFile.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
    check('Escape on the note pane does not rebuild the editor', await js('afterFile === document.activeElement && afterFile.isConnected'));
    win.webContents.debugger.detach();
    await js('afterFile.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }))');
    await until(() => win.isDestroyed());
    check('Ctrl+Enter still submits the committed reply with its attachment', (await snapshot()).status === 'completed' && (await snapshot()).result.content.some(b => b.type === 'file'));
    check('No renderer errors', errors.length === 0);
    writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
    console.log(`INPUT REPORT ${join(output, 'report.json')}`);
  } catch (error) {
    console.error(error); process.exitCode = 1;
    writeFileSync(join(output, 'failure.json'), JSON.stringify({ checks, error: error.stack, errors }, null, 2));
  } finally { app.exit(process.exitCode || 0); }
}
void run();
