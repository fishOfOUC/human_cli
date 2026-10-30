import { $, esc, icon, refreshIcons } from './ui.js';
import { railHTML, panelHTML, progressHTML } from './views.js';
import { applyTheme } from './themes.js';
import { ReplyEditor } from './reply-editor.js';
import { renderNoteBody } from './note-renderer.js';
import './style.css';
import './desktop.css';

const bridge = window.humanCli;
const local = { pane: 'note', reply: '', checks: [], requestId: null, version: null, configDrafts: {}, openSettings: new Set(), toolTabs: {}, replyHeight: 64, attachmentCount: 0 };
let state, draftTimer, toastTimer, draftChain = Promise.resolve(), completing = false, closing = false, completionSequence = 0;
const editor = new ReplyEditor({ upload: (data) => call('uploadAttachment', data), changed: scheduleDraft, render: renderEditor });
function renderEditor() {
  const count = editor.blocks.filter((b) => b.type !== 'text').length;
  if (count > local.attachmentCount) local.replyHeight = Math.max(local.replyHeight, Math.min(320, 100 + count * 90));
  local.attachmentCount = count; render();
}
$('#app').innerHTML = `<main class="note-window" aria-label="AI 协助便签"><header class="window-titlebar"><div class="window-identity">${icon('sticky-note')}<span id="agent-name">human_cli</span></div><div class="window-controls"><button class="icon-button pin-control" data-action="pin" aria-label="切换置顶" title="切换置顶">${icon('pin')}</button><button class="icon-button" data-action="hide" aria-label="最小化到任务栏" title="最小化到任务栏，AI 请求继续等待">${icon('minus')}</button><button class="icon-button close-control" data-action="close" aria-label="关闭此请求" title="关闭此请求并通知 AI，不提交回复">${icon('x')}</button></div></header><div class="note-body"></div>${['n','s','e','w','ne','nw','se','sw'].map(edge => `<div class="resize-edge ${edge}" data-resize-edge="${edge}" aria-hidden="true"></div>`).join('')}<div class="note-toast" role="status" aria-live="polite"></div></main>`;

