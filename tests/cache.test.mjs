import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { fixture, png } from './helpers.mjs';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { RequestService } from '../core/requests.mjs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('logs locate standalone UTF-8 request and reply caches with original binary files', (t) => {
  const { service } = fixture(t), request = service.create({ title: '查看截图后的回复', plugins: [] });
  const pending = service.logs().entries[0];
  assert.equal(pending.createdAt, request.createdAt); assert.equal(pending.cache.replyPath, null);
  assert.equal(json(pending.cache.requestPath).status, 'pending');
  service.addImage(request.id, { name: '现场.png', mime: 'image/png', bytes: png });
  service.complete(request.id, { version: 1, reply: '中文操作说明已保存' });
  const entry = service.logs().entries[0], saved = json(entry.cache.replyPath);
  assert.ok(isAbsolute(entry.cache.directory)); assert.ok(isAbsolute(saved.content[1].path));
  assert.equal(entry.cache.state, 'saved'); assert.equal(entry.title, request.title);
  assert.equal(saved.content[0].text, '中文操作说明已保存'); assert.deepEqual(readFileSync(saved.content[1].path), png);
  assert.ok(saved.content[1].path.startsWith(join(entry.cache.directory, 'attachments')));
  assert.equal(json(entry.cache.requestPath).result.reply, saved.content[0].text);
});

test('recent logs paginate by creation time, independent of later draft updates', (t) => {
  const { service } = fixture(t);
  const old = service.create({ title: 'earlier', plugins: [] }), recent = service.create({ title: 'recent', plugins: [] });
  service.get(old.id).createdAt = '2026-01-01T00:00:00.000Z';
  service.get(recent.id).createdAt = '2026-01-02T00:00:00.000Z';
  service.draft(old.id, { reply: 'updated later' });
  const first = service.logs({ limit: 1 }), second = service.logs({ limit: 1, offset: first.nextOffset });
  assert.equal(first.entries[0].id, recent.id); assert.equal(first.total, 2);
  assert.equal(second.entries[0].id, old.id); assert.equal(second.nextOffset, null);
  assert.throws(() => service.logs({ limit: 201 }), { code: 'E_LOG_PAGE' });
  assert.throws(() => service.logs({ offset: -1 }), { code: 'E_LOG_PAGE' });
});

test('restart migrates previous receipts and rebuilds missing cache from durable state', (t) => {
  const f = fixture(t), request = f.service.create({ title: 'upgrade', plugins: [] });
  f.service.addImage(request.id, { name: 'proof.png', mime: 'image/png', bytes: png });
  f.service.complete(request.id, { version: 1, reply: '保留旧数据' });
  const raw = f.service.get(request.id);
  delete raw.cache; raw.delivery = { state: 'delivered', receiptId: 'obsolete' }; f.store.save();
  rmSync(join(f.directory, 'cache'), { recursive: true });
  const store = new JsonStore(f.directory), reopened = new RequestService(store, new AttachmentStore(store), f.plugins);
  const entry = reopened.logs().entries[0];
  assert.equal(entry.cache.state, 'saved'); assert.equal(reopened.get(request.id).delivery, undefined);
  const saved = json(entry.cache.replyPath);
  assert.equal(saved.content[0].text, '保留旧数据'); assert.deepEqual(readFileSync(saved.content[1].path), png);
});

test('discard removes reply file and exported image while keeping a readable log tombstone', (t) => {
  const { service } = fixture(t), request = service.create({ title: 'discard cache', plugins: [] });
  service.addImage(request.id, { name: 'private.png', mime: 'image/png', bytes: png });
  service.complete(request.id, { version: 1, reply: 'remove this' });
  const before = service.logs().entries[0], imagePath = json(before.cache.replyPath).content[1].path;
  service.discardReply(request.id, service.get(request.id).version);
  const after = service.logs().entries[0];
  assert.equal(after.cache.state, 'discarded'); assert.equal(after.cache.replyPath, null);
  assert.equal(existsSync(before.cache.replyPath), false); assert.equal(existsSync(imagePath), false);
  assert.ok(!readFileSync(after.cache.requestPath, 'utf8').includes('remove this'));
  assert.equal(json(after.cache.requestPath).status, 'completed');
});
