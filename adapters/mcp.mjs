import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { api } from './client.mjs';
import { createSchema, updateSchema } from '../core/schemas.mjs';
import { requestHuman, waitForHuman } from './human.mjs';
import { projectReply, legacySnapshot } from './reply.mjs';
import { createMcpInputContract } from './mcp-schema.mjs';

const server = new McpServer({ name: 'human_cli', version: '2.0.3' });
const requestId = z.string().uuid().describe('请求 UUID，使用创建请求返回的 requestId。');
const text = (value) => ({ type: 'text', text: JSON.stringify(value, null, 2) });
const publicTools = [];
const register = (name, description, shape, handler) => {
  const contract = createMcpInputContract(shape);
  publicTools.push({ name, description, inputSchema: contract.inputSchema });
  return server.registerTool(name, { description, inputSchema: contract.validation }, async (input, extra) => {
    try { return await handler(input, extra); } catch (error) { return { isError: true, content: [text({ code: error.code || 'E_HUMAN_CLI', message: error.message, ...(error.requestId ? { requestId: error.requestId, cache: error.cache } : {}) })] }; }
  });
};
async function replyContent(request, imageOffset = 0, signal, format = 'json') {
  if (format !== 'legacy') return { content: [text(projectReply(request))] };
  const requestId = request.id;
  if (request.status !== 'completed') return { content: [text({ requestId, status: request.status, cancelReason: request.cancelReason, cancelledBy: request.cancelledBy, cache: request.cache })] };
  const result = await api(`/requests/${requestId}/result?format=legacy&imageOffset=${imageOffset}`, 'GET', undefined, { signal });
  if (result.cache?.state === 'discarded') return { content: [text({ requestId, status: 'reply_discarded', cache: result.cache, message: '用户已丢弃缓存回复，原回复不会再发送。' })] };
  const images = result.result.images;
  return { content: [text({ ...result, result: { ...result.result, images: images.map(({ data, ...metadata }) => metadata) } }), ...images.filter((image) => image.data).map((image) => ({ type: 'image', mimeType: image.mime, data: image.data }))] };
}
const formatSchema = z.enum(['json', 'legacy']).default('json').describe('默认 json：有序内容块与附件本地路径。legacy 仅供旧调用者兼容，无法完整表达穿插顺序。');
register('human_request', '请求用户协助并在同一次调用中等待提交，不设用户操作期限。用户关闭时返回 cancelledBy=user，表示终止本次协助，不应自动重建便签。返回有序 content：文字、图片和文件路径、附入的诊断。用户直接空内容提交时，submission.type=confirmation_only 明确表示用户已提交完成确认，不代表验收通过，也不能据此推断输入丢失。图片与文件缓存于软件目录，请使用自身工具按 path 读取。正常调用无需再调用 human_wait。仅明确后台创建时设置 background:true；幂等键避免重复，断线用 human_logs 恢复。可选 agent/idempotencyKey 的空字符串按省略处理。', { ...createSchema.shape, format: formatSchema, background: z.boolean().default(false).describe('默认 false，等待用户完成后返回；仅后台任务显式设为 true，立即返回便签 ID。') }, async ({ background, format, ...input }, extra) => {
  const request = await requestHuman(input, { background, signal: extra.signal });
  return background ? { content: [text(format === 'legacy' ? legacySnapshot(request) : projectReply(request, { background: true }))] } : replyContent(request, 0, extra.signal, format);
});
register('human_wait', '恢复等待已有便签，并返回有序文字、图片/文件缓存路径和诊断。用户主动关闭会返回 status=cancelled、cancelledBy=user，不应自动重建便签。附件请使用自身工具读取 path。正常 human_request 已在同次调用返回，无需再调用；断线后凭 ID 恢复或用 human_logs 查缓存。新格式不需要图片分页。', { requestId, format: formatSchema, imageOffset: z.number().int().min(0).max(8).default(0).describe('仅 format=legacy 的旧图片分页使用。') }, async ({ requestId, imageOffset, format }, extra) => replyContent(await waitForHuman(requestId, { signal: extra.signal }), imageOffset, extra.signal, format));
register('human_logs', '按便签创建时间倒序查询最近日志，返回标题、时间、状态和缓存的绝对路径。AI 重启或工具调用失败后，用此接口定位 request.json、reply.json 和图片文件，直接读取本地文件；无需回执。支持 limit/offset 分页。', { limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().nonnegative().default(0) }, async ({ limit, offset }) => ({ content: [text(await api(`/logs?limit=${limit}&offset=${offset}`))] }));
register('human_get', '查询完整内部快照：当前状态、有序用户草稿和工具运行结果。正常协助结果使用 human_request/human_wait；图片和文件通过返回的本地路径读取。', { requestId }, async ({ requestId }) => ({ content: [text(await api(`/requests/${requestId}`))] }));
register('human_update', '更新尚未完成的协助说明。保留用户草稿，version 用于避免覆盖过期请求。', { requestId, version: z.number().int().positive(), patch: updateSchema }, async ({ requestId, ...input }) => ({ content: [text(await api(`/requests/${requestId}`, 'PATCH', input))] }));
register('human_cancel', '由 AI 取消不再需要的请求，便签立即消失；用户最小化窗口不代表取消。', { requestId, reason: z.string().max(2000).default('') }, async ({ requestId, reason }) => ({ content: [text(projectReply(await api(`/requests/${requestId}/cancel`, 'POST', { reason })))] }));
register('human_list', '列出已有请求，不会创建便签。', {}, async () => ({ content: [text(await api('/requests'))] }));
register('human_plugins', '列出已安装侧栏插件的 ID、配置 JSON Schema 和声明能力，以选择请求需要的功能按钮。', {}, async () => ({ content: [text(await api('/plugins'))] }));
// Use the SDK's public protocol handler API for the model-facing description;
// registerTool still owns validation, execution, cancellation and error handling.
server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: publicTools }));
await server.connect(new StdioServerTransport());
