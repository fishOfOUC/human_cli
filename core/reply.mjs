import { hasReplyContent } from './content.mjs';

export const emptySubmission = () => ({ type: 'confirmation_only', message: '用户已提交完成确认，本次收到的正文和附件均为空。' });

export function projectReply(request, { background = false } = {}) {
  const reply = { schemaVersion: 1, requestId: request.id, status: request.status };
  if (background) return reply;
  if (request.cancelReason) reply.cancelReason = request.cancelReason;
  if (request.status === 'cancelled' && request.cancelledBy === 'user') reply.cancelledBy = 'user';
  if (request.cache?.state === 'discarded') return { ...reply, replyState: 'discarded' };
  if (request.status === 'completed') {
    if (!Array.isArray(request.result?.content)) throw Object.assign(new Error('桌面端未提供有序回复，请在现有任务结束后重启到新版 human_cli；原回复仍可通过 get/logs 查询。'), { code: 'E_REPLY_VERSION', requestId: request.id });
    reply.content = request.result.content.filter(hasReplyContent).map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.attachmentId) {
        const a = b.attachment;
        if (!a?.path) throw Object.assign(new Error('附件缓存路径不可用。'), { code: 'E_ATTACHMENT_CACHE', requestId: request.id });
        return { type: b.type, attachmentId: a.id, name: a.name, mimeType: a.mime, size: a.size, path: a.path };
      }
      const { blockId, ...diagnostic } = b;
      return diagnostic;
    });
    if (reply.content.length === 0) reply.submission = emptySubmission();
  }
  return reply;
}
