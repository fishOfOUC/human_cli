import { randomUUID } from 'node:crypto';
import { fail } from '../core/errors.mjs';
import { MAX_IMAGE_BYTES, MAX_FILE_BYTES, isPreviewImage } from '../core/content.mjs';

export const SPI_VERSION = 1;
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
export function validateEndpoint(value) {
  const url = new URL(value);
  fail(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash, 'E_SPI_URL', 'SPI 地址必须为不含凭据或片段的 HTTP/HTTPS 地址。');
  return url.href;
}
export async function rpc(provider, method, params = {}, { signal, timeoutMs = 10000 } = {}) {
  const id = randomUUID();
  const abort = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(validateEndpoint(provider.url), {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(provider.token ? { Authorization: `Bearer ${provider.token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: signal ? AbortSignal.any([signal, abort]) : abort,
    });
    fail(response.ok, 'E_SPI_HTTP', `SPI 服务 ${provider.id} 返回 HTTP ${response.status}。`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength; fail(size <= MAX_RESPONSE_BYTES, 'E_SPI_SIZE', 'SPI 响应超过 64 MB。'); chunks.push(chunk);
    }
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    fail(message.jsonrpc === '2.0' && message.id === id, 'E_SPI_PROTOCOL', 'SPI 返回了不匹配的 JSON-RPC 响应。');
    if (message.error) throw Object.assign(new Error(message.error.message || 'SPI 服务执行失败。'), { code: message.error.data?.code || 'E_SPI_REMOTE', details: message.error.data?.details });
    fail(Object.hasOwn(message, 'result'), 'E_SPI_PROTOCOL', 'SPI 响应缺少 result。');
    return message.result;
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('请求已变更，SPI 调用已停止。'), { code: 'E_REQUEST_CHANGED' });
    if (error.code) throw error;
    throw Object.assign(new Error(`无法连接 SPI 服务 ${provider.id}：${error.message}`), { code: 'E_SPI_CONNECTION' });
  } finally { if (response?.body && !response.body.locked) response.body.cancel().catch(() => {}); }
}
export function encodeOutput(output) {
  fail(output && typeof output.text === 'string' && output.text.length <= 100000, 'E_SPI_OUTPUT', '插件结果必须包含不超过 100000 字符的 text。');
  fail(Array.isArray(output.attachments || []) && (output.attachments || []).length <= 8, 'E_SPI_OUTPUT', '每次插件结果最多 8 个附件。');
  return { text: output.text, attachments: (output.attachments || []).map((a) => {
    const bytes = Buffer.from(a.bytes), preview = isPreviewImage(a.mime);
    fail(bytes.length <= (preview ? MAX_IMAGE_BYTES : MAX_FILE_BYTES) && (!preview || bytes.length > 0), 'E_SPI_SIZE', '插件图片限制为 1 字节至 5 MiB，普通文件最多 20 MiB。');
    return { name: a.name, mime: a.mime, data: bytes.toString('base64') };
  }) };
}
export function decodeOutput(output) {
  fail(output && typeof output.text === 'string' && output.text.length <= 100000, 'E_SPI_OUTPUT', 'SPI 结果缺少有效 text。');
  fail(Array.isArray(output.attachments || []) && (output.attachments || []).length <= 8, 'E_SPI_OUTPUT', 'SPI 结果最多包含 8 个附件。');
  return { text: output.text, attachments: (output.attachments || []).map((a) => {
    fail(typeof a.data === 'string' && a.data.length <= Math.ceil(MAX_FILE_BYTES / 3) * 4 && a.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(a.data), 'E_SPI_ATTACHMENT', '附件必须为有效 Base64。');
    const bytes = Buffer.from(a.data, 'base64'); fail(bytes.toString('base64') === a.data, 'E_SPI_ATTACHMENT', '附件 Base64 编码不规范。');
    const preview = isPreviewImage(a.mime);
    fail(bytes.length <= (preview ? MAX_IMAGE_BYTES : MAX_FILE_BYTES) && (!preview || bytes.length > 0), 'E_SPI_SIZE', '插件图片限制为 1 字节至 5 MiB，普通文件最多 20 MiB。');
    fail(typeof a.name === 'string' && typeof a.mime === 'string', 'E_SPI_ATTACHMENT', '附件缺少 name 或 mime。');
    return { name: a.name, mime: a.mime, bytes };
  }) };
}
