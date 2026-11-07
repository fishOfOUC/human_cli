import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
export const softwareRoot = ({ executable = process.execPath } = {}) => {
  // Packaged desktop builds keep data portable beside the executable; source runs use the project root.
  if (process.versions.electron && !process.defaultApp) return dirname(executable);
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
};

export const dataDirectory = ({ software = softwareRoot() } = {}) => {
  const configured = process.env.ASK_FOR_USER_HELP_DATA_DIR || process.env.HUMAN_CLI_DATA_DIR || process.env.RELAY_DATA_DIR;
  if (configured) return configured;
  const current = join(software, '.askForUserHelp-data');
  const base = process.env.LOCALAPPDATA || join(homedir(), '.local', 'share');
  const legacy = ['askForUserHelp', 'human_cli', 'RelayNote'].map((name) => join(base, name));
  // Prefer portable data beside the software; keep pre-rename notes visible while the portable directory is still empty.
  return existsSync(join(current, 'state.json')) ? current : legacy.find((directory) => existsSync(join(directory, 'state.json'))) || current;
};
export const runtimePath = () => join(dataDirectory(), 'runtime.json');

export function replyCacheDirectory({ packaged = false, executable = process.execPath } = {}) {
  const software = packaged ? dirname(executable) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  return resolve(process.env.ASK_FOR_USER_HELP_CACHE_DIR || process.env.HUMAN_CLI_CACHE_DIR || join(software, 'cache'));
}
