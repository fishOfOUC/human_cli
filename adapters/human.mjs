import { api } from './client.mjs';

export const waitForHuman = (requestId, { signal } = {}) => api(`/requests/${requestId}/wait`, 'GET', undefined, { wait: true, signal });

// The public operation is one request/response interaction with a human.
// Creating a note without awaiting a reply must be an explicit opt-in.
export async function requestHuman(input, { background = false, signal, onCreated } = {}) {
  const request = await api('/requests', 'POST', input, { signal });
  if (background && await foregroundOnly()) {
    // The user disabled background creation: the call blocks like a foreground
    // request and the reply states that the restriction was applied.
    onCreated?.(request);
    const reply = await waitForHuman(request.id, { signal });
    const note = '用户已勾选仅允许前台调用。';
    if (reply.status === 'completed' && reply.result) {
      reply.result.content = [...(reply.result.content || []), { type: 'text', text: note }];
      reply.result.reply = `${reply.result.reply ? `${reply.result.reply}\n` : ''}${note}`;
    }
    return reply;
  }
  if (background) return request;
  try {
    onCreated?.(request);
    return await waitForHuman(request.id, { signal });
  } catch (error) {
    error.requestId = request.id; error.cache = request.cache;
    throw error;
  }
}
async function foregroundOnly() {
  try { return (await api('/preferences')).foregroundOnly === true; } catch { return false; }
}
