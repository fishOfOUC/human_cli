import {
  createIcons, NotebookPen, Plus, ChevronRight, Move, StickyNote, Pin, Minus, X,
  HardDrive, Grip, PanelTopOpen, RotateCcw, Info, ExternalLink, Copy, ScanLine,
  Terminal, RotateCw, LoaderCircle, ArrowUpRight, CircleAlert, Check,
  CornerDownLeft, MousePointer2, SlidersHorizontal, Puzzle, HandHelping,
  Clock3, ChevronDown, ImagePlus, CornerDownRight, Bot, FileWarning,
  AppWindow, Sun, Moon, Download, PinOff,
} from 'lucide';
import { scenarios, createTask } from './data.js';
import { setupWindow } from './window.js';
import './style.css';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const iconSet = {
  NotebookPen, Plus, ChevronRight, Move, StickyNote, Pin, Minus, X, HardDrive,
  Grip, PanelTopOpen, RotateCcw, Info, ExternalLink, Copy, ScanLine, Terminal,
  RotateCw, LoaderCircle, ArrowUpRight, CircleAlert, Check, CornerDownLeft,
  MousePointer2, SlidersHorizontal, Puzzle, HandHelping, Clock3, ChevronDown,
  ImagePlus, CornerDownRight, Bot, FileWarning, AppWindow, Sun, Moon, Download, PinOff,
};
const refreshIcons = () => createIcons({ icons: iconSet, attrs: { 'aria-hidden': 'true' } });
const tasks = scenarios.map((_, index) => createTask(index));
let current = 0, pinned = true, visible = true, toolCounter = 0, toastTimer, modalReturnFocus;
const task = () => tasks[current];
const states = { idle: '待运行', running: '运行中', success: '已完成', error: '出错了' };
const stateBadge = (state) => `<span class="state ${state}"><span class="state-dot"></span>${states[state] || state}</span>`;

$('#app').innerHTML = `
  <header class="demo-header">
    <div class="brand">${icon('notebook-pen', 'brand-mark')}<span class="wordmark">relay</span><span class="brand-cn">接力便签</span></div>
    <div class="demo-actions"><div class="demo-label"><span></span>桌面交互原型</div><button class="secondary new-note" data-action="new-note">${icon('plus')}新便签</button></div>
  </header>
  <div class="workspace-label">工作台 ${icon('chevron-right')} 人工协助</div>
  <div class="workspace-hint">${icon('move')}拖动标题栏移动 · 右下角调整大小</div>
  <div class="reopen-note" hidden>${icon('sticky-note')}<h2>便签已收起</h2><p>回复草稿还在。准备好时，再把便签打开。</p><button class="secondary" data-action="reopen">${icon('panel-top-open')}重新打开便签</button></div>
  <main class="note-window" aria-label="Agent 协作便签">
    <header class="window-titlebar" data-drag>
      <div class="window-identity">${icon('sticky-note')}协作便签<span class="note-number">/ 01</span></div>
      <div class="window-controls"><button class="pin-control" data-action="pin" title="置顶状态演示，系统级置顶需桌面端接入" aria-pressed="true">${icon('pin')}<span>已置顶</span></button><button class="icon-button" data-action="minimize" aria-label="收起便签" title="收起便签">${icon('minus')}</button><button class="icon-button close" data-action="close" aria-label="关闭便签" title="关闭便签，保留当前草稿">${icon('x')}</button></div>
    </header>
    <div class="note-body"></div>
    <footer class="window-statusbar"><span>${icon('hard-drive')}<span id="geometry-status">窗口位置与大小会自动记住</span></span><span class="geometry" id="geometry-value"></span></footer>
    <div class="resize-handle" data-resize role="separator" aria-label="拖动调整窗口大小" title="拖动调整窗口大小">${icon('grip')}</div>
  </main>
  <footer class="demo-footer"><div class="demo-footer-left"><span>试一张不同的便签</span><div class="scene-switch" aria-label="切换演示场景">${scenarios.map((s, i) => `<button data-action="scenario" data-index="${i}" class="${i === current ? 'active' : ''}" aria-pressed="${i === current}">${s.name}</button>`).join('')}</div></div><div class="demo-footer-right"><span>系统置顶与工具调用待桌面端接入</span><button data-action="reset-window" title="恢复默认位置和大小">${icon('rotate-ccw')}重置窗口</button><button data-action="about">${icon('info')}设计说明</button></div></footer>
  <input id="image-input" type="file" accept="image/*" multiple hidden />`;

