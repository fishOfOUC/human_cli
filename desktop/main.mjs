import { app, protocol, net, session, screen } from 'electron';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dataDirectory, runtimePath, replyCacheDirectory } from '../core/paths.mjs';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { RequestService } from '../core/requests.mjs';
import { PluginHost } from '../plugins/host.mjs';
import { NetworkPluginHost, readProviders } from '../plugins/network-host.mjs';
import { startSpiServer } from '../plugins/spi-server.mjs';
import { startApi } from '../adapters/http.mjs';
import { WindowManager } from './windows.mjs';
import { createCapabilities } from './capabilities.mjs';
import { registerIpc } from './ipc.mjs';
import { ConfigUiManager } from './config-ui.mjs';
import { OnDemandLifecycle } from './lifecycle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
app.setName('human_cli'); app.setPath('userData', dataDirectory());
protocol.registerSchemesAsPrivileged([{ scheme: 'human-cli-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }, { scheme: 'human-cli-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
export let ready;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  ready = app.whenReady().then(async () => {
  const store = new JsonStore(dataDirectory()), attachments = new AttachmentStore(store), windows = new WindowManager(root, store);
  const pluginDirectory = join(dataDirectory(), 'plugins'); mkdirSync(pluginDirectory, { recursive: true });
  const legacy = new PluginHost([join(root, 'plugins', 'builtin'), pluginDirectory], createCapabilities(windows));
  const builtinProvider = await startSpiServer({
    plugins: () => legacy.list().map(({ entry, permissions, ...manifest }) => manifest),
    execute: (id, context, options) => legacy.execute(id, { ...context, config: legacy.validateConfig(id, context.config) }, options),
  });
  const providerFile = join(pluginDirectory, 'providers.json');
  if (!existsSync(providerFile)) writeFileSync(providerFile, JSON.stringify({ version: 1, providers: [] }, null, 2), { mode: 0o600 });
  let configured = [], configError;
  try { configured = readProviders(providerFile); } catch (error) { configError = { folder: 'providers.json', message: error.message }; }
  const host = await new NetworkPluginHost([{ id: 'human.builtin', url: builtinProvider.url, token: builtinProvider.token }, ...configured]).initialize();
  host.loadErrors.push(...legacy.loadErrors, ...(configError ? [configError] : []));
  const service = new RequestService(store, attachments, host, { cacheDirectory: replyCacheDirectory({ packaged: app.isPackaged }) });
  protocol.handle('human-cli-app', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'ui') return new Response('Not found', { status: 404 });
    const file = resolve(join(root, 'dist'), `.${decodeURIComponent(url.pathname)}`);
    const rel = relative(join(root, 'dist'), file);
    if (rel.startsWith('..') || isAbsolute(rel) || !existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  protocol.handle('human-cli-asset', (request) => {
    try {
      const url = new URL(request.url), id = url.pathname.slice(1);
      if (url.hostname !== 'attachment' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error();
      const item = attachments.get(id);
      return new Response(attachments.bytes(id), { headers: { 'Content-Type': item.mime, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'human-cli-app://ui' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' human-cli-asset: data:; connect-src 'self' human-cli-asset:; object-src 'none'; frame-src 'none'"] } }));
  const configUis = new ConfigUiManager(service);
  const lifecycle = new OnDemandLifecycle(() => service.list().some((r) => r.status === 'pending'), () => app.quit());
  registerIpc(service, windows, configUis);
  const api = await startApi(service, { activity: (path) => lifecycle.begin(path) });
  writeFileSync(runtimePath(), JSON.stringify({ url: api.url, token: api.token, pid: process.pid, version: '2.0.3' }), { mode: 0o600 });
  service.on('change', ({ id, event }) => {
    if (event === 'created') windows.open(id);
    else if (service.get(id).status !== 'pending') windows.finish(id);
    lifecycle.changed();
  });
  app.on('second-instance', () => { for (const win of windows.windows.values()) { if (win.isMinimized()) win.restore(); win.show(); } });
  for (const event of ['display-removed', 'display-added', 'display-metrics-changed']) screen.on(event, () => windows.displayChanged());
  const pending = service.list().filter((r) => r.status === 'pending');
  for (const request of pending) windows.open(request.id);
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { lifecycle.dispose(); void configUis.shutdown(); windows.shutdown(); api.server.closeAllConnections(); api.server.close(); builtinProvider.server.closeAllConnections(); builtinProvider.server.close(); try { unlinkSync(runtimePath()); } catch {} });
  });
}
