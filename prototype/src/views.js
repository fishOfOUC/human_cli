import { esc, icon, states, stateBadge } from './ui.js';

export function railHTML(t, side) {
  const active = t.tools.some((tool) => tool.id === t.activePane) || t.activePane.startsWith('add-') ? t.activePane : 'note';
  const tab = (id, label, glyph, state = 'idle', extra = '', isTool = false) => `<button
    id="tab-${id}" class="bookmark ${state} ${active === id ? 'selected' : ''} ${extra}"
    data-action="${isTool ? 'run-tool' : 'pane'}" data-pane="${esc(id)}" ${isTool ? `data-id="${esc(id)}" data-tool="${esc(id)}"` : ''}
    aria-label="${esc(label)}${isTool ? ` · ${states[state]} · 左键运行，右键详情` : ''}"
    title="${esc(label)}${isTool ? ` · ${states[state]}\n左键运行 / 右键详情（Shift+F10）` : ''}" tabindex="0">${icon(glyph)}</button>`;
  return `<aside class="bookmark-rail ${side}" aria-label="${side === 'left' ? '操作工具' : '采集工具'}">
    <div class="bookmark-list" role="toolbar" aria-label="${side === 'left' ? '便签与操作' : '截图与诊断'}" aria-orientation="vertical">
      ${side === 'left' ? tab('note', '便签与回复', 'sticky-note', 'idle', 'note-tab') : ''}
      ${t.tools.filter((tool) => tool.side === side).map((tool) => tab(tool.id, tool.name, tool.icon, tool.state, '', true)).join('')}
      ${tab(`add-${side}`, '添加工具', 'plus', 'idle', 'add-tab')}
    </div>
  </aside>`;
}

export function attachmentsHTML(t) {
  return t.images.map((image) => `<div class="image-attachment">
    <button class="image-open" data-action="view-image" data-id="${image.id}" title="${esc(image.name)}"><img src="${image.url}" alt="${esc(image.name)}" /></button>
    <button class="remove-attachment" data-action="remove-image" data-id="${image.id}" aria-label="移除 ${esc(image.name)}">${icon('x')}</button>
  </div>`).join('') + t.errors.map((error) => `<div class="error-attachment" title="${esc(error.text)}"><span>${icon('file-warning')}诊断已附入</span><button data-action="remove-error" data-id="${esc(error.id)}" aria-label="移除诊断附件">${icon('x')}</button></div>`).join('');
}

function noteHTML(t) {
  if (t.result) return resultHTML(t);
  return `<div class="pane-scroll note-content">
    <div class="request-meta"><span>${esc(t.category)}</span><span class="waiting-label">等你接力</span></div>
    <h1>${esc(t.title)}</h1>
    <ol class="checklist">${t.steps.map((step, i) => `<li><label class="${t.checks.includes(i) ? 'checked' : ''}"><input type="checkbox" data-step="${i}" ${t.checks.includes(i) ? 'checked' : ''} /><span>${esc(step)}</span></label></li>`).join('')}</ol>
    <section class="composer" aria-label="回复 Agent"><label class="sr-only" for="reply">给 Agent 的回复</label><textarea id="reply" placeholder="回复两句，或直接粘贴图片…">${esc(t.reply)}</textarea><div class="attachments">${attachmentsHTML(t)}</div><div class="composer-toolbar"><button class="attach-button" data-action="upload" title="添加图片，支持上传、拖入和粘贴">${icon('image-plus')}图片<span id="attachment-count">${t.images.length || ''}</span></button><button data-action="pane" data-pane="context" class="context-button">任务详情${icon('chevron-right')}</button></div></section>
  </div><footer class="pane-footer note-footer"><button class="complete-only" data-action="complete-only">仅完成</button><button class="primary" data-action="complete">${icon('check')}完成并回复</button></footer>`;
}

const panelHeader = (title, status = '') => `<div class="pane-heading"><button class="icon-button" data-action="pane" data-pane="note" title="返回便签" aria-label="返回便签">${icon('arrow-left')}</button><h1>${esc(title)}</h1>${status}</div>`;
const backButton = (label = '返回便签') => `<button type="button" class="text-button" data-action="pane" data-pane="note">${label}</button>`;

