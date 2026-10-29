import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, png } from './helpers.mjs';
import { startApi } from '../adapters/http.mjs';

test('large image results paginate below MCP message buffer size without losing originals', async (t) => {
  const { service } = fixture(t), api = await startApi(service), r = service.create({ title: 'large images' });
  t.after(() => { api.server.closeAllConnections(); return new Promise((resolve) => api.server.close(resolve)); });
  const bytes = Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]);
  for (let i = 0; i < 3; i++) service.addImage(r.id, { name: `${i}.png`, mime: 'image/png', bytes });
  service.complete(r.id, { version: 1, reply: '三张大图' });
  const received = [];
  let offset = 0;
  do {
    const response = await fetch(`${api.url}/requests/${r.id}/result?format=legacy&imageOffset=${offset}`, { headers: { Authorization: `Bearer ${api.token}` } });
    const raw = await response.text(); assert.ok(Buffer.byteLength(raw) < 8 * 1024 * 1024);
    const page = JSON.parse(raw); received.push(...page.result.images.filter((image) => image.data));
    offset = page.imagePage.nextOffset;
  } while (offset !== null);
  assert.equal(received.length, 3); assert.deepEqual(Buffer.from(received[2].data, 'base64'), bytes);
  assert.equal(service.get(r.id).cache.state, 'saved');
});