const windowElement = $('.note-window');
const windowManager = setupWindow(windowElement, (geometry, saved) => {
  $('#geometry-value').textContent = `${geometry.width} × ${geometry.height}`;
  if (saved) $('#geometry-status').textContent = '已记住位置与大小，下张便签会在这里打开';
});

function toolHTML(tool) {
  const attached = task().errors.some((e) => e.id === tool.id);
  return `<section class="tool-card" data-tool="${esc(tool.id)}">
    <div class="tool-name">${icon(tool.icon)}${esc(tool.name)}</div>
    <p class="tool-description">${esc(tool.description)}</p>
    <button class="tool-run" data-action="run-tool" data-id="${esc(tool.id)}" ${tool.state === 'running' || task().result ? 'disabled' : ''} aria-label="${esc(tool.name)}：${states[tool.state]}">${stateBadge(tool.state)}${tool.state === 'running' ? icon('loader-circle') : icon(tool.state === 'error' ? 'rotate-cw' : 'arrow-up-right')}</button>
    ${tool.state === 'error' ? `<div class="tool-error"><div class="error-heading">${icon('circle-alert')}${tool.action === 'logs' ? '连接未成功' : '工具运行失败'}</div><p>${esc(tool.error?.split('\n')[1] || '演示工具执行失败，请重试。')}</p><div class="error-code">${esc(tool.error?.split('\n')[0] || 'E_DEMO_TOOL')}</div><div class="error-actions"><button data-action="copy-error" data-id="${esc(tool.id)}" title="复制完整错误">${icon('copy')}复制</button><button data-action="attach-error" data-id="${esc(tool.id)}" class="${attached ? 'attached' : ''}" ${task().result ? 'disabled' : ''}>${icon(attached ? 'check' : 'corner-down-left')}${attached ? '已附入' : '附入回复'}</button></div></div>` : ''}
  </section>`;
}

function railHTML(side) {
  const left = side === 'left';
  return `<aside class="tool-rail ${side}" aria-label="${left ? '操作工具' : '采集工具'}"><div class="rail-heading"><h2>${left ? '操作工具' : '采集与诊断'}</h2>${icon(left ? 'mouse-pointer-2' : 'sliders-horizontal')}</div><div class="tool-list">${task().tools.filter((t) => t.side === side).map(toolHTML).join('')}</div><button class="add-tool" data-action="add-tool" data-side="${side}">${icon('plus')}添加工具</button><div class="rail-bottom">${left ? `${icon('puzzle')}你的顺手工具，<br>也可以挂在这里。` : `<span>工具状态，一眼可见</span><div class="rail-legend">${stateBadge('idle')}${stateBadge('running')}${stateBadge('success')}${stateBadge('error')}</div>`}</div></aside>`;
}

