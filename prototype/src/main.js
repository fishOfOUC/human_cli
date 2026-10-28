import { scenarios, createTask } from './data.js';
import { setupWindow } from './window.js';
import { makeSampleImage } from './sample-image.js';
import { $, esc, icon, refreshIcons } from './ui.js';
import { railHTML, panelHTML, attachmentsHTML } from './views.js';
import './style.css';

const tasks = scenarios.map((_, index) => createTask(index));
let current = 0, pinned = true, visible = true, toolCounter = 0, toastTimer;
const task = () => tasks[current];

$('#app').innerHTML = `
  <header class="demo-header"><div class="brand">${icon('notebook-pen')}<span>relay</span><small>接力便签</small></div><div class="demo-actions"><span>桌面交互原型</span><button class="secondary" data-action="new-note">${icon('plus')}新便签</button></div></header>
  <div class="workspace-hint">拖动便签 · 左键运行工具 / 右键配置与结果</div>
  <div class="reopen-note" hidden><button class="secondary" data-action="reopen">${icon('sticky-note')}打开便签</button><p>回复草稿还在。</p></div>
  <main class="note-window" aria-label="Agent 协作便签">
    <header class="window-titlebar" data-drag><div class="window-identity">${icon('bot')}<span>Codex</span><span class="note-number">便签 1</span></div><div class="window-controls"><button class="icon-button pin-control" data-action="pin" title="置顶状态演示，系统置顶待桌面端接入" aria-label="关闭置顶状态" aria-pressed="true">${icon('pin')}</button><button class="icon-button" data-action="minimize" title="收起便签" aria-label="收起便签">${icon('minus')}</button><button class="icon-button close" data-action="close" title="关闭并保留本次草稿" aria-label="关闭便签">${icon('x')}</button></div></header>
    <div class="note-body"></div>
    <div class="resize-handle" data-resize role="separator" aria-label="拖动调整便签大小" title="拖动调整大小">${icon('grip')}</div>
    <div class="note-toast" role="status" aria-live="polite"></div>
  </main>
  <footer class="demo-footer"><div class="scene-switch" aria-label="切换演示场景">${scenarios.map((s, i) => `<button data-action="scenario" data-index="${i}" aria-pressed="${i === current}" class="${i === current ? 'active' : ''}">${esc(s.name)}</button>`).join('')}</div><div class="demo-footer-right"><span id="geometry-value">320 × 360</span><button data-action="reset-window">${icon('rotate-ccw')}重置尺寸</button><button data-action="about">${icon('info')}说明</button><span class="demo-boundary">置顶与工具调用为演示</span></div></footer>
  <input id="image-input" type="file" accept="image/*" multiple hidden />`;

const windowElement = $('.note-window');
const windowManager = setupWindow(windowElement, (g) => {
  $('#geometry-value').textContent = `${g.width} × ${g.height}`;
});

function render() {
  const t = task();
  const focus = document.activeElement;
  const focusedId = focus?.id;
  const selection = typeof focus?.selectionStart === 'number' ? [focus.selectionStart, focus.selectionEnd] : null;
  const panel = $('#shared-panel');
  const samePane = panel?.dataset.pane === t.activePane;
  const scroll = samePane ? $('.pane-scroll')?.scrollTop || 0 : 0;
  $('.note-body').innerHTML = `${railHTML(t, 'left')}<article class="paper" id="shared-panel" role="region" aria-label="便签与工具详情" data-pane="${esc(t.activePane)}">${panelHTML(t)}</article>${railHTML(t, 'right')}`;
  $('.note-number').textContent = `便签 ${t.number}`;
  $('.scene-switch').querySelectorAll('button').forEach((button, i) => {
    button.classList.toggle('active', current === i);
    button.setAttribute('aria-pressed', current === i);
  });
  refreshIcons();
  if (samePane) {
    const replacement = focusedId && document.getElementById(focusedId);
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (selection && replacement.setSelectionRange) replacement.setSelectionRange(...selection);
    }
    if ($('.pane-scroll')) $('.pane-scroll').scrollTop = scroll;
  }
}

function setPane(pane) {
  const t = task();
  t.previousPane = t.activePane;
  if (pane.startsWith('add-') && !t.activePane.startsWith('add-')) t.toolDraft.side = pane.slice(4);
  t.activePane = pane;
  render();
}

