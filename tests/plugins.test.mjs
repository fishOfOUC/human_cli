import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers.mjs';
function addPlugin(f, code, options = {}) {
  const dir = join(f.directory, 'custom'); mkdirSync(dir);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ apiVersion: 1, id: 'test.plugin', name: 'Test', side: 'right', entry: 'plugin.mjs', permissions: [], configSchema: { type: 'object', properties: {} }, ...options }));
  writeFileSync(join(dir, 'plugin.mjs'), code); f.plugins.load(dir);
  return f.service.create({ title: 'x', plugins: [{ id: 'custom', plugin: 'test.plugin' }] });
}
test('third-party example loads without changing core and returns data through declared capability', async (t) => {
  const f = fixture(t); f.plugins.load(fileURLToPath(new URL('../examples/plugins/clipboard-note', import.meta.url)));
  const r = f.service.create({ title: '扩展插件', plugins: [{ id: 'clipboard', plugin: 'example.clipboard-note' }] });
  await f.service.run(r.id, 'clipboard');
  assert.equal(f.service.snapshot(r.id).tools[0].state, 'success');
  assert.match(f.service.snapshot(r.id).tools[0].output.text, /现场记录.*\n请求：扩展插件/);
});
test('undeclared host capability is denied and remains a copyable error', async (t) => {
  const f = fixture(t), r = addPlugin(f, 'export async function run(ctx) { await ctx.clipboard.readText(); return {text:"bad"}; }');
  await f.service.run(r.id, 'custom'); assert.equal(f.service.get(r.id).tools[0].error.code, 'E_PLUGIN_PERMISSION');
});
test('worker timeout and process exit cannot block the request service', async (t) => {
  const f = fixture(t, {}, { timeoutMs: 150 }), r = addPlugin(f, 'export async function run() { await new Promise(() => {}); }');
  await f.service.run(r.id, 'custom'); assert.equal(f.service.get(r.id).tools[0].error.code, 'E_PLUGIN_TIMEOUT');
});
test('AI cancellation terminates worker and preserves final request state', async (t) => {
  const f = fixture(t), r = addPlugin(f, 'export async function run() { await new Promise(r => setTimeout(r, 10000)); return {text:"late"}; }');
  const running = f.service.run(r.id, 'custom'); f.service.cancel(r.id, 'cancel'); await running;
  assert.equal(f.service.get(r.id).status, 'cancelled'); assert.equal(f.service.get(r.id).tools[0].output, null);
});
test('incompatible manifests, duplicate plugin IDs and invalid schemas are rejected', (t) => {
  const f = fixture(t);
  assert.throws(() => addPlugin(f, '', { apiVersion: 999 }), /apiVersion/);
  assert.throws(() => f.plugins.load(fileURLToPath(new URL('../plugins/builtin/screenshot', import.meta.url))), /重复/);
});
test('removed plugins do not hide persisted requests or their original results', async (t) => {
  const f = fixture(t), r = f.service.create({ title: 'restore' }); f.plugins.definitions.delete('human.screenshot');
  assert.equal(f.service.snapshot(r.id).tools[0].manifest.name, '插件未安装');
  await f.service.run(r.id, 'capture');
  f.service.attachError(r.id, 'capture');
  assert.equal(f.service.get(r.id).diagnostics[0].code, 'E_PLUGIN_MISSING');
});
