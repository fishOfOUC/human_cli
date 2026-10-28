// Use a new geometry key so the first large demo cannot reopen this small note at 1040px.
const KEY = 'relay.window.compact.v2';
const MIN_W = 280, MIN_H = 300;
export function setupWindow(element, onGeometry) {
  let geometry;
  const defaults = () => ({ x: innerWidth - 320 - 96, y: 148, width: 320, height: 360 });
  const clamp = (g) => {
    // Browser work area only. Native display work areas and DPI are a desktop adapter concern.
    const width = Math.max(MIN_W, Math.min(Number(g.width) || 320, Math.max(MIN_W, innerWidth - 96)));
    const height = Math.max(MIN_H, Math.min(Number(g.height) || 360, Math.max(MIN_H, innerHeight - 160)));
    return {
      width, height,
      x: Math.max(44, Math.min(Number(g.x) || 44, Math.max(44, innerWidth - width - 44))),
      y: Math.max(90, Math.min(Number(g.y) || 90, Math.max(90, innerHeight - height - 70))),
    };
  };
  const apply = (save = false) => {
    Object.assign(element.style, { left: `${geometry.x}px`, top: `${geometry.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
    if (save) { try { localStorage.setItem(KEY, JSON.stringify(geometry)); } catch { /* Storage may be disabled. */ } }
    onGeometry(geometry, save);
  };
  const restore = () => {
    try { geometry = clamp(JSON.parse(localStorage.getItem(KEY)) || defaults()); } catch { geometry = clamp(defaults()); }
    apply();
  };
  restore();
  let motion = null;
  element.addEventListener('pointerdown', (event) => {
    const resize = event.target.closest('[data-resize]');
    const drag = event.target.closest('[data-drag]');
    if ((!resize && !drag) || event.target.closest('button,input,textarea,a') || event.button !== 0) return;
    motion = { type: resize ? 'resize' : 'drag', x: event.clientX, y: event.clientY, start: { ...geometry }, pointer: event.pointerId };
    element.setPointerCapture(event.pointerId);
    document.body.classList.add('moving');
    event.preventDefault();
  });
  element.addEventListener('pointermove', (event) => {
    if (!motion) return;
    const dx = event.clientX - motion.x, dy = event.clientY - motion.y;
    geometry = motion.type === 'drag'
      ? clamp({ ...motion.start, x: motion.start.x + dx, y: motion.start.y + dy })
      : clamp({ ...motion.start, width: motion.start.width + dx, height: motion.start.height + dy });
    apply();
  });
  const end = () => { if (motion) { motion = null; apply(true); document.body.classList.remove('moving'); } };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  addEventListener('resize', () => { geometry = clamp(geometry); apply(); });
  return { restore, reset() { geometry = clamp(defaults()); apply(true); }, get: () => ({ ...geometry }) };
}
