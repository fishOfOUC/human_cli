import { readFileSync } from 'node:fs';
import { api } from './client.mjs';

const [command, id, ...rest] = process.argv.slice(2);
try {
  let result;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write('human_cli.exe request <file.json|-> | wait/get/result/cancel <id> | logs [limit] [offset] | list | plugins | mcp\nJSON request input may also be read from stdin. Output is UTF-8 JSON.\n');
  }
  else if (command === 'request') result = await api('/requests', 'POST', JSON.parse(readFileSync(!id || id === '-' ? 0 : id, 'utf8').replace(/^\uFEFF/, '')));
  else if (command === 'get' || command === 'result') result = await api(`/requests/${id}${command === 'result' ? '/result' : ''}`);
  else if (command === 'wait') result = await api(`/requests/${id}/wait`, 'GET', undefined, { wait: true });
  else if (command === 'logs') result = await api(`/logs?limit=${id || 50}&offset=${rest[0] || 0}`);
  else if (command === 'cancel') result = await api(`/requests/${id}/cancel`, 'POST', { reason: rest.join(' ') });
  else if (command === 'list' || command === 'plugins') result = await api(`/${command === 'list' ? 'requests' : 'plugins'}`);
  else throw new Error('未知命令。运行 human_cli.exe --help 查看用法。');
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error.code || 'E_HUMAN_CLI'}: ${error.message}\n`); process.exitCode = 1; }
