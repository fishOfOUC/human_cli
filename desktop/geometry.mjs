const intersect = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
export const resizeEdges = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export function resizeFromEdge(bounds, edge, dx, dy, { minWidth = 340, minHeight = 300, maxWidth = 1600, maxHeight = 1200 } = {}) {
  if (!resizeEdges.includes(edge) || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('无效的窗口缩放方向或距离。');
  const clamp = (value, min, max) => Math.round(Math.max(min, Math.min(Math.max(min, max), value)));
  const next = { ...bounds };
  if (edge.includes('e') || edge.includes('w')) {
    next.width = clamp(bounds.width + (edge.includes('w') ? -dx : dx), minWidth, maxWidth);
    if (edge.includes('w')) next.x = bounds.x + bounds.width - next.width;
  }
  if (edge.includes('n') || edge.includes('s')) {
    next.height = clamp(bounds.height + (edge.includes('n') ? -dy : dy), minHeight, maxHeight);
    if (edge.includes('n')) next.y = bounds.y + bounds.height - next.height;
  }
  return next;
}
export function stableBounds(bounds, scaleFactor) {
  // Whole physical pixels can map to fractional DIP at 125/150/175% scaling.
  // Persist a representable grid so rounding cannot grow a window on every restore.
  let grid = 1;
  while (grid < 100 && Math.abs(grid * scaleFactor - Math.round(grid * scaleFactor)) > 0.00001) grid++;
  return { ...bounds, width: Math.round(bounds.width / grid) * grid, height: Math.round(bounds.height / grid) * grid };
}
export function restoreBounds(saved, displays, primaryId) {
  const primary = displays.find((d) => d.id === primaryId) || displays[0];
  if (!primary) throw new Error('没有可用的显示器。');
  const old = saved?.bounds;
  let display = displays.find((d) => String(d.id) === String(saved?.displayId));
  if (!display && old) display = [...displays].sort((a, b) => intersect(old, b.workArea) - intersect(old, a.workArea))[0];
  if (!display || (old && !displays.some((d) => String(d.id) === String(saved?.displayId)) && intersect(old, display.workArea) === 0)) display = primary;
  const area = display.workArea;
  const width = Math.min(Math.max(Number(old?.width) || 380, 340), area.width);
  const height = Math.min(Math.max(Number(old?.height) || 360, 300), area.height);
  const sameScreen = old && (String(display.id) === String(saved?.displayId) || intersect(old, area) > 0);
  const x = sameScreen ? old.x : area.x + area.width - width - 50;
  const y = sameScreen ? old.y : area.y + 90;
  return { x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))), width: Math.round(width), height: Math.round(height) };
}
