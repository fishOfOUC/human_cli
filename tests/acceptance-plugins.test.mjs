import test from 'node:test';
import assert from 'node:assert/strict';
import { startAcceptanceProvider } from './fixtures/acceptance-plugins.mjs';
import { NetworkPluginHost } from '../plugins/network-host.mjs';

test('three acceptance plugins expose different configuration modes and execute saved configurations over SPI', async (t) => {
  const provider = await startAcceptanceProvider();
  t.after(async () => { provider.server.closeAllConnections(); await new Promise((done) => provider.server.close(done)); });
  const host = await new NetworkPluginHost([{ id: 'acceptance', ...provider }], { pollMs: 5 }).initialize();
  assert.deepEqual(host.loadErrors, []);
  assert.deepEqual(host.list().map((m) => m.configUi.type), ['web', 'schema', 'none']);
  const run = (id, config) => host.execute(id, { request: {}, config: host.validateConfig(id, config) });
  assert.match((await run('acceptance.web', { label: '网页文字', color: '#123456', scale: 1.5 })).text, /网页文字\n颜色：#123456\n预览大小：1.5/);
  assert.equal((await run('acceptance.simple', { message: '验收', repeat: 2, format: '加方括号', showCounter: false })).text, '[验收]\n[验收]');
  assert.match((await run('acceptance.none', {})).text, /第 1 次/);
  assert.match((await run('acceptance.none', {})).text, /第 2 次/);
  assert.throws(() => host.validateConfig('acceptance.simple', { repeat: 4 }), { code: 'E_PLUGIN_CONFIG' });
});
