import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api } from './client.mjs';
import { createSchema, updateSchema } from '../core/schemas.mjs';
import { requestHuman, waitForHuman } from './human.mjs';

const server = new McpServer({ name: 'human_cli', version: '1.1.0' });
const requestId = z.string().uuid();
const text = (value) => ({ type: 'text', text: JSON.stringify(value, null, 2) });
const register = (name, description, schema, handler) => server.registerTool(name, { description, inputSchema: schema }, async (input, extra) => {
  try { return await handler(input, extra); } catch (error) { return { isError: true, content: [text({ code: error.code || 'E_HUMAN_CLI', message: error.message, ...(error.requestId ? { requestId: error.requestId, cache: error.cache } : {}) })] }; }
});
async function replyContent(request, imageOffset = 0, signal) {
  const requestId = request.id;
  if (request.status !== 'completed') return { content: [text({ requestId, status: request.status, cancelReason: request.cancelReason, cache: request.cache })] };
  const result = await api(`/requests/${requestId}/result?imageOffset=${imageOffset}`, 'GET', undefined, { signal });
  if (result.cache?.state === 'discarded') return { content: [text({ requestId, status: 'reply_discarded', cache: result.cache, message: '用户已丢弃缓存回复，原回复不会再发送。' })] };
  const images = result.result.images;
  return { content: [text({ ...result, result: { ...result.result, images: images.map(({ data, ...metadata }) => metadata) } }), ...images.filter((image) => image.data).map((image) => ({ type: 'image', mimeType: image.mime, data: image.data }))] };
}
register('human_request', '请求用户协助并等待答复：显示置顶便签，用户完成后在同一次调用中返回文字和图片，不设用户操作期限。正常调用不需要再调用 human_wait。只有明确需要后台创建时才设置 background:true。idempotencyKey 避免重试重复创建；断线后用 human_logs 恢复。图片有 nextOffset 时用 human_wait 补取后续页。', { ...createSchema.shape, background: z.boolean().default(false).describe('默认 false，等待用户完成后返回；仅后台任务显式设为 true，立即返回便签 ID。') }, async ({ background, ...input }, extra) => {
  const request = await requestHuman(input, { background, signal: extra.signal });
  return background ? { content: [text(request)] } : replyContent(request, 0, extra.signal);
});
register('human_wait', '恢复等待已有便签或补取后续图片页。正常 human_request 已等待并返回回复，无需另调本工具。断线后可凭 ID 再等待，或用 human_logs 查缓存。若图片 imagePage.nextOffset 非 null，用它作为 imageOffset 继续读取。', { requestId, imageOffset: z.number().int().min(0).max(8).default(0) }, async ({ requestId, imageOffset }, extra) => replyContent(await waitForHuman(requestId, { signal: extra.signal }), imageOffset, extra.signal));
register('human_logs', '按便签创建时间倒序查询最近日志，返回标题、时间、状态和缓存的绝对路径。AI 重启或工具调用失败后，用此接口定位 request.json、reply.json 和图片文件，直接读取本地文件；无需回执。支持 limit/offset 分页。', { limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().nonnegative().default(0) }, async ({ limit, offset }) => ({ content: [text(await api(`/logs?limit=${limit}&offset=${offset}`))] }));
register('human_get', '查询请求当前状态、用户草稿和工具运行结果。最终图片请使用 human_wait 获取。', { requestId }, async ({ requestId }) => ({ content: [text(await api(`/requests/${requestId}`))] }));
register('human_update', '更新尚未完成的协助说明。保留用户草稿，version 用于避免覆盖过期请求。', { requestId, version: z.number().int().positive(), patch: updateSchema }, async ({ requestId, ...input }) => ({ content: [text(await api(`/requests/${requestId}`, 'PATCH', input))] }));
register('human_cancel', '由 AI 取消不再需要的请求，便签显示已取消；用户关闭或收起窗口不代表取消。', { requestId, reason: z.string().max(2000).default('') }, async ({ requestId, reason }) => ({ content: [text(await api(`/requests/${requestId}/cancel`, 'POST', { reason }))] }));
register('human_list', '列出已有请求，不会创建便签。', {}, async () => ({ content: [text(await api('/requests'))] }));
register('human_plugins', '列出已安装侧栏插件的 ID、配置 JSON Schema 和声明能力，以选择请求需要的功能按钮。', {}, async () => ({ content: [text(await api('/plugins'))] }));
await server.connect(new StdioServerTransport());
