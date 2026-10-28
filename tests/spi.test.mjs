import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fixture, png } from './helpers.mjs';
import { startSpiServer } from '../plugins/spi-server.mjs';
import { NetworkPluginHost, readProviders } from '../plugins/network-host.mjs';
import { RequestService } from '../core/requests.mjs';
import { rpc, decodeOutput } from '../plugins/spi-rpc.mjs';

const close = (server) => { server.closeAllConnections(); return server.listening ? new Promise((r) => server.close(r)) : Promise.resolve(); };
const manifest = { apiVersion: 1, id: 'test.network', name: '网络服务', version: '1', side: 'right', icon: 'puzzle', configSchema: { type: 'object', properties: {} } };
async function networkFixture(t, execute, { rpcTimeoutMs = 500, pollMs = 10 } = {}) {
  const f = fixture(t);
  const provider = await startSpiServer({ plugins: [manifest], execute }); t.after(() => close(provider.server));
  const host = await new NetworkPluginHost([{ id: 'test-provider', ...provider }], { rpcTimeoutMs, pollMs }).initialize();
  const service = new RequestService(f.store, f.attachments, host);
  return { ...f, host, service, provider };
}
test('built-in Node plugins execute through HTTP SPI with exact binary round trip', async (t) => {
  const f = fixture(t), provider = await startSpiServer({ plugins: () => f.plugins.list(), execute: (id, ctx, options) => f.plugins.execute(id, ctx, options) });
  t.after(() => close(provider.server));
  const host = await new NetworkPluginHost([{ id: 'builtin', ...provider }], { pollMs: 5 }).initialize();
  assert.equal(host.list().length, 4); assert.ok(!Object.hasOwn(host.list()[0], 'entry'));
  const service = new RequestService(f.store, f.attachments, host), r = service.create({ title: '网络截图' });
  await service.run(r.id, 'capture');
  const after = service.snapshot(r.id); assert.equal(after.tools[0].state, 'success'); assert.equal(after.images.length, 1);
  assert.deepEqual(f.attachments.bytes(after.images[0].id), png);
});
test('SPI execution can exceed per-connection deadline without a total job deadline', async (t) => {
  const f = await networkFixture(t, async () => { await new Promise((r) => setTimeout(r, 450)); return { text: 'long work done' }; }, { rpcTimeoutMs: 250 });
  const r = f.service.create({ title: 'work', plugins: [{ id: 'network', plugin: 'test.network' }] });
  await f.service.run(r.id, 'network'); assert.equal(f.service.get(r.id).tools[0].output.text, 'long work done');
});
test('AI cancellation propagates to provider job without changing unrelated user work', async (t) => {
  let started = false, stopped = false;
  const f = await networkFixture(t, (_id, _ctx, { signal }) => new Promise((_resolve, reject) => {
    started = true; signal.addEventListener('abort', () => { stopped = true; reject(new Error('stopped')); }, { once: true });
  }));
  const r = f.service.create({ title: 'cancel', plugins: [{ id: 'network', plugin: 'test.network' }] }), running = f.service.run(r.id, 'network');
  while (!started) await new Promise((r) => setTimeout(r, 5));
  f.service.cancel(r.id, 'AI cancel'); await running;
  assert.equal(stopped, true); assert.equal(f.service.get(r.id).status, 'cancelled');
});
test('provider failure is a tool error, not a cancelled human request', async (t) => {
  const f = await networkFixture(t, async () => { throw Object.assign(new Error('remote failure'), { code: 'E_REMOTE_FAILURE', details: 'provider-specific stack' }); });
  const r = f.service.create({ title: 'x', plugins: [{ id: 'network', plugin: 'test.network' }] });
  await f.service.run(r.id, 'network');
  assert.equal(f.service.get(r.id).status, 'pending'); assert.equal(f.service.get(r.id).tools[0].error.code, 'E_REMOTE_FAILURE');
  assert.equal(f.service.get(r.id).tools[0].error.details, 'provider-specific stack');
});
test('SPI auth, run idempotency and result forgetting are enforced', async (t) => {
  let executions = 0;
  const provider = await startSpiServer({ plugins: [manifest], execute: async () => { executions++; return { text: 'ok' }; } }); t.after(() => close(provider.server));
  await assert.rejects(rpc({ id: 'bad', url: provider.url, token: 'wrong' }, 'spi.describe'), { code: 'E_SPI_HTTP' });
  const runId = randomUUID(), params = { runId, pluginId: manifest.id, request: {}, config: {} };
  await rpc(provider, 'spi.start', params); await rpc(provider, 'spi.start', params);
  assert.equal(executions, 1); const result = await rpc(provider, 'spi.status', { runId }); assert.equal(result.state, 'completed');
  await rpc(provider, 'spi.forget', { runId }); await assert.rejects(rpc(provider, 'spi.status', { runId }), { code: 'E_SPI_JOB_MISSING' });
});
test('provider discovery isolates unreachable service and rejects malformed attachment encodings', async (t) => {
  const f = fixture(t), config = join(f.directory, 'providers.json');
  writeFileSync(config, JSON.stringify({ version: 1, providers: [{ id: 'external', url: 'http://127.0.0.1:1/rpc', token: 'x' }] }));
  const host = await new NetworkPluginHost(readProviders(config), { rpcTimeoutMs: 100 }).initialize();
  assert.equal(host.list().length, 0); assert.equal(host.loadErrors.length, 1);
  assert.throws(() => decodeOutput({ text: '', attachments: [{ name: 'x', mime: 'image/png', data: 'invalid!' }] }), /Base64/);
});
const pythonAvailable = spawnSync('python', ['--version'], { windowsHide: true }).status === 0;
test('independent Python SPI provider handles Unicode and binary attachments without Node plugin loading', { skip: !pythonAvailable }, async (t) => {
  const child = spawn('python', ['-u', resolve('examples/spi-python/provider.py'), '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const endpoint = await new Promise((resolve, reject) => {
    let data = ''; const timer = setTimeout(() => reject(new Error('Python provider startup timeout')), 5000);
    child.once('error', reject); child.stdout.on('data', (chunk) => { data += chunk; if (data.includes('\n')) { clearTimeout(timer); try { resolve(JSON.parse(data.split('\n')[0])); } catch (error) { reject(error); } } });
  });
  const f = fixture(t), host = await new NetworkPluginHost([{ id: 'python', ...endpoint }], { pollMs: 5 }).initialize();
  assert.equal(host.list()[0].providerId, 'python');
  const service = new RequestService(f.store, f.attachments, host);
  const r = service.create({ title: '中文跨语言测试', plugins: [{ id: 'python', plugin: 'example.python-note', config: { prefix: '中文记录', includeImage: true } }] });
  await service.run(r.id, 'python'); const tool = service.snapshot(r.id).tools[0];
  assert.equal(tool.state, 'success'); assert.match(tool.output.text, /中文记录.*\n请求：中文跨语言测试/);
  const image = tool.output.attachments.find((a) => a.mime === 'image/png'); assert.deepEqual(f.attachments.bytes(image.id), png);
  service.attach(r.id, image.id); service.complete(r.id, { version: 1, reply: 'Python 服务结果已保存' });
  assert.equal(service.snapshot(r.id).result.images.length, 1);
});
