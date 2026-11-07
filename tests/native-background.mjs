// Exercise the real renderer -> preload -> IPC -> HTTP -> CLI path in isolated data.
import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const output = resolve('.qa', `background-${randomUUID().slice(0, 8)}`);
process.env.ASK_FOR_USER_HELP_DATA_DIR = join(output, 'data');
process.env.ASK_FOR_USER_HELP_CACHE_DIR = join(output, 'cache');
mkdirSync(output, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const checks = [], errors = [], children = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
async function until(fn) {
  for (let i = 0; i < 150; i++) { const value = await fn(); if (value) return value; await sleep(40); }
  throw new Error('Background acceptance timed out');
}
function cli(args, input) {
  const child = spawn(process.execPath, [resolve('adapters/cli.mjs'), ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ASK_FOR_USER_HELP_NO_AUTOSTART: '1' }, stdio: 'pipe',
  });
  children.push(child);
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', (s) => { stdout += s; });
  child.stderr.setEncoding('utf8').on('data', (s) => { stderr += s; });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
  return { child, done, get stdout() { return stdout; } };
}

async function run() {
  try {
    const desktop = await import('../desktop/main.mjs'); await desktop.ready;
    const runtime = JSON.parse(readFileSync(join(process.env.ASK_FOR_USER_HELP_DATA_DIR, 'runtime.json'), 'utf8'));
    const api = async (path) => {
      const response = await fetch(runtime.url + path, { headers: { Authorization: `Bearer ${runtime.token}` } });
      assert.ok(response.ok); return response.json();
    };
    const js = (win, code) => win.webContents.executeJavaScript(code, true);
    const first = cli(['request', '-'], JSON.stringify({ title: '后台运行验收', description: '稍后回复，AI 可以先继续其他工作。', plugins: [], steps: ['确认后台运行通知'] }));
    const r = await until(async () => (await api('/requests')).find((r) => r.title === '后台运行验收'));
    const win = await until(() => BrowserWindow.getAllWindows().find((w) => w.requestId === r.id));
    win.webContents.on('render-process-gone', (_event, info) => errors.push(info.reason));
    win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
    await until(() => !win.webContents.isLoading() && js(win, 'Boolean(document.querySelector("#reply"))'));
    await until(async () => (await api(`/requests/${r.id}`)).receiver.waiting);
    check('Footer replaces the waiting label with a muted, keyboard-accessible button', await js(win, `(()=>{const b=document.querySelector('[data-action=background]');return b.tagName==='BUTTON' && b.textContent==='进入后台等待' && getComputedStyle(b).color===getComputedStyle(document.querySelector('.text-button')).color && !document.body.textContent.includes('等待你的反馈')})()`));
    await js(win, `document.querySelector('#nav-settings').click()`);
    await until(() => js(win, `Boolean(document.querySelector('[data-action=foregroundOnly]'))`));
    await js(win, `document.querySelector('[data-action=foregroundOnly]').click()`);
    await until(async () => (await api('/preferences')).foregroundOnly === true);
    await js(win, `document.querySelector('#nav-note').click()`);
    await until(() => js(win, `Boolean(document.querySelector('#reply'))`));
    const second = cli(['request', '-'], JSON.stringify({ title: '另一张仍在等待的便签', plugins: [] }));
    const other = await until(async () => (await api('/requests')).find((r) => r.title === '另一张仍在等待的便签'));
    await until(async () => (await api(`/requests/${other.id}`)).receiver.waiting);
    // Minimization alone must keep waiting; only the explicit background action releases it.
    await js(win, `document.querySelector('[data-action=hide]').click()`);
    await until(() => win.isMinimized());
    check('Titlebar minimize keeps AI waiting', (await api(`/requests/${r.id}`)).receiver.waiting && first.stdout === '');
    win.restore();
    await until(() => !win.isMinimized());
    await js(win, `document.querySelector('#reply').value='保留草稿，稍后完成';document.querySelector('#reply').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-step]').click()`);
    await until(async () => (await api(`/requests/${r.id}`)).reply === '保留草稿，稍后完成');
    for (const [width, height] of [[380, 360], [320, 300], [580, 500]]) {
      win.setSize(width, height); await sleep(80);
      check(`Footer controls fit at ${width} x ${height}`, await js(win, `(()=>{const a=document.querySelector('[data-action=background]').getBoundingClientRect(),b=document.querySelector('[data-action=complete]').getBoundingClientRect();return a.right<b.left && a.left>=0 && b.right<=innerWidth})()`));
    }
    win.setSize(380, 360); await sleep(100);
    writeFileSync(join(output, 'before.png'), (await win.webContents.capturePage()).toPNG());
    await js(win, `document.querySelector('[data-action=background]').click()`);
    await until(() => first.child.exitCode !== null);
    const result = await first.done, reply = JSON.parse(result.stdout);
    check('Click ends the waiting CLI with an explicit user background notice', result.code === 0 && reply.status === 'pending' && reply.background.by === 'user' && reply.background.message.includes('过程可能耗时较长，用户选择进入后台等待') && reply.background.message.includes('human_logs') && !reply.content);
    check('User action overrides foregroundOnly without changing that preference', (await api('/preferences')).foregroundOnly === true);
    await until(() => win.isMinimized());
    const snapshot = await api(`/requests/${r.id}`);
    check('Note stays pending, preserves the draft and checks, and releases its receiver', snapshot.status === 'pending' && snapshot.reply === '保留草稿，稍后完成' && snapshot.checks.includes(0) && !snapshot.receiver.waiting && !win.isDestroyed());
    check('Other note keeps waiting', (await api(`/requests/${other.id}`)).receiver.waiting && second.stdout === '');
    win.restore(); await until(() => !win.isMinimized());
    await until(() => js(win, `document.querySelector('[data-action=background]').disabled`));
    check('Restored note shows a quiet background state and an editable draft', await js(win, `document.querySelector('[data-action=background]').textContent==='已进入后台等待' && document.querySelector('#reply').value==='保留草稿，稍后完成' && !document.querySelector('#reply').disabled`));
    await sleep(100); writeFileSync(join(output, 'after.png'), (await win.webContents.capturePage()).toPNG());
    await js(win, `document.querySelector('[data-action=complete]').click()`);
    await until(() => win.isDestroyed());
    const completed = JSON.parse((await cli(['result', r.id]).done).stdout);
    check('Later completion persists the real reply for AI to retrieve', completed.status === 'completed' && completed.content[0].text === '保留草稿，稍后完成' && !completed.background);
    const logs = JSON.parse((await cli(['logs']).done).stdout);
    const log = logs.entries.find((entry) => entry.id === r.id);
    check('AI can recover the completed reply from the logged file path', log.status === 'completed' && JSON.parse(readFileSync(log.cache.replyPath, 'utf8')).content[0].text === '保留草稿，稍后完成');
    const otherWin = BrowserWindow.getAllWindows().find((w) => w.requestId === other.id);
    await js(otherWin, `document.querySelector('[data-action=close]').click()`);
    await second.done;
    check('No renderer errors', errors.length === 0);
    writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
    console.log(`NATIVE REPORT ${join(output, 'report.json')}`);
  } catch (error) {
    console.error(error); process.exitCode = 1;
    writeFileSync(join(output, 'failure.json'), JSON.stringify({ checks, errors, error: error.stack }, null, 2));
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    app.exit(process.exitCode || 0);
  }
}
void run();
