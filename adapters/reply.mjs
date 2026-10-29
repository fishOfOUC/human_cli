export { projectReply } from '../core/reply.mjs';

export function legacySnapshot(request) {
  if (request.status === 'cancelled' && request.cancelledBy === 'user') return {
    id: request.id, status: request.status, cancelledBy: 'user', cancelReason: request.cancelReason, result: null, cache: request.cache,
  };
  const { content, ...snapshot } = request;
  if (snapshot.result) {
    const { content, ...result } = snapshot.result;
    snapshot.result = { ...result, reply: result.reply || '已完成' };
  }
  return snapshot;
}
