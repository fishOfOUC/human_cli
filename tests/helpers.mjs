import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from '../core/store.mjs';
import { AttachmentStore } from '../core/attachments.mjs';
import { PluginHost } from '../plugins/host.mjs';
import { RequestService } from '../core/requests.mjs';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
export function fixture(t, capabilities = {}, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'human-cli-test-'));
  t.after(() => { if (!resolve(directory).startsWith(resolve(tmpdir(), 'human-cli-test-'))) throw new Error('Unsafe test cleanup'); rmSync(directory, { recursive: true, force: true }); });
  const store = new JsonStore(directory), attachments = new AttachmentStore(store);
  const calls = [];
  const plugins = new PluginHost([fileURLToPath(new URL('../plugins/builtin', import.meta.url)), ...(options.roots || [])], {
    'screen.capture': async () => png,
    'clipboard.write': ({ text }) => { calls.push(text); },
    'clipboard.read': () => '剪贴板文字',
    'system.info': () => ({ os: 'test', displays: [] }),
    ...capabilities,
  }, options);
  const service = new RequestService(store, attachments, plugins);
  return { service, store, attachments, plugins, directory, calls };
}
