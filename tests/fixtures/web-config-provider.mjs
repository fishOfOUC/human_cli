// Test-only provider. It is not installed into user data or packaged releases.
import { randomBytes, randomUUID } from 'node:crypto';
import { startSpiServer } from '../../plugins/spi-server.mjs';
import { fail } from '../../core/errors.mjs';

export const webManifest = {
  apiVersion: 1, id: 'test.web-config', version: '1', name: '界面配置测试', side: 'right', icon: 'settings',
  configSchema: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', minLength: 1, maxLength: 80, default: '我的工具' }, color: { type: 'string', pattern: '^#[0-9a-f]{6}$', default: '#486044' }, scale: { type: 'number', minimum: 0.5, maximum: 2, default: 1 } }, required: ['label', 'color', 'scale'] },
  configUi: { type: 'web', path: '/ui' },
};

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/style.css"><title>插件自己的配置界面</title></head><body><form id="settings"><div class="fields"><label for="label">显示文字</label><input id="label" required maxlength="80"><div class="row"><label for="color">文字颜色<input id="color" type="color"></label><label for="scale">预览大小<input id="scale" type="range" min="0.5" max="2" step="0.1"></label></div><div id="preview" aria-label="实时预览"></div></div><div class="bottom"><p id="message" role="status">正在读取配置…</p><div class="actions"><button type="button" id="cancel">取消</button><button type="submit" id="save">保存配置</button></div></div></form><script src="/ui/app.js"></script></body></html>`;
const css = `:root{--bg:#fff;--ink:#242a22;--line:#d7dccf}*{box-sizing:border-box}html,body{height:100%;overflow:hidden}body{margin:0;padding:0;background:var(--bg);color:var(--ink);font:12px/1.5 "Segoe UI",sans-serif}form{height:100%;display:flex;flex-direction:column}.fields{flex:1;min-height:0;overflow:auto;padding:8px 12px 4px}.bottom{flex-shrink:0;padding:4px 12px 8px;border-top:1px solid var(--line)}.fields>label{display:block}input{font:inherit;color:inherit}#label{width:100%;height:27px;margin:4px 0 8px;border:1px solid var(--line);border-radius:3px;background:transparent;padding:3px 6px}.row{display:flex;gap:14px}.row>label{flex:1;font-size:11px}.row input{display:block;width:100%;height:25px;margin:4px 0}#color{padding:0;border:0;background:none}#preview{margin-top:8px;padding:8px 4px;text-align:center;border-block:1px solid var(--line);overflow:hidden}#message{font-size:11px;margin:6px 0;min-height:16px;white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;justify-content:space-between;gap:8px}button{font:inherit;padding:5px 10px;border:1px solid var(--line);background:transparent;color:inherit;border-radius:3px;cursor:pointer}#save{background:#293326;color:#fff;border-color:#293326}`;
const javascript = `const params=new URLSearchParams(location.hash.slice(1)),sessionId=params.get('session'),key=params.get('key');let loaded=false;const label=document.querySelector('#label'),color=document.querySelector('#color'),scale=document.querySelector('#scale'),message=document.querySelector('#message');function preview(){const p=document.querySelector('#preview');p.textContent=label.value;p.style.color=color.value;p.style.fontSize=(14*Number(scale.value))+'px'}async function api(path,config){const r=await fetch('/ui/'+path,{method:config?'POST':'GET',headers:config?{'Content-Type':'application/json'}:{},...(config?{body:JSON.stringify({sessionId,key,config})}:{})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data}async function poll(){try{const r=await api('state?sessionId='+sessionId+'&key='+key);if(!loaded){label.value=r.config.label;color.value=r.config.color;scale.value=r.config.scale;loaded=true;preview();const colors={paper:['#fff6cf','#272b20'],sage:['#eaf0de','#273023'],light:['#fff','#242a22'],dark:['#252923','#e8ecdf']}[r.theme]||['#fff','#242a22'];document.documentElement.style.setProperty('--bg',colors[0]);document.documentElement.style.setProperty('--ink',colors[1])}message.textContent=r.error?.message||(r.state==='saved'?'配置已保存':r.state==='submitted'?'等待宿主校验并保存…':'修改后可在上方实时预览。')}catch(e){message.textContent=e.message}setTimeout(poll,200)}document.querySelector('#settings').addEventListener('input',preview);document.querySelector('#settings').addEventListener('submit',async e=>{e.preventDefault();try{await api('submit',{label:label.value,color:color.value,scale:Number(scale.value)});message.textContent='等待宿主校验并保存…'}catch(e){message.textContent=e.message}});document.querySelector('#cancel').addEventListener('click',()=>fetch('/ui/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,key})}));poll();`;

