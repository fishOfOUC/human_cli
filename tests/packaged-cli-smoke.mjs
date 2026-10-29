// Run with Node as a test driver. The tested CLI/MCP children have an empty PATH
// and use only human_cli.exe plus the portable directory's bundled runtime.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const executable = resolve(process.argv[2] || '');
assert.ok(executable.endsWith('human_cli.exe') && existsSync(executable), 'Pass packaged human_cli.exe path');
const directory = mkdtempSync(resolve('.qa', 'cli-中文 空格-'));
const alias = join(directory, '发布包 空格');
symlinkSync(resolve(executable, '..'), alias, 'junction');
const cli = join(alias, 'human_cli.exe');
const environment = { ...process.env, PATH: '', HUMAN_CLI_DATA_DIR: join(directory, 'data'), HUMAN_CLI_NO_AUTOSTART: '0' };
delete environment.HUMAN_CLI_DESKTOP_EXE;
delete environment.HUMAN_CLI_CACHE_DIR;
const checks = [], check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const invoke = (args, input) => new Promise((resolveResult, reject) => {
  const child = spawn(cli, args, { env: environment, windowsHide: true, stdio: 'pipe' });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject); child.once('close', (code) => resolveResult({ code, stdout, stderr }));
  child.stdin.on('error', () => {}); child.stdin.end(input);
});
const json = async (args, input) => { const result = await invoke(args, input); assert.equal(result.code, 0, result.stderr); return JSON.parse(result.stdout); };
let runtime, client;
try {
  const help = await invoke(['--help']);
  check('Native help exits successfully without starting desktop', help.code === 0 && help.stdout.includes('human_cli.exe') && !existsSync(join(environment.HUMAN_CLI_DATA_DIR, 'runtime.json')));
  const invalid = await invoke(['invalid-command']);
  check('Native errors use stderr and nonzero exit status', invalid.code === 1 && invalid.stdout === '' && invalid.stderr.includes('E_HUMAN_CLI'));
  const plugins = await json(['plugins']);
  check('EXE autostarts desktop with no node.exe in PATH', plugins.length === 4);
  runtime = JSON.parse(readFileSync(join(environment.HUMAN_CLI_DATA_DIR, 'runtime.json'), 'utf8'));
  const file = join(directory, '便签 请求.json');
  writeFileSync(file, JSON.stringify({ title: 'EXE 文件请求：中文与空格', plugins: [] }));
  const request = await json(['request', file, '--background']);
  request.id = request.requestId;
  check('Unicode executable and JSON input paths work', (await json(['get', request.id])).title === 'EXE 文件请求：中文与空格');
  const stdin = await json(['request', '-', '--background'], JSON.stringify({ title: '标准输入 "引号" \\ & $()', plugins: [] }));
  stdin.id = stdin.requestId;
  check('UTF-8 stdin creates request without shell interpolation', (await json(['get', stdin.id])).title === '标准输入 "引号" \\ & $()');
  check('Native get returns clean JSON on stdout', (await json(['get', request.id])).status === 'pending');
  check('Native list contains created requests', (await json(['list'])).length === 2);
  const logs = await json(['logs', '1', '0']);
  check('Native logs paginate and locate readable cache', logs.total === 2 && logs.entries.length === 1 && JSON.parse(readFileSync(logs.entries[0].cache.requestPath, 'utf8')).id === logs.entries[0].id);
  check('Default reply cache belongs to the portable software directory', realpathSync(logs.cacheDirectory) === realpathSync(resolve(executable, '..', 'cache')));
  const result = await json(['result', request.id]);
  check('Native pending result exposes only the compact public envelope', result.status === 'pending' && result.requestId === request.id && result.schemaVersion === 1 && Object.keys(result).length === 3);
  const waiting = json(['wait', request.id]);
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await json(['get', request.id])).receiver.waiting) { connected = true; break; }
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.ok(connected, 'CLI wait connected');
  const reason = '中文 "带引号" 与 \\ 结尾\\';
  const cancelled = await json(['cancel', request.id, reason]);
  check('Native argument quoting preserves quotes and backslashes', cancelled.cancelReason === reason);
  check('Native wait returns when AI cancels', (await waiting).status === 'cancelled');
  let normalSettled = false;
  const normal = json(['request', '-'], JSON.stringify({ title: '默认请求应等待用户', plugins: [] })).then((value) => { normalSettled = true; return value; });
  let normalRequest;
  for (let attempt = 0; attempt < 30; attempt++) {
    normalRequest = (await json(['list'])).find((entry) => entry.title === '默认请求应等待用户');
    if (normalRequest && (await json(['get', normalRequest.id])).receiver.waiting) break;
    await new Promise((done) => setTimeout(done, 50));
  }
  check('Native request defaults to awaiting the human instead of returning creation', Boolean(normalRequest) && !normalSettled && (await json(['get', normalRequest.id])).receiver.waiting);
  await json(['cancel', normalRequest.id, '测试中断等待']);
  check('Native request returns final cancellation in the same call', (await normal).status === 'cancelled');
  client = new Client({ name: 'native-exe-mcp-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: cli, args: ['mcp'], env: environment, stderr: 'pipe' }));
  const packagedTools = (await client.listTools()).tools;
  check('EXE mcp starts stdio server without system Node', packagedTools.length === 8);
  check('Packaged MCP publishes closed strict-compatible root schemas', packagedTools.every((tool) => tool.inputSchema.additionalProperties === false && JSON.stringify([...tool.inputSchema.required].sort()) === JSON.stringify(Object.keys(tool.inputSchema.properties).sort())));
  let mcpSettled = false;
  const mcpRequest = client.callTool({ name: 'human_request', arguments: { title: 'MCP 默认等待验收', plugins: [] } }).then((value) => { mcpSettled = true; return value; });
  let mcpId;
  for (let attempt = 0; attempt < 30; attempt++) {
    mcpId = (await json(['list'])).find((entry) => entry.title === 'MCP 默认等待验收')?.id;
    if (mcpId && (await json(['get', mcpId])).receiver.waiting) break;
    await new Promise((done) => setTimeout(done, 50));
  }
  check('EXE MCP request also waits by default', Boolean(mcpId) && !mcpSettled && (await json(['get', mcpId])).receiver.waiting);
  await json(['cancel', mcpId, '测试结束']);
  check('EXE MCP request returns final state in the same call', JSON.parse((await mcpRequest).content[0].text).status === 'cancelled');
  const mcpLogs = await client.callTool({ name: 'human_logs', arguments: {} });
  check('EXE mcp logs can recover CLI-created requests', JSON.parse(mcpLogs.content[0].text).entries.some((entry) => entry.id === request.id));
  await client.close(); client = null;
  await json(['cancel', stdin.id, '结束最后一张便签']);
  for (let attempt = 0; attempt < 100 && existsSync(join(environment.HUMAN_CLI_DATA_DIR, 'runtime.json')); attempt++) await new Promise((done) => setTimeout(done, 50));
  check('Packaged desktop exits automatically after the last task', !existsSync(join(environment.HUMAN_CLI_DATA_DIR, 'runtime.json')));
  check('A later CLI query restarts the host and recovers logs', (await json(['logs', '1'])).entries.length === 1);
  for (let attempt = 0; attempt < 100 && existsSync(join(environment.HUMAN_CLI_DATA_DIR, 'runtime.json')); attempt++) await new Promise((done) => setTimeout(done, 50));
  check('Read-only packaged query leaves no resident desktop', !existsSync(join(environment.HUMAN_CLI_DATA_DIR, 'runtime.json')));
  writeFileSync(join(directory, 'acceptance.json'), JSON.stringify({ passed: checks.length, checks, executable, nodeAvailableInChildPath: false }, null, 2));
  console.log(`PACKAGED CLI PASS ${checks.length} checks ${directory}`);
} finally {
  if (client) await client.close();
  if (runtime) {
    const health = await fetch(`${runtime.url}/health`, { headers: { Authorization: `Bearer ${runtime.token}` } }).catch(() => null);
    if (health?.ok && (await health.json()).pid === runtime.pid) process.kill(runtime.pid);
  }
}
