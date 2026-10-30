// Keep the editor and its ancestors connected while unrelated note state changes.
// Reattaching an old textarea after innerHTML replacement still cancels native IME.
const markup = new WeakMap();
const blockKey = (node) => node.dataset.textBlock || node.dataset.block;

function replaceSection(current, next) {
  if (current && markup.get(current) === next.outerHTML) return;
  markup.set(next, next.outerHTML);
  current.replaceWith(next);
}

function updateBlocks(current, next) {
  const existing = new Map([...current.children].map((node) => [blockKey(node), node]));
  const wanted = new Set([...next.children].map(blockKey));
  for (const [key, node] of existing) if (!wanted.has(key)) node.remove();
  let cursor = current.firstElementChild;
  for (const desired of [...next.children]) {
    let node = existing.get(blockKey(desired));
    if (node?.tagName !== desired.tagName) node = null;
    if (node?.matches('textarea')) {
      for (const { name, value } of desired.attributes) if (node.getAttribute(name) !== value) node.setAttribute(name, value);
      // Even assigning the same value/selection can disturb an IME or caret.
      if (node.value !== desired.value) node.value = desired.value;
    } else if (!node || markup.get(node) !== desired.outerHTML) {
      markup.set(desired, desired.outerHTML);
      if (node) { if (cursor === node) cursor = desired; node.replaceWith(desired); }
      node = desired;
    }
    if (node !== cursor) current.insertBefore(node, cursor);
    cursor = node.nextElementSibling;
  }
  current.className = next.className;
}

export function renderNoteBody(body, html, requestId, pane) {
  const template = document.createElement('template'); template.innerHTML = html;
  const next = template.content, paper = body.querySelector('.paper'), nextPaper = next.querySelector('.paper');
  const composer = paper?.querySelector('.composer'), nextComposer = nextPaper?.querySelector('.composer');
  if (body.dataset.requestId !== requestId || paper?.dataset.pane !== 'note' || pane !== 'note' || !composer || !nextComposer) {
    body.replaceChildren(next); body.dataset.requestId = requestId || '';
    return;
  }
  for (const side of ['left', 'right']) {
    const selector = `.bookmark-rail.${side}`, current = body.querySelector(selector), desired = next.querySelector(selector);
    if (!desired) current?.remove();
    else if (current) replaceSection(current, desired);
    else body.insertBefore(desired, side === 'left' ? paper : null);
  }
  for (const selector of ['.note-content', '.note-footer']) replaceSection(paper.querySelector(selector), nextPaper.querySelector(selector));
  if (composer.style.height !== nextComposer.style.height) composer.style.height = nextComposer.style.height;
  updateBlocks(composer.querySelector('.reply-blocks'), nextComposer.querySelector('.reply-blocks'));
}
