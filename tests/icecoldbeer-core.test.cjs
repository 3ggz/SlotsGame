const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'icecoldbeer.html'), 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'icecoldbeer.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, Number, Float32Array, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);
const core = sandbox.globalThis.IceColdBeerCore;
assert(core, 'IceColdBeerCore must be exported');

function run(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } }
async function runAsync(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } }

run('7 climbing targets, strictly ascending', () => {
  assert.strictEqual(core.TARGETS.length, 7);
  for (let i = 1; i < core.TARGETS.length; i++) {
    assert(core.TARGETS[i].y > core.TARGETS[i - 1].y, 'target ' + i + ' must be higher');
  }
});

run('ladder: 7 rungs, strictly increasing, sane bounds', () => {
  assert.strictEqual(core.LADDER.length, 7);
  for (let i = 1; i < core.LADDER.length; i++) assert(core.LADDER[i] > core.LADDER[i - 1], 'rung ' + i);
  assert(core.LADDER[0] >= 1.2 && core.LADDER[0] <= 1.6, 'first rung modest');
  assert(core.LADDER[6] >= 15, 'top rung is a real prize');
});

run('payout = bet x rung; 0 before any bank', () => {
  assert.strictEqual(core.payout(100, 0), 0);
  assert.strictEqual(core.payout(100, 1), 140);   // 1.4x
  assert.strictEqual(core.payout(50, 7), 1400);   // 28x
  assert.strictEqual(core.payout(25, 3), 75);     // 3.0x
  assert.strictEqual(core.ladderAt(0), 0);
  assert.strictEqual(core.ladderAt(7), 28);
});

run('every hazard row leaves a navigable gap (no full horizontal block)', () => {
  // group hazards by row y, and assert there's an x in the play width
  // where the ball center clears every hazard in that row by > captureR.
  const rows = {};
  for (const h of core.HAZARDS) { const key = h.y.toFixed(2); (rows[key] = rows[key] || []).push(h.x); }
  const minX = -core.HALF + core.BALL_R, maxX = core.HALF - core.BALL_R;
  for (const key of Object.keys(rows)) {
    const xs = rows[key];
    let safeFound = false;
    for (let x = minX; x <= maxX; x += 0.1) {
      if (xs.every(hx => Math.abs(x - hx) > core.CAPTURE_R + 0.05)) { safeFound = true; break; }
    }
    assert(safeFound, 'row y=' + key + ' has no navigable gap');
  }
});

run('no target sits inside a hazard capture radius', () => {
  for (const t of core.TARGETS) {
    for (const h of core.HAZARDS) {
      assert(Math.hypot(t.x - h.x, t.y - h.y) >= core.CAPTURE_R + 0.05, 'target overlaps hazard at ' + JSON.stringify(t));
    }
  }
});

run('the threading path stays clear of hazards (ball-center clearance)', () => {
  const pts = [{ x: 0, y: core.BOTTOM }, ...core.TARGETS];
  let minClear = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let s = 0; s <= 50; s++) {
      const t = s / 50, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      for (const h of core.HAZARDS) minClear = Math.min(minClear, Math.hypot(px - h.x, py - h.y));
    }
  }
  assert(minClear > core.CAPTURE_R + 0.1, 'path clearance ' + minClear.toFixed(2) + ' too tight');
});

run('classify: lit target wins, hazards bust, gaps are safe', () => {
  // standing on the lit target (index 0)
  let c = core.classify(core.TARGETS[0].x, core.TARGETS[0].y, 0, null);
  assert.strictEqual(c.type, 'target'); assert.strictEqual(c.index, 0);
  // standing on a hazard
  const h = core.HAZARDS[0];
  c = core.classify(h.x, h.y, 0, null);
  assert.strictEqual(c.type, 'hazard');
  // a target that is NOT lit must read as none (not a win) when you're not aiming for it
  c = core.classify(core.TARGETS[3].x, core.TARGETS[3].y, 0, null);
  assert.strictEqual(c.type, 'none', 'unlit target must not auto-win');
  // the start position is safe
  c = core.classify(0, core.BOTTOM, 0, null);
  assert.strictEqual(c.type, 'none');
});

/* ---------- real physics: ball rests on the rod and rolls downhill ---------- */
(async () => {
  let RAPIER = null;
  try { RAPIER = require('@dimforge/rapier3d-compat'); }
  catch (e) { console.log('SKIP physics test (rapier3d-compat not installed)'); console.log('Ice Cold Beer core tests complete'); return; }
  await RAPIER.init();

  await runAsync('ball settles ON the rod under gravity (does not fall through)', async () => {
    const sim = core.createPhysicsSim(RAPIER);
    const flat = core.ROD_START_Y;
    for (let i = 0; i < 240; i++) sim.step(flat, flat);   // 2s settle
    const b = sim.getBall();
    // ball must rest roughly one ball-radius above the rod, not have fallen away
    assert(b.y > flat && b.y < flat + 1.2, 'ball y ' + b.y.toFixed(2) + ' should rest just above the flat rod ' + flat);
    assert(Math.abs(b.vy) < 1.0, 'ball should be at rest, vy=' + b.vy.toFixed(2));
    sim.free();
  });

  await runAsync('GRADUAL tilt rolls the ball toward the lower end (raise-left -> right)', async () => {
    // Tilt the way the game actually does — moving a knob a little each
    // step (ROD_SPEED). Instantly teleporting the kinematic rod flings
    // the ball as a contact artifact and does NOT reflect real play.
    const rate = core.ROD_SPEED * core.H;
    function gradual(raiseLeft) {
      const sim = core.createPhysicsSim(RAPIER);
      sim.resetBall(0, core.BALL_START.y);
      let L = core.ROD_START_Y, R = core.ROD_START_Y;
      for (let i = 0; i < 60; i++) sim.step(L, R);
      for (let i = 0; i < 120; i++) { if (raiseLeft) L = Math.min(core.Y_MAX, L + rate); else R = Math.min(core.Y_MAX, R + rate); sim.step(L, R); }
      const x = sim.getBall().x; sim.free(); return x;
    }
    const xL = gradual(true);   // raise left -> ball rolls RIGHT
    assert(xL > 0.6, 'raise-left should roll the ball right (+x), got ' + xL.toFixed(2));
    const xR = gradual(false);  // raise right -> ball rolls LEFT
    assert(xR < -0.6, 'raise-right should roll the ball left (-x), got ' + xR.toFixed(2));
  });

  await runAsync('raising both ends carries the ball UP the board', async () => {
    const sim = core.createPhysicsSim(RAPIER);
    sim.resetBall(0, core.BALL_START.y);
    for (let i = 0; i < 60; i++) sim.step(core.ROD_START_Y, core.ROD_START_Y);
    const y0 = sim.getBall().y;
    // raise both ends by ~6 units gradually
    let h = core.ROD_START_Y;
    for (let i = 0; i < 240; i++) { h = Math.min(core.ROD_START_Y + 6, h + 0.03); sim.step(h, h); }
    const y1 = sim.getBall().y;
    assert(y1 > y0 + 4, 'ball should rise with the rod: ' + y0.toFixed(2) + ' -> ' + y1.toFixed(2));
    sim.free();
  });

  console.log('Ice Cold Beer core tests complete');
})();
