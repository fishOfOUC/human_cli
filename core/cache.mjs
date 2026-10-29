import { mkdirSync, writeFileSync, renameSync, existsSync, readdirSync, unlinkSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveContent } from './content.mjs';
import { projectReply } from './reply.mjs';
import { fail } from './errors.mjs';

function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

// Readable, per-request files for an AI recovering after a failed tool call.
// Keep binary files beside the JSON so recovery never depends on a live GUI URL.
export class RequestCache {
  constructor(store, attachments, directory) { this.root = resolve(directory || join(store.directory, 'cache')); this.attachments = attachments; mkdirSync(this.root, { recursive: true }); }
  location(request) {
    fail(/^[a-f0-9-]{36}$/.test(request.id), 'E_CACHE_PATH', '无效的请求缓存标识。');
    const directory = join(this.root, request.id);
    return { directory, requestPath: join(directory, 'request.json'), replyPath: request.result ? join(directory, 'reply.json') : null };
  }
  attachment(requestId, id) {
    const item = this.attachments.forRequest(id, requestId);
    fail(this.attachments.isManagedFile(item.file), 'E_ATTACHMENT_PATH', '无效的附件存储位置。');
    const directory = join(this.location({ id: requestId }).directory, 'attachments'), path = join(directory, item.file);
    mkdirSync(directory, { recursive: true });
    if (!existsSync(path) || statSync(path).size !== item.size) {
      const source = this.attachments.bytes(id);
      writeFileSync(`${path}.tmp`, source, { mode: 0o600 });
      fail(readFileSync(`${path}.tmp`).equals(source), 'E_CACHE_COPY', '附件缓存校验失败。');
      renameSync(`${path}.tmp`, path);
    }
    const { file, ...metadata } = item;
    return { ...metadata, path };
  }
  sync(request) {
    const location = this.location(request), directory = join(location.directory, 'attachments');
    mkdirSync(directory, { recursive: true });
    const used = new Set();
    const attachment = (id) => {
      const item = this.attachments.forRequest(id, request.id);
      used.add(item.file);
      return this.attachment(request.id, id);
    };
    const snapshot = structuredClone(request);
    snapshot.images = request.images.map(attachment);
    snapshot.content = resolveContent(request.content || [], attachment);
    snapshot.tools = request.tools.map((tool) => ({ ...tool, output: tool.output ? { ...tool.output, attachments: (tool.output.attachments || []).map(attachment) } : null }));
    if (request.result) snapshot.result = { ...request.result, images: request.result.images.map(attachment), content: resolveContent(request.result.content || [], attachment) };
    snapshot.cache = { ...request.cache, ...location };
    writeJson(location.requestPath, snapshot);
    if (snapshot.result) writeJson(location.replyPath, projectReply(snapshot));
    else {
      try { unlinkSync(join(location.directory, 'reply.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const name of readdirSync(directory)) {
      if (!used.has(name) && this.attachments.isManagedFile(name)) unlinkSync(join(directory, name));
    }
    return location;
  }
}
