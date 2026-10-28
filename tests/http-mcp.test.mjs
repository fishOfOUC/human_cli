import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture, png } from './helpers.mjs';
import { startApi } from '../adapters/http.mjs';

async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) { const value = check(); if (value) return value; await new Promise((done) => setTimeout(done, 10)); }
  throw new Error('Request did not start waiting');
}

test('local API rejects browsers and unauthenticated callers; exposes no user completion route', async (t) => {
  const { service } = fixture(t), api = await startApi(service); t.after(() => new Promise((r) => api.server.close(r)));
  assert.equal((await fetch(`${api.url}/health`)).status, 401);
  assert.equal((await fetch(`${api.url}/health`, { headers: { Origin: 'https://example.com', Authorization: `Bearer ${api.token}` } })).status, 403);
  const r = service.create({ title: 'x' });
  assert.equal((await fetch(`${api.url}/requests/${r.id}/complete`, { method: 'POST', headers: { Authorization: `Bearer ${api.token}` } })).status, 404);
});
test('one normal MCP human_request waits through user drafting and returns the completed reply and images', async (t) => {
  const { service, directory } = fixture(t), api = await startApi(service);
  t.after(() => new Promise((r) => api.server.close(r)));
  writeFileSync(join(directory, 'runtime.json'), JSON.stringify({ url: api.url, token: api.token }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../adapters/mcp.mjs', import.meta.url))], env: { ...process.env, HUMAN_CLI_DATA_DIR: directory, HUMAN_CLI_NO_AUTOSTART: '1' }, stderr: 'pipe' });
  const client = new Client({ name: 'human-cli-integration-test', version: '1' });
  await client.connect(transport); t.after(() => client.close());
  const tools = await client.listTools(); assert.equal(tools.tools.length, 8);
  assert.ok(!tools.tools.some((t) => t.name === 'human_ack'));
  assert.ok(tools.tools.some((t) => t.name === 'human_logs'));
  assert.ok(!tools.tools.find((t) => t.name === 'human_wait').inputSchema.properties.timeoutMs);
  assert.equal(tools.tools.find((t) => t.name === 'human_request').inputSchema.properties.background.default, false);
  let settled = false;
  const calling = client.callTool({ name: 'human_request', arguments: { title: '真正的 MCP 请求', agent: '测试 Agent', steps: ['打开页面'] } }).then((value) => { settled = true; return value; });
  const request = await until(() => service.list().find((entry) => entry.title === '真正的 MCP 请求'));
  await until(() => service.snapshot(request.id).receiver.waiting);
  service.draft(request.id, { reply: '用户还没有打完字' });
  await new Promise((done) => setTimeout(done, 30));
  assert.equal(settled, false);
  service.addImage(request.id, { name: 'x.png', mime: 'image/png', bytes: png });
  service.complete(request.id, { version: 1, reply: '验收完成' });
  const response = await calling; assert.ok(!response.isError, JSON.stringify(response));
  assert.equal(JSON.parse(response.content[0].text).status, 'completed');
  assert.equal(response.content[1].type, 'image'); assert.equal(response.content[1].data, png.toString('base64'));
  assert.match(response.content[0].text, /验收完成/);
  assert.equal(service.get(request.id).cache.state, 'saved');
  const logs = JSON.parse((await client.callTool({ name: 'human_logs', arguments: {} })).content[0].text);
  assert.equal(logs.entries[0].title, '真正的 MCP 请求');
  const saved = JSON.parse(readFileSync(logs.entries[0].cache.replyPath, 'utf8'));
  assert.equal(saved.reply, '验收完成'); assert.deepEqual(readFileSync(saved.images[0].path), png);
  const other = JSON.parse((await client.callTool({ name: 'human_request', arguments: { title: 'another', background: true } })).content[0].text);
  assert.equal(other.status, 'pending'); assert.equal(service.snapshot(other.id).receiver.waiting, false);
  const update = await client.callTool({ name: 'human_update', arguments: { requestId: other.id, version: 1, patch: { title: 'updated' } } });
  assert.equal(JSON.parse(update.content[0].text).version, 2);
  await client.callTool({ name: 'human_cancel', arguments: { requestId: other.id, reason: '不再需要' } });
  assert.equal(service.get(other.id).status, 'cancelled');
});
test('MCP client timeout recovers reply using logs and local files without original request ID or acknowledgement', async (t) => {
  const { service, directory } = fixture(t), api = await startApi(service);
  t.after(() => { api.server.closeAllConnections(); return new Promise((resolve) => api.server.close(resolve)); });
  writeFileSync(join(directory, 'runtime.json'), JSON.stringify({ url: api.url, token: api.token }));
  const connect = async () => {
    const client = new Client({ name: 'reconnecting-client', version: '1' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../adapters/mcp.mjs', import.meta.url))], env: { ...process.env, HUMAN_CLI_DATA_DIR: directory, HUMAN_CLI_NO_AUTOSTART: '1' }, stderr: 'pipe' }));
    t.after(() => client.close()); return client;
  };
  const first = await connect();
  const timedOut = assert.rejects(first.callTool({ name: 'human_request', arguments: { title: '用户可能先去回消息' } }, undefined, { timeout: 300 }));
  const r = await until(() => service.list().find((entry) => entry.title === '用户可能先去回消息'));
  await until(() => service.snapshot(r.id).receiver.waiting);
  await timedOut;
  await first.close();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(service.get(r.id).status, 'pending'); assert.equal(service.snapshot(r.id).receiver.waiting, false);
  service.complete(r.id, { version: 1, reply: '回来后完成，先在本机保存' });
  assert.equal(service.get(r.id).cache.state, 'saved');
  const second = await connect();
  const logs = JSON.parse((await second.callTool({ name: 'human_logs', arguments: {} })).content[0].text);
  assert.equal(logs.entries[0].id, r.id); assert.equal(logs.entries[0].title, '用户可能先去回消息');
  assert.match(readFileSync(logs.entries[0].cache.replyPath, 'utf8'), /回来后完成/);
  const result = await second.callTool({ name: 'human_wait', arguments: { requestId: r.id } });
  assert.match(result.content[0].text, /先在本机保存/);
  service.discardReply(r.id, service.get(r.id).version);
  const discarded = await second.callTool({ name: 'human_wait', arguments: { requestId: r.id } });
  assert.equal(JSON.parse(discarded.content[0].text).status, 'reply_discarded');
  assert.ok(!JSON.stringify(discarded).includes('回来后完成'));
});
