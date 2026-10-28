import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fail, errorData } from '../core/errors.mjs';
import { SPI_VERSION, encodeOutput } from './spi-rpc.mjs';

// Reference provider implementation. human_cli clients use only its network protocol;
// providers in other languages implement the same five JSON-RPC methods.
export async function startSpiServer({ plugins, execute, configUi, token = randomBytes(32).toString('hex'), port = 0, host = '127.0.0.1', retentionMs = 300000 }) {
  const jobs = new Map();
  const server = createServer(async (req, res) => {
    let id = null;
    const reply = (message, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ jsonrpc: '2.0', id, ...message })); };
    try {
      if (configUi?.handleHttp && await configUi.handleHttp(req, res)) return;
      fail(req.method === 'POST' && !req.headers.origin, 'E_SPI_REQUEST', 'SPI 仅接受服务端 POST。', 403);
      const candidate = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
      fail(candidate.length === token.length && timingSafeEqual(candidate, Buffer.from(token)), 'E_SPI_AUTH', 'SPI 认证失败。', 401);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; fail(size <= 1024 * 1024, 'E_SPI_SIZE', 'SPI 输入超过 1 MB。'); chunks.push(chunk); }
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      id = message.id;
      fail(message.jsonrpc === '2.0' && (typeof id === 'string' || typeof id === 'number') && typeof message.method === 'string', 'E_SPI_PROTOCOL', '无效 JSON-RPC 请求。');
      const params = message.params || {};
      if (message.method === 'spi.describe') return reply({ result: { spiVersion: SPI_VERSION, plugins: typeof plugins === 'function' ? plugins() : plugins } });
      if (message.method.startsWith('spi.ui.')) {
        const method = message.method.slice(7);
        fail(['open', 'status', 'resolve', 'close'].includes(method) && typeof configUi?.[method] === 'function', 'E_SPI_METHOD', '服务未实现该配置界面方法。');
        fail(typeof params.sessionId === 'string' && /^[a-f0-9-]{36}$/.test(params.sessionId), 'E_UI_SESSION', '需要有效配置会话 ID。');
        return reply({ result: await configUi[method](params, { origin: `http://${host}:${server.address().port}` }) });
      }
      fail(typeof params.runId === 'string' && /^[a-f0-9-]{36}$/.test(params.runId), 'E_SPI_RUN_ID', '需要有效 runId。');
      if (message.method === 'spi.start') {
        if (!jobs.has(params.runId)) {
          fail(jobs.size < 512 && [...jobs.values()].filter((j) => j.state === 'running').length < 32, 'E_SPI_BUSY', 'SPI 服务任务队列已满。');
          const abort = new AbortController();
          const job = { state: 'running', abort }; jobs.set(params.runId, job);
          Promise.resolve().then(() => execute(params.pluginId, { request: params.request, config: params.config || {} }, { signal: abort.signal, runId: params.runId })).then((output) => {
            if (job.state === 'running') { job.output = encodeOutput(output); job.state = 'completed'; }
          }).catch((error) => { if (job.state === 'running') { job.error = errorData(error); job.state = 'failed'; } }).finally(() => {
            if (jobs.get(params.runId) !== job) return;
            job.expiry = setTimeout(() => { if (jobs.get(params.runId) === job) jobs.delete(params.runId); }, retentionMs); job.expiry.unref();
          });
        }
        return reply({ result: { runId: params.runId, state: jobs.get(params.runId).state } });
      }
      const job = jobs.get(params.runId); fail(job, 'E_SPI_JOB_MISSING', 'SPI 运行记录不存在，服务可能已重启。', 404);
      if (message.method === 'spi.status') return reply({ result: { runId: params.runId, state: job.state, ...(job.output ? { output: job.output } : {}), ...(job.error ? { error: job.error } : {}) } });
      if (message.method === 'spi.cancel') {
        if (job.state === 'running') { job.state = 'cancelled'; job.abort.abort(); }
        return reply({ result: { runId: params.runId, state: job.state } });
      }
      if (message.method === 'spi.forget') {
        fail(job.state !== 'running', 'E_SPI_RUNNING', '运行中的任务不能释放。'); clearTimeout(job.expiry); jobs.delete(params.runId);
        return reply({ result: { forgotten: true } });
      }
      fail(false, 'E_SPI_METHOD', '不支持的 SPI 方法。');
    } catch (error) { reply({ error: { code: error.code === 'E_SPI_METHOD' ? -32601 : -32000, message: error.message, data: errorData(error) } }, error.status === 401 || error.status === 403 ? error.status : 200); }
  });
  server.on('close', () => { for (const job of jobs.values()) { clearTimeout(job.expiry); if (job.state === 'running') { job.state = 'cancelled'; job.abort.abort(); } } jobs.clear(); configUi?.dispose?.(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, token, url: `http://${host}:${server.address().port}/rpc`, jobs };
}
