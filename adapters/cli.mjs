import { readFileSync } from 'node:fs';
import { api } from './client.mjs';
import { requestHuman, waitForHuman } from './human.mjs';

const [command, id, ...rest] = process.argv.slice(2);
try {
  let result;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write('human_cli.exe request [file.json|-] [--background] | wait/get/result/cancel <id> | logs [limit] [offset] | list | plugins | mcp\nrequest waits for the human reply by default, with no human-operation deadline.\n--background explicitly creates a note and returns immediately.\nJSON request input may also be read from stdin. Output is UTF-8 JSON.\n');
  }
  else if (command === 'request') {
    const args = [id, ...rest].filter((value) => value !== undefined), background = args.includes('--background');
    const files = args.filter((value) => value !== '--background');
    if (files.length > 1 || files.some((value) => value.startsWith('--'))) throw new Error('用法：human_cli.exe request [file.json|-] [--background]');
    const input = JSON.parse(readFileSync(!files[0] || files[0] === '-' ? 0 : files[0], 'utf8').replace(/^\uFEFF/, ''));
    result = await requestHuman(input, { background, onCreated: (request) => process.stderr.write(`${JSON.stringify({ event: 'waiting_for_user', requestId: request.id, title: request.title, cache: request.cache })}\n`) });
  }
  else if (command === 'get' || command === 'result') result = await api(`/requests/${id}${command === 'result' ? '/result' : ''}`);
  else if (command === 'wait') result = await waitForHuman(id);
  else if (command === 'logs') result = await api(`/logs?limit=${id || 50}&offset=${rest[0] || 0}`);
  else if (command === 'cancel') result = await api(`/requests/${id}/cancel`, 'POST', { reason: rest.join(' ') });
  else if (command === 'list' || command === 'plugins') result = await api(`/${command === 'list' ? 'requests' : 'plugins'}`);
  else throw new Error('未知命令。运行 human_cli.exe --help 查看用法。');
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error.code || 'E_HUMAN_CLI'}: ${error.message}\n`); process.exitCode = 1; }
