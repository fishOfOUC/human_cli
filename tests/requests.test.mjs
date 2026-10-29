import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, png } from './helpers.mjs';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { RequestService } from '../core/requests.mjs';

test('AI request creation validates plugin configuration and preserves instruction fields', (t) => {
  const { service } = fixture(t);
  const r = service.create({ title: '帮我验收', agent: 'AI', steps: ['打开应用'] });
  assert.equal(r.status, 'pending'); assert.equal(r.tools[0].config.autoAttach, true);
  assert.throws(() => service.create({ title: '', plugins: [] }));
  assert.throws(() => service.create({ title: 'x', plugins: [{ id: 'x', plugin: 'human.open-url', config: {} }] }), /配置无效/);
});
test('idempotent retries never duplicate a request', (t) => {
  const { service } = fixture(t);
  assert.equal(service.create({ title: 'x', idempotencyKey: 'retry' }).id, service.create({ title: 'x', idempotencyKey: 'retry' }).id);
  assert.equal(service.list().length, 1);
});
test('AI updates preserve reply but reset changed instructions and invalidate stale completion', (t) => {
  const { service } = fixture(t), r = service.create({ title: 'x', steps: ['old'] });
  service.draft(r.id, { reply: '我的草稿', checks: [0] }); service.update(r.id, { steps: ['new'] }, 1);
  assert.equal(service.get(r.id).reply, '我的草稿'); assert.deepEqual(service.get(r.id).checks, []);
  assert.throws(() => service.complete(r.id, { version: 1 }), /AI 已更新/);
});
test('image and full diagnostic are included in immutable completion snapshot', async (t) => {
  const { service } = fixture(t, { 'screen.capture': () => { throw new Error('capture broke'); } });
  const r = service.create({ title: 'x' }); service.addImage(r.id, { name: 'test.png', mime: 'image/png', bytes: png });
  await service.run(r.id, 'capture'); service.attachError(r.id, 'capture');
  const result = service.complete(r.id, { version: 1, reply: '完成' }).result;
  assert.equal(result.images.length, 1); assert.match(result.diagnostics[0].details, /capture broke/);
  assert.throws(() => service.draft(r.id, { reply: 'changed' }), /已结束/);
  assert.equal(service.snapshot(r.id).result.reply, '完成');
});
test('only-complete deliberately omits prepared reply and images', (t) => {
  const { service } = fixture(t), r = service.create({ title: 'x' });
  service.addImage(r.id, { name: 'x.png', mime: 'image/png', bytes: png });
  const { result } = service.complete(r.id, { version: 1, only: true, reply: '不回传' });
  assert.equal(result.reply, '已完成'); assert.equal(result.images.length, 0);
});
test('wait resolves on cancellation; disconnect removes listener without ending human request', async (t) => {
  const { service } = fixture(t), r = service.create({ title: 'x' });
  const waiting = service.wait(r.id); service.cancel(r.id, 'AI 不再需要');
  assert.equal((await waiting).status, 'cancelled');
  assert.equal(service.listenerCount('change'), 0);
  const other = service.create({ title: 'y' }), controller = new AbortController();
  const disconnected = service.wait(other.id, controller.signal); controller.abort();
  await assert.rejects(disconnected, { code: 'E_WAIT_DISCONNECTED' });
  assert.equal(service.get(other.id).status, 'pending');
  assert.equal(service.listenerCount('change'), 0);
});
test('attachments reject spoofed types, cross-request attachment and oversized files', (t) => {
  const { service } = fixture(t), a = service.create({ title: 'a' }), b = service.create({ title: 'b' });
  assert.throws(() => service.addImage(a.id, { name: 'x.png', mime: 'image/png', bytes: Buffer.from('not image') }), /不符/);
  assert.throws(() => service.addImage(a.id, { mime: 'image/png', bytes: Buffer.alloc(6 * 1024 * 1024) }), /5 MB/);
  const image = service.addImage(a.id, { name: 'x.png', mime: 'image/png', bytes: png });
  assert.throws(() => service.attach(b.id, image.id), /不属于/);
});
test('eight-picture limit and remove/reattach preserve stored originals', (t) => {
  const { service, attachments } = fixture(t), r = service.create({ title: 'x' });
  const images = Array.from({ length: 8 }, () => service.addImage(r.id, { name: 'x.png', mime: 'image/png', bytes: png }));
  assert.throws(() => service.addImage(r.id, { name: 'x.png', mime: 'image/png', bytes: png }), /最多/);
  service.removeAttachment(r.id, images[0].id); assert.deepEqual(attachments.bytes(images[0].id), png);
  service.attach(r.id, images[0].id); assert.equal(service.get(r.id).images.length, 8);
});
test('tool execution is deduplicated and respects optional auto attachment', async (t) => {
  let runs = 0;
  const { service } = fixture(t, { 'screen.capture': async () => { runs++; await new Promise((r) => setTimeout(r, 20)); return png; } });
  const r = service.create({ title: 'x' }); await Promise.all([service.run(r.id, 'capture'), service.run(r.id, 'capture')]);
  assert.equal(runs, 1); assert.equal(service.snapshot(r.id).images.length, 1);
  service.configure(r.id, 'capture', { display: 'primary', delayMs: 0, autoAttach: false }); await service.run(r.id, 'capture');
  assert.equal(service.snapshot(r.id).images.length, 1); assert.equal(service.snapshot(r.id).tools[0].output.attachments.length, 1);
});
test('late plugin output cannot change completed reply or attach to updated instructions', async (t) => {
  const { service } = fixture(t, { 'screen.capture': async () => { await new Promise((r) => setTimeout(r, 30)); return png; } });
  const r = service.create({ title: 'x' }), running = service.run(r.id, 'capture');
  service.complete(r.id, { version: 1, reply: '已完成' }); await running;
  assert.equal(service.snapshot(r.id).result.images.length, 0);
  assert.equal(service.snapshot(r.id).tools[0].error.code, 'E_REQUEST_CHANGED');
});
test('restart restores requests, images, themes and marks interrupted workers', (t) => {
  const { service, store, plugins, directory } = fixture(t), r = service.create({ title: 'x' });
  service.preferences({ theme: 'dark', pinned: false, motion: false });
  service.addImage(r.id, { name: 'x.png', mime: 'image/png', bytes: png });
  service.get(r.id).tools[0].state = 'running'; store.save();
  const reopened = new JsonStore(directory), restored = new RequestService(reopened, new AttachmentStore(reopened), plugins);
  assert.equal(reopened.data.preferences.theme, 'dark'); assert.equal(restored.snapshot(r.id).images.length, 1);
  assert.equal(reopened.data.preferences.motion, false);
  assert.equal(restored.snapshot(r.id).tools[0].error.code, 'E_INTERRUPTED');
  assert.match(readFileSync(join(directory, 'state.json'), 'utf8'), /已中断|中断/);
});
test('invalid preferences and duplicate binding IDs are rejected', (t) => {
  const { service } = fixture(t); assert.throws(() => service.preferences({ theme: 'pink' }), /未知主题/);
  assert.throws(() => service.preferences({ motion: 'false' }), /动效值必须为布尔值/);
  assert.throws(() => service.create({ title: 'x', plugins: [{ id: 'same', plugin: 'human.screenshot' }, { id: 'same', plugin: 'human.screenshot' }] }), /不能重复/);
});
