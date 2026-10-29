import { esc, icon, stateBadge } from './ui.js';
import { themes } from './themes.js';

export function railHTML(request, side, pane) {
  const tools = (request?.tools || []).filter((tool) => tool.side === side);
  if (side === 'left' && !tools.length) return '';
  const nav = (id, label, glyph) => `<button id="nav-${id}" class="bookmark idle ${pane === id ? 'selected' : ''}" data-action="pane" data-pane="${id}" ${pane === id ? 'aria-current="page"' : ''} title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  return `<aside class="bookmark-rail ${side}" aria-label="${side === 'left' ? '操作工具' : '采集工具'}"><div class="bookmark-list" role="toolbar" aria-orientation="vertical">
    ${side === 'right' ? nav('note', '便签与回复', 'sticky-note') : ''}
    ${tools.map((tool) => `<button id="tool-${tool.id}" class="bookmark ${tool.state} ${pane === tool.id ? 'selected' : ''}" data-action="run" data-tool="${tool.id}" ${pane === tool.id ? 'aria-current="page"' : ''} title="${esc(tool.manifest.name)} · ${tool.state === 'idle' ? '待运行' : tool.state === 'running' ? '运行中' : tool.state === 'success' ? '成功' : '出错'}\n左键运行 / 右键详情（Shift+F10）" aria-label="${esc(tool.manifest.name)}，左键运行，右键详情">${icon(tool.manifest.icon)}</button>`).join('')}
    ${side === 'right' ? `<span class="rail-separator" aria-hidden="true"></span>${nav('settings', '便签设置', 'settings')}` : ''}
  </div></aside>`;
}
const header = (title, status = '') => `<div class="pane-heading"><button class="icon-button" data-action="pane" data-pane="note" aria-label="返回便签">${icon('arrow-left')}</button><h1>${esc(title)}</h1>${status}</div>`;
const back = (label = '返回便签') => `<button type="button" class="text-button" data-action="pane" data-pane="note">${label}</button>`;
const image = (a) => `<button class="image-open" data-action="image" data-id="${a.id}" title="${esc(a.name)}"><img src="${a.url}" alt="${esc(a.name)}" /></button>`;
export function attachmentsHTML(request) {
  return request.images.map((a) => `<div class="image-attachment">${image(a)}<span class="attachment-name">${esc(a.name)}</span><button class="remove-attachment" data-action="remove-image" data-id="${a.id}" aria-label="移除图片">${icon('x')}</button></div>`).join('') + request.diagnostics.map((d) => `<div class="error-attachment" title="${esc(d.message)}"><span>${icon('file-warning')}诊断已附入</span><button data-action="remove-error" data-id="${d.toolId}" aria-label="移除诊断">${icon('x')}</button></div>`).join('');
}
export function replyBlocksHTML(content) {
  let textIndex = 0;
  return content.map((b) => {
    if (b.type === 'text') return `<textarea id="${textIndex++ === 0 ? 'reply' : `reply-${b.blockId}`}" data-text-block="${esc(b.blockId)}" aria-label="给 AI 的回复，第 ${textIndex} 段" placeholder="${textIndex === 1 ? '写下结果，也可以粘贴图片或拖入文件…' : '继续写下说明…'}">${esc(b.text)}</textarea>`;
    const a = b.attachment;
    const actions = `<div class="block-actions"><button data-action="move-block-up" data-block="${esc(b.blockId)}" title="上移" aria-label="上移附件">${icon('arrow-up')}</button><button data-action="move-block-down" data-block="${esc(b.blockId)}" title="下移" aria-label="下移附件">${icon('arrow-down')}</button><button data-action="remove-block" data-block="${esc(b.blockId)}" title="移除" aria-label="移除此内容块">${icon('x')}</button></div>`;
    if (b.type === 'diagnostic') return `<div class="reply-attachment error-attachment" data-block="${esc(b.blockId)}" title="${esc(b.message)}"><span>${icon('file-warning')}${esc(b.name)} · 诊断</span>${actions}</div>`;
    return `<div class="reply-attachment ${b.type === 'image' ? 'image-attachment' : 'file-attachment'} ${b.error ? 'upload-error' : ''}" data-block="${esc(b.blockId)}">${b.type === 'image' && a ? image(a) : icon(b.pending ? 'loader-circle' : 'file')}<span class="attachment-name">${esc(a?.name || b.name)}${b.pending ? '<small>正在保存…</small>' : b.error ? `<small role="alert">${esc(b.error)}</small><button class="text-button" data-action="retry-block" data-block="${esc(b.blockId)}">重试</button>` : `<small>${a?.size === 0 ? '空文件' : `${Math.ceil((a?.size || 0) / 1024)} KiB`}</small>`}</span>${actions}</div>`;
  }).join('');
}
export function progressHTML(request) {
  const count = request.checks.filter((i) => i < request.steps.length).length, total = request.steps.length;
  return total ? `<div class="progress-row"><span id="progress-copy" aria-live="polite">${count} / ${total} 项已完成</span><div class="progress-track" role="progressbar" aria-label="任务进度" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${count}"><div class="progress-fill" style="width:${count / total * 100}%"></div></div></div>` : '';
}
function note(request, local) {
  if (!request || request.status !== 'pending') return '';
  return `<div class="pane-scroll note-content"><h1>${esc(request.title)}</h1>${request.description ? `<p class="description">${esc(request.description)}</p>` : ''}${progressHTML(request)}<ol class="checklist">${request.steps.map((step, i) => `<li class="check-row ${request.checks.includes(i) ? 'done' : ''}"><label class="check-label"><span class="check-box"><input type="checkbox" data-step="${i}" ${request.checks.includes(i) ? 'checked' : ''} aria-label="${esc(step)}" /><span class="check-visual">${icon('check')}</span></span><span class="check-title">${esc(step)}</span></label></li>`).join('')}</ol><div class="task-link-row"><button class="text-button" data-action="pane" data-pane="context">任务详情${icon('chevron-right')}</button></div></div><section class="composer" aria-label="回复 AI" style="height:${local.replyHeight}px"><div class="reply-resize top" data-reply-resize="top" aria-hidden="true"></div><div class="reply-blocks ${request.content.length === 1 ? 'single' : ''}">${replyBlocksHTML(request.content)}</div><div class="reply-resize bottom" data-reply-resize="bottom" aria-hidden="true"></div></section><footer class="pane-footer note-footer"><span class="waiting-label" role="status"><span class="status-dot"></span>等待你的反馈</span><button class="primary" data-action="complete">完成并回复${icon('send')}</button></footer>`;
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
function toolPanel(request, tool, local, configUi) {
  const output = tool.output, error = tool.error, pictures = output?.attachments || [];
  const body = error ? `<div class="error-block"><div class="error-title">${icon('circle-alert')}${esc(error.code)}</div><pre>${esc(error.message)}${error.details ? `\n${esc(error.details)}` : ''}</pre></div><div class="error-actions"><button class="secondary" data-action="copy-error" data-id="${tool.id}">${icon('copy')}复制错误</button><button class="secondary" data-action="attach-error" data-id="${tool.id}" ${request.status !== 'pending' ? 'disabled' : ''}>${icon('corner-down-left')}附入回复</button></div>` : pictures.length ? `${pictures.map((a) => `${['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(a.mime) ? `<button class="capture-preview" data-action="image" data-id="${a.id}"><img src="${a.url}" alt="${esc(a.name)}" /></button>` : `<p class="tool-hint">${icon('file')}${esc(a.name)}</p>`}<button class="secondary" data-action="attach-image" data-id="${a.id}" ${request.status !== 'pending' || request.content.some((b) => b.attachmentId === a.id) ? 'disabled' : ''}>附入回复</button>`).join('')}<p class="tool-hint">${esc(output.text)}</p>` : `<div class="tool-message">${icon(tool.state === 'running' ? 'loader-circle' : tool.state === 'success' ? 'check' : tool.manifest.icon)}<p>${esc(tool.state === 'running' ? '正在运行…' : output?.text || '左键侧边书签即可运行。')}</p></div>`;
  if (tool.manifest.configUi?.type === 'web') {
    const tab = local.toolTabs[tool.id] || 'config', ui = configUi?.toolId === tool.id ? configUi : null;
    const tabs = `<div class="tool-tabs" role="tablist" aria-label="工具配置与结果"><button role="tab" aria-selected="${tab === 'config'}" data-action="tool-tab" data-tool="${tool.id}" data-tab="config">配置</button><button role="tab" aria-selected="${tab === 'result'}" data-action="tool-tab" data-tool="${tool.id}" data-tab="result">结果</button></div>`;
    const content = tab === 'result' ? `<div class="pane-scroll tool-content">${body}</div>` : request.status !== 'pending' ? '<div class="pane-scroll detail-content"><p>请求已经结束，配置不再修改。</p></div>' : `<div class="web-tool-content"><div class="web-config-status" role="status">${ui?.error ? `<span class="web-config-error">${esc(ui.error.message)}</span><button class="text-button" data-action="copy-config-error">复制错误</button>` : ui?.savedAt ? '配置已保存。' : ui?.loading || ui?.phase === 'opening' ? '正在加载插件配置页…' : '在插件页面内保存设置；返回时放弃未保存的修改。'}</div><div class="web-config-host" data-config-ui-host="${tool.id}">${!ui?.connected ? `<p>${ui?.error ? '暂时无法显示配置页面。' : ui?.loading || ui?.phase === 'opening' ? '正在准备插件配置界面…' : '配置页已关闭，未保存的修改已放弃。'}</p>${!ui?.loading && ui?.phase !== 'opening' ? `<button class="secondary" data-action="open-config-ui" data-tool="${tool.id}">${ui?.error ? '重新连接' : '打开配置页'}</button>` : ''}` : ''}</div></div>`;
    return `${header(tool.manifest.name, stateBadge(tool.state))}${tabs}${content}<footer class="pane-footer">${back()}<button class="secondary" data-action="save" data-id="${tool.id}" ${!output && !error ? 'disabled' : ''}>${icon('download')}保存结果</button></footer>`;
  }
  return `${header(tool.manifest.name, stateBadge(tool.state))}<div class="pane-scroll tool-content"><p class="tool-description">${esc(tool.manifest.description || '')}</p>${body}${tool.manifest.configUi?.type === 'none' ? '<p class="tool-hint">此工具无需配置，左键侧栏按钮即可执行。</p>' : `<details class="tool-settings" data-id="${tool.id}" ${local.openSettings.has(tool.id) ? 'open' : ''}><summary>工具设置</summary><form class="tool-settings-form" data-id="${tool.id}">${configFields(tool, local.configDrafts[tool.id])}<button type="submit" class="secondary" ${request.status !== 'pending' || tool.state === 'running' ? 'disabled' : ''}>保存设置</button></form></details>`}</div><footer class="pane-footer">${back()}<button class="secondary" data-action="save" data-id="${tool.id}" ${!output && !error ? 'disabled' : ''}>${icon('download')}保存结果</button></footer>`;
}
function settings(state) {
  const toggle = (title, text, action, checked) => `<div class="settings-row"><div><strong>${title}</strong><p>${text}</p></div><button class="switch" role="switch" aria-checked="${checked}" aria-label="${title}" data-action="${action}"></button></div>`;
  return `${header('便签设置')}<div class="pane-scroll settings-content"><h2>便签主题</h2><div class="theme-picker">${themes.map((theme) => `<button class="theme-swatch ${state.preferences.theme === theme.id ? 'selected' : ''}" data-action="theme" data-theme="${theme.id}" aria-pressed="${state.preferences.theme === theme.id}"><span style="background:${theme.color}"></span>${theme.name}</button>`).join('')}</div><p class="tool-hint">应用到所有便签，并记住下次使用的选择。</p>${toggle('控件动效', '勾选反馈与按钮响应', 'motion', state.preferences.motion !== false)}${toggle('窗口置顶', '让当前任务保持在其他窗口上方', 'pin', state.preferences.pinned)}</div><footer class="pane-footer">${back()}</footer>`;
}
export function panelHTML(state, local) {
  const request = state.request, pane = local.pane;
  if (pane === 'settings') return settings(state);
  if (pane === 'note' || !request) return note(request, local);
  const tool = request.tools.find((t) => t.id === pane);
  if (tool) return toolPanel(request, tool, local, state.configUi);
  if (pane === 'context') return `${header('任务详情')}<div class="pane-scroll detail-content"><p class="detail-project">${esc(request.project)}</p><p>${esc(request.description)}</p><h2>AI 上下文</h2><p>${esc(request.context)}</p><h2>希望你告诉我</h2><p>${esc(request.expectation)}</p></div><footer class="pane-footer">${back()}</footer>`;
  if (pane.startsWith('image:')) {
    const id = pane.slice(6), a = [...request.content.filter((b) => b.attachment).map((b) => b.attachment), ...request.images, ...(request.result?.images || []), ...request.tools.flatMap((t) => t.output?.attachments || [])].find((a) => a.id === id);
    return `${header('图片预览')}<div class="pane-scroll image-content">${a ? `<img src="${a.url}" alt="${esc(a.name)}" /><p>${esc(a.name)}</p>` : '<p>图片不存在。</p>'}</div><footer class="pane-footer">${back()}</footer>`;
  }
  return note(request, local);
}