function toast(text) {
  clearTimeout(toastTimer); $('.note-toast').textContent = text; $('.note-toast').classList.add('visible');
  toastTimer = setTimeout(() => $('.note-toast').classList.remove('visible'), 3200);
}
async function call(method, ...args) {
  const response = await bridge[method](...args);
  if (!response.ok) throw Object.assign(new Error(response.error.message), response.error);
  return response.value;
}
let deferredState, composing, pendingRender = false;
function receive(next) {
  if (replyResize || composing) { deferredState = next; return; }
  const request = next.request;
  if (request?.id !== local.requestId) {
    editor.receive(request?.content, true);
    local.reply = request?.reply || ''; local.checks = request?.checks || [];
    local.requestId = request?.id || null; local.version = request?.version; local.pane = 'note'; local.replyHeight = 64; local.attachmentCount = 0;
  } else if (request?.version !== local.version) {
    local.version = request.version; local.checks = [...request.checks];
    if (request.status !== 'pending') local.pane = 'note';
  }
  else editor.receive(request?.content);
  state = next; renderEditor();
}
function render() {
  if (!state) return;
  if (composing) { pendingRender = true; return; }
  pendingRender = false;
  applyTheme(state.preferences.theme);
  document.documentElement.classList.toggle('motion-off', state.preferences.motion === false);
  const focused = document.activeElement, focusId = focused?.id, hadFocus = document.hasFocus();
  const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  const oldPane = $('#shared-panel')?.dataset.pane, scroll = $('.pane-scroll')?.scrollTop || 0;
  const request = state.request ? { ...state.request, content: editor.blocks, checks: local.checks } : null;
  renderNoteBody($('.note-body'), `${railHTML(request, 'left', local.pane)}<article class="paper" id="shared-panel" role="region" aria-label="便签与工具详情" data-pane="${esc(local.pane)}">${panelHTML({ ...state, request }, local)}</article>${railHTML(request, 'right', local.pane)}`, request?.id, local.pane);
  $('#agent-name').textContent = request?.agent || 'human_cli';
  $('.pin-control').innerHTML = icon(state.preferences.pinned ? 'pin' : 'pin-off');
  $('.pin-control').setAttribute('aria-pressed', String(state.preferences.pinned));
  refreshIcons();
  for (const input of document.querySelectorAll('.reply-blocks:not(.single) textarea')) { input.style.height = 'auto'; input.style.height = `${Math.max(36, input.scrollHeight)}px`; }
  if (oldPane === local.pane) {
    const replacement = focused?.isConnected ? focused : focusId && document.getElementById(focusId);
    if (replacement && document.activeElement !== replacement) {
      if (hadFocus) replacement.focus({ preventScroll: true });
      if (selection && replacement.setSelectionRange) replacement.setSelectionRange(...selection);
    }
    if ($('.pane-scroll')) $('.pane-scroll').scrollTop = scroll;
  }
  requestAnimationFrame(syncConfigBounds);
}
function pane(id) {
  if (id === local.pane) return;
  if (id !== local.pane && state?.configUi) execute(() => call('closeConfigUi'));
  local.pane = id; render();
}
let lastConfigBounds = '';
function configBounds() {
  const host = $('[data-config-ui-host]'); if (!host) return null;
  const { x, y, width, height } = host.getBoundingClientRect();
  return { id: host.dataset.configUiHost, bounds: { x, y, width, height } };
}
function syncConfigBounds() {
  if (!bridge || !state) return;
  const current = configBounds(), serialized = JSON.stringify(current);
  if (serialized === lastConfigBounds) return;
  lastConfigBounds = serialized;
  execute(() => call('configUiBounds', current?.id, current?.bounds || null));
}
async function openToolPanel(id) {
  const tool = state.request?.tools.find((item) => item.id === id);
  if (local.pane !== id && state.configUi) await call('closeConfigUi');
  if (tool?.manifest.configUi?.type === 'web') local.toolTabs[id] = 'config';
  local.pane = id; render();
  if (tool?.manifest.configUi?.type === 'web' && state.request.status === 'pending') {
    await call('openConfigUi', id, configBounds()?.bounds);
    lastConfigBounds = ''; requestAnimationFrame(syncConfigBounds);
  }
}
function saveDraft() {
  clearTimeout(draftTimer);
  if (closing || composing || !state.request || state.request.status !== 'pending') return draftChain;
  if (!editor.ready) return draftChain;
  const payload = { content: editor.serialize(), checks: [...local.checks] };
  draftChain = draftChain.catch(() => {}).then(() => call('draft', payload));
  draftChain = draftChain.catch((error) => { toast(error.message); throw error; });
  return draftChain;
}
function scheduleDraft() {
  clearTimeout(draftTimer);
  if (closing || composing) return;
  draftTimer = setTimeout(() => { saveDraft().catch(() => { draftChain = Promise.resolve(); }); }, 200);
}
async function finish() {
  if (closing || completing || composing || state.request?.status !== 'pending') return;
  const version = state.request.version;
  const sequence = ++completionSequence;
  completing = true;
  try {
    await editor.waitReady();
    if (closing || sequence !== completionSequence) return;
    await saveDraft();
    if (closing || sequence !== completionSequence) return;
    await call('complete', { version, content: editor.serialize(), checks: local.checks });
  } finally { completing = false; }
}
async function closeRequest() {
  if (closing || state?.request?.status !== 'pending') return;
  const saving = saveDraft();
  completionSequence++;
  closing = true; clearTimeout(draftTimer);
  const button = document.querySelector('[data-action=close]');
  if (button) button.disabled = true;
  try { await saving.catch(() => {}); await call('close'); }
  catch (error) { closing = false; if (button?.isConnected) button.disabled = false; throw error; }
}
async function addFiles(files) {
  if (state.request?.status !== 'pending') { toast('当前没有等待协助的请求'); return; }
  editor.addFiles(files);
}
const actions = {
  pane: (button) => pane(button.dataset.pane),
  hide: () => call('hide'), pin: () => call('preferences', { pinned: !state.preferences.pinned }),
  close: () => closeRequest(),
  theme: (button) => call('preferences', { theme: button.dataset.theme }),
  motion: () => call('preferences', { motion: state.preferences.motion === false }),
  run: async (button) => { await call('runTool', button.dataset.tool); },
  image: (button) => pane(`image:${button.dataset.id}`),
  'remove-image': (button) => call('removeImage', button.dataset.id),
  'remove-error': (button) => call('removeError', button.dataset.id),
  'attach-image': (button) => { const a = state.request.tools.flatMap((t) => t.output?.attachments || []).find((a) => a.id === button.dataset.id); if (a) { editor.insertAttachment(a); pane('note'); } },
  'attach-error': (button) => { const t = state.request.tools.find((t) => t.id === button.dataset.id); if (t?.error) { editor.insert([{ blockId: crypto.randomUUID(), type: 'diagnostic', toolId: t.id, name: t.manifest.name, ...t.error }]); pane('note'); toast('完整错误已附入回复'); } },
  'remove-block': (button) => editor.remove(button.dataset.block),
  'move-block-up': (button) => editor.move(button.dataset.block, -1),
  'move-block-down': (button) => editor.move(button.dataset.block, 1),
  'retry-block': (button) => { const b = editor.blocks.find((b) => b.blockId === button.dataset.block); if (b?.file) { editor.startUpload(b); render(); } },
  'copy-error': async (button) => { const error = state.request.tools.find((t) => t.id === button.dataset.id).error; await call('copyText', `${error.code}\n${error.message}\n${error.details || ''}`); toast('完整错误已复制'); },
  save: async (button) => { if (await call('saveResult', button.dataset.id)) toast('结果已保存'); },
  complete: () => finish(),
  'open-config-ui': (button) => openToolPanel(button.dataset.tool),
  'tool-tab': async (button) => {
    if (button.dataset.tab === 'config') return openToolPanel(button.dataset.tool);
    local.toolTabs[button.dataset.tool] = 'result'; render();
    await call('closeConfigUi');
  },
  'copy-config-error': async () => { const error = state.configUi?.error; if (error) { await call('copyText', `${error.code}\n${error.message}\n${error.details || ''}`); toast('配置错误已复制'); } },
};
function execute(action) { Promise.resolve().then(action).catch((error) => toast(error.message)); }
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled && state) execute(() => actions[button.dataset.action]?.(button));
});
document.addEventListener('contextmenu', (event) => {
  const button = event.target.closest('.bookmark[data-tool]');
  if (button) { event.preventDefault(); execute(() => openToolPanel(button.dataset.tool)); }
});
function configDraft(form) {
  const tool = state.request.tools.find((t) => t.id === form.dataset.id), data = new FormData(form), config = {};
  for (const [key, field] of Object.entries(tool.manifest.configSchema.properties || {})) {
    if (field.type === 'boolean') config[key] = data.has(key);
    else if (['integer', 'number'].includes(field.type)) config[key] = Number(data.get(key));
    else if (['object', 'array'].includes(field.type)) config[key] = JSON.parse(data.get(key));
    else config[key] = data.get(key);
  }
  return config;
}
document.addEventListener('compositionstart', (event) => {
  composing = event.target; clearTimeout(draftTimer);
});
document.addEventListener('compositionend', (event) => {
  if (composing !== event.target) return;
  composing = null;
  if (event.target.matches('[data-text-block]')) editor.input(event.target);
  // Let any final input event update the model before replaying external state.
  queueMicrotask(() => {
    if (composing) return;
    if (deferredState) { const next = deferredState; deferredState = null; receive(next); }
    else if (pendingRender) renderEditor();
    scheduleDraft();
  });
});
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-text-block]')) { editor.input(event.target); if (!$('.reply-blocks').classList.contains('single')) { event.target.style.height = 'auto'; event.target.style.height = `${Math.max(36, event.target.scrollHeight)}px`; } }
  const form = event.target.closest('.tool-settings-form');
  if (form) { try { local.configDrafts[form.dataset.id] = configDraft(form); } catch {} }
});
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-step]')) {
    const n = Number(event.target.dataset.step);
    local.checks = event.target.checked ? [...new Set([...local.checks, n])] : local.checks.filter((i) => i !== n);
    const row = event.target.closest('.check-row');
    row.classList.toggle('done', event.target.checked);
    row.classList.toggle('just-checked', event.target.checked);
    setTimeout(() => row.classList.remove('just-checked'), 320);
    const progress = $('.progress-row');
    if (progress) progress.outerHTML = progressHTML({ ...state.request, checks: local.checks });
    scheduleDraft();
  }
  const form = event.target.closest('.tool-settings-form'); if (form) { try { local.configDrafts[form.dataset.id] = configDraft(form); } catch {} }
});
document.addEventListener('toggle', (event) => {
  if (!event.target.matches('.tool-settings') || !event.target.isConnected) return;
  if (event.target.open) local.openSettings.add(event.target.dataset.id); else local.openSettings.delete(event.target.dataset.id);
}, true);
document.addEventListener('submit', (event) => {
  if (!event.target.matches('.tool-settings-form')) return;
  event.preventDefault(); const form = event.target;
  execute(async () => { const id = form.dataset.id; await call('configureTool', id, configDraft(form)); delete local.configDrafts[id]; toast('工具设置已保存'); });
});
document.addEventListener('keydown', (event) => {
  if (!state || composing || event.isComposing || event.keyCode === 229) return;
  const button = event.target.closest('.bookmark[data-tool]');
  if (button && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); execute(() => openToolPanel(button.dataset.tool)); return; }
  if (button && ['Enter', ' '].includes(event.key) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); if (!event.repeat) execute(() => actions.run(button)); return; }
  if (event.key === 'Escape') { pane('note'); return; }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && local.pane === 'note') { event.preventDefault(); execute(() => finish()); }
  if (event.target.matches('.bookmark') && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const buttons = [...event.target.closest('[role="toolbar"]').querySelectorAll('.bookmark')], index = buttons.indexOf(event.target);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
  }
});
document.addEventListener('paste', (event) => {
  if (!state || local.pane !== 'note') return;
  const files = [...(event.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
  if (files.length) { event.preventDefault(); editor.capture(event.target); execute(() => addFiles(files)); }
});
for (const name of ['focusin', 'select', 'keyup', 'click']) document.addEventListener(name, (event) => editor.capture(event.target));
document.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
document.addEventListener('drop', (event) => { event.preventDefault(); editor.capture(event.target); if (event.dataTransfer?.files.length) execute(() => addFiles([...event.dataTransfer.files])); });
let replyResize, replyFrame;
function setReplyHeight(height) {
  local.replyHeight = Math.round(Math.max(44, height));
  $('.composer').style.height = `${local.replyHeight}px`;
}
function finishReplyDrag(drag) {
  if (replyResize !== drag) return;
  replyResize = null;
  if (deferredState) { const next = deferredState; deferredState = null; receive(next); }
}
async function resizeReplyBottom(drag, final = false) {
  await drag.ready;
  if (replyResize !== drag || (drag.ending && !final)) return;
  const bounds = await call('resize');
  if (bounds && replyResize === drag) setReplyHeight(drag.height + bounds.height - drag.windowHeight);
}
document.addEventListener('pointerdown', (event) => {
  const edge = event.target.closest('[data-reply-resize]');
  if (!edge || event.button !== 0 || replyResize) return;
  event.preventDefault(); edge.setPointerCapture(event.pointerId);
  const drag = { edge: edge.dataset.replyResize, element: edge, pointerId: event.pointerId, y: event.clientY, height: $('.composer').getBoundingClientRect().height };
  replyResize = drag;
  drag.ready = drag.edge === 'bottom' ? call('beginResize', 's', drag.height).then(bounds => { drag.windowHeight = bounds.height; }) : Promise.resolve();
  drag.ready.catch(error => { finishReplyDrag(drag); toast(error.message); });
});
document.addEventListener('pointermove', (event) => {
  const drag = replyResize;
  if (!drag || drag.ending || event.pointerId !== drag.pointerId) return;
  if (drag.edge === 'top') {
    const max = Math.max(44, $('.paper').clientHeight - 112);
    setReplyHeight(Math.min(max, drag.height - (event.clientY - drag.y)));
  } else if (!replyFrame) {
    replyFrame = requestAnimationFrame(() => { replyFrame = null; execute(() => resizeReplyBottom(drag)); });
  }
});
function endReplyResize(event) {
  const drag = replyResize;
  if (!drag || drag.ending || event.pointerId !== drag.pointerId) return;
  drag.ending = true; cancelAnimationFrame(replyFrame); replyFrame = null;
  if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
  execute(async () => {
    try { if (drag.edge === 'bottom') { await resizeReplyBottom(drag, true); await call('endResize'); } }
    finally { finishReplyDrag(drag); }
  });
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) document.addEventListener(event, endReplyResize);
let resize, resizeFrame;
document.addEventListener('pointerdown', (event) => {
  const edge = event.target.closest('[data-resize-edge]');
  if (!edge || event.button !== 0 || resize || !bridge) return;
  event.preventDefault(); edge.setPointerCapture(event.pointerId);
  const drag = { edge, pointerId: event.pointerId, ready: call('beginResize', edge.dataset.resizeEdge) };
  resize = drag;
  drag.ready.catch((error) => { if (resize === drag) resize = null; toast(error.message); });
});
document.addEventListener('pointermove', (event) => {
  if (!resize || event.pointerId !== resize.pointerId || resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null; const drag = resize;
    if (drag) execute(async () => { await drag.ready; if (resize === drag) await call('resize'); });
  });
});
function endResize(event) {
  if (!resize || event.pointerId !== resize.pointerId) return;
  const drag = resize; resize = null;
  cancelAnimationFrame(resizeFrame); resizeFrame = null;
  if (drag.edge.hasPointerCapture(event.pointerId)) drag.edge.releasePointerCapture(event.pointerId);
  execute(async () => { await drag.ready; await call('endResize'); });
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(event, endResize);
new ResizeObserver(() => requestAnimationFrame(syncConfigBounds)).observe($('.note-window'));
refreshIcons();
if (!bridge) {
  $('.note-body').innerHTML = '<article class="paper"><div class="pane-scroll empty-note"><h1>请从桌面端打开 human_cli。</h1><p>运行 npm start，或双击“启动 human_cli.cmd”。AI 调用 MCP 后会自动出现协助便签。</p></div></article>';
} else {
  bridge.onState(receive);
  bridge.onCloseRequest(() => execute(closeRequest));
  call('bootstrap').then(receive).catch((error) => toast(error.message));
}
