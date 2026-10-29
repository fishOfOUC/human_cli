import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, png } from './helpers.mjs';
import { startApi } from '../adapters/http.mjs';
import { createServer } from 'node:http';

async function setup(t, apiFactory = startApi) {
  const f = fixture(t), api = await apiFactory(f.service);
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

test('a lost creation response retries with the same idempotency key and creates only one note', async (t) => {
  const keys = [];
  const { service, run } = await setup(t, async (service) => {
    const server = createServer(async (req, res) => {
      if (req.url === '/health') { res.end(JSON.stringify({ name: 'human_cli' })); return; }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString()); keys.push(input.idempotencyKey);
      const request = service.create(input);
      if (keys.length === 1) req.socket.destroy();
      else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(request)); }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    return { server, token: 'test-token', url: `http://127.0.0.1:${server.address().port}` };
  });
  const result = await run(['request', '-', '--background'], JSON.stringify({ title: '安全重连', plugins: [] })).done;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(service.list().length, 1); assert.equal(keys.length, 2);
  assert.ok(keys[0]); assert.equal(keys[0], keys[1]);
  assert.equal(JSON.parse(result.stdout).requestId, service.list()[0].id);
});
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
  assert.equal(result.code, 0); assert.equal(value.status, 'completed'); assert.equal(value.content[0].text, '我已验收');
  assert.deepEqual(Object.keys(value).sort(), ['content', 'requestId', 'schemaVersion', 'status']);
  assert.equal(JSON.parse(result.stderr).event, 'waiting_for_user');
  const cached = JSON.parse(readFileSync(service.logs().entries[0].cache.replyPath, 'utf8'));
  assert.deepEqual(cached, value);
  assert.deepEqual(readFileSync(cached.content[1].path), png);
});

test('CLI only returns immediately with explicit --background, including stdin and file forms', async (t) => {
  const { service, directory, run } = await setup(t);
  const input = JSON.stringify({ title: '明确后台创建', plugins: [] });
  const file = join(directory, '请求.json'); writeFileSync(file, input);
  for (const args of [['request', '-', '--background'], ['request', '--background', file]]) {
    const result = await run(args, input).done, request = JSON.parse(result.stdout);
    assert.equal(result.code, 0); assert.equal(request.status, 'pending'); assert.equal(result.stderr, '');
    assert.equal(service.snapshot(request.requestId).receiver.waiting, false);
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
  assert.equal(JSON.parse(readFileSync(logs.entries[0].cache.replyPath, 'utf8')).content[0].text, '稍后完成');
});

test('CLI wait/result share the new reply and explicit legacy retains the previous snapshot/image output', async (t) => {
  const { service, run } = await setup(t), r = service.create({ title: 'compatibility', plugins: [] });
  service.addImage(r.id, { name: 'proof.png', mime: 'image/png', bytes: png }); service.complete(r.id, { version: 1, reply: '正文' });
  const waiting = JSON.parse((await run(['wait', r.id]).done).stdout);
  const result = JSON.parse((await run(['result', r.id]).done).stdout);
  assert.deepEqual(waiting, result);
  const oldWait = JSON.parse((await run(['wait', r.id, '--format', 'legacy']).done).stdout);
  const oldResult = JSON.parse((await run(['result', r.id, '--format', 'legacy']).done).stdout);
  assert.equal(oldWait.result.reply, '正文'); assert.equal(oldWait.content, undefined); assert.equal(oldWait.result.content, undefined);
  assert.equal(oldResult.result.images[0].data, png.toString('base64'));
});