function renderPaper() {
  const t = task();
  if (t.result) return resultHTML(t);
  return `<div class="paper-content"><div class="request-meta"><span class="request-kind">${icon('hand-helping')}${esc(t.category)}</span><span class="waiting-label">${icon('clock-3')}等你接力</span></div><h1>${esc(t.title)}</h1><p class="request-description">${esc(t.description)}</p>
    <ol class="checklist">${t.steps.map((step, i) => `<li><label class="${t.checks.includes(i) ? 'checked' : ''}"><input type="checkbox" data-step="${i}" ${t.checks.includes(i) ? 'checked' : ''} /><span>${esc(step)}</span></label></li>`).join('')}</ol>
    <button class="context-toggle" data-action="context" aria-expanded="${t.contextOpen}">${icon(t.contextOpen ? 'chevron-down' : 'chevron-right')}查看 Agent 上下文</button><div class="context-box" ${t.contextOpen ? '' : 'hidden'}>${esc(t.context)}</div>
    <section class="reply-area"><div class="reply-heading"><label for="reply">给 Agent 留个回复</label><span>选填</span></div><div class="composer"><textarea id="reply" placeholder="已经看过了，显示正常。或者，说说你遇到的问题…" aria-describedby="reply-help">${esc(t.reply)}</textarea><div class="attachments"></div><div class="composer-toolbar"><button class="attach-button" data-action="upload">${icon('image-plus')}添加图片</button><span class="paste-hint">也可以拖入 / Ctrl + V 粘贴</span></div></div><div class="reply-note" id="reply-help">${icon('corner-down-right')}回复和附件会一起交给 Agent，接着往下做。</div></section>
  </div><div class="paper-actions"><div class="agent-info"><span class="agent-avatar">${icon('bot')}</span><div><strong>来自 Codex</strong><small>等待你的协助</small></div></div><div class="complete-actions"><button class="complete-only" data-action="complete-only">仅完成</button><button class="primary" data-action="complete">${icon('check')}完成并回复</button></div></div>`;
}

function render() {
  $('.note-body').innerHTML = `${railHTML('left')}<article class="paper">${renderPaper()}</article>${railHTML('right')}`;
  $('.note-number').textContent = `/ ${task().number}`;
  $('.scene-switch').querySelectorAll('button').forEach((button, i) => { button.classList.toggle('active', current === i); button.setAttribute('aria-pressed', current === i); });
  refreshAttachments();
  refreshIcons();
}

function refreshAttachments() {
  const target = $('.attachments');
  if (!target) return;
  target.innerHTML = task().images.map((img) => `<div class="image-attachment"><img src="${img.url}" alt="${esc(img.name)}" data-action="view-image" data-id="${img.id}" tabindex="0" role="button" /><button class="remove-attachment" data-action="remove-image" data-id="${img.id}" aria-label="移除 ${esc(img.name)}">${icon('x')}</button><span class="image-name">${esc(img.name)}</span></div>`).join('') + task().errors.map((error) => `<div class="error-attachment"><span title="${esc(error.text)}">${icon('file-warning')}诊断信息 · ${esc(error.text.split('\n')[0])}</span><button data-action="remove-error" data-id="${esc(error.id)}" aria-label="移除诊断信息">${icon('x')}</button></div>`).join('');
  refreshIcons();
}

function refreshTools() {
  for (const side of ['left', 'right']) $(`.tool-rail.${side} .tool-list`).innerHTML = task().tools.filter((t) => t.side === side).map(toolHTML).join('');
  refreshIcons();
}

function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); }

function openModal(content, className = '') {
  modalReturnFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-overlay"><section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${content}</section></div>`;
  refreshIcons();
  const autofocus = $('[autofocus]', $('#modal-root')) || $('button,input,select', $('#modal-root'));
  autofocus?.focus();
}
const modalHeader = (title) => `<header class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭对话框">${icon('x')}</button></header>`;
function closeModal() { $('#modal-root').innerHTML = ''; modalReturnFocus?.focus(); }

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制，可以直接粘贴'); return true; }
  catch { openModal(`${modalHeader('复制内容')}<p class="modal-description">浏览器未授予剪贴板权限，可以选中下方内容复制。</p><textarea class="form-input" style="height:140px" readonly>${esc(text)}</textarea>`); $('textarea', $('#modal-root')).select(); return false; }
}

