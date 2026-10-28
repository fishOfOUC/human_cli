import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { dataDirectory } from '../core/paths.mjs';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { RequestService } from '../core/requests.mjs';

test('new human_cli data path honors explicit configuration and preserves legacy notes', (t) => {
  const { directory } = fixture(t);
  const keys = ['HUMAN_CLI_DATA_DIR', 'RELAY_DATA_DIR', 'LOCALAPPDATA'];
  const previous = keys.map((key) => [key, process.env[key]]);
  t.after(() => { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  delete process.env.HUMAN_CLI_DATA_DIR; delete process.env.RELAY_DATA_DIR;
  process.env.LOCALAPPDATA = directory;
  assert.equal(dataDirectory(), join(directory, 'human_cli'));
  const legacy = join(directory, 'RelayNote'); mkdirSync(legacy);
  writeFileSync(join(legacy, 'state.json'), '{}');
  assert.equal(dataDirectory(), legacy);
  process.env.RELAY_DATA_DIR = join(directory, 'old-config');
  assert.equal(dataDirectory(), process.env.RELAY_DATA_DIR);
  process.env.HUMAN_CLI_DATA_DIR = join(directory, 'new-config');
  assert.equal(dataDirectory(), process.env.HUMAN_CLI_DATA_DIR);
});

test('renamed built-in plugins retain previous request bindings and saved configurations', (t) => {
  const f = fixture(t), request = f.service.create({ title: 'existing note' });
  f.service.get(request.id).tools[0].plugin = 'relay.screenshot';
  f.store.data.pluginDefaults['relay.screenshot'] = { display: 'primary' }; f.store.save();
  const store = new JsonStore(f.directory), service = new RequestService(store, new AttachmentStore(store), f.plugins);
  const restored = service.snapshot(request.id);
  assert.equal(restored.tools[0].plugin, 'human.screenshot');
  assert.equal(restored.tools[0].manifest.id, 'human.screenshot');
  assert.deepEqual(store.data.pluginDefaults['human.screenshot'], { display: 'primary' });
  assert.equal(store.data.pluginDefaults['relay.screenshot'], undefined);
});
