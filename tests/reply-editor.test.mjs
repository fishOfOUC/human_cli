import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplyEditor } from '../src/reply-editor.js';

globalThis.requestAnimationFrame = () => 0;
const file = (name) => ({ name, type: 'text/plain', size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer });
function editor(upload) { const e = new ReplyEditor({ upload, changed: () => {}, render: () => {} }); e.receive([], true); return e; }

test('file uploads finish out of order but retain original insertion position and surrounding text', async () => {
  const resolvers = new Map();
  const e = editor(({ name }) => new Promise((done) => resolvers.set(name, done)));
  const first = e.blocks[0]; first.text = 'beforeafter';
  e.capture({ matches: () => true, dataset: { textBlock: first.blockId }, selectionStart: 6, selectionEnd: 6 });
  e.addFiles([file('one.txt'), file('two.txt')]);
  await new Promise((done) => setImmediate(done));
  const waiting = e.waitReady(); let settled = false; waiting.then(() => { settled = true; });
  resolvers.get('two.txt')({ id: 'two', name: 'two.txt', mime: 'text/plain', size: 1 });
  await new Promise((done) => setImmediate(done)); assert.equal(settled, false);
  resolvers.get('one.txt')({ id: 'one', name: 'one.txt', mime: 'text/plain', size: 1 });
  const result = await waiting;
  assert.deepEqual(result.filter((b) => b.type !== 'text').map((b) => b.attachmentId), ['one', 'two']);
  assert.equal(result[0].text, 'before'); assert.equal(result.at(-1).text, 'after');
  // An old server echo cannot resurrect a locally removed block.
  const removed = result.find((b) => b.attachmentId === 'one'); e.remove(removed.blockId); e.receive([removed]);
  assert.ok(!e.blocks.some((b) => b.attachmentId === 'one'));
});

test('failed upload blocks submission until retry succeeds or user removes the failed block', async () => {
  let fail = true;
  const e = editor(async () => { if (fail) throw new Error('disk full'); return { id: 'saved', name: 'a.txt', mime: 'text/plain', size: 1 }; });
  e.addFiles([file('a.txt')]);
  await assert.rejects(e.waitReady(), /尚未保存成功/);
  const b = e.blocks.find((b) => b.file); assert.equal(b.error, 'disk full');
  fail = false; e.startUpload(b);
  assert.equal((await e.waitReady()).find((b) => b.type === 'file').attachmentId, 'saved');
  const other = editor(async () => { throw new Error('fail'); }); other.addFiles([file('b.txt')]);
  await assert.rejects(other.waitReady()); other.remove(other.blocks.find((b) => b.file).blockId);
  assert.ok((await other.waitReady()).every((b) => b.type === 'text'));
});