async function runTool(id) {
  const t = task(), tool = t.tools.find((item) => item.id === id);
  if (!tool || tool.state === 'running' || t.result) return;
  tool.state = 'running'; refreshTools();
  if (tool.action === 'preview') {
    tool.state = 'success'; refreshTools(); openPreview(); return;
  }
  if (tool.action === 'copy') {
    tool.state = await copy('Studio / 设置 / 外观') ? 'success' : 'idle'; if (task() === t) refreshTools(); return;
  }
  await new Promise((resolve) => setTimeout(resolve, 1100));
  if (tool.action === 'capture') {
    const image = makeSampleImage();
    if (!t.result && t.images.length < 8) { t.images.push(image); tool.state = 'success'; if (task() === t) { refreshAttachments(); toast('示例截图已附入回复，可点击预览'); } }
    else { tool.state = 'idle'; if (task() === t) toast(t.result ? '便签已完成，截图未附入' : '最多可附 8 张图片，请先移除一张'); }
  } else if (tool.action === 'logs' || tool.action === 'error') {
    tool.state = 'error'; tool.error = tool.error || 'E_DEMO_TOOL\n演示工具执行失败。\n请检查工具配置，然后重试。';
    if (task() === t) toast('演示采集未连接：可以复制错误或附入回复');
  } else { tool.state = 'success'; if (task() === t) toast(`${tool.name}：演示动作已完成`); }
  if (task() === t) refreshTools();
}

function makeSampleImage() {
  // Draw the demo's own sample settings screen. This is not an OS screenshot.
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 620;
  const c = canvas.getContext('2d'); c.fillStyle = '#222522'; c.fillRect(0, 0, 1000, 620);
  c.fillStyle = '#2c302b'; c.fillRect(0, 0, 1000, 62); c.fillRect(0, 62, 220, 558);
  c.font = '22px "Microsoft YaHei", sans-serif'; c.fillStyle = '#c0cab9'; c.fillText('Studio / 设置 / 外观', 27, 40);
  c.fillStyle = '#e5ece0'; c.font = '34px "Microsoft YaHei", sans-serif'; c.fillText('外观', 275, 139);
  c.font = '19px "Microsoft YaHei", sans-serif'; c.fillStyle = '#adb8a6'; c.fillText('让工作空间，更合你的习惯。', 275, 182);
  ['通用设置', '外观', '通知', '快捷键'].forEach((name, i) => { if (i === 1) { c.fillStyle = '#3b4436'; c.fillRect(16, 140, 188, 47); } c.fillStyle = i === 1 ? '#e5ece0' : '#adb8a6'; c.fillText(name, 35, 121 + i * 49); });
  c.fillStyle = '#e5ece0'; c.fillText('主题', 275, 248);
  c.strokeStyle = '#56654d'; c.lineWidth = 2; c.strokeRect(275, 274, 260, 112); c.strokeStyle = '#819a6b'; c.strokeRect(555, 274, 260, 112);
  c.fillText('浅色', 305, 340); c.fillText('深色（已选）', 585, 340);
  c.fillText('跟随系统强调色', 275, 449); c.fillStyle = '#617b51'; c.beginPath(); c.roundRect(760, 425, 55, 30, 15); c.fill(); c.fillStyle = '#e5ece0'; c.beginPath(); c.arc(798, 440, 10, 0, Math.PI * 2); c.fill();
  c.font = '16px "Microsoft YaHei", sans-serif'; c.fillStyle = '#95a38b'; c.fillText('Relay 演示截图 · 非真实屏幕采集', 275, 561);
  return { id: crypto.randomUUID(), name: '外观设置-示例.png', url: canvas.toDataURL('image/png') };
}

function openPreview() {
  openModal(`${modalHeader('目标页面预览')}<p class="modal-description">这是便签内的示例页面。试试切换主题，观察文字与按钮。</p><div class="preview-app" id="preview-app"><div class="preview-chrome">${icon('app-window')}Studio / 设置 / 外观<span style="margin-left:auto">演示页面</span></div><div class="preview-content"><div class="preview-nav"><div>通用设置</div><div class="selected">外观</div><div>通知</div><div>快捷键</div></div><div class="preview-settings"><h3>外观</h3><p>让工作空间，更合你的习惯。</p><div class="theme-controls"><button class="theme-option selected" data-action="theme" data-theme="light">${icon('sun')}浅色</button><button class="theme-option" data-action="theme" data-theme="dark">${icon('moon')}深色</button></div><div class="preview-row"><span>跟随系统强调色</span><button class="toggle" data-action="toggle-accent" role="switch" aria-checked="true" aria-label="跟随系统强调色"></button></div></div></div></div><div class="modal-footer"><button class="secondary" data-action="close-modal">返回便签</button><button class="primary" data-action="sample-capture">${icon('image-plus')}附上示例截图</button></div>`, 'preview-modal');
}

