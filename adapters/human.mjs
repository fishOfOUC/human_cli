import { api } from './client.mjs';

export const waitForHuman = (requestId, { signal } = {}) => api(`/requests/${requestId}/wait`, 'GET', undefined, { wait: true, signal });

// The public operation is one request/response interaction with a human.
// Creating a note without awaiting a reply must be an explicit opt-in.
export async function requestHuman(input, { background = false, signal, onCreated } = {}) {
  const request = await api('/requests', 'POST', input, { signal });
  if (background) return request;
  try {
    onCreated?.(request);
    return await waitForHuman(request.id, { signal });
  } catch (error) {
    error.requestId = request.id; error.cache = request.cache;
    throw error;
  }
}
