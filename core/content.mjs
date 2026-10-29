import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const isPreviewImage = (mime) => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
export const block = (value) => ({ blockId: randomUUID(), ...value });
export const hasReplyContent = (value) => value.type !== 'text' || Boolean(value.text.trim());

// Old records did not record insertion positions. Preserve their known order.
export function legacyContent(value) {
  return [
    ...(value.reply?.trim() ? [block({ type: 'text', text: value.reply })] : []),
    ...(value.images || []).map((image) => block({ type: 'image', attachmentId: typeof image === 'string' ? image : image.id })),
    ...(value.diagnostics || []).map((diagnostic) => block({ type: 'diagnostic', ...diagnostic })),
  ];
}

export function normalizeContent(input, requestId, attachments) {
  fail(Array.isArray(input) && input.length <= 200, 'E_CONTENT', '回复最多包含 200 个内容块。');
  const ids = new Set(), files = new Map();
  let textLength = 0, imageCount = 0, fileCount = 0;
  const result = input.map((item) => {
    fail(item && typeof item === 'object', 'E_CONTENT', '无效的回复内容块。');
    const blockId = item.blockId ?? randomUUID();
    fail(typeof blockId === 'string' && /^[\w-]{1,80}$/.test(blockId) && !ids.has(blockId), 'E_CONTENT', '内容块标识无效或重复。');
    ids.add(blockId);
    if (item.type === 'text') {
      fail(typeof item.text === 'string', 'E_REPLY', '文字内容无效。');
      textLength += item.text.length;
      return { blockId, type: 'text', text: item.text };
    }
    if (item.type === 'image' || item.type === 'file') {
      const a = attachments.forRequest(item.attachmentId, requestId);
      const type = isPreviewImage(a.mime) ? 'image' : 'file';
      fail(item.type === type, 'E_CONTENT', '附件内容块的类型不匹配。');
      if (type === 'image') imageCount++;
      fileCount++; files.set(a.id, a.size);
      return { blockId, type, attachmentId: a.id };
    }
    fail(item.type === 'diagnostic' && typeof item.toolId === 'string' && typeof item.code === 'string' && typeof item.message === 'string', 'E_CONTENT', '诊断内容无效。');
    fail(item.toolId.length <= 200 && item.code.length <= 200 && item.message.length <= 30000 && (item.details === undefined || typeof item.details === 'string' && item.details.length <= 100000), 'E_CONTENT', '诊断内容过长。');
    return { blockId, type: 'diagnostic', toolId: item.toolId, name: String(item.name || item.toolId).slice(0, 200), code: item.code, message: item.message, ...(item.details ? { details: item.details } : {}) };
  });
  fail(textLength <= 30000, 'E_REPLY', '回复不能超过 30000 字符。');
  fail(imageCount <= 8, 'E_IMAGE_LIMIT', '每张便签最多附 8 张图片。');
  fail(fileCount <= 20, 'E_ATTACHMENT_LIMIT', '每张便签最多附 20 个附件。');
  fail([...files.values()].reduce((sum, size) => sum + size, 0) <= MAX_TOTAL_BYTES, 'E_FILE_SIZE', '附件总大小不能超过 100 MiB。');
  return result;
}

// Keep the internal inspection API compatible; public replies use content only.
export function syncLegacyFields(value) {
  value.reply = value.content.filter((b) => b.type === 'text' && b.text.length).map((b) => b.text).join('\n');
  value.images = [...new Set(value.content.filter((b) => b.type === 'image').map((b) => b.attachmentId))];
  value.diagnostics = value.content.filter((b) => b.type === 'diagnostic').map(({ blockId, type, ...diagnostic }) => diagnostic);
}

export function resolveContent(content, attachment) {
  return content.map((b) => b.attachmentId ? { ...b, attachment: attachment(b.attachmentId) } : { ...b });
}
