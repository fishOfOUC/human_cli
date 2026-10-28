import test from 'node:test';
import assert from 'node:assert/strict';
import { OnDemandLifecycle } from '../desktop/lifecycle.mjs';

function setup(t, pending = 0) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let count = pending, quits = 0;
  const lifecycle = new OnDemandLifecycle(() => count > 0, () => quits++);
  t.after(() => lifecycle.dispose());
  return { lifecycle, tick: (ms) => t.mock.timers.tick(ms), setPending: (n) => { count = n; lifecycle.changed(); }, get quits() { return quits; } };
}

test('standalone startup exits silently and health polling cannot keep an unused host resident', (t) => {
  const f = setup(t); f.tick(4500);
  f.lifecycle.begin('/health')(); f.tick(499); assert.equal(f.quits, 0);
  f.tick(1); assert.equal(f.quits, 1);
});

test('pending human work has no deadline, including a disconnected receiver', (t) => {
  const f = setup(t, 1), end = f.lifecycle.begin('/requests/id/wait');
  f.tick(86400000); assert.equal(f.quits, 0);
  end(); f.tick(86400000); assert.equal(f.quits, 0);
  f.setPending(0); f.tick(250); assert.equal(f.quits, 1);
});

test('last note finishing cannot exit while a reply HTTP response is still active', (t) => {
  const f = setup(t, 1), end = f.lifecycle.begin('/requests/id/wait');
  f.setPending(0); f.tick(86400000); assert.equal(f.quits, 0);
  end(); end(); assert.equal(f.lifecycle.active, 0);
  f.tick(249); assert.equal(f.quits, 0);
  f.tick(1); assert.equal(f.quits, 1);
});

test('overlapping notes and follow-up image queries delay idle exit until all work drains', (t) => {
  const f = setup(t, 2); f.lifecycle.begin('/requests')();
  f.setPending(1); f.tick(10000); assert.equal(f.quits, 0);
  f.setPending(0); f.tick(200);
  const image = f.lifecycle.begin('/requests/id/result');
  f.tick(10000); assert.equal(f.quits, 0);
  image(); f.tick(200); f.setPending(1); f.tick(10000); assert.equal(f.quits, 0);
  f.setPending(0); f.tick(250); assert.equal(f.quits, 1);
});

test('read-only queries are short-lived work and shutdown disposal cancels timers', (t) => {
  const f = setup(t); f.lifecycle.begin('/logs')();
  f.tick(249); assert.equal(f.quits, 0);
  f.lifecycle.dispose(); f.tick(86400000); assert.equal(f.quits, 0);
});
