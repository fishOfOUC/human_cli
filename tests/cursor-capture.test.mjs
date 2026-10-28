import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { fixture, png } from './helpers.mjs';
import { startSpiServer } from '../plugins/spi-server.mjs';
import { NetworkPluginHost } from '../plugins/network-host.mjs';
import { RequestService } from '../core/requests.mjs';
import { decodeOutput, encodeOutput } from '../plugins/spi-rpc.mjs';

const message = '已截取鼠标所在屏幕，请查收截图。';
async function setup(t, config = {}) {
  const captures = [], f = fixture(t, { 'screen.capture': async (options) => { captures.push(options); return png; } });
  f.plugins.load(fileURLToPath(new URL('../examples/plugins/cursor-capture-reply', import.meta.url)));
  const provider = await startSpiServer({ plugins: () => f.plugins.list(), execute: (id, ctx, options) => f.plugins.execute(id, ctx, options) });
  t.after(() => { provider.server.closeAllConnections(); return new Promise((done) => provider.server.close(done)); });
  const host = await new NetworkPluginHost([{ id: 'example-local-spi', ...provider }], { pollMs: 5 }).initialize();
  const service = new RequestService(f.store, f.attachments, host);
  const request = service.create({ title: '鼠标屏幕截图', plugins: [{ id: 'capture-reply', plugin: 'example.cursor-capture-reply', config }] });
  return { ...f, service, request, captures };
}

test('cursor capture extension runs through HTTP SPI and attaches image plus sentence without altering the draft', async (t) => {
  const f = await setup(t); f.service.draft(f.request.id, { reply: '用户还在打字' });
  await f.service.run(f.request.id, 'capture-reply');
  const after = f.service.snapshot(f.request.id);
  assert.equal(after.tools[0].state, 'success');
  assert.deepEqual(f.captures[0], { display: 'cursor', delayMs: 500 });
  assert.equal(after.reply, '用户还在打字');
  assert.deepEqual(after.replyNotes, [{ toolId: 'capture-reply', text: message }]);
  assert.deepEqual(f.attachments.bytes(after.images[0].id), png);
  const complete = f.service.complete(after.id, { version: 1, reply: '用户输入已完成' });
  assert.equal(complete.result.reply, `用户输入已完成\n${message}`);
  const saved = JSON.parse(readFileSync(complete.cache.replyPath, 'utf8'));
  assert.equal(saved.reply, complete.result.reply); assert.deepEqual(readFileSync(saved.images[0].path), png);
});

test('caption is configurable, replaced on rerun, removable, and excluded by only-complete', async (t) => {
  const f = await setup(t, { message: '第一次附言' });
  await f.service.run(f.request.id, 'capture-reply');
  f.service.configure(f.request.id, 'capture-reply', { message: '修改后的附言', autoAttach: true });
  await f.service.run(f.request.id, 'capture-reply');
  assert.deepEqual(f.service.snapshot(f.request.id).replyNotes, [{ toolId: 'capture-reply', text: '修改后的附言' }]);
  f.service.removeReplyNote(f.request.id, 'capture-reply'); assert.equal(f.service.snapshot(f.request.id).replyNotes.length, 0);
  await f.service.run(f.request.id, 'capture-reply');
  assert.equal(f.service.complete(f.request.id, { version: 1, only: true }).result.reply, '已完成');
});

test('disabled auto-attach keeps both screenshot and caption in tool output only', async (t) => {
  const f = await setup(t, { autoAttach: false }); await f.service.run(f.request.id, 'capture-reply');
  const after = f.service.snapshot(f.request.id);
  assert.equal(after.images.length, 0); assert.equal(after.replyNotes.length, 0);
  assert.equal(after.tools[0].output.replyText, message); assert.equal(after.tools[0].output.attachments.length, 1);
});

test('full image capacity reports an error instead of falsely claiming screenshot attachment succeeded', async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 8; i++) f.service.addImage(f.request.id, { name: `${i}.png`, mime: 'image/png', bytes: png });
  await f.service.run(f.request.id, 'capture-reply');
  const after = f.service.snapshot(f.request.id);
  assert.equal(after.tools[0].error.code, 'E_IMAGE_LIMIT'); assert.equal(after.images.length, 8); assert.equal(after.replyNotes.length, 0);
});

test('replyText is optional and validated across the SPI wire boundary', () => {
  assert.equal(decodeOutput(encodeOutput({ text: 'status', replyText: message })).replyText, message);
  assert.equal(decodeOutput({ text: 'old provider' }).replyText, undefined);
  assert.throws(() => decodeOutput({ text: 'bad', replyText: { text: 'wrong' } }), { code: 'E_PLUGIN_REPLY_TEXT' });
  assert.throws(() => encodeOutput({ text: 'too large', replyText: 'x'.repeat(2001) }), { code: 'E_PLUGIN_REPLY_TEXT' });
});
