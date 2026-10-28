import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

let nextId = 0;
const calls = new Map();
parentPort.on('message', (message) => {
  if (message.type !== 'capability-result') return;
  const callback = calls.get(message.id); if (!callback) return; calls.delete(message.id);
  if (message.error) callback.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
  else callback.resolve(message.result);
});
const call = (method, args) => new Promise((resolve, reject) => {
  const id = ++nextId; calls.set(id, { resolve, reject }); parentPort.postMessage({ type: 'capability', id, method, args });
});
try {
  const plugin = await import(pathToFileURL(workerData.entry).href);
  const context = Object.freeze({
    request: Object.freeze(workerData.context.request), config: Object.freeze(workerData.context.config),
    captureScreen: (options = {}) => call('screen.capture', options),
    clipboard: Object.freeze({ readText: () => call('clipboard.read'), writeText: (text) => call('clipboard.write', { text }) }),
    openUrl: (url) => call('shell.openUrl', { url }),
    systemInfo: () => call('system.info'),
  });
  const output = await plugin.run(context);
  parentPort.postMessage({ type: 'result', output });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: { code: error.code || 'E_PLUGIN', message: error.message, details: error.stack } });
}
