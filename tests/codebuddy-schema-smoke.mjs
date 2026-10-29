// Local-only compatibility probe. Extracts the installed client's real strict
// converter without starting its CLI, loading credentials or calling a model.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [bundle, beforePath, reportPath] = process.argv.slice(2);
assert.ok(bundle, 'Usage: node tests/codebuddy-schema-smoke.mjs <installed dist/codebuddy.js> [before.json] [report.json]');
const source = readFileSync(bundle, 'utf8');
const key = source.indexOf('function assertOpenAIStrictToolSchemaPreservesOpenObjects(');
assert.ok(key >= 0, 'Installed CodeBuddy strict converter changed; review extraction before running');
const header = [...source.slice(0, key).matchAll(/(?:^|\},)(\d+)\(eA,el,ec\)\{/g)].at(-1);
const start = header.index + (source.slice(header.index, header.index + 2) === '},' ? 2 : 0);
const next = /\},\d+\(eA(?:,el(?:,ec)?)?\)\{/.exec(source.slice(key));
const method = source.slice(start, key + next.index + 1).replace(/^\d+\(/, 'function(');
const requireStub = (id) => {
  if (id === 454483) return { yo: class UserError extends Error {} };
  if (id === 264709) return {};
  throw new Error(`Unexpected converter dependency ${id}; inspect the installed version first`);
};
requireStub.d = (target, values) => { for (const [name, get] of Object.entries(values)) Object.defineProperty(target, name, { get }); };
const converter = {};
vm.runInNewContext(`(${method})`, { structuredClone, URL })({}, converter, requireStub);
function inspect(tools) {
  return tools.map((tool) => {
    try { converter.CB(tool.inputSchema); const prepared = converter.Eg(tool.inputSchema); assert.equal(prepared.schema.additionalProperties, false); return { name: tool.name, passed: true }; }
    catch (error) { return { name: tool.name, passed: false, error: error.message }; }
  });
}
const report = { bundle: resolve(bundle), bundleSha256: createHash('sha256').update(source).digest('hex'), codebuddyVersion: JSON.parse(readFileSync(resolve(bundle, '../../package.json'))).version, before: beforePath ? inspect(JSON.parse(readFileSync(beforePath))) : undefined, connections: [] };
for (let attempt = 0; attempt < 3; attempt++) {
  const client = new Client({ name: 'codebuddy-schema-probe', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(process.env.HUMAN_CLI_MCP_ENTRY || 'adapters/mcp.mjs')], env: { ...process.env, HUMAN_CLI_NO_AUTOSTART: '1' }, stderr: 'pipe' });
  await client.connect(transport);
  try {
    for (let refresh = 0; refresh < 2; refresh++) {
      const results = inspect((await client.listTools()).tools);
      report.connections.push({ attempt, refresh, results });
      assert.equal(results.length, 8);
      assert.ok(results.every((tool) => tool.passed), JSON.stringify(results));
    }
  } finally { await client.close(); }
}
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ beforeFailures: report.before?.filter((tool) => !tool.passed).length, connections: 3, listsPerConnection: 2, toolsPerList: 8, conversionsPassed: 48, report: reportPath }, null, 2));
