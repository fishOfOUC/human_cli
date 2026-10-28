import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fail } from '../core/errors.mjs';

async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; fail(size <= 256 * 1024, 'E_BODY_SIZE', '请求体过大。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail(false, 'E_JSON', 'JSON 格式不正确。'); }
}
export async function startApi(service, { activity } = {}) {
  const token = randomBytes(32).toString('hex');
  const server = createServer(async (req, res) => {
    const done = activity?.(req.url.split('?')[0]);
    if (done) { res.once('finish', done); res.once('close', done); }
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      fail(!req.headers.origin, 'E_ORIGIN', '浏览器来源不能直接调用 AI 接口。', 403);
      const candidate = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
      fail(candidate.length === token.length && timingSafeEqual(candidate, Buffer.from(token)), 'E_AUTH', '需要本地访问令牌。', 401);
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { name: 'human_cli', pid: process.pid, version: '1.1.0' });
      if (req.method === 'GET' && url.pathname === '/plugins') return send(200, service.plugins.list());
      if (req.method === 'GET' && url.pathname === '/logs') return send(200, service.logs({ limit: Number(url.searchParams.get('limit') || 50), offset: Number(url.searchParams.get('offset') || 0) }));
      if (req.method === 'GET' && url.pathname === '/requests') return send(200, service.list());
      if (req.method === 'POST' && url.pathname === '/requests') return send(201, service.create(await body(req)));
      const match = url.pathname.match(/^\/requests\/([a-f0-9-]+)(?:\/(wait|cancel|result))?$/);
      fail(match, 'E_ROUTE', '接口不存在。', 404);
      const [, id, action] = match;
      if (req.method === 'PATCH' && !action) { const data = await body(req); return send(200, service.update(id, data.patch, data.version)); }
      if (req.method === 'POST' && action === 'cancel') return send(200, service.cancel(id, (await body(req)).reason));
      if (req.method === 'GET' && (action === 'wait' || !action)) {
        const abort = new AbortController(); res.on('close', () => abort.abort());
        service.get(id);
        if (action !== 'wait') return send(200, service.snapshot(id));
        // Flush headers before an unbounded human wait. Whitespace heartbeats are
        // valid before JSON, maintain the transport, and never expire the request.
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.flushHeaders();
        const heartbeat = setInterval(() => { if (!res.destroyed) res.write('\n'); }, 15000);
        try { const request = await service.wait(id, abort.signal); if (!res.destroyed) res.end(JSON.stringify(request)); }
        finally { clearInterval(heartbeat); }
        return;
      }
      if (req.method === 'GET' && action === 'result') {
        const request = service.snapshot(id), result = request.result;
        let imagePage;
        if (result) {
          const paged = url.searchParams.has('imageOffset'), offset = Number(url.searchParams.get('imageOffset') || 0);
          fail(Number.isInteger(offset) && offset >= 0 && offset <= result.images.length, 'E_IMAGE_OFFSET', '无效的图片分页位置。');
          let used = 0, next = offset;
          result.images = result.images.map((image, index) => {
            if (paged && index !== next) return image;
            const estimated = Math.ceil(image.size / 3) * 4;
            if (paged && next > offset && used + estimated > 7 * 1024 * 1024) return image;
            used += estimated; next = index + 1;
            return { ...image, data: service.attachments.bytes(image.id).toString('base64') };
          });
          if (paged) imagePage = { offset, count: next - offset, total: result.images.length, nextOffset: next < result.images.length ? next : null };
        }
        return send(200, { requestId: id, status: request.status, cache: request.cache, cancelReason: request.cancelReason, result, ...(imagePage ? { imagePage } : {}) });
      }
      fail(false, 'E_ROUTE', '接口不存在。', 404);
    } catch (error) { if (!res.destroyed) { if (res.headersSent) res.end(JSON.stringify({ error: { code: error.code || 'E_WAIT', message: error.message } })); else send(error.status || (error.name === 'ZodError' ? 400 : 500), { error: { code: error.code || 'E_INPUT', message: error.message } }); } }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, token, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` };
}
