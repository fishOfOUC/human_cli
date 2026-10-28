import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runtimePath } from '../core/paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let starting;
async function connect() {
  if (!existsSync(runtimePath())) return null;
  try {
    const runtime = JSON.parse(readFileSync(runtimePath(), 'utf8'));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.url)) return null;
    const health = await fetch(`${runtime.url}/health`, { headers: { Authorization: `Bearer ${runtime.token}` }, signal: AbortSignal.timeout(1500) });
    return health.ok && (await health.json()).name === 'human_cli' ? runtime : null;
  } catch { return null; }
}
export async function ensureDesktop() {
  const current = await connect(); if (current) return current;
  if (!starting) starting = (async () => {
    if (process.env.HUMAN_CLI_NO_AUTOSTART === '1') throw new Error('human_cli 桌面端未运行，请先启动。');
    const packaged = process.env.HUMAN_CLI_DESKTOP_EXE;
    if (!packaged && !existsSync(join(root, 'dist', 'index.html'))) throw new Error('界面尚未构建，请先在项目目录运行 npm run build。');
    let executable = packaged;
    if (!executable) {
      const directory = dirname(createRequire(import.meta.url).resolve('electron'));
      const pathFile = join(directory, 'path.txt');
      if (!existsSync(pathFile)) throw new Error('Electron 运行时尚未安装，请先在项目目录运行 npm run setup。');
      executable = join(directory, 'dist', readFileSync(pathFile, 'utf8').trim());
      if (!existsSync(executable)) throw new Error('Electron 运行时缺失，请运行 npm run setup。');
    }
    const args = packaged ? [] : [join(root, 'desktop', 'main.mjs')];
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true, env });
    let launchError; child.on('error', (error) => { launchError = error; }); child.unref();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      const runtime = await connect(); if (runtime) return runtime;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('桌面端启动超时，请运行 npm start 后重试。');
  })().finally(() => { starting = null; });
  return starting;
}
export async function api(path, method = 'GET', data, { signal, wait = false } = {}) {
  const runtime = await ensureDesktop();
  const response = await fetch(`${runtime.url}${path}`, {
    method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    ...(wait ? { signal } : { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }),
  });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error?.message || `HTTP ${response.status}`), { code: value.error?.code });
  return value;
}
