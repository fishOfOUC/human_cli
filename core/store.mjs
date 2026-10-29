import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class JsonStore {
  constructor(directory) {
    mkdirSync(directory, { recursive: true });
    this.directory = directory; this.path = join(directory, 'state.json');
    this.data = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {
      schemaVersion: 1, requests: {}, attachments: {}, preferences: { theme: 'light', pinned: true, motion: true }, pluginDefaults: {}, geometry: null,
    };
    if (this.data.schemaVersion !== 1) throw new Error('不支持的数据版本，请先备份数据再升级。');
  }
  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
}