function addToolModal(side) {
  openModal(`${modalHeader('挂上一个顺手工具')}<p class="modal-description">给便签加一项辅助操作，放在你用得顺手的那一侧。</p><form id="tool-form"><div class="form-field"><label class="form-label" for="tool-name">工具名称</label><input class="form-input" id="tool-name" name="name" required maxlength="14" placeholder="例如：采集应用日志" autofocus /></div><div class="form-field"><label class="form-label" for="tool-description">一句话说明</label><input class="form-input" id="tool-description" name="description" maxlength="40" placeholder="例如：整理最近一次操作的日志" /></div><div class="form-field"><span class="form-label">挂在便签哪边</span><div class="form-choice"><label><input type="radio" name="side" value="left" ${side === 'left' ? 'checked' : ''} />左侧 · 操作工具</label><label><input type="radio" name="side" value="right" ${side === 'right' ? 'checked' : ''} />右侧 · 采集与诊断</label></div></div><div class="form-field"><label class="form-label" for="tool-outcome">演示运行结果</label><select class="form-input" id="tool-outcome" name="outcome"><option value="success">运行中 → 成功</option><option value="error">运行中 → 出错</option></select></div><div class="modal-note">此处演示工具配置与状态流转。实际脚本、参数和权限可在桌面端接入。</div><div class="modal-footer"><button type="button" class="secondary" data-action="close-modal">取消</button><button class="primary" type="submit">${icon('plus')}添加到便签</button></div></form>`);
}

async function addFiles(files) {
  const t = task();
  if (t.result) { toast('这张便签已经完成，请先打开一张新便签'); return; }
  for (const file of files) {
    if (!file.type.startsWith('image/')) { toast('请添加图片文件'); continue; }
    if (file.size > 5 * 1024 * 1024) { toast('单张图片需小于 5 MB'); continue; }
    if (t.images.length >= 8) { toast('每张便签最多附 8 张图片'); break; }
    const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }).catch(() => null);
    if (url && !t.result) t.images.push({ id: crypto.randomUUID(), name: file.name || '粘贴的图片.png', url });
  }
  if (task() === t) refreshAttachments();
}

function finish(only = false) {
  const t = task(); if (t.result) return;
  // Snapshot the response. Any asynchronous tool result cannot alter this sent payload.
  t.result = { request_id: t.instance, status: 'completed', reply: only ? '已完成' : t.reply.trim() || '已完成', images: only ? [] : t.images.map((image) => ({ ...image })), diagnostics: only ? [] : t.errors.map((e) => ({ ...e })), completed_at: new Date().toISOString(), demo: true };
  render(); toast('已完成 · 演示回传结果已生成');
}

function resultHTML(t) {
  const r = t.result;
  return `<div class="paper-content"><div class="request-meta"><span class="request-kind">${icon('hand-helping')}${esc(t.category)}</span>${stateBadge('success')}</div><div class="success-heading"><div class="success-symbol">${icon('check')}</div><h1>接力完成，交给 Agent。</h1><p>你的协助已经整理好了。下方是这次便签的演示回传内容。</p></div><div class="sent-label"><span>你的回复</span><span>${new Date(r.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div><div class="sent-reply">${esc(r.reply)}${r.images.length ? `<div>${r.images.map((img) => `<img src="${img.url}" alt="${esc(img.name)}" data-action="view-image" data-id="${img.id}" tabindex="0" role="button" />`).join('')}</div>` : ''}${r.diagnostics.map((e) => `<pre>${esc(e.text)}</pre>`).join('')}</div><div class="success-bottom">${icon('info')}当前为前端演示，尚未连接真实 Agent。</div><div class="result-tools"><button class="secondary" data-action="export-result">${icon('download')}导出回传 JSON</button><button class="text-button" data-action="restart">再试一次</button></div></div><div class="paper-actions"><div class="agent-info"><span class="agent-avatar">${icon('bot')}</span><div><strong>来自 Codex</strong><small>${esc(t.project)}</small></div></div><button class="secondary" data-action="new-note">${icon('plus')}新便签</button></div>`;
}