function refreshAttachments() {
  const attachments = $('.attachments');
  if (attachments) {
    attachments.innerHTML = attachmentsHTML(task());
    $('#attachment-count').textContent = task().images.length || '';
    refreshIcons();
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('.note-toast').textContent = message;
  $('.note-toast').classList.add('visible');
  toastTimer = setTimeout(() => $('.note-toast').classList.remove('visible'), 2600);
}

function reopen() {
  visible = true;
  windowElement.hidden = false;
  $('.reopen-note').hidden = true;
  windowManager.restore();
}

function freshTask() {
  tasks[current] = createTask(current);
  reopen(); render(); toast('新便签沿用记住的位置和大小');
}

async function copy(text, revealFallback = true) {
  const t = task();
  try {
    await navigator.clipboard.writeText(text);
    if (task() === t) toast('已复制');
    return true;
  } catch {
    if (!revealFallback) return false;
    t.copyText = text;
    t.activePane = 'copy-fallback';
    if (task() === t) { render(); $('.copy-fallback')?.select(); }
    return false;
  }
}

async function runTool(id) {
  const t = task(), tool = t.tools.find((item) => item.id === id);
  if (!tool || tool.state === 'running') return;
  if (t.result) { toast('便签已完成，可右键查看工具结果'); return; }
  tool.state = 'running'; render();
  if (tool.action === 'preview') {
    const target = window.open(`/target.html?theme=${t.previewTheme}`, 'relay-tool-target', 'popup,width=640,height=460');
    tool.state = target ? 'success' : 'error';
    if (target) {
      target.opener = null;
      tool.error = null; tool.output = '已打开目标页面（演示）。';
      toast('目标页面已打开');
    } else {
      tool.error = 'E_POPUP_BLOCKED\n目标页面未能打开，请允许此站点打开弹窗。';
      toast('页面未打开，右键查看详情');
    }
    tool.completedAt = new Date().toISOString(); render(); return;
  }
  if (tool.action === 'copy') {
    const copied = await copy('Studio / 设置 / 外观', false);
    tool.state = copied ? 'success' : 'error';
    tool.output = 'Studio / 设置 / 外观';
    tool.error = copied ? null : 'E_CLIPBOARD_UNAVAILABLE\n无法写入剪贴板，可在详情里手动复制路径。';
    tool.completedAt = new Date().toISOString();
    if (!copied && task() === t) toast('复制未成功，右键查看并手动复制');
    if (task() === t) render();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (tool.action === 'capture') {
    const image = makeSampleImage();
    tool.lastImage = image; tool.state = 'success'; tool.error = null;
    const attach = tool.autoAttach !== false && !t.result && t.images.length < 8;
    if (attach) t.images.push(image);
    tool.output = attach ? '示例截图已生成并附入回复。' : '示例截图已保留在工具结果中。';
    if (task() === t) toast(attach ? '示例截图已附入回复' : '截图已保留，右键查看或保存');
  } else if (tool.action === 'logs' || tool.action === 'error') {
    tool.state = 'error';
    tool.error ||= 'E_DEMO_TOOL\n演示工具执行失败。\n请检查工具配置，然后重试。';
    if (task() === t) toast('工具出错，右键查看详情');
  } else {
    tool.state = 'success'; tool.error = null; tool.output = `${tool.name}：演示运行完成。`;
    if (task() === t) toast('工具运行完成，右键查看结果');
  }
  tool.completedAt = new Date().toISOString();
  if (task() === t) render();
}

async function addFiles(files) {
  const t = task();
  if (t.result) { toast('便签已完成，请先打开新便签'); return; }
  for (const file of files) {
    if (!file.type.startsWith('image/')) { toast('请选择图片文件'); continue; }
    if (file.size > 5 * 1024 * 1024) { toast('单张图片需小于 5 MB'); continue; }
    if (t.images.length >= 8) { toast('最多可附 8 张图片'); break; }
    const url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (url && !t.result && t.images.length < 8) t.images.push({ id: crypto.randomUUID(), name: file.name || '粘贴的图片.png', url });
  }
  if (task() === t) {
    if (t.activePane !== 'note') setPane('note');
    else refreshAttachments();
  }
}

function finish(only = false) {
  const t = task();
  if (t.result) return;
  // Snapshot the response so a late tool completion never changes sent content.
  t.result = {
    request_id: t.instance, status: 'completed', reply: only ? '已完成' : t.reply.trim() || '已完成',
    images: only ? [] : t.images.map((image) => ({ ...image })),
    diagnostics: only ? [] : t.errors.map((error) => ({ ...error })),
    completed_at: new Date().toISOString(), demo: true,
  };
  t.activePane = 'note'; render(); toast('演示回传已生成');
}

function exportResult() {
  if (!task().result) return;
  const blob = new Blob([JSON.stringify(task().result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `relay-${task().id}-response.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('回传 JSON 已导出');
}

function saveToolResult(id) {
  const tool = task().tools.find((item) => item.id === id);
  if (!tool) return;
  const link = document.createElement('a');
  let objectUrl;
  if (tool.lastImage) {
    link.href = tool.lastImage.url; link.download = tool.lastImage.name;
  } else {
    const result = tool.state === 'error' ? tool.error : tool.output;
    if (!result) return;
    objectUrl = URL.createObjectURL(new Blob([result], { type: 'text/plain;charset=utf-8' }));
    link.href = objectUrl; link.download = `${tool.name}-结果.txt`;
  }
  link.click();
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  toast('结果已导出');
}

const actions = {
  pane: (button) => setPane(button.dataset.pane),
  'new-note': () => {
    const t = task();
    if (!t.result && (t.reply || t.images.length || t.errors.length)) setPane('confirm-new');
    else freshTask();
  },
  'confirm-new': freshTask,
  reopen,
  close: () => { visible = false; windowElement.hidden = true; $('.reopen-note').hidden = false; },
  minimize: () => actions.close(),
  pin: (button) => {
    pinned = !pinned; button.classList.toggle('off', !pinned);
    button.setAttribute('aria-pressed', pinned);
    button.setAttribute('aria-label', pinned ? '关闭置顶状态' : '开启置顶状态');
    button.innerHTML = icon(pinned ? 'pin' : 'pin-off'); refreshIcons();
    toast(pinned ? '置顶状态已开启（演示）' : '置顶状态已关闭（演示）');
  },
  'reset-window': () => { windowManager.reset(); toast('已恢复 320 × 360 小便签'); },
  scenario: (button) => { current = Number(button.dataset.index); reopen(); render(); },
  'run-tool': (button) => runTool(button.dataset.id),
  'save-tool-result': (button) => saveToolResult(button.dataset.id),
  'attach-tool-image': (button) => {
    const t = task(), image = t.tools.find((tool) => tool.id === button.dataset.id)?.lastImage;
    if (!image || t.result) return;
    if (t.images.length >= 8) { toast('最多 8 张图片，请先移除一张'); return; }
    if (!t.images.some((item) => item.id === image.id)) t.images.push({ ...image });
    render(); toast('图片已附入回复');
  },
  'copy-error': (button) => copy(task().tools.find((tool) => tool.id === button.dataset.id)?.error || ''),
  'attach-error': (button) => {
    const t = task(), tool = t.tools.find((item) => item.id === button.dataset.id);
    if (t.result || !tool?.error) return;
    if (!t.errors.some((error) => error.id === tool.id)) t.errors.push({ id: tool.id, text: tool.error });
    setPane('note'); toast('完整错误已附入回复');
  },
  'remove-error': (button) => { task().errors = task().errors.filter((error) => error.id !== button.dataset.id); refreshAttachments(); },
  upload: () => $('#image-input').click(),
  'remove-image': (button) => { task().images = task().images.filter((image) => image.id !== button.dataset.id); refreshAttachments(); },
  'view-image': (button) => setPane(`image:${button.dataset.id}`),
  complete: () => finish(),
  'complete-only': () => {
    const t = task();
    if (t.reply.trim() || t.images.length || t.errors.length) setPane('confirm-only');
    else finish(true);
  },
  'confirm-only': () => finish(true),
  theme: (button) => { task().previewTheme = button.dataset.theme; render(); },
  'toggle-accent': () => { task().accent = !task().accent; render(); },
  'export-result': exportResult,
  about: () => { reopen(); setPane('about'); },
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) actions[button.dataset.action]?.(button);
});

function openToolDetails(button) {
  setPane(button.dataset.tool);
  document.getElementById(button.id)?.focus({ preventScroll: true });
}

document.addEventListener('contextmenu', (event) => {
  const button = event.target.closest('.bookmark[data-tool]');
  if (!button) return;
  event.preventDefault(); openToolDetails(button);
});

function updateSettingsDraft(target) {
  const form = target.closest('.tool-settings-form');
  if (!form) return;
  const tool = task().tools.find((item) => item.id === form.dataset.id);
  const data = new FormData(form);
  if (tool) tool.settingsDraft = {
    name: data.get('name'), description: data.get('description'),
    autoAttach: data.has('autoAttach'), outcome: data.get('outcome'),
  };
}

document.addEventListener('toggle', (event) => {
  if (!event.target.matches('.tool-settings')) return;
  const tool = task().tools.find((item) => item.id === event.target.dataset.id);
  if (tool && event.target.isConnected) tool.settingsOpen = event.target.open;
}, true);

document.addEventListener('input', (event) => {
  if (event.target.id === 'reply') task().reply = event.target.value;
  if (event.target.closest('#tool-form')) task().toolDraft[event.target.name] = event.target.value;
  updateSettingsDraft(event.target);
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-step]')) {
    const n = Number(event.target.dataset.step);
    task().checks = event.target.checked ? [...task().checks, n] : task().checks.filter((i) => i !== n);
    event.target.closest('label').classList.toggle('checked', event.target.checked);
  }
  if (event.target.id === 'image-input') { addFiles([...event.target.files]); event.target.value = ''; }
  if (event.target.closest('#tool-form')) task().toolDraft[event.target.name] = event.target.value;
  updateSettingsDraft(event.target);
});

document.addEventListener('submit', (event) => {
  if (event.target.matches('.tool-settings-form')) {
    event.preventDefault();
    const tool = task().tools.find((item) => item.id === event.target.dataset.id);
    if (!tool || task().result || tool.state === 'running') return;
    const data = new FormData(event.target), name = data.get('name').trim();
    if (!name) return;
    tool.name = name; tool.description = data.get('description').trim();
    if (tool.action === 'capture') tool.autoAttach = data.has('autoAttach');
    if (data.has('outcome')) tool.action = data.get('outcome');
    tool.settingsDraft = null; render(); toast('工具设置已保存'); return;
  }
  if (event.target.id !== 'tool-form') return;
  event.preventDefault();
  const form = new FormData(event.target), name = form.get('name').trim();
  if (!name) return;
  const tool = {
    id: `custom-${++toolCounter}`, side: form.get('side'), name,
    description: form.get('description').trim() || '自定义工具 · 演示动作',
    icon: 'puzzle', state: 'idle', action: form.get('outcome'),
  };
  task().tools.push(tool);
  task().toolDraft = { name: '', description: '', side: tool.side, outcome: 'success' };
  setPane(tool.id);
});

document.addEventListener('keydown', (event) => {
  const toolButton = event.target.closest('.bookmark[data-tool]');
  if (toolButton && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
    event.preventDefault(); openToolDetails(toolButton); return;
  }
  if (toolButton && ['Enter', ' '].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (!event.repeat) runTool(toolButton.dataset.tool);
    return;
  }
  if (event.key === 'Escape' && visible && task().activePane !== 'note') { setPane('note'); return; }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && visible && task().activePane === 'note') { event.preventDefault(); finish(); }
  if (event.target.matches('.bookmark') && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const tabs = [...event.target.closest('[role="toolbar"]').querySelectorAll('.bookmark')];
    const index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length;
    tabs[next].focus();
  }
});

document.addEventListener('paste', (event) => {
  if (!visible || task().result || task().activePane !== 'note') return;
  const images = [...(event.clipboardData?.items || [])].filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
  if (images.length) { event.preventDefault(); addFiles(images); }
});

document.addEventListener('dragover', (event) => {
  if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault();
  if (event.target.closest('.paper') && !task().result) $('.paper').classList.add('dragover');
});
document.addEventListener('dragleave', (event) => {
  if (event.target.closest('.paper') && !event.relatedTarget?.closest?.('.paper')) $('.paper')?.classList.remove('dragover');
});
document.addEventListener('drop', (event) => {
  if (event.dataTransfer?.files.length) {
    event.preventDefault();
    if (visible && event.target.closest('.paper')) addFiles([...event.dataTransfer.files]);
  }
  $('.paper')?.classList.remove('dragover');
});
render();
