import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixture, png } from './helpers.mjs';
import { RequestService } from '../core/requests.mjs';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { replyCacheDirectory } from '../core/paths.mjs';
import { startApi } from '../adapters/http.mjs';
import { projectReply } from '../core/reply.mjs';
import { legacySnapshot } from '../adapters/reply.mjs';

test('an old running desktop cannot silently turn an existing reply into an empty new-format response', () => {
  assert.throws(() => projectReply({ id: 'old', status: 'completed', result: { reply: 'must not disappear' } }), { code: 'E_REPLY_VERSION' });
});

test('ordered reply freezes text/image/text/file/diagnostic without duplicate metadata or binary data', (t) => {
  const f = fixture(t), r = f.service.create({ title: 'private task title', plugins: [] });
  const image = f.service.addAttachment(r.id, { name: '现场.png', mime: 'image/png', bytes: png }, { insert: false });
  const file = f.service.addAttachment(r.id, { name: '../中文 配置.json', mime: 'application/json', bytes: Buffer.from('{"value":1}') }, { insert: false });
  const content = [{ type: 'text', text: ' 第一段\n' }, { type: 'image', attachmentId: image.id }, { type: 'text', text: '已完成' }, { type: 'file', attachmentId: file.id }, { type: 'diagnostic', toolId: 'capture', name: '截图', code: 'E_TEST', message: '附入诊断', details: '完整详情' }];
  f.service.complete(r.id, { version: 1, content });
  const reply = f.service.reply(r.id);
  assert.deepEqual(reply.content.map((b) => b.type), ['text', 'image', 'text', 'file', 'diagnostic']);
  assert.equal(reply.content[0].text, ' 第一段\n'); assert.equal(reply.content[2].text, '已完成');
  assert.equal(reply.content[3].name, '中文 配置.json');
  assert.deepEqual(readFileSync(reply.content[1].path), png);
  assert.equal(readFileSync(reply.content[3].path, 'utf8'), '{"value":1}');
  assert.equal(reply.content[4].details, '完整详情');
  assert.deepEqual(Object.keys(reply).sort(), ['content', 'requestId', 'schemaVersion', 'status']);
  assert.ok(!JSON.stringify(reply).includes('private task title'));
  assert.ok(!JSON.stringify(reply).includes('blockId'));
  assert.deepEqual(JSON.parse(readFileSync(f.service.logs().entries[0].cache.replyPath)), reply);
  const reopened = new RequestService(new JsonStore(f.directory), f.attachments, f.plugins);
  assert.deepEqual(reopened.reply(r.id), reply);
  assert.throws(() => f.service.draft(r.id, { content: [] }), { code: 'E_REQUEST_CLOSED' });
});

test('empty completion, whitespace and explicit only completion do not synthesize user text', (t) => {
  const { service } = fixture(t);
  for (const content of [[], [{ type: 'text', text: ' \n ' }]]) {
    const r = service.create({ title: 'empty', plugins: [] }); service.complete(r.id, { version: 1, content });
    assert.deepEqual(service.reply(r.id).content, []);
    assert.equal(service.reply(r.id).submission.type, 'confirmation_only');
    assert.match(service.reply(r.id).submission.message, /用户已提交完成确认/);
    assert.deepEqual(service.get(r.id).result.content, []);
    assert.deepEqual(service.snapshot(r.id).submission, service.reply(r.id).submission);
  }
  const r = service.create({ title: 'only', plugins: [] });
  service.addImage(r.id, { name: 'secret.png', mime: 'image/png', bytes: png });
  service.complete(r.id, { version: 1, only: true, reply: '不要提交' });
  assert.deepEqual(service.reply(r.id).content, []);
  assert.equal(service.reply(r.id).submission.type, 'confirmation_only');
});

test('confirmation metadata survives restart and cache while nonempty, pending, cancelled and discarded replies cannot claim confirmation-only', (t) => {
  const f = fixture(t), r = f.service.create({ title: '直接确认', plugins: [] });
  f.service.complete(r.id, { version: 1, content: [{ blockId: 'empty', type: 'text', text: '' }] });
  const reply = f.service.reply(r.id);
  const reopened = new RequestService(new JsonStore(f.directory), f.attachments, f.plugins);
  assert.deepEqual(reopened.reply(r.id), reply);
  assert.deepEqual(JSON.parse(readFileSync(reopened.logs().entries[0].cache.replyPath)), reply);
  assert.equal(reopened.snapshot(r.id).result.submission.type, 'confirmation_only');
  reopened.discardReply(r.id, reopened.get(r.id).version);
  assert.equal(reopened.reply(r.id).submission, undefined);
  const pending = reopened.create({ title: '尚未提交', plugins: [] });
  assert.equal(reopened.reply(pending.id).submission, undefined);
  reopened.cancel(pending.id); assert.equal(reopened.reply(pending.id).submission, undefined);
  for (const type of ['text', 'image', 'file']) {
    const request = reopened.create({ title: type, plugins: [] });
    if (type === 'text') reopened.draft(request.id, { reply: '已完成' });
    else reopened.addAttachment(request.id, { name: type === 'image' ? 'x.png' : 'empty.txt', mime: type === 'image' ? 'image/png' : 'text/plain', bytes: type === 'image' ? png : Buffer.alloc(0) });
    reopened.complete(request.id, { version: 1 });
    assert.equal(reopened.reply(request.id).submission, undefined, type);
  }
});