export async function startWebConfigProvider({ manifest = webManifest, ...options } = {}) {
  const sessions = new Map(), closed = new Set(), requests = [], resolutions = [];
  let origin;
  const find = (sessionId) => { const value = sessions.get(sessionId); fail(value, 'E_UI_SESSION', '配置会话不存在或已经关闭。', 404); return value; };
  const configUi = {
    open(params, context) {
      origin = context.origin;
      fail(!closed.has(params.sessionId), 'E_UI_SESSION', '此会话已关闭。');
      if (!sessions.has(params.sessionId)) sessions.set(params.sessionId, { sessionId: params.sessionId, key: randomBytes(24).toString('hex'), config: structuredClone(params.config), state: 'editing', theme: params.theme, request: params.request });
      const value = find(params.sessionId);
      return { sessionId: params.sessionId, url: origin + '/ui/settings#session=' + params.sessionId + '&key=' + value.key };
    },
    status({ sessionId }) { const value = find(sessionId); return { sessionId, state: value.state, ...(value.submission ? { submission: value.submission } : {}) }; },
    resolve({ sessionId, submissionId, accepted, config, error }) {
      const value = find(sessionId);
      if (value.lastResolved?.id === submissionId) return { sessionId, state: value.lastResolved.state };
      fail(value.submission?.id === submissionId, 'E_UI_SUBMISSION', '配置提交已经变更。');
      resolutions.push({ sessionId, submissionId, accepted, config, error });
      value.state = accepted ? 'saved' : 'editing'; value.error = error || null;
      if (accepted) value.config = config;
      delete value.submission;
      value.lastResolved = { id: submissionId, state: value.state };
      return { sessionId, state: value.state };
    },
    close({ sessionId }) { closed.add(sessionId); sessions.delete(sessionId); return { sessionId, closed: true }; },
    async handleHttp(req, res) {
      const url = new URL(req.url, 'http://localhost'); if (!url.pathname.startsWith('/ui/')) return false;
      requests.push({ path: url.pathname, authorization: req.headers.authorization });
      const send = (code, content, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(content) : content); };
      if (req.method === 'GET' && url.pathname === '/ui/settings') { send(200, html, 'text/html'); return true; }
      if (req.method === 'GET' && url.pathname === '/ui/style.css') { send(200, css, 'text/css'); return true; }
      if (req.method === 'GET' && url.pathname === '/ui/app.js') { send(200, javascript, 'text/javascript'); return true; }
      try {
        let data = Object.fromEntries(url.searchParams);
        if (req.method === 'POST') {
          const chunks = []; let bytes = 0;
          for await (const chunk of req) { bytes += chunk.length; fail(bytes <= 256 * 1024, 'E_UI_SIZE', '配置过大。'); chunks.push(chunk); }
          data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
        fail(!req.headers.origin || req.headers.origin === origin, 'E_UI_ORIGIN', '来源不匹配。', 403);
        const value = find(data.sessionId); fail(data.key === value.key, 'E_UI_KEY', '配置会话凭据无效。', 403);
        if (req.method === 'GET' && url.pathname === '/ui/state') send(200, { config: value.config, state: value.state, theme: value.theme, error: value.error || null });
        else if (req.method === 'POST' && url.pathname === '/ui/submit') {
          fail(value.state !== 'submitted', 'E_UI_BUSY', '正在等待宿主保存。');
          value.submission = { id: randomUUID(), config: data.config }; value.state = 'submitted'; value.error = null; send(202, { state: value.state });
        } else if (req.method === 'POST' && url.pathname === '/ui/cancel') { value.state = 'closed'; send(200, { state: 'closed' }); }
        else send(404, { error: '接口不存在。' });
      } catch (error) { send(error.status || 400, { error: error.message }); }
      return true;
    },
    dispose() { sessions.clear(); closed.clear(); },
  };
  const provider = await startSpiServer({ plugins: [manifest], execute: async (_id, { config }) => ({ text: '执行结果：' + config.label }), configUi, ...options });
  return { ...provider, sessions, requests, resolutions, configUi, submit(sessionId, config, id = randomUUID()) { const value = find(sessionId); value.submission = { id, config }; value.state = 'submitted'; return id; } };
}