function reopen() { visible = true; windowElement.hidden = false; $('.reopen-note').hidden = true; windowManager.restore(); }
function freshTask() { tasks[current] = createTask(current); reopen(); render(); toast('新便签已打开，沿用记住的位置与大小'); }

document.addEventListener('click', async (event) => {
  if (event.target.classList.contains('modal-overlay')) { closeModal(); return; }
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  switch (action) {
    case 'new-note': if (task().reply || task().images.length || task().errors.length) {
      if (!task().result) { openModal(`${modalHeader('打开一张新便签？')}<p class="modal-description">当前便签还有未发送的回复。新便签会替换当前演示场景的草稿。</p><div class="modal-footer"><button class="secondary" data-action="close-modal">保留草稿</button><button class="primary" data-action="confirm-new">打开新便签</button></div>`); break; }
    } freshTask(); break;
    case 'confirm-new': closeModal(); freshTask(); break;
    case 'reopen': reopen(); break;
    case 'close': case 'minimize': visible = false; windowElement.hidden = true; $('.reopen-note').hidden = false; break;
    case 'pin': pinned = !pinned; button.classList.toggle('off', !pinned); button.setAttribute('aria-pressed', pinned); button.innerHTML = `${icon(pinned ? 'pin' : 'pin-off')}<span>${pinned ? '已置顶' : '未置顶'}</span>`; refreshIcons(); toast(`${pinned ? '已开启' : '已关闭'}置顶状态演示；系统级置顶由桌面端接入`); break;
    case 'reset-window': windowManager.reset(); toast('已恢复默认窗口位置与大小'); break;
    case 'scenario': current = Number(button.dataset.index); reopen(); render(); break;
    case 'context': task().contextOpen = !task().contextOpen; button.setAttribute('aria-expanded', task().contextOpen); button.innerHTML = `${icon(task().contextOpen ? 'chevron-down' : 'chevron-right')}查看 Agent 上下文`; $('.context-box').hidden = !task().contextOpen; refreshIcons(); break;
    case 'run-tool': runTool(id); break;
    case 'copy-error': await copy(task().tools.find((t) => t.id === id)?.error || ''); break;
    case 'attach-error': { const tool = task().tools.find((t) => t.id === id); if (!task().errors.some((e) => e.id === id)) task().errors.push({ id, text: tool.error }); refreshAttachments(); refreshTools(); toast('完整错误已附入回复，完成时会一起回传'); break; }
    case 'remove-error': task().errors = task().errors.filter((e) => e.id !== id); refreshAttachments(); refreshTools(); break;
    case 'add-tool': addToolModal(button.dataset.side); break;
    case 'upload': $('#image-input').click(); break;
    case 'remove-image': task().images = task().images.filter((img) => img.id !== id); refreshAttachments(); break;
    case 'view-image': { const img = task().images.find((i) => i.id === id) || task().result?.images.find((i) => i.id === id); if (img) openModal(`${modalHeader(esc(img.name))}<img src="${img.url}" alt="${esc(img.name)}" />`, 'modal-image'); break; }
    case 'complete': finish(); break;
    case 'complete-only': if (task().reply.trim() || task().images.length || task().errors.length) openModal(`${modalHeader('只标记完成？')}<p class="modal-description">你已准备了一些回复内容。「仅完成」只回传完成状态，文字和附件不会发出。</p><div class="modal-footer"><button class="secondary" data-action="close-modal">返回编辑</button><button class="primary" data-action="confirm-only">仅标记完成</button></div>`); else finish(true); break;
    case 'confirm-only': closeModal(); finish(true); break;
    case 'close-modal': closeModal(); break;
    case 'theme': $('#preview-app').classList.toggle('dark', button.dataset.theme === 'dark'); $('.theme-controls').querySelectorAll('button').forEach((el) => el.classList.toggle('selected', el === button)); break;
    case 'toggle-accent': button.classList.toggle('off'); button.setAttribute('aria-checked', !button.classList.contains('off')); break;
    case 'sample-capture': closeModal(); runTool('capture'); break;
    case 'restart': freshTask(); break;
    case 'export-result': { const blob = new Blob([JSON.stringify(task().result, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `relay-${task().id}-response.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('演示回传 JSON 已导出，图片包含在数据中'); break; }
    case 'about': openModal(`${modalHeader('把需要你的那一步，递给你。')}<p class="modal-description">Relay 的灵感来自前台递给后厨的便签。Agent 做到需要你接手的一步时，递出一张说明清楚的小纸条；你做好，再把它递回去。</p><div class="modal-note"><strong>这个 Demo 可以体验</strong><br>任务清单、图片上传 / 粘贴 / 拖入、左右自定义工具、运行状态、错误复制与附入、完成回复，以及窗口位置与尺寸记忆。<br><br><strong>桌面端接入时</strong><br>实现系统级置顶、真实截图、工具执行、Agent 通信。窗口恢复需根据显示器工作区和 DPI 校正；原屏幕断开时迁回主屏并限制到可见区域。</div><p class="modal-description" style="margin:18px 0 0">设计方向：Framed sheet。暖白纸面、鼠尾草灰工具边栏、深绿完成按钮，让要做的事先被看见。三个场景与工具结果均为演示数据。</p>`); break;
  }
});

document.addEventListener('input', (event) => { if (event.target.id === 'reply') task().reply = event.target.value; });
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-step]')) { const n = Number(event.target.dataset.step); task().checks = event.target.checked ? [...task().checks, n] : task().checks.filter((i) => i !== n); event.target.closest('label').classList.toggle('checked', event.target.checked); }
  if (event.target.id === 'image-input') { addFiles([...event.target.files]); event.target.value = ''; }
});
document.addEventListener('submit', (event) => {
  if (event.target.id !== 'tool-form') return;
  event.preventDefault(); const form = new FormData(event.target); const name = form.get('name').trim(); if (!name) return;
  task().tools.push({ id: `custom-${++toolCounter}`, side: form.get('side'), name, description: form.get('description').trim() || '自定义工具 · 演示动作', icon: 'puzzle', state: 'idle', action: form.get('outcome') }); closeModal(); refreshTools(); toast('工具已挂到便签上，点一下就能试运行');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('.modal-overlay')) closeModal();
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !$('.modal-overlay') && visible) { event.preventDefault(); finish(); }
  if (event.key === 'Enter' && event.target.matches('img[data-action]')) event.target.click();
  if (event.key === 'Tab' && $('.modal-overlay')) {
    const focusables = [...$('.modal').querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter((el) => !el.disabled && !el.hidden);
    const first = focusables[0], last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
document.addEventListener('paste', (event) => {
  if (!visible || $('.modal-overlay') || task().result) return;
  const images = [...(event.clipboardData?.items || [])].filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
  if (images.length) { event.preventDefault(); addFiles(images); }
});
let dragDepth = 0;
document.addEventListener('dragenter', (event) => { if (event.target.closest('.composer')) { dragDepth++; $('.composer')?.classList.add('dragover'); } });
document.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', (event) => { if (event.target.closest('.composer') && --dragDepth <= 0) { dragDepth = 0; $('.composer')?.classList.remove('dragover'); } });
document.addEventListener('drop', (event) => { if (event.dataTransfer?.files.length) { event.preventDefault(); if (!$('.modal-overlay') && event.target.closest('.paper') && visible) addFiles([...event.dataTransfer.files]); } dragDepth = 0; $('.composer')?.classList.remove('dragover'); });
render();