test('user closing cancels only its request, identifies the actor and keeps saved drafts out of the public response', async (t) => {
  const f = fixture(t), request = f.service.create({ title: '关闭目标', plugins: [] }), other = f.service.create({ title: '保留任务', plugins: [] });
  f.service.draft(request.id, { reply: '不能作为回复交付的草稿' });
  f.service.addImage(request.id, { name: 'draft.png', mime: 'image/png', bytes: png });
  const waiting = f.service.wait(request.id);
  f.service.closeByUser(request.id);
  assert.equal((await waiting).status, 'cancelled');
  const reply = f.service.reply(request.id);
  assert.deepEqual(reply, { schemaVersion: 1, requestId: request.id, status: 'cancelled', cancelReason: '用户关闭了协助窗口。', cancelledBy: 'user' });
  assert.ok(!JSON.stringify(reply).includes('草稿')); assert.equal(reply.submission, undefined); assert.equal(reply.content, undefined);
  assert.ok(!JSON.stringify(legacySnapshot(f.service.snapshot(request.id))).includes('草稿'));
  assert.equal(f.service.get(request.id).reply, '不能作为回复交付的草稿');
  assert.equal(f.service.get(request.id).result, null); assert.equal(f.service.get(other.id).status, 'pending');
  const version = f.service.get(request.id).version;
  f.service.closeByUser(request.id); assert.equal(f.service.get(request.id).version, version);
  const reopened = new RequestService(new JsonStore(f.directory), f.attachments, f.plugins);
  assert.deepEqual(reopened.reply(request.id), reply);
  const done = reopened.create({ title: '已经完成', plugins: [] }); reopened.complete(done.id, { version: 1, reply: '真实回复' });
  reopened.closeByUser(done.id); assert.equal(reopened.reply(done.id).status, 'completed'); assert.equal(reopened.reply(done.id).cancelledBy, undefined);
});

test('a failed user close remains retryable without persisting a false cancellation', (t) => {
  const f = fixture(t), r = f.service.create({ title: '失败重试', plugins: [] });
  const sync = f.service.cache.sync.bind(f.service.cache);
  f.service.cache.sync = (request) => { if (request.status === 'cancelled') throw new Error('cache unavailable'); return sync(request); };
  assert.throws(() => f.service.closeByUser(r.id), /cache unavailable/);
  assert.equal(f.service.get(r.id).status, 'pending'); assert.equal(f.service.get(r.id).cancelledBy, undefined);
  f.service.cache.sync = sync; f.service.closeByUser(r.id);
  assert.equal(f.service.reply(r.id).cancelledBy, 'user');
});

test('ordinary binary, zero-byte, duplicate-name and repeated references retain original bytes', (t) => {
  const { service } = fixture(t), r = service.create({ title: 'files', plugins: [] });
  const first = service.addAttachment(r.id, { name: '同名.zip', mime: 'application/zip', bytes: Buffer.from([0, 255, 1, 2]) });
  const second = service.addAttachment(r.id, { name: '同名.zip', mime: 'application/zip', bytes: Buffer.alloc(0) });
  service.draft(r.id, { content: [{ type: 'file', attachmentId: second.id }, { type: 'file', attachmentId: first.id }, { type: 'file', attachmentId: second.id }] });
  service.complete(r.id, { version: 1 });
  const reply = service.reply(r.id);
  assert.equal(reply.content[0].size, 0); assert.equal(reply.content[0].path, reply.content[2].path);
  assert.notEqual(reply.content[0].path, reply.content[1].path);
  assert.deepEqual(readFileSync(reply.content[1].path), Buffer.from([0, 255, 1, 2]));
  service.discardReply(r.id, service.get(r.id).version);
  assert.ok(!existsSync(reply.content[0].path)); assert.ok(!existsSync(reply.content[1].path));
  assert.deepEqual(service.reply(r.id), { schemaVersion: 1, requestId: r.id, status: 'completed', replyState: 'discarded' });
});

