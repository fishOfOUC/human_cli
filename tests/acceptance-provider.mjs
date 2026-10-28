import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startAcceptanceProvider } from './fixtures/acceptance-plugins.mjs';

const directory = resolve(process.argv[2]), data = join(directory, 'data');
mkdirSync(join(data, 'plugins'), { recursive: true });
const provider = await startAcceptanceProvider();
writeFileSync(join(data, 'plugins', 'providers.json'), JSON.stringify({ version: 1, providers: [{ id: 'acceptance', url: provider.url, token: provider.token }] }, null, 2), { mode: 0o600 });
writeFileSync(join(directory, 'provider-ready.json'), JSON.stringify({ pid: process.pid, pluginIds: ['acceptance.web', 'acceptance.simple', 'acceptance.none'] }));
console.log('三个本地测试插件已就绪。验收任务结束、桌面端退出后，测试服务自动退出。');

// Only startup has a deadline. Once the desktop connects, user work can take indefinitely.
let connected = false, failures = 0;
const startup = Date.now();
try {
  while (true) {
    await delay(1000);
    let alive = false;
    const path = join(data, 'runtime.json');
    if (existsSync(path)) try {
      const runtime = JSON.parse(readFileSync(path, 'utf8'));
      if (/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.url)) {
        const response = await fetch(runtime.url + '/health', { headers: { Authorization: `Bearer ${runtime.token}` }, signal: AbortSignal.timeout(1500) });
        alive = response.ok && (await response.json()).name === 'human_cli';
      }
    } catch {}
    if (alive) { connected = true; failures = 0; }
    else if (connected && ++failures >= 5 || !connected && Date.now() - startup > 90000) break;
  }
} finally { provider.server.closeAllConnections(); await new Promise((done) => provider.server.close(done)); }
