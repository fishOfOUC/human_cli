import { esc, icon, stateBadge } from './ui.js';
import { themes } from './themes.js';

export function railHTML(request, side, pane) {
  const nav = (id, label, glyph) => `<button id="nav-${id}" class="bookmark idle ${pane === id ? 'selected' : ''}" data-action="pane" data-pane="${id}" title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  return `<aside class="bookmark-rail ${side}" aria-label="${side === 'left' ? '操作工具' : '采集工具'}"><div class="bookmark-list" role="toolbar" aria-orientation="vertical">
    ${side === 'left' ? nav('note', '便签与回复', 'sticky-note') : ''}
    ${(request?.tools || []).filter((tool) => tool.side === side).map((tool) => `<button id="tool-${tool.id}" class="bookmark ${tool.state} ${pane === tool.id ? 'selected' : ''}" data-action="run" data-tool="${tool.id}" title="${esc(tool.manifest.name)} · ${tool.state === 'idle' ? '待运行' : tool.state === 'running' ? '运行中' : tool.state === 'success' ? '成功' : '出错'}\n左键运行 / 右键详情（Shift+F10）" aria-label="${esc(tool.manifest.name)}，左键运行，右键详情">${icon(tool.manifest.icon)}</button>`).join('')}
    ${side === 'left' ? nav('settings', '主题与请求记录', 'settings') : ''}
  </div></aside>`;
}
const header = (title, status = '') => `<div class="pane-heading"><button class="icon-button" data-action="pane" data-pane="note" aria-label="返回便签">${icon('arrow-left')}</button><h1>${esc(title)}</h1>${status}</div>`;
const back = (label = '返回便签') => `<button type="button" class="text-button" data-action="pane" data-pane="note">${label}</button>`;
const image = (a) => `<button class="image-open" data-action="image" data-id="${a.id}" title="${esc(a.name)}"><img src="${a.url}" alt="${esc(a.name)}" /></button>`;
export function attachmentsHTML(request) {
  return request.images.map((a) => `<div class="image-attachment">${image(a)}<button class="remove-attachment" data-action="remove-image" data-id="${a.id}" aria-label="移除图片">${icon('x')}</button></div>`).join('') + request.diagnostics.map((d) => `<div class="error-attachment" title="${esc(d.message)}"><span>${icon('file-warning')}诊断已附入</span><button data-action="remove-error" data-id="${d.toolId}" aria-label="移除诊断">${icon('x')}</button></div>`).join('') + (request.replyNotes || []).map((note) => `<div class="reply-note">${icon('file-text')}<span>${esc(note.text)}</span><button data-action="remove-reply-note" data-id="${note.toolId}" aria-label="移除附言">${icon('x')}</button></div>`).join('');
}
function note(request) {
  if (!request) return `<div class="pane-scroll empty-note"><span class="empty-icon">${icon('sticky-note')}</span><h1>等 AI 递来一张便签。</h1><p>需要你接手时，请求会出现在这里。你完成操作，再把回复交回去。</p><button class="secondary" data-action="pane" data-pane="settings">${icon('settings')}主题与连接说明</button></div>`;
  if (request.status !== 'pending') {
    const r = request.result;
    const cache = request.cache?.state;
    const title = request.status === 'cancelled' ? 'AI 已取消请求' : cache === 'discarded' ? '回复已丢弃' : '回复已保存';
    return `${header(title)}<div class="pane-scroll result-content">${r ? `<div class="sent-reply">${esc(r.reply)}<div class="sent-images">${r.images.map(image).join('')}</div>${r.diagnostics.map((d) => `<pre>${esc(d.code)}\n${esc(d.message)}\n${esc(d.details || '')}</pre>`).join('')}</div><p class="tool-hint">回复已保存到本机。若连接中断，AI 可通过日志找到这份回复。</p>` : `<p>${cache === 'discarded' ? '这份缓存回复的文字和附件已清除。操作记录保留，未替 AI 取消请求。' : esc(request.cancelReason || '这项操作已不再需要。')}</p>`}</div><footer class="pane-footer">${cache === 'saved' ? '<button class="text-button" data-action="discard-reply">丢弃回复</button>' : back('查看结果')}<button class="secondary" data-action="hide">收起便签</button></footer>`;
  }
  return `<div class="pane-scroll note-content"><div class="request-meta"><span>${esc(request.project || '需要你协助')}</span><span class="waiting-label" title="${request.receiver?.waiting ? 'AI 有正在等待的接收连接' : '当前没有等待连接，完成后回复会保存在本机'}">${request.receiver?.waiting ? 'AI 正在等你' : '回复将先保存'}</span></div><h1>${esc(request.title)}</h1><ol class="checklist">${request.steps.map((step, i) => `<li><label class="${request.checks.includes(i) ? 'checked' : ''}"><input type="checkbox" data-step="${i}" ${request.checks.includes(i) ? 'checked' : ''} /><span>${esc(step)}</span></label></li>`).join('')}</ol><section class="composer" aria-label="回复 AI"><label class="sr-only" for="reply">给 AI 的回复</label><textarea id="reply" placeholder="回复两句，或直接粘贴图片…">${esc(request.reply)}</textarea><div class="attachments">${attachmentsHTML(request)}</div><div class="composer-toolbar"><button class="attach-button" data-action="upload">${icon('image-plus')}图片 ${request.images.length || ''}</button><button class="context-button" data-action="pane" data-pane="context">任务详情${icon('chevron-right')}</button></div></section></div><footer class="pane-footer note-footer"><button class="complete-only" data-action="only">仅完成</button><button class="primary" data-action="complete">${icon('check')}完成并回复</button></footer>`;
}
function configFields(tool, draft) {
  const config = draft || tool.config;
  return Object.entries(tool.manifest.configSchema.properties || {}).map(([key, field]) => {
    const value = config[key] ?? field.default ?? '', label = esc(field.title || key), name = esc(key);
    if (field.type === 'boolean') return `<label class="setting-checkbox"><input name="${name}" type="checkbox" ${value ? 'checked' : ''} />${label}</label>`;
    let control;
    if (field.enum) control = `<select class="form-input" id="config-${name}" name="${name}">${field.enum.map((v) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    else if (['integer', 'number'].includes(field.type)) control = `<input class="form-input" id="config-${name}" name="${name}" type="number" value="${esc(value)}" step="${field.type === 'integer' ? 1 : 'any'}" ${field.minimum !== undefined ? `min="${field.minimum}"` : ''} ${field.maximum !== undefined ? `max="${field.maximum}"` : ''} />`;
    else if (field.type === 'object' || field.type === 'array' || field.maxLength > 500) control = `<textarea class="form-input config-textarea" id="config-${name}" name="${name}">${esc(typeof value === 'object' ? JSON.stringify(value, null, 2) : value)}</textarea>`;
    else control = `<input class="form-input" id="config-${name}" name="${name}" value="${esc(value)}" ${field.maxLength ? `maxlength="${field.maxLength}"` : ''} />`;
    return `<label class="form-label" for="config-${name}">${label}</label>${control}${field.description ? `<p class="tool-hint">${esc(field.description)}</p>` : ''}`;
  }).join('');
}
function toolPanel(request, tool, local) {
  const output = tool.output, error = tool.error, pictures = (output?.attachments || []).filter((a) => a.mime.startsWith('image/'));
  const body = error ? `<div class="error-block"><div class="error-title">${icon('circle-alert')}${esc(error.code)}</div><pre>${esc(error.message)}${error.details ? `\n${esc(error.details)}` : ''}</pre></div><div class="error-actions"><button class="secondary" data-action="copy-error" data-id="${tool.id}">${icon('copy')}复制错误</button><button class="secondary" data-action="attach-error" data-id="${tool.id}" ${request.status !== 'pending' ? 'disabled' : ''}>${icon('corner-down-left')}附入回复</button></div>` : pictures.length ? `${pictures.map((a) => `<button class="capture-preview" data-action="image" data-id="${a.id}"><img src="${a.url}" alt="${esc(a.name)}" /></button><button class="secondary" data-action="attach-image" data-id="${a.id}" ${request.status !== 'pending' || request.images.some((i) => i.id === a.id) ? 'disabled' : ''}>附入回复</button>`).join('')}<p class="tool-hint">${esc(output.text)}</p>` : `<div class="tool-message">${icon(tool.state === 'running' ? 'loader-circle' : tool.state === 'success' ? 'check' : tool.manifest.icon)}<p>${esc(tool.state === 'running' ? '正在运行…' : output?.text || '左键侧边书签即可运行。')}</p></div>`;
  return `${header(tool.manifest.name, stateBadge(tool.state))}<div class="pane-scroll tool-content"><p class="tool-description">${esc(tool.manifest.description || '')}</p>${body}<details class="tool-settings" data-id="${tool.id}" ${local.openSettings.has(tool.id) ? 'open' : ''}><summary>工具设置</summary><form class="tool-settings-form" data-id="${tool.id}">${configFields(tool, local.configDrafts[tool.id])}<button type="submit" class="secondary" ${request.status !== 'pending' || tool.state === 'running' ? 'disabled' : ''}>保存设置</button></form></details></div><footer class="pane-footer">${back()}<button class="secondary" data-action="save" data-id="${tool.id}" ${!output && !error ? 'disabled' : ''}>${icon('download')}保存结果</button></footer>`;
}
function settings(state) {
  return `${header('主题与偏好')}<div class="pane-scroll settings-content"><h2>便签主题</h2><div class="theme-picker">${themes.map((theme) => `<button class="theme-swatch ${state.preferences.theme === theme.id ? 'selected' : ''}" data-action="theme" data-theme="${theme.id}" aria-pressed="${state.preferences.theme === theme.id}"><span style="background:${theme.color}"></span>${theme.name}</button>`).join('')}</div><p class="tool-hint">应用到所有便签，并记住下次使用的选择。</p><h2>请求记录</h2>${state.requests.length ? `<div class="request-list">${state.requests.slice(0, 30).map((r) => `<button data-action="show-request" data-id="${r.id}"><span>${esc(r.title.replace(/\n/g, ' '))}</span><small>${r.status === 'pending' ? '待协助' : r.cache?.state === 'saved' ? '已保存' : r.cache?.state === 'discarded' ? '已丢弃' : r.status === 'completed' ? '已完成' : '已取消'}</small></button>`).join('')}</div>` : '<p class="tool-hint">还没有请求。由 AI 调用 human_request 创建。</p>'}<h2>AI 连接</h2><p class="tool-hint">在支持 MCP 的 AI 客户端中注册 human_cli.exe mcp。也可使用命令行提交请求；具体配置见项目说明。</p><h2>已安装功能插件</h2><div class="installed-plugins">${state.plugins.map((p) => `<p><strong>${esc(p.name)}</strong><small>${esc(p.id)} · ${esc(p.version || '1')}</small></p>`).join('')}</div><button class="secondary" data-action="open-plugins">打开插件与服务目录</button><p class="tool-hint">在 providers.json 中配置网络 SPI 服务后重启 human_cli。旧插件目录仍由内置服务兼容。按钮由 AI 为请求选择。</p>${state.pluginErrors.map((e) => `<p class="tool-hint">${esc(e.folder)}：${esc(e.message)}</p>`).join('')}</div><footer class="pane-footer">${back()}<button class="text-button" data-action="hide">收起</button></footer>`;
}
export function panelHTML(state, local) {
  const request = state.request, pane = local.pane;
  if (pane === 'settings') return settings(state);
  if (pane === 'note' || !request) return note(request);
  const tool = request.tools.find((t) => t.id === pane);
  if (tool) return toolPanel(request, tool, local);
  if (pane === 'context') return `${header('任务详情')}<div class="pane-scroll detail-content"><p class="detail-project">${esc(request.project)}</p><p>${esc(request.description)}</p><h2>AI 上下文</h2><p>${esc(request.context)}</p><h2>希望你告诉我</h2><p>${esc(request.expectation)}</p></div><footer class="pane-footer">${back()}</footer>`;
  if (pane === 'confirm-only') return `${header('只标记完成？')}<div class="pane-scroll detail-content"><p>你已准备了回复或附件。仅完成只回传完成状态，不包含这些内容。</p></div><footer class="pane-footer">${back('返回编辑')}<button class="primary" data-action="confirm-only">仅标记完成</button></footer>`;
  if (pane === 'confirm-discard') return `${header('丢弃缓存回复？')}<div class="pane-scroll detail-content"><p>将删除这份回复缓存，清除回复文字、图片和诊断。操作记录及独立工具结果保留，此操作无法撤销。</p><p>若 AI 此前已经读取或正在接收，丢弃不能撤回那部分内容。</p></div><footer class="pane-footer">${back('保留回复')}<button class="secondary" data-action="confirm-discard">确认丢弃</button></footer>`;
  if (pane.startsWith('image:')) {
    const id = pane.slice(6), a = [...request.images, ...(request.result?.images || []), ...request.tools.flatMap((t) => t.output?.attachments || [])].find((a) => a.id === id);
    return `${header('图片预览')}<div class="pane-scroll image-content">${a ? `<img src="${a.url}" alt="${esc(a.name)}" /><p>${esc(a.name)}</p>` : '<p>图片不存在。</p>'}</div><footer class="pane-footer">${back()}</footer>`;
  }
  return note(request);
}
