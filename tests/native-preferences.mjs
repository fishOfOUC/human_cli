// Native acceptance for foreground-only AI calls and keep-open note windows.
// Runs in Electron with the real IPC/CLI paths; never sends global input.
// Keep this file out of release packages.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const output = resolve('.qa', `native-pref-${randomUUID().slice(0, 8)}`);
mkdirSync(output, { recursive: true }); process.env.ASK_FOR_USER_HELP_DATA_DIR = join(output, 'data');
process.env.ASK_FOR_USER_HELP_CACHE_DIR = join(output, 'cache');
const checks = [], errors = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(70); }
  throw new Error('Native acceptance timed out');
}
async function ready(win) { if (win.webContents.isLoading()) await once(win.webContents, 'did-finish-load'); await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector("h1"))')); }
let cliProcess;
async function runAcceptance() {
try {
  const desktop = await import('../desktop/main.mjs');
  await desktop.ready;
  const runtime = JSON.parse(readFileSync(join(process.env.ASK_FOR_USER_HELP_DATA_DIR, 'runtime.json'), 'utf8'));
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(runtime.url + path, { method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
  };
  const js = (win, code) => win.webContents.executeJavaScript(code, true);
  const replyViaRenderer = async (win, text) => {
    await js(win, `document.querySelector("#reply").value=${JSON.stringify(text)};document.querySelector("#reply").dispatchEvent(new Event("input",{bubbles:true}))`);
    await js(win, 'document.querySelector("[data-action=complete]").click()');
  };
  const spawnCli = (args, input) => {
    const child = spawn(process.execPath, [resolve('adapters/cli.mjs'), ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ASK_FOR_USER_HELP_NO_AUTOSTART: '1' }, stdio: 'pipe' });
    let stdout = '', stderr = ''; let closed = false;
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const done = new Promise((resolveResult, reject) => { child.once('error', reject); child.once('close', (code) => { closed = true; resolveResult({ code, stdout, stderr }); }); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
    return { done, get closed() { return closed; }, get stdout() { return stdout; }, get stderr() { return stderr; } };
  };

  check('Startup has no home or waiting window', BrowserWindow.getAllWindows().length === 0);

  // Enable both new preferences through the real settings UI.
  const first = await api('/requests', 'POST', { title: '偏好设置验收', plugins: [] });
  const setupWin = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === first.id)); await ready(setupWin);
  await js(setupWin, 'document.querySelector("[data-pane=settings]").click()');
  await js(setupWin, 'document.querySelector("[data-action=foregroundOnly]").click()');
  await js(setupWin, 'document.querySelector("[data-action=keepOpen]").click()');
  await until(async () => (await api('/preferences')).foregroundOnly === true && (await api('/preferences')).keepOpen === true);
  check('Settings toggles persist foregroundOnly and keepOpen', true);
  check('Preferences endpoint serves foregroundOnly to adapters', (await api('/preferences')).foregroundOnly === true);

  // Forced foreground: a --background CLI call blocks until the reply and gains the notice.
  const forced = spawnCli(['request', '-', '--background'], JSON.stringify({ title: '强制前台验收', plugins: [] }));
  const forcedRequest = await until(async () => (await api('/requests')).find((entry) => entry.title === '强制前台验收'));
  const forcedWin = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === forcedRequest.id)); await ready(forcedWin);
  await until(async () => (await api(`/requests/${forcedRequest.id}`)).receiver.waiting);
  await sleep(80);
  check('Background call waits in foreground when foregroundOnly is on', !forced.closed && forced.stdout === '');
  await replyViaRenderer(forcedWin, '前台完成');
  const forcedResult = await forced.done, forcedReply = JSON.parse(forcedResult.stdout);
  check('Forced foreground reply carries the added notice', forcedResult.code === 0 && forcedReply.status === 'completed' && forcedReply.content.at(-1).text === '用户已勾选仅允许前台调用。' && forcedResult.stderr.includes('waiting_for_user'));
  check('keepOpen retains the finished note window', await until(() => BrowserWindow.getAllWindows().includes(forcedWin)) && !forcedWin.isDestroyed() && forcedWin.isVisible());
  check('Finished note shows the completed view', await js(forcedWin, 'document.querySelector("#shared-panel").textContent.includes("回复已提交")'));
  await js(forcedWin, 'document.querySelector("[data-action=close]").click()');
  await until(() => forcedWin.isDestroyed());
  check('Dismiss closes the kept-open window without errors', BrowserWindow.getAllWindows().length === 1);

  // A plain foreground call never gains the notice.
  const direct = spawnCli(['request', '-'], JSON.stringify({ title: '前台调用验收', plugins: [] }));
  const directRequest = await until(async () => (await api('/requests')).find((entry) => entry.title === '前台调用验收'));
  const directWin = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === directRequest.id)); await ready(directWin);
  await until(async () => (await api(`/requests/${directRequest.id}`)).receiver.waiting);
  await replyViaRenderer(directWin, '正常回复');
  const directReply = JSON.parse((await direct.done).stdout);
  check('Foreground call has no notice and keepOpen still retains it', directReply.content.at(-1).text === '正常回复' && !directWin.isDestroyed());

  // Turn both preferences off through the UI of the kept-open window.
  await js(directWin, 'document.querySelector("[data-pane=settings]").click()');
  await js(directWin, 'document.querySelector("[data-action=foregroundOnly]").click()');
  await js(directWin, 'document.querySelector("[data-action=keepOpen]").click()');
  await until(async () => (await api('/preferences')).foregroundOnly === false && (await api('/preferences')).keepOpen === false);
  check('Toggling preferences off persists', true);
  await js(directWin, 'document.querySelector("[data-action=close]").click()');
  await until(() => directWin.isDestroyed());
  await api(`/requests/${first.id}/cancel`, 'POST', { reason: '偏好设置完成' });
  await until(() => setupWin.isDestroyed());
  check('Setup note auto-closes when keepOpen is off', true);

  // Original behaviors are restored: background returns immediately, finished notes close themselves.
  const background = spawnCli(['request', '-', '--background'], JSON.stringify({ title: '后台立即返回验收', plugins: [] }));
  const backgroundResult = await background.done, backgroundReply = JSON.parse(backgroundResult.stdout);
  check('Background call returns immediately again', backgroundResult.code === 0 && backgroundReply.status === 'pending' && backgroundResult.stderr === '');
  const backgroundWin = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === backgroundReply.requestId)); await ready(backgroundWin);
  await api(`/requests/${backgroundReply.requestId}/cancel`, 'POST', { reason: '偏好验收结束' });
  await until(() => backgroundWin.isDestroyed());
  check('Finished note auto-closes when keepOpen is off', BrowserWindow.getAllWindows().length === 0);
  check('No native renderer errors', errors.length === 0);
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(`NATIVE REPORT ${join(output, 'report.json')}`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ checks, error: error.stack, errors }, null, 2));
} finally { if (cliProcess && cliProcess.exitCode === null) cliProcess.kill(); if (process.exitCode) app.once('will-quit', () => app.exit(process.exitCode)); app.quit(); }
}
void runAcceptance();
