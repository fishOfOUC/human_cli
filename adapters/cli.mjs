import { readFileSync } from 'node:fs';
import { api } from './client.mjs';
import { requestHuman, waitForHuman } from './human.mjs';
import { projectReply, legacySnapshot } from './reply.mjs';

try {
  const args = process.argv.slice(2), formatAt = args.indexOf('--format');
  const format = formatAt < 0 ? 'json' : args[formatAt + 1];
  if (!['json', 'legacy'].includes(format)) throw new Error('--format 只支持 json 或 legacy。');
  if (formatAt >= 0) args.splice(formatAt, 2);
  const [command, id, ...rest] = args;
  const output = (request, options) => format === 'legacy' ? legacySnapshot(request) : projectReply(request, options);
  let result;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write('human_cli.exe request [file.json|-] [--background] | wait/get/result/cancel <id> | logs [limit] [offset] | list | plugins | mcp\nrequest waits for the human reply by default, with no human-operation deadline.\n--background explicitly creates a note and returns immediately.\nReplies contain ordered content blocks and absolute cached file/image paths; read them with your own tools.\n--format legacy opts into the previous snapshot format (interleaving is not preserved).\nJSON request input may also be read from stdin. Output is UTF-8 JSON.\n');
  }
  else if (command === 'request') {
    const args = [id, ...rest].filter((value) => value !== undefined), background = args.includes('--background');
    const files = args.filter((value) => value !== '--background');
    if (files.length > 1 || files.some((value) => value.startsWith('--'))) throw new Error('用法：human_cli.exe request [file.json|-] [--background]');
    const input = JSON.parse(readFileSync(!files[0] || files[0] === '-' ? 0 : files[0], 'utf8').replace(/^\uFEFF/, ''));
    result = output(await requestHuman(input, { background, onCreated: (request) => process.stderr.write(`${JSON.stringify({ event: 'waiting_for_user', requestId: request.id })}\n`) }), { background });
  }
  else if (command === 'get' || command === 'result') result = await api(`/requests/${id}${command === 'result' ? `/result${format === 'legacy' ? '?format=legacy' : ''}` : ''}`);
  else if (command === 'wait') result = output(await waitForHuman(id));
  else if (command === 'logs') result = await api(`/logs?limit=${id || 50}&offset=${rest[0] || 0}`);
  else if (command === 'cancel') result = output(await api(`/requests/${id}/cancel`, 'POST', { reason: rest.join(' ') }));
  else if (command === 'list' || command === 'plugins') result = await api(`/${command === 'list' ? 'requests' : 'plugins'}`);
  else throw new Error('未知命令。运行 human_cli.exe --help 查看用法。');
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${JSON.stringify({ error: { code: error.code || 'E_HUMAN_CLI', message: error.message, ...(error.requestId ? { requestId: error.requestId } : {}) } })}\n`); process.exitCode = 1; }
