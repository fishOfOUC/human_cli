import '@fontsource-variable/dm-sans';
import { $, esc, icon, refreshIcons } from './ui.js';
import { railHTML, panelHTML } from './views.js';
import { applyTheme } from './themes.js';
import './style.css';
import './desktop.css';

const bridge = window.humanCli;
const local = { pane: 'note', reply: '', checks: [], requestId: null, version: null, configDrafts: {}, openSettings: new Set(), toolTabs: {} };
let state, draftTimer, toastTimer, draftChain = Promise.resolve(), completing = false;
$('#app').innerHTML = `<main class="note-window" aria-label="AI 协助便签"><header class="window-titlebar"><div class="window-identity">${icon('bot')}<span id="agent-name">human_cli</span></div><div class="window-controls"><button class="icon-button" data-action="pane" data-pane="settings" aria-label="便签主题" title="便签主题">${icon('settings')}</button><button class="icon-button pin-control" data-action="pin" aria-label="切换置顶" title="切换置顶">${icon('pin')}</button><button class="icon-button" data-action="hide" aria-label="最小化到任务栏" title="最小化到任务栏，AI 请求继续等待">${icon('minus')}</button></div></header><div class="note-body"></div><div class="resize-handle" data-resize aria-label="拖动调整大小">${icon('grip')}</div><div class="note-toast" role="status" aria-live="polite"></div></main><input id="image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden />`;

