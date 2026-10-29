const textBlock = (text = '') => ({ blockId: crypto.randomUUID(), type: 'text', text });
const preview = (mime) => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
const mimeFor = (file) => file.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', json: 'application/json', csv: 'text/csv', pdf: 'application/pdf', zip: 'application/zip' }[file.name.split('.').at(-1).toLowerCase()]) || 'application/octet-stream';

// The draft model, rather than upload completion order, owns insertion positions.
export class ReplyEditor {
  constructor({ upload, changed, render }) {
    this.upload = upload; this.changed = changed; this.render = render;
    this.blocks = []; this.seen = new Set(); this.uploads = new Set(); this.cursor = null;
  }
  receive(content, reset = false) {
    if (reset) { this.blocks = structuredClone(content || []); this.seen = new Set(this.blocks.map((b) => b.blockId)); this.cursor = null; }
    else for (const b of content || []) {
      const local = this.blocks.find((item) => item.blockId === b.blockId);
      if (local && b.attachment) local.attachment = b.attachment;
      if (!this.seen.has(b.blockId) && !local) this.blocks.push(structuredClone(b));
      this.seen.add(b.blockId);
    }
    this.ensureText();
  }
  ensureText() {
    const next = [];
    for (const b of this.blocks) {
      if (b.type === 'text' && next.at(-1)?.type === 'text') {
        if (!b.text) { this.seen.add(b.blockId); continue; }
        if (!next.at(-1).text) this.seen.add(next.pop().blockId);
      }
      if (b.type !== 'text' && (!next.length || next.at(-1).type !== 'text')) next.push(textBlock());
      next.push(b);
    }
    if (!next.length || next.at(-1).type !== 'text') next.push(textBlock());
    this.blocks = next;
  }
  capture(element) {
    if (element?.matches('[data-text-block]')) this.cursor = { blockId: element.dataset.textBlock, start: element.selectionStart, end: element.selectionEnd };
  }
  input(element) {
    const b = this.blocks.find((item) => item.blockId === element.dataset.textBlock);
    if (b) b.text = element.value;
    this.capture(element); this.changed();
  }
  insert(items) {
    let index = this.blocks.findIndex((b) => b.blockId === this.cursor?.blockId && b.type === 'text');
    if (index < 0) index = this.blocks.findLastIndex((b) => b.type === 'text');
    const current = this.blocks[index], start = this.cursor?.blockId === current.blockId ? this.cursor.start : current.text.length;
    const end = this.cursor?.blockId === current.blockId ? this.cursor.end : start;
    const after = textBlock(current.text.slice(end));
    this.blocks.splice(index, 1, { ...current, text: current.text.slice(0, start) }, ...items, after);
    this.ensureText(); this.cursor = { blockId: after.blockId, start: 0, end: 0 };
    this.render(); this.changed();
    requestAnimationFrame(() => {
      const input = document.querySelector(`[data-text-block="${after.blockId}"]`);
      input?.focus({ preventScroll: true }); input?.setSelectionRange(0, 0); input?.scrollIntoView({ block: 'nearest' });
    });
  }
  insertAttachment(attachment) {
    this.insert([{ blockId: crypto.randomUUID(), type: preview(attachment.mime) ? 'image' : 'file', attachmentId: attachment.id, attachment }]);
  }
  addFiles(files) {
    const existing = this.blocks.filter((b) => b.type === 'image' || b.type === 'file');
    if (existing.length + files.length > 20) throw new Error('每张便签最多附 20 个附件。');
    if (existing.filter((b) => b.type === 'image').length + files.filter((f) => preview(mimeFor(f))).length > 8) throw new Error('每张便签最多附 8 张图片。');
    const sizes = new Map(existing.map((b) => [b.attachmentId || b.blockId, b.attachment?.size ?? b.file?.size ?? 0]));
    if ([...sizes.values()].reduce((sum, size) => sum + size, 0) + files.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024) throw new Error('附件总大小不能超过 100 MiB。');
    const items = files.map((file) => ({ blockId: crypto.randomUUID(), type: preview(mimeFor(file)) ? 'image' : 'file', file, name: file.name || '粘贴的图片.png', pending: true }));
    this.insert(items);
    for (const item of items) this.startUpload(item);
  }
  startUpload(item) {
    item.pending = true; delete item.error;
    const task = Promise.resolve().then(async () => {
      const mime = mimeFor(item.file), limit = preview(mime) ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
      if (item.file.size > limit) throw new Error(preview(mime) ? '单张图片不能超过 5 MiB' : '单个文件不能超过 20 MiB');
      const attachment = await this.upload({ name: item.name, mime, bytes: new Uint8Array(await item.file.arrayBuffer()) });
      item.attachmentId = attachment.id; item.attachment = attachment;
    }).catch((error) => { item.error = error.message; }).finally(() => {
      item.pending = false; this.uploads.delete(task); this.render(); this.changed();
    });
    this.uploads.add(task);
  }
  remove(id) {
    this.seen.add(id); this.blocks = this.blocks.filter((b) => b.blockId !== id); this.ensureText(); this.render(); this.changed();
  }
  move(id, direction) {
    const index = this.blocks.findIndex((b) => b.blockId === id);
    let target = index + direction;
    while (target >= 0 && target < this.blocks.length && this.blocks[target].type === 'text' && !this.blocks[target].text) target += direction;
    if (index < 0 || target < 0 || target >= this.blocks.length) return;
    const [item] = this.blocks.splice(index, 1); this.blocks.splice(target, 0, item);
    this.ensureText(); this.render(); this.changed();
  }
  get ready() { return !this.blocks.some((b) => b.pending || b.error); }
  serialize() {
    if (!this.ready) throw new Error('附件尚未保存成功，请等待、重试或移除失败项。');
    return this.blocks.map((b) => {
      if (b.type === 'text') return { blockId: b.blockId, type: 'text', text: b.text };
      if (b.type === 'diagnostic') { const { blockId, type, toolId, name, code, message, details } = b; return { blockId, type, toolId, name, code, message, ...(details ? { details } : {}) }; }
      return { blockId: b.blockId, type: b.type, attachmentId: b.attachmentId };
    });
  }
  async waitReady() {
    while (this.uploads.size) await Promise.all([...this.uploads]);
    return this.serialize();
  }
}
