import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fail } from './errors.mjs';

const MAX_BYTES = 5 * 1024 * 1024;
export function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
export class AttachmentStore {
  constructor(store) {
    this.store = store; this.root = join(store.directory, 'attachments'); mkdirSync(this.root, { recursive: true });
    this.cleanupDiscarded();
  }
  cleanupDiscarded() {
    const used = new Set();
    for (const request of Object.values(this.store.data.requests)) {
      for (const id of request.images || []) used.add(id);
      for (const id of request.result?.images || []) used.add(id);
      for (const tool of request.tools || []) for (const id of tool.output?.attachments || []) used.add(id);
    }
    let changed = false;
    for (const [id, attachment] of Object.entries(this.store.data.attachments)) {
      const request = this.store.data.requests[attachment.requestId];
      if ((request?.cache?.state || request?.delivery?.state) !== 'discarded' || used.has(id)) continue;
      // Files are generated IDs, never caller-provided paths. Keep failed cleanup
      // records for retry at next startup, while the reply is already undeliverable.
      if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp|txt)$/.test(attachment.file)) continue;
      try { unlinkSync(join(this.root, attachment.file)); }
      catch (error) { if (error.code !== 'ENOENT') continue; }
      delete this.store.data.attachments[id]; changed = true;
    }
    if (changed) this.store.save();
  }
  add(requestId, { name, mime, bytes }) {
    const content = Buffer.from(bytes);
    fail(content.length > 0 && content.length <= MAX_BYTES, 'E_FILE_SIZE', '附件必须为 1 字节至 5 MB。');
    if (mime.startsWith('image/')) fail(imageMime(content) === mime, 'E_IMAGE_TYPE', '图片内容与类型不符，仅支持 PNG、JPEG、GIF 和 WebP。');
    else fail(mime === 'text/plain', 'E_FILE_TYPE', '插件附件仅支持图片或纯文本。');
    const id = randomUUID(), ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'text/plain': 'txt' }[mime];
    writeFileSync(join(this.root, `${id}.${ext}`), content, { mode: 0o600 });
    const metadata = { id, requestId, name: basename(name || `附件.${ext}`).slice(0, 200), mime, size: content.length, file: `${id}.${ext}`, createdAt: new Date().toISOString() };
    this.store.data.attachments[id] = metadata;
    this.store.save();
    return this.view(metadata);
  }
  get(id) { const item = this.store.data.attachments[id]; fail(item, 'E_ATTACHMENT', '附件不存在。', 404); return item; }
  bytes(id) { return readFileSync(join(this.root, this.get(id).file)); }
  view(item) { const { file, ...metadata } = item; return { ...metadata, url: `human-cli-asset://attachment/${item.id}` }; }
  forRequest(id, requestId) { const item = this.get(id); fail(item.requestId === requestId, 'E_ATTACHMENT_OWNER', '附件不属于该请求。'); return item; }
}
