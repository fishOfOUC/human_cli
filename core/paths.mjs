import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
export const dataDirectory = () => {
  const configured = process.env.HUMAN_CLI_DATA_DIR || process.env.RELAY_DATA_DIR;
  if (configured) return configured;
  const base = process.env.LOCALAPPDATA || join(homedir(), '.local', 'share');
  const current = join(base, 'human_cli'), legacy = join(base, 'RelayNote');
  // Keep existing notes and preferences available after the product rename.
  return !existsSync(join(current, 'state.json')) && existsSync(join(legacy, 'state.json')) ? legacy : current;
};
export const runtimePath = () => join(dataDirectory(), 'runtime.json');

export function replyCacheDirectory({ packaged = false, executable = process.execPath } = {}) {
  const software = packaged ? dirname(executable) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  return resolve(process.env.HUMAN_CLI_CACHE_DIR || join(software, 'cache'));
}
