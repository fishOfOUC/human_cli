import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import electron from 'electron';
import { stableBounds } from '../desktop/geometry.mjs';

const output = resolve('.qa', `lifecycle-${randomUUID().slice(0, 8)}`), data = join(output, 'data');
mkdirSync(output, { recursive: true });
const env = { ...process.env, HUMAN_CLI_DATA_DIR: data, HUMAN_CLI_NO_AUTOSTART: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const checks = [], check = (name, result) => { assert.ok(result, name); checks.push(name); console.log(`PASS ${name}`); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn) { for (let i = 0; i < 200; i++) { const value = await fn(); if (value) return value; await sleep(40); } throw new Error('Native lifecycle check timed out'); }
let sequence = 0, current, cli;
function launch() {
  const child = spawn(electron, [resolve('tests/fixtures/lifecycle-desktop.mjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stderr = '', ready;
  child.stderr.on('data', (v) => { stderr += v; }); child.stdout.resume();
  const events = [], pending = new Map();
  child.on('message', (message) => {
    if (message.event) { events.push(message); if (message.event === 'ready') ready = message; }
    else if (pending.has(message.id)) { const { resolve: done, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error)) : done(message.value); }
  });
  const closed = new Promise((done, reject) => { child.once('error', reject); child.once('close', (code) => { for (const { reject } of pending.values()) reject(new Error('Desktop exited')); done({ code, stderr }); }); });
  return { child, events, closed, get ready() { return ready; },
    command(action, requestId, text) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); child.send({ id, action, requestId, text }); }); } };
}
function command(args, input) {
  const child = spawn(process.execPath, [resolve('adapters/cli.mjs'), ...args], { env, windowsHide: true, stdio: 'pipe' });
  let stdout = '', stderr = '', settled = false;
  child.stdout.on('data', (v) => { stdout += v; }); child.stderr.on('data', (v) => { stderr += v; });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => { settled = true; resolve({ code, stdout, stderr }); }); });
  return { child, done, get settled() { return settled; } };
}
try {
  current = launch(); await until(() => current.ready);
  check('Startup exposes no home window', current.ready.windows.length === 0);
  assert.equal((await current.closed).code, 0);
  check('An unused desktop exits without ever creating a window', !current.events.some((e) => e.event === 'window') && !existsSync(join(data, 'runtime.json')));

  current = launch(); const { runtime } = await until(() => current.ready);
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(runtime.url + path, { method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  cli = command(['request', '-'], JSON.stringify({ title: '一次调用后自行消失', plugins: [] }));
  const first = await until(async () => (await api('/requests'))[0]);
  await until(async () => (await api(`/requests/${first.id}`)).receiver.waiting);
  const second = await api('/requests', 'POST', { title: '并行请求', plugins: [] });
  await until(async () => (await current.command('windows')).filter((w) => w.visible).length === 2);
  check('Only AI task windows appear', current.events.filter((e) => e.event === 'window').every((e) => [first.id, second.id].includes(e.requestId)));
  await current.command('draft', first.id, '还没写完');
  await until(async () => (await api(`/requests/${first.id}`)).reply === '还没写完');
  check('Drafting never finishes the calling CLI', !cli.settled);
  await current.command('minimize', first.id);
  await until(async () => (await current.command('windows')).find((w) => w.requestId === first.id)?.minimized);
  check('Pending note can be restored from taskbar without a tray', (await api(`/requests/${first.id}`)).status === 'pending');
  await current.command('restore', first.id); await current.command('draft', first.id, '已验收，便签可以消失了');
  await until(async () => (await api(`/requests/${first.id}`)).reply.includes('已验收'));
  await current.command('capture', first.id);
  const resized = await current.command('resize', first.id);
  await current.command('complete', first.id);
  const result = await cli.done; assert.equal(result.code, 0, result.stderr);
  const completed = JSON.parse(result.stdout);
  check('The same CLI receives the full persisted completion', completed.result.reply === '已验收，便签可以消失了' && existsSync(completed.cache.replyPath));
  await until(async () => (await current.command('windows')).length === 1);
  check('Completed note is destroyed while another pending note stays', (await current.command('windows'))[0].requestId === second.id);
  await api(`/requests/${second.id}/cancel`, 'POST', { reason: '并行任务结束' });
  const exited = await current.closed; assert.equal(exited.code, 0, exited.stderr);
  check('Last cancellation drains its reply, removes all windows and exits the actual process', !existsSync(join(data, 'runtime.json')) && current.events.find((e) => e.event === 'exiting')?.windows.length === 0);
  check('Immediate completion flushes a recent resize; ending an unchanged companion does not overwrite it', JSON.parse(readFileSync(join(data, 'state.json'), 'utf8')).geometry.bounds.width === stableBounds(resized.bounds, resized.scaleFactor).width);

  current = launch(); await until(() => current.ready);
  check('Restart with only completed history creates no windows', current.ready.windows.length === 0);
  const logs = await command(['logs']).done;
  check('AI recovers cached reply through logs without a user interface', logs.code === 0 && JSON.parse(readFileSync(JSON.parse(logs.stdout).entries.find((r) => r.id === first.id).cache.replyPath, 'utf8')).reply.includes('已验收'));
  await current.closed;
  check('Read-only recovery process also exits automatically', !existsSync(join(data, 'runtime.json')));
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks }, null, 2));
  console.log(`LIFECYCLE REPORT ${join(output, 'report.json')}`);
} finally {
  if (cli && !cli.settled) cli.child.kill();
  if (current?.child.exitCode === null) current.child.kill();
}
