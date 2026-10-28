import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, png } from './helpers.mjs';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { RequestService } from '../core/requests.mjs';
import { startApi } from '../adapters/http.mjs';

test('human wait creates no deadline timer and survives a day of user inactivity', async (t) => {
  const { service } = fixture(t), r = service.create({ title: '慢慢来' }), abort = new AbortController();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let settled = false;
  const waiting = service.wait(r.id, abort.signal).finally(() => { settled = true; });
  t.mock.timers.tick(24 * 60 * 60 * 1000); await Promise.resolve();
  assert.equal(settled, false); assert.equal(service.get(r.id).status, 'pending');
  service.complete(r.id, { version: 1, reply: '回完消息再完成' });
  assert.equal((await waiting).result.reply, '回完消息再完成');
});
test('disconnected receiver does not lose reply, attachments, or restart recovery', async (t) => {
  const f = fixture(t), r = f.service.create({ title: '离线保存' }), abort = new AbortController();
  const waiting = f.service.wait(r.id, abort.signal); assert.equal(f.service.snapshot(r.id).receiver.waiting, true);
  abort.abort(); await assert.rejects(waiting, { code: 'E_WAIT_DISCONNECTED' });
  assert.equal(f.service.snapshot(r.id).receiver.waiting, false);
  f.service.addImage(r.id, { name: 'proof.png', mime: 'image/png', bytes: png });
  f.service.complete(r.id, { version: 1, reply: '已做完，先保存' });
  const store = new JsonStore(f.directory), reopened = new RequestService(store, new AttachmentStore(store), f.plugins);
  const result = await reopened.wait(r.id);
  assert.equal(result.cache.state, 'saved'); assert.equal(result.result.reply, '已做完，先保存'); assert.equal(result.result.images.length, 1);
  assert.equal(reopened.listenerCount('change'), 0);
});
test('reading a saved reply is repeatable and requires no acknowledgement', async (t) => {
  const { service } = fixture(t), r = service.create({ title: 'read retry' }); service.complete(r.id, { version: 1, reply: '内容' });
  const first = await service.wait(r.id), second = await service.wait(r.id);
  assert.equal(first.cache.state, 'saved'); assert.deepEqual(first.result, second.result);
  assert.equal(first.delivery, undefined); assert.equal(typeof service.acknowledge, 'undefined');
});
test('user can discard cached reply without pretending AI cancelled the request', (t) => {
  const { service, attachments } = fixture(t), r = service.create({ title: 'discard' }); const image = service.addImage(r.id, { name: 'x.png', mime: 'image/png', bytes: png });
  service.complete(r.id, { version: 1, reply: '缓存的私密内容' });
  assert.throws(() => service.discardReply(r.id, 1), { code: 'E_VERSION' });
  service.discardReply(r.id, service.get(r.id).version);
  const after = service.snapshot(r.id);
  assert.equal(after.status, 'completed'); assert.equal(after.cache.state, 'discarded'); assert.equal(after.result, null);
  assert.equal(after.reply, ''); assert.deepEqual(after.images, []); assert.ok(!after.cancelReason);
  assert.throws(() => attachments.bytes(image.id), { code: 'E_ATTACHMENT' });
  assert.throws(() => service.discardReply(r.id, after.version), { code: 'E_REPLY_STATE' });
});
test('HTTP wait disconnects cleanly; a later receiver obtains complete persisted result', async (t) => {
  const { service } = fixture(t), api = await startApi(service), r = service.create({ title: 'http reconnect' });
  t.after(() => { api.server.closeAllConnections(); return new Promise((resolve) => api.server.close(resolve)); });
  const headers = { Authorization: `Bearer ${api.token}` }, abort = new AbortController();
  const response = await fetch(`${api.url}/requests/${r.id}/wait`, { headers, signal: abort.signal });
  const body = response.json(); abort.abort(); await assert.rejects(body);
  await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(service.get(r.id).status, 'pending');
  service.complete(r.id, { version: 1, reply: 'disconnect safe' });
  const retry = await fetch(`${api.url}/requests/${r.id}/wait`, { headers });
  assert.equal((await retry.json()).result.reply, 'disconnect safe'); assert.equal(service.get(r.id).cache.state, 'saved');
});
test('discard deletes unreferenced reply images but retains independently saved tool results', async (t) => {
  const { service, attachments } = fixture(t), r = service.create({ title: 'retain tool evidence' });
  await service.run(r.id, 'capture');
  const imageId = service.get(r.id).images[0];
  service.complete(r.id, { version: 1, reply: 'discard reply only' });
  service.discardReply(r.id, service.get(r.id).version);
  assert.deepEqual(attachments.bytes(imageId), png);
  assert.equal(service.snapshot(r.id).tools[0].output.attachments[0].id, imageId);
});
