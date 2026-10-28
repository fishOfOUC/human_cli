import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, png } from './helpers.mjs';
import { startApi } from '../adapters/http.mjs';

async function setup(t) {
  const f = fixture(t), api = await startApi(f.service);
  t.after(() => { api.server.closeAllConnections(); return new Promise((done) => api.server.close(done)); });
  writeFileSync(join(f.directory, 'runtime.json'), JSON.stringify({ url: api.url, token: api.token }));
  const run = (args, input) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../adapters/cli.mjs', import.meta.url)), ...args], { env: { ...process.env, HUMAN_CLI_DATA_DIR: f.directory, HUMAN_CLI_NO_AUTOSTART: '1' }, stdio: 'pipe' });
    let stdout = '', stderr = '', settled = false;
    child.stdout.setEncoding('utf8').on('data', (value) => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', (value) => { stderr += value; });
    child.stdin.on('error', () => {}); child.stdin.end(input);
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => { settled = true; resolve({ code, stdout, stderr }); }); });
    t.after(() => { if (!settled) child.kill(); });
    return { child, done, get stdout() { return stdout; }, get settled() { return settled; } };
  };
  return { ...f, run };
}
async function until(check) {
  for (let attempt = 0; attempt < 200; attempt++) { const value = check(); if (value) return value; await new Promise((done) => setTimeout(done, 10)); }
  throw new Error('CLI did not reach expected state');
}

test('CLI request is one blocking human interaction and never returns while the user is still drafting', async (t) => {
  const { service, run } = await setup(t);
  const command = run(['request', '-'], JSON.stringify({ title: '请用户验收', plugins: [] }));
  const request = await until(() => service.list()[0]);
  await until(() => service.snapshot(request.id).receiver.waiting);
  service.draft(request.id, { reply: '还没打完字' });
  await new Promise((done) => setTimeout(done, 40));
  assert.equal(command.settled, false); assert.equal(command.stdout, '');
  service.addImage(request.id, { name: 'proof.png', mime: 'image/png', bytes: png });
  service.complete(request.id, { version: 1, reply: '我已验收' });
  const result = await command.done, value = JSON.parse(result.stdout);
  assert.equal(result.code, 0); assert.equal(value.status, 'completed'); assert.equal(value.result.reply, '我已验收');
  assert.equal(JSON.parse(result.stderr).event, 'waiting_for_user');
  const cached = JSON.parse(readFileSync(value.cache.replyPath, 'utf8'));
  assert.deepEqual(readFileSync(cached.images[0].path), png);
});

test('CLI only returns immediately with explicit --background, including stdin and file forms', async (t) => {
  const { service, directory, run } = await setup(t);
  const input = JSON.stringify({ title: '明确后台创建', plugins: [] });
  const file = join(directory, '请求.json'); writeFileSync(file, input);
  for (const args of [['request', '-', '--background'], ['request', '--background', file]]) {
    const result = await run(args, input).done, request = JSON.parse(result.stdout);
    assert.equal(result.code, 0); assert.equal(request.status, 'pending'); assert.equal(result.stderr, '');
    assert.equal(service.snapshot(request.id).receiver.waiting, false);
  }
});

test('CLI rejects misspelled request options instead of silently changing the waiting behavior', async (t) => {
  const { service, run } = await setup(t);
  const result = await run(['request', '--backgroun'], '{}').done;
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /用法/);
  assert.equal(service.list().length, 0);
});

test('disconnecting a default CLI request leaves human work and subsequent cached reply recoverable', async (t) => {
  const { service, run } = await setup(t);
  const command = run(['request', '-'], JSON.stringify({ title: '离开后继续', plugins: [] }));
  const request = await until(() => service.list()[0]);
  await until(() => service.snapshot(request.id).receiver.waiting);
  command.child.kill(); await command.done;
  await until(() => !service.snapshot(request.id).receiver.waiting);
  assert.equal(service.get(request.id).status, 'pending');
  service.complete(request.id, { version: 1, reply: '稍后完成' });
  const logs = JSON.parse((await run(['logs']).done).stdout);
  assert.equal(JSON.parse(readFileSync(logs.entries[0].cache.replyPath, 'utf8')).reply, '稍后完成');
});
