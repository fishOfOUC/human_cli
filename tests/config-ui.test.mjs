import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers.mjs';
import { startWebConfigProvider, webManifest } from './fixtures/web-config-provider.mjs';
import { NetworkPluginHost } from '../plugins/network-host.mjs';
import { ConfigUiSessions } from '../plugins/ui-sessions.mjs';
import { RequestService } from '../core/requests.mjs';
import { configUiDescriptor, configUiUrl, configUiStatus } from '../plugins/config-ui.mjs';

const config = { label: '原配置', color: '#486044', scale: 1 };
async function until(check) {
  for (let attempt = 0; attempt < 150; attempt++) { const value = check(); if (value) return value; await new Promise((done) => setTimeout(done, 10)); }
  throw new Error('Configuration session did not reach expected state');
}
async function setup(t, options = {}) {
  const f = fixture(t), provider = await startWebConfigProvider(options);
  const host = await new NetworkPluginHost([{ id: 'test-web', ...provider }], { pollMs: 5, rpcTimeoutMs: 300 }).initialize();
  const service = new RequestService(f.store, f.attachments, host), sessions = new ConfigUiSessions(service, { pollMs: 5, retryMs: 10 });
  t.after(async () => { await sessions.shutdown(); provider.server.closeAllConnections(); await new Promise((done) => provider.server.close(done)); });
  const request = service.create({ title: '网页配置测试', plugins: [{ id: 'web', plugin: webManifest.id, config }] });
  return { ...f, service, provider, host, sessions, request };
}

test('web descriptors are optional, same-origin, and reject unsafe or malformed UI locations', () => {
  assert.deepEqual(configUiDescriptor(undefined, 'http://127.0.0.1:8/rpc'), { type: 'schema' });
  assert.deepEqual(configUiDescriptor({ type: 'none' }, 'http://127.0.0.1:8/rpc'), { type: 'none' });
  const descriptor = configUiDescriptor({ type: 'web', path: '/ui' }, 'http://127.0.0.1:8/rpc');
  assert.equal(configUiUrl('http://127.0.0.1:8/ui/settings#session=x', descriptor, 'http://127.0.0.1:8/rpc'), 'http://127.0.0.1:8/ui/settings#session=x');
  for (const path of ['//evil.test/ui', '/ui?token=x', '/ui#x', '/\\evil.test']) assert.throws(() => configUiDescriptor({ type: 'web', path }, 'http://127.0.0.1:8/rpc'));
  for (const url of ['https://evil.test/ui', 'file:///ui', 'http://127.0.0.1:8/rpc', 'http://user:pass@127.0.0.1:8/ui']) assert.throws(() => configUiUrl(url, descriptor, 'http://127.0.0.1:8/rpc'));
  assert.throws(() => configUiUrl('http://127.0.0.1:8/ui#key=long-term-token', descriptor, 'http://127.0.0.1:8/rpc', 'long-term-token'), { code: 'E_UI_CREDENTIAL' });
});

test('custom web configuration is submitted over SPI, validated, persisted, then acknowledged and used by execution', async (t) => {
  const f = await setup(t), record = await f.sessions.open('win', f.request.id, 'web', { theme: 'sage' });
  assert.equal(f.sessions.snapshot('win').phase, 'ready'); assert.ok(!record.page.url.includes(f.provider.token));
  assert.deepEqual(f.service.get(f.request.id).tools[0].config, config);
  const edited = { ...config, label: '保存后的文字', scale: 1.5 };
  f.provider.submit(record.sessionId, edited);
  await until(() => f.provider.resolutions.length);
  assert.equal(f.provider.resolutions[0].accepted, true);
  assert.deepEqual(f.service.get(f.request.id).tools[0].config, edited);
  assert.deepEqual(f.store.data.pluginDefaults[webManifest.id], edited);
  assert.equal(JSON.parse(readFileSync(f.service.snapshot(f.request.id).cache.requestPath, 'utf8')).tools[0].config.label, edited.label);
  await f.service.run(f.request.id, 'web'); assert.equal(f.service.get(f.request.id).tools[0].output.text, '执行结果：保存后的文字');
});

test('close discards unsaved edits and revokes the page session without changing local configuration', async (t) => {
  const f = await setup(t), record = await f.sessions.open('win', f.request.id, 'web');
  const info = f.provider.sessions.get(record.sessionId);
  await f.sessions.close('win');
  assert.deepEqual(f.service.get(f.request.id).tools[0].config, config); assert.equal(f.provider.sessions.size, 0);
  const response = await fetch(`${new URL(f.provider.url).origin}/ui/state?sessionId=${record.sessionId}&key=${info.key}`);
  assert.equal(response.status, 404); assert.equal(f.sessions.snapshot('win'), null);
});

test('invalid configuration stays unsaved and can be corrected within the same web session', async (t) => {
  const f = await setup(t), record = await f.sessions.open('win', f.request.id, 'web');
  f.provider.submit(record.sessionId, { ...config, scale: 10 });
  await until(() => f.provider.resolutions.length === 1);
  assert.equal(f.provider.resolutions[0].accepted, false); assert.equal(f.provider.resolutions[0].error.code, 'E_PLUGIN_CONFIG');
  assert.deepEqual(f.service.get(f.request.id).tools[0].config, config);
  f.provider.submit(record.sessionId, { ...config, scale: 2 });
  await until(() => f.provider.resolutions.length === 2);
  assert.equal(f.service.get(f.request.id).tools[0].config.scale, 2); assert.ok(f.sessions.snapshot('win').savedAt);
});

