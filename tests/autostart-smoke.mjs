// Run with Node. Verifies packaged desktop autostart via the real MCP adapter.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const directory = mkdtempSync(resolve('.qa/autostart-'));
const executable = process.argv[2];
assert.ok(executable, 'Pass absolute packaged human_cli-desktop.exe path');
const client = new Client({ name: 'autostart-acceptance', version: '1' });
let runtime;
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [process.argv[3] || resolve('adapters/mcp.mjs')], env: { ...process.env, HUMAN_CLI_DATA_DIR: directory, HUMAN_CLI_DESKTOP_EXE: executable, HUMAN_CLI_NO_AUTOSTART: '0' }, stderr: 'pipe' }));
  const plugins = await client.callTool({ name: 'human_plugins', arguments: {} });
  assert.ok(!plugins.isError, JSON.stringify(plugins));
  assert.equal(JSON.parse(plugins.content[0].text).length, 4);
  runtime = JSON.parse(readFileSync(join(directory, 'runtime.json'), 'utf8'));
  const request = await client.callTool({ name: 'human_request', arguments: { title: '便携包 MCP 自动启动验收', plugins: [], idempotencyKey: 'packaged-autostart', background: true } });
  assert.ok(!request.isError, JSON.stringify(request));
  const id = JSON.parse(request.content[0].text).id;
  const pending = await client.callTool({ name: 'human_get', arguments: { requestId: id } });
  assert.equal(JSON.parse(pending.content[0].text).status, 'pending');
  const cancelled = await client.callTool({ name: 'human_cancel', arguments: { requestId: id, reason: '验收结束' } });
  assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled');
  const logs = JSON.parse((await client.callTool({ name: 'human_logs', arguments: {} })).content[0].text);
  assert.equal(logs.entries[0].id, id);
  assert.equal(JSON.parse(readFileSync(logs.entries[0].cache.requestPath, 'utf8')).status, 'cancelled');
  writeFileSync(join(directory, 'acceptance.json'), JSON.stringify({ passed: true, executable, checks: ['packaged desktop autostart', 'four installed plugins through network SPI', 'real MCP create/get/cancel', 'logs locate readable cache file'], pid: runtime.pid }, null, 2));
  console.log(`PACKAGED AUTOSTART PASS ${directory}`);
} finally {
  await client.close();
  if (runtime) {
    // Kill only our just-started test instance after re-authenticating its identity.
    const response = await fetch(`${runtime.url}/health`, { headers: { Authorization: `Bearer ${runtime.token}` } }).catch(() => null);
    if (response?.ok && (await response.json()).pid === runtime.pid) process.kill(runtime.pid);
  }
}
