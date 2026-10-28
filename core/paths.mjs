import { homedir } from 'node:os';
import { join } from 'node:path';
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