test('content validation rejects cross-request files, spoofed types and duplicate block ids without changing draft', (t) => {
  const { service } = fixture(t), a = service.create({ title: 'a', plugins: [] }), b = service.create({ title: 'b', plugins: [] });
  const file = service.addAttachment(a.id, { name: 'a.pdf', mime: 'application/pdf', bytes: Buffer.from('pdf') });
  assert.throws(() => service.draft(b.id, { content: [{ type: 'file', attachmentId: file.id }] }), { code: 'E_ATTACHMENT_OWNER' });
  assert.throws(() => service.draft(a.id, { content: [{ type: 'image', attachmentId: file.id }] }), { code: 'E_CONTENT' });
  assert.throws(() => service.draft(a.id, { content: [{ blockId: 'same', type: 'text', text: 'a' }, { blockId: 'same', type: 'text', text: 'b' }] }), { code: 'E_CONTENT' });
  assert.equal(service.get(a.id).content[0].attachmentId, file.id);
  assert.throws(() => service.addAttachment(a.id, { name: 'x.zip', mime: 'application/zip', bytes: Buffer.alloc(20 * 1024 * 1024 + 1) }), { code: 'E_FILE_SIZE' });
});

test('cache storage failure rolls back completion and remains retryable after reopening durable state', (t) => {
  const f = fixture(t), r = f.service.create({ title: 'retry', plugins: [] });
  const sync = f.service.cache.sync.bind(f.service.cache);
  f.service.cache.sync = (request) => { if (request.status === 'completed') throw Object.assign(new Error('disk unavailable'), { code: 'E_TEST_DISK' }); return sync(request); };
  assert.throws(() => f.service.complete(r.id, { version: 1, reply: '可重试' }), { code: 'E_TEST_DISK' });
  assert.equal(f.service.get(r.id).status, 'pending'); assert.equal(f.service.get(r.id).version, 1);
  const reopened = new RequestService(new JsonStore(f.directory), f.attachments, f.plugins);
  assert.equal(reopened.get(r.id).status, 'pending');
  reopened.complete(r.id, { version: 1, reply: '重试成功' });
  assert.equal(reopened.reply(r.id).content[0].text, '重试成功');
});

test('software cache root is independent of cwd and moving software rebuilds absolute paths without deleting old cache', (t) => {
  const f = fixture(t), firstRoot = join(f.directory, '软件 目录', 'cache'), secondRoot = join(f.directory, '移动后', 'cache');
  const service = new RequestService(f.store, f.attachments, f.plugins, { cacheDirectory: firstRoot });
  const r = service.create({ title: 'move', plugins: [] });
  service.addAttachment(r.id, { name: 'a.txt', mime: 'text/plain', bytes: Buffer.from('原始数据') });
  service.complete(r.id, { version: 1 });
  const oldPath = service.reply(r.id).content[0].path;
  mkdirSync(secondRoot, { recursive: true }); cpSync(firstRoot, secondRoot, { recursive: true });
  const reopened = new RequestService(new JsonStore(f.directory), f.attachments, f.plugins, { cacheDirectory: secondRoot });
  const newPath = reopened.reply(r.id).content[0].path;
  assert.ok(newPath.startsWith(secondRoot)); assert.notEqual(newPath, oldPath);
  assert.equal(readFileSync(newPath, 'utf8'), '原始数据'); assert.ok(existsSync(oldPath));
  assert.equal(JSON.parse(readFileSync(reopened.logs().entries[0].cache.replyPath)).content[0].path, newPath);
  const configured = process.env.HUMAN_CLI_CACHE_DIR; delete process.env.HUMAN_CLI_CACHE_DIR;
  try { assert.equal(replyCacheDirectory({ packaged: true, executable: join(f.directory, '软件', 'human_cli-desktop.exe') }), resolve(f.directory, '软件', 'cache')); }
  finally { if (configured !== undefined) process.env.HUMAN_CLI_CACHE_DIR = configured; }
});

test('legacy records migrate known text/image order and default HTTP returns tiny path-only replies for large images', async (t) => {
  const f = fixture(t), r = f.service.create({ title: 'legacy', plugins: [] });
  const large = Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]);
  f.service.addImage(r.id, { name: 'big.png', mime: 'image/png', bytes: large });
  f.service.complete(r.id, { version: 1, reply: '旧回复' });
  delete f.service.get(r.id).content; delete f.service.get(r.id).result.content; f.store.save();
  const reopened = new RequestService(new JsonStore(f.directory), f.attachments, f.plugins);
  assert.deepEqual(reopened.reply(r.id).content.map((b) => b.type), ['text', 'image']);
  const api = await startApi(reopened); t.after(() => { api.server.closeAllConnections(); return new Promise((done) => api.server.close(done)); });
  const response = await fetch(`${api.url}/requests/${r.id}/result`, { headers: { Authorization: `Bearer ${api.token}` } });
  const raw = await response.text(); assert.ok(Buffer.byteLength(raw) < 3000);
  const reply = JSON.parse(raw); assert.ok(!reply.imagePage); assert.ok(!reply.result);
  assert.deepEqual(readFileSync(reply.content[1].path), large);
});