test('external config changes invalidate the session instead of overwriting newer settings', async (t) => {
  const f = await setup(t); await f.sessions.open('win', f.request.id, 'web');
  f.service.configure(f.request.id, 'web', { ...config, label: '更新的设置' });
  assert.equal(f.sessions.snapshot('win').error.code, 'E_UI_STALE');
  await until(() => f.provider.sessions.size === 0);
  assert.equal(f.service.get(f.request.id).tools[0].config.label, '更新的设置');
});

test('AI update, completion and cancellation close active configuration sessions', async (t) => {
  for (const action of ['update', 'complete', 'cancel']) {
    const f = await setup(t); await f.sessions.open('win', f.request.id, 'web');
    if (action === 'update') f.service.update(f.request.id, { title: 'new instructions' }, 1);
    else if (action === 'complete') f.service.complete(f.request.id, { version: 1 });
    else f.service.cancel(f.request.id);
    assert.equal(f.sessions.snapshot('win'), null); await until(() => f.provider.sessions.size === 0);
  }
});

test('lost save acknowledgement retries do not apply the same configuration twice', async (t) => {
  const f = await setup(t), original = f.host.resolveConfigUi.bind(f.host);
  let attempts = 0, applied = 0;
  f.host.resolveConfigUi = (...args) => { if (++attempts === 1) throw Object.assign(new Error('connection lost'), { code: 'E_SPI_CONNECTION' }); return original(...args); };
  f.service.on('change', ({ event }) => { if (event === 'config') applied++; });
  const record = await f.sessions.open('win', f.request.id, 'web');
  f.provider.submit(record.sessionId, { ...config, label: '只保存一次' });
  await until(() => f.provider.resolutions.length);
  assert.equal(attempts, 2); assert.equal(applied, 1); assert.equal(f.provider.resolutions[0].accepted, true);
});

test('persistence failure restores original settings and defaults rather than reporting saved', async (t) => {
  const f = await setup(t), record = await f.sessions.open('win', f.request.id, 'web');
  const save = f.store.save.bind(f.store); let writes = 0;
  f.store.save = () => { if (++writes === 1) throw Object.assign(new Error('disk failed'), { code: 'E_DISK' }); return save(); };
  f.provider.submit(record.sessionId, { ...config, label: '不能保存' });
  await until(() => f.provider.resolutions.length);
  assert.equal(f.provider.resolutions[0].accepted, false); assert.deepEqual(f.service.get(f.request.id).tools[0].config, config);
  assert.equal(f.store.data.pluginDefaults[webManifest.id], undefined);
});

test('lost response after provider accepted the save recovers a consistent saved status', async (t) => {
  const f = await setup(t), original = f.host.resolveConfigUi.bind(f.host);
  let attempts = 0, applied = 0;
  f.host.resolveConfigUi = async (...args) => { const value = await original(...args); if (++attempts === 1) throw Object.assign(new Error('response lost'), { code: 'E_SPI_CONNECTION' }); return value; };
  f.service.on('change', ({ event }) => { if (event === 'config') applied++; });
  const record = await f.sessions.open('win', f.request.id, 'web');
  f.provider.submit(record.sessionId, { ...config, label: '响应丢失仍已保存' });
  await until(() => f.sessions.snapshot('win').savedAt);
  assert.equal(applied, 1); assert.equal(f.provider.resolutions.length, 1); assert.equal(f.sessions.snapshot('win').error, null);
});

test('configuration submissions cannot save while the bound plugin is running', async (t) => {
  let finish, started = false;
  const f = await setup(t, { execute: async () => { started = true; await new Promise((resolve) => { finish = resolve; }); return { text: 'done' }; } });
  const record = await f.sessions.open('win', f.request.id, 'web'), running = f.service.run(f.request.id, 'web');
  await until(() => started);
  f.provider.submit(record.sessionId, { ...config, label: '运行时修改' });
  await until(() => f.provider.resolutions.length);
  assert.equal(f.provider.resolutions[0].error.code, 'E_RUNNING'); assert.deepEqual(f.service.get(f.request.id).tools[0].config, config);
  finish(); await running;
});

test('UI protocol rejects mismatched sessions and oversized or non-object submissions', () => {
  assert.throws(() => configUiStatus({ sessionId: 'other', state: 'editing' }, 'expected'));
  assert.throws(() => configUiStatus({ sessionId: 'expected', state: 'unknown' }, 'expected'));
  assert.throws(() => configUiStatus({ sessionId: 'expected', state: 'submitted', submission: { id: 'not-uuid', config: {} } }, 'expected'));
  for (const config of [null, [], 'text', { content: 'x'.repeat(256 * 1024) }]) assert.throws(() => configUiStatus({ sessionId: 'expected', state: 'submitted', submission: { id: '00000000-0000-4000-8000-000000000001', config } }, 'expected'), { code: 'E_UI_PROTOCOL' });
});

test('closing during a slow open does not resurrect the page or leave a provider session behind', async (t) => {
  const f = await setup(t), original = f.host.openConfigUi.bind(f.host);
  let opened = false, finish;
  f.host.openConfigUi = async (...args) => { const value = await original(...args); opened = true; await new Promise((resolve) => { finish = resolve; }); return value; };
  const opening = f.sessions.open('win', f.request.id, 'web');
  await until(() => opened); await f.sessions.close('win'); finish(); await opening;
  await until(() => f.provider.sessions.size === 0);
  assert.equal(f.sessions.snapshot('win'), null); assert.deepEqual(f.service.get(f.request.id).tools[0].config, config);
});