function toolHTML(t, tool) {
  const attached = t.errors.some((error) => error.id === tool.id);
  let content = '';
  if (tool.action === 'preview') {
    content = `<div class="preview-app ${t.previewTheme === 'dark' ? 'dark' : ''}" id="preview-app"><div class="preview-chrome">Studio / 设置 / 外观</div><div class="preview-settings"><h2>外观</h2><p>让工作空间更合你的习惯。</p><div class="theme-controls"><button class="theme-option ${t.previewTheme === 'light' ? 'selected' : ''}" data-action="theme" data-theme="light">${icon('sun')}浅色</button><button class="theme-option ${t.previewTheme === 'dark' ? 'selected' : ''}" data-action="theme" data-theme="dark">${icon('moon')}深色</button></div><div class="preview-row"><span>系统强调色</span><button class="toggle ${t.accent ? '' : 'off'}" data-action="toggle-accent" role="switch" aria-checked="${t.accent}" aria-label="系统强调色"></button></div></div></div>`;
    if (tool.state === 'error') content += `<div class="error-block"><pre>${esc(tool.error)}</pre></div>`;
  } else if (tool.action === 'capture') {
    const image = tool.lastImage;
    const attachedImage = image && t.images.some((i) => i.id === image.id);
    content = image ? `<button class="capture-preview" data-action="view-image" data-id="${image.id}" title="预览截图"><img src="${image.url}" alt="示例截图" /></button><div class="capture-actions"><span class="tool-hint">${attachedImage ? '已附入回复' : '结果已保留在工具中'}</span><button class="secondary" data-action="attach-tool-image" data-id="${tool.id}" ${t.result || attachedImage ? 'disabled' : ''}>${icon(attachedImage ? 'check' : 'image-plus')}${attachedImage ? '已附入' : '附入回复'}</button></div>` : `<div class="capture-empty">${icon('scan-line')}<span>左键侧边书签即可截图</span><small>此处生成演示图片，不采集真实屏幕。</small></div>`;
  } else if (tool.action === 'copy') {
    content = '<div class="path-display">Studio / 设置 / 外观</div><p class="tool-hint">左键侧边书签即可复制，也可选中上方路径手动复制。</p>';
    if (tool.state === 'error') content += `<p class="tool-hint">${esc(tool.error)}</p>`;
  } else {
    content = tool.state === 'error' ? `<div class="error-block"><div class="error-title">${icon('circle-alert')}${tool.action === 'logs' ? '采集服务未连接' : '工具执行失败'}</div><pre>${esc(tool.error)}</pre></div><div class="error-actions"><button class="secondary" data-action="copy-error" data-id="${esc(tool.id)}">${icon('copy')}复制错误</button><button class="secondary ${attached ? 'attached' : ''}" data-action="attach-error" data-id="${esc(tool.id)}" ${t.result ? 'disabled' : ''}>${icon(attached ? 'check' : 'corner-down-left')}${attached ? '已附入回复' : '附入回复'}</button></div>` : `<div class="tool-message">${icon(tool.state === 'running' ? 'loader-circle' : tool.state === 'success' ? 'check' : 'puzzle')}<p>${tool.state === 'running' ? '正在运行，请稍等…' : tool.state === 'success' ? esc(tool.output || '运行完成。') : '工具就绪，左键侧边书签即可运行。'}</p></div>`;
  }
  return `${panelHeader(tool.name, stateBadge(tool.state))}<div class="pane-scroll tool-content"><p class="tool-description">${esc(tool.description)}</p>${content}${tool.state === 'running' ? '<p class="running-message">正在运行…</p>' : ''}${toolSettingsHTML(t, tool)}</div><footer class="pane-footer">${backButton(t.images.length || t.errors.length ? '查看回复' : '返回便签')}<button class="secondary" data-action="save-tool-result" data-id="${esc(tool.id)}" ${!tool.lastImage && !tool.output && !tool.error ? 'disabled' : ''}>${icon('download')}保存结果</button></footer>`;
}

function toolSettingsHTML(t, tool) {
  const d = tool.settingsDraft || { name: tool.name, description: tool.description, autoAttach: tool.autoAttach !== false, outcome: tool.action };
  return `<details class="tool-settings" ${tool.settingsOpen ? 'open' : ''} data-id="${esc(tool.id)}"><summary>工具设置</summary><form class="tool-settings-form" data-id="${esc(tool.id)}"><label class="form-label" for="setting-name">名称</label><input class="form-input" id="setting-name" name="name" required maxlength="14" value="${esc(d.name)}" /><label class="form-label" for="setting-description">说明</label><input class="form-input" id="setting-description" name="description" maxlength="80" value="${esc(d.description)}" />${tool.action === 'capture' ? `<label class="setting-checkbox"><input type="checkbox" name="autoAttach" ${d.autoAttach ? 'checked' : ''} />截图后自动附入回复</label>` : ''}${['success', 'error'].includes(tool.action) ? `<label class="form-label" for="setting-outcome">演示运行结果</label><select class="form-input" id="setting-outcome" name="outcome"><option value="success" ${d.outcome === 'success' ? 'selected' : ''}>成功</option><option value="error" ${d.outcome === 'error' ? 'selected' : ''}>出错</option></select>` : ''}<button type="submit" class="secondary" ${t.result || tool.state === 'running' ? 'disabled' : ''}>保存设置</button></form></details>`;
}

