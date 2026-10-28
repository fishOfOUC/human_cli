import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreBounds, stableBounds } from '../desktop/geometry.mjs';
const main = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };
const left = { id: 2, workArea: { x: -1280, y: 0, width: 1280, height: 984 }, scaleFactor: 1.5 };
test('restore exact DIP geometry on a still-connected display', () => {
  const bounds = { x: -900, y: 100, width: 400, height: 450 };
  assert.deepEqual(restoreBounds({ bounds, displayId: 2 }, [main, left], 1), bounds);
});
test('unplugged display moves entire note including tool wings onto primary work area', () => {
  const r = restoreBounds({ bounds: { x: -1200, y: 100, width: 380, height: 360 }, displayId: 2 }, [main], 1);
  assert.ok(r.x >= 0 && r.x + r.width <= 1920); assert.equal(r.width, 380);
});
test('DPI changes do not double scale Electron DIP bounds; oversize and shifted areas clamp', () => {
  const r = restoreBounds({ bounds: { x: 1900, y: 990, width: 4000, height: 3000 }, displayId: 1 }, [{ ...main, scaleFactor: 2 }], 1);
  assert.deepEqual(r, { x: 0, y: 0, width: 1920, height: 1040 });
});
test('125 percent physical-pixel rounding converges rather than growing on restore', () => {
  const saved = stableBounds({ x: 0, y: 0, width: 411, height: 391 }, 1.25);
  assert.equal(saved.width, 412); assert.equal(saved.height, 392);
  assert.deepEqual(stableBounds(saved, 1.25), saved);
});
