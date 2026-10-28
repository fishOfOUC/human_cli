import { mkdirSync, writeFileSync, renameSync, existsSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

// Readable, per-request files for an AI recovering after a failed tool call.
// Keep binary files beside the JSON so recovery never depends on a live GUI URL.
export class RequestCache {
  constructor(store, attachments) { this.root = resolve(store.directory, 'cache'); this.attachments = attachments; mkdirSync(this.root, { recursive: true }); }
  location(request) {
    const directory = join(this.root, request.id);
    return { directory, requestPath: join(directory, 'request.json'), replyPath: request.result ? join(directory, 'reply.json') : null };
  }
  sync(request) {
    const location = this.location(request), directory = join(location.directory, 'attachments');
    mkdirSync(directory, { recursive: true });
    const used = new Set();
    const attachment = (id) => {
      const item = this.attachments.forRequest(id, request.id), path = join(directory, item.file);
      used.add(item.file);
      if (!existsSync(path)) copyFileSync(join(this.attachments.root, item.file), path);
      const { file, ...metadata } = item;
      return { ...metadata, path };
    };
    const snapshot = structuredClone(request);
    snapshot.images = request.images.map(attachment);
    snapshot.tools = request.tools.map((tool) => ({ ...tool, output: tool.output ? { ...tool.output, attachments: (tool.output.attachments || []).map(attachment) } : null }));
    if (request.result) snapshot.result = { ...request.result, images: request.result.images.map(attachment) };
    snapshot.cache = { ...request.cache, ...location };
    writeJson(location.requestPath, snapshot);
    if (snapshot.result) writeJson(location.replyPath, { ...snapshot.result, title: request.title, createdAt: request.createdAt, cache: snapshot.cache });
    else {
      try { unlinkSync(join(location.directory, 'reply.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const name of readdirSync(directory)) {
      if (!used.has(name) && /^[a-f0-9-]{36}\.(png|jpg|gif|webp|txt)$/.test(name)) unlinkSync(join(directory, name));
    }
    return location;
  }
}