function addToolHTML(t) {
  const d = t.toolDraft;
  return `${panelHeader('添加工具')}<form id="tool-form" class="tool-form"><div class="pane-scroll form-content">
    <label class="form-label" for="tool-name">工具名称</label><input class="form-input" id="tool-name" name="name" required maxlength="14" value="${esc(d.name)}" placeholder="例如：导出操作记录" />
    <label class="form-label" for="tool-description">说明 <span class="muted">选填</span></label><input class="form-input" id="tool-description" name="description" maxlength="40" value="${esc(d.description)}" placeholder="这项工具帮你做什么" />
    <div class="form-columns"><div><label class="form-label" for="tool-side">挂在哪边</label><select class="form-input" id="tool-side" name="side"><option value="left" ${d.side === 'left' ? 'selected' : ''}>左侧</option><option value="right" ${d.side === 'right' ? 'selected' : ''}>右侧</option></select></div><div><label class="form-label" for="tool-outcome">演示结果</label><select class="form-input" id="tool-outcome" name="outcome"><option value="success" ${d.outcome === 'success' ? 'selected' : ''}>运行成功</option><option value="error" ${d.outcome === 'error' ? 'selected' : ''}>运行出错</option></select></div></div>
    <p class="tool-hint">挂成一枚书签贴，在这里共用工具界面。实际执行待桌面端接入。</p>
  </div><footer class="pane-footer">${backButton('取消')}<button type="submit" class="primary">${icon('plus')}添加</button></footer></form>`;
}

function resultHTML(t) {
  const r = t.result;
  return `${panelHeader('已接力完成', stateBadge('success'))}<div class="pane-scroll result-content"><p class="result-caption">你的回复与附件已整理好。</p><div class="sent-reply">${esc(r.reply)}${r.images.length ? `<div class="sent-images">${r.images.map((i) => `<button data-action="view-image" data-id="${i.id}"><img src="${i.url}" alt="${esc(i.name)}" /></button>`).join('')}</div>` : ''}${r.diagnostics.map((e) => `<pre>${esc(e.text)}</pre>`).join('')}</div><p class="tool-hint">前端演示，尚未向真实 Agent 发送。</p></div><footer class="pane-footer"><button class="text-button" data-action="export-result">${icon('download')}回传 JSON</button><button class="primary" data-action="new-note">${icon('plus')}新便签</button></footer>`;
}

export function panelHTML(t) {
  const pane = t.activePane;
  if (pane === 'note') return noteHTML(t);
  if (pane.startsWith('add-')) return addToolHTML(t);
  const tool = t.tools.find((item) => item.id === pane);
  if (tool) return toolHTML(t, tool);
  if (pane === 'context') return `${panelHeader('任务详情')}<div class="pane-scroll detail-content"><p class="detail-project">${esc(t.project)}</p><p>${esc(t.description)}</p><h2>Agent 上下文</h2><p>${esc(t.context)}</p><h2>希望你告诉我</h2><p>${esc(t.expectation)}</p></div><footer class="pane-footer">${backButton()}</footer>`;
  if (pane.startsWith('image:')) {
    const image = t.images.find((i) => i.id === pane.slice(6)) || t.result?.images.find((i) => i.id === pane.slice(6)) || t.tools.find((tool) => tool.lastImage?.id === pane.slice(6))?.lastImage;
    return `${panelHeader('图片预览')}<div class="pane-scroll image-content">${image ? `<img src="${image.url}" alt="${esc(image.name)}" /><p>${esc(image.name)}</p>` : '<p>图片已移除。</p>'}</div><footer class="pane-footer">${backButton('返回回复')}</footer>`;
  }
  if (pane === 'confirm-new' || pane === 'confirm-only') {
    const isNew = pane === 'confirm-new';
    return `${panelHeader(isNew ? '打开新便签？' : '只标记完成？')}<div class="pane-scroll detail-content"><p>${isNew ? '当前还有未发送的内容。打开新便签会替换这张便签的草稿。' : '你已写了回复或添加附件。仅完成只回传完成状态，不包含这些内容。'}</p></div><footer class="pane-footer">${backButton('保留草稿')}<button class="primary" data-action="${isNew ? 'confirm-new' : 'confirm-only'}">${isNew ? '打开新便签' : '仅标记完成'}</button></footer>`;
  }
  if (pane === 'copy-fallback') return `${panelHeader('复制内容')}<div class="pane-scroll detail-content"><p>剪贴板暂不可用，可选中下方内容复制。</p><textarea class="copy-fallback" readonly>${esc(t.copyText)}</textarea></div><footer class="pane-footer">${backButton()}</footer>`;
  return `${panelHeader('关于这张便签')}<div class="pane-scroll detail-content"><h2>小小一张，接一下手。</h2><p>正文和回复放在便签里，两侧工具只留书签贴。左键直接运行，右键打开配置与结果，窗口大小不变。键盘 Enter / 空格运行，Shift+F10 查看详情。</p><p>灰色待运行，蓝色运行中，绿色成功，红色出错。悬停可看名称，错误可以复制或附入回复。</p><p>图片上传、粘贴、拖入、完成回传与窗口记忆均可体验。截图、系统置顶、工具执行和 Agent 通信仍为前端演示。</p></div><footer class="pane-footer">${backButton()}</footer>`;
}