function toast(text) {
  clearTimeout(toastTimer); $('.note-toast').textContent = text; $('.note-toast').classList.add('visible');
  toastTimer = setTimeout(() => $('.note-toast').classList.remove('visible'), 3200);
}
async function call(method, ...args) {
  const response = await bridge[method](...args);
  if (!response.ok) throw Object.assign(new Error(response.error.message), response.error);
  return response.value;
}
function receive(next) {
  const request = next.request;
  if (request?.id !== local.requestId) {
    local.reply = request?.reply || ''; local.checks = request?.checks || [];
    local.requestId = request?.id || null; local.version = request?.version; local.pane = 'note';
  } else if (request?.version !== local.version) {
    local.version = request.version; local.checks = [...request.checks];
    if (request.status !== 'pending') local.pane = 'note';
  }
  state = next; render();
}
function render() {
  if (!state) return;
  applyTheme(state.preferences.theme);
  const focused = document.activeElement, focusId = focused?.id, hadFocus = document.hasFocus();
  const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  const oldPane = $('#shared-panel')?.dataset.pane, scroll = $('.pane-scroll')?.scrollTop || 0;
  const request = state.request ? { ...state.request, reply: local.reply, checks: local.checks } : null;
  $('.note-body').innerHTML = `${railHTML(request, 'left', local.pane)}<article class="paper" id="shared-panel" role="region" aria-label="便签与工具详情" data-pane="${esc(local.pane)}">${panelHTML({ ...state, request }, local)}</article>${railHTML(request, 'right', local.pane)}`;
  $('#agent-name').textContent = request?.agent || 'human_cli';
  $('.pin-control').innerHTML = icon(state.preferences.pinned ? 'pin' : 'pin-off');
  $('.pin-control').setAttribute('aria-pressed', String(state.preferences.pinned));
  refreshIcons();
  if (oldPane === local.pane) {
    const replacement = focusId && document.getElementById(focusId);
    if (hadFocus) replacement?.focus({ preventScroll: true });
    if (replacement && selection && replacement.setSelectionRange) replacement.setSelectionRange(...selection);
    if ($('.pane-scroll')) $('.pane-scroll').scrollTop = scroll;
  }
  requestAnimationFrame(syncConfigBounds);
}
function pane(id) {
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
  if (!state.request || state.request.status !== 'pending') return draftChain;
  const payload = { reply: local.reply, checks: [...local.checks] };
  draftChain = draftChain.catch(() => {}).then(() => call('draft', payload));
  draftChain = draftChain.catch((error) => { toast(error.message); throw error; });
  return draftChain;
}
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { saveDraft().catch(() => { draftChain = Promise.resolve(); }); }, 200);
}
async function finish(only = false) {
  if (completing || state.request?.status !== 'pending') return;
  const version = state.request.version;
  completing = true;
  try {
    await saveDraft();
    await call('complete', { version, only, reply: local.reply, checks: local.checks });

  } finally { completing = false; }
}
async function addFiles(files) {
  if (state.request?.status !== 'pending') { toast('当前没有等待协助的请求'); return; }
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) { toast('单张图片需小于 5 MB'); continue; }
    const mime = file.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[file.name.split('.').at(-1).toLowerCase()]);
    await call('addImage', { name: file.name || '粘贴的图片.png', mime, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
}
const actions = {
  pane: (button) => pane(button.dataset.pane),
  hide: () => call('hide'), pin: () => call('preferences', { pinned: !state.preferences.pinned }),
  theme: (button) => call('preferences', { theme: button.dataset.theme }),
  run: async (button) => { await call('runTool', button.dataset.tool); },
  upload: () => $('#image-input').click(),
  image: (button) => pane(`image:${button.dataset.id}`),
  'remove-image': (button) => call('removeImage', button.dataset.id),
  'remove-error': (button) => call('removeError', button.dataset.id),
  'attach-image': (button) => call('attachImage', button.dataset.id),
  'attach-error': async (button) => { await call('attachError', button.dataset.id); pane('note'); toast('完整错误已附入回复'); },
  'copy-error': async (button) => { const error = state.request.tools.find((t) => t.id === button.dataset.id).error; await call('copyText', `${error.code}\n${error.message}\n${error.details || ''}`); toast('完整错误已复制'); },
  save: async (button) => { if (await call('saveResult', button.dataset.id)) toast('结果已保存'); },
  complete: () => finish(),
  only: () => { if (local.reply.trim() || state.request.images.length || state.request.diagnostics.length) pane('confirm-only'); else return finish(true); },
  'confirm-only': () => finish(true),
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
document.addEventListener('input', (event) => {
  if (event.target.id === 'reply') { local.reply = event.target.value; scheduleDraft(); }
  const form = event.target.closest('.tool-settings-form');
  if (form) { try { local.configDrafts[form.dataset.id] = configDraft(form); } catch {} }
});
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-step]')) {
    const n = Number(event.target.dataset.step);
    local.checks = event.target.checked ? [...new Set([...local.checks, n])] : local.checks.filter((i) => i !== n);
    event.target.closest('label').classList.toggle('checked', event.target.checked); scheduleDraft();
  }
  if (event.target.id === 'image-input') { const files = [...event.target.files]; event.target.value = ''; execute(() => addFiles(files)); }
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
  if (!state) return;
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
  const files = [...(event.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
  if (files.length) { event.preventDefault(); execute(() => addFiles(files)); }
});
document.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
document.addEventListener('drop', (event) => { event.preventDefault(); if (event.dataTransfer?.files.length) execute(() => addFiles([...event.dataTransfer.files])); });
let resize;
$('[data-resize]').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return; resize = { x: event.screenX, y: event.screenY, width: innerWidth, height: innerHeight };
  event.target.closest('[data-resize]').setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove', (event) => { if (resize) execute(() => call('resize', { width: resize.width + event.screenX - resize.x, height: resize.height + event.screenY - resize.y })); });
document.addEventListener('pointerup', () => { resize = null; });
document.addEventListener('pointercancel', () => { resize = null; });
new ResizeObserver(() => requestAnimationFrame(syncConfigBounds)).observe($('.note-window'));
refreshIcons();
if (!bridge) {
  $('.note-body').innerHTML = '<article class="paper"><div class="pane-scroll empty-note"><h1>请从桌面端打开 human_cli。</h1><p>运行 npm start，或双击“启动 human_cli.cmd”。AI 调用 MCP 后会自动出现协助便签。</p></div></article>';
} else {
  bridge.onState(receive);
  call('bootstrap').then(receive).catch((error) => toast(error.message));
}
