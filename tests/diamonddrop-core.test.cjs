const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'diamonddrop.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'diamonddrop.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, Number, Float32Array, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const core = sandbox.globalThis.DiamondDropCore;
assert(core, 'DiamondDropCore must be exported');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
async function runAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function binom(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return Math.round(r);
}

run('bucket counts are exactly binomial(12) and sum to 4096', () => {
  assert.strictEqual(core.COUNTS.length, 13);
  assert.strictEqual(core.COUNTS.reduce((a, b) => a + b, 0), 4096);
  for (let i = 0; i < 13; i++) {
    assert.strictEqual(core.COUNTS[i], binom(12, i), `count ${i}`);
  }
  const probSum = core.PROBS.reduce((a, b) => a + b, 0);
  assert(Math.abs(probSum - 1) < 1e-12, 'probabilities must sum to 1');
});

run('multiplier tables: 13 entries, symmetric, for every risk', () => {
  for (const risk of core.RISKS) {
    const t = core.MULTS[risk];
    assert(Array.isArray(t) && t.length === 13, `${risk} length`);
    for (let i = 0; i < 13; i++) {
      assert.strictEqual(t[i], t[12 - i], `${risk} symmetry at ${i}`);
      assert(t[i] > 0, `${risk} positive at ${i}`);
    }
  }
});

run('RTP is exactly within [0.97, 0.99] for every risk (closed form)', () => {
  for (const risk of core.RISKS) {
    const rtp = core.rtp(risk);
    assert(rtp >= 0.97 && rtp <= 0.99,
      `${risk} RTP ${rtp.toFixed(4)} out of [0.97, 0.99]`);
  }
});

run('pickBucket maps [0,1) onto buckets by the exact integer CDF', () => {
  // first value of 4096 -> bucket 0 (count 1)
  assert.strictEqual(core.pickBucket(0), 0);
  assert.strictEqual(core.pickBucket(0.5 / 4096), 0);
  // next 12 values -> bucket 1
  assert.strictEqual(core.pickBucket(1.5 / 4096), 1);
  assert.strictEqual(core.pickBucket(12.5 / 4096), 1);
  // boundary into bucket 2 at cumulative 13
  assert.strictEqual(core.pickBucket(13.5 / 4096), 2);
  // center + top
  assert.strictEqual(core.pickBucket(0.5), 6);
  assert.strictEqual(core.pickBucket(0.999999), 12);
  assert.strictEqual(core.pickBucket(4095.5 / 4096), 12);
  // garbage clamps
  assert.strictEqual(core.pickBucket(-1), 0);
  assert.strictEqual(core.pickBucket(NaN), 0);
});

run('pickBucket is a pure function of its rng input', () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 2000; i++) {
    const v = rng();
    assert.strictEqual(core.pickBucket(v), core.pickBucket(v));
  }
});

run('empirical pick distribution tracks binomial within 2%', () => {
  const rng = mulberry32(7);
  const N = 200000;
  const counts = new Array(13).fill(0);
  for (let i = 0; i < N; i++) counts[core.pickBucket(rng())]++;
  for (let i = 0; i < 13; i++) {
    const expected = core.PROBS[i];
    const got = counts[i] / N;
    assert(Math.abs(got - expected) < 0.02, `bucket ${i}: ${got} vs ${expected}`);
  }
});

run('payout = bet x multiplier, rounded to cents', () => {
  assert.strictEqual(core.payout(6, 'medium', 100), 55);    // 0.55x
  assert.strictEqual(core.payout(0, 'high', 10), 1700);     // 170x
  assert.strictEqual(core.payout(12, 'low', 25), 200);      // 8x
  assert.strictEqual(core.payout(5, 'medium', 33), 28.05);  // 0.85 * 33
});

run('board geometry: 102 pegs in 12 rows, buckets aligned', () => {
  const pegs = core.pegPositions();
  assert.strictEqual(pegs.length, 102); // sum 3..14
  assert.strictEqual(pegs.filter(p => p.row === 0).length, 3);
  assert.strictEqual(pegs.filter(p => p.row === 11).length, 14);
  assert.strictEqual(core.bucketCenterX(6), 0);
  assert.strictEqual(core.bucketCenterX(0), -6);
  assert.strictEqual(core.bucketCenterX(12), 6);
});

/* ---------- THE REAL PHYSICS TEST ----------
   Runs the actual Rapier search engine headlessly (same code the page
   executes) and asserts that for a spread of target buckets the found
   trajectory genuinely lands in the target, with real peg contacts
   recorded along the way. Skipped (loudly) if the npm package is not
   installed — `npm i --no-save @dimforge/rapier3d-compat@0.12.0`. */
(async () => {
  let RAPIER = null;
  try {
    RAPIER = require('@dimforge/rapier3d-compat');
  } catch (e) {
    console.log('SKIP physics search test (rapier3d-compat not installed)');
    console.log('Diamond Drop core tests complete');
    return;
  }
  await RAPIER.init();

  await runAsync('physics search finds real trajectories into every requested bucket', async () => {
    const sim = core.createPhysicsSim(RAPIER);
    const rng = mulberry32(1234);
    const targets = [0, 2, 4, 6, 8, 10, 12];
    let nudgedCount = 0;
    for (const target of targets) {
      const traj = sim.findTrajectory(target, rng);
      assert.strictEqual(traj.bucket, target, `target ${target} -> landed ${traj.bucket}`);
      assert(traj.n > 60, `target ${target}: trajectory too short (${traj.n} steps)`);
      assert(traj.hits.length >= 3, `target ${target}: only ${traj.hits.length} contacts — not a real tumble`);
      const pegContacts = traj.hits.filter(h => h.peg >= 0).length;
      assert(pegContacts >= 2, `target ${target}: needs real peg contacts, got ${pegContacts}`);
      if (traj.nudged) nudgedCount++;
      // trajectory stays inside the walls
      for (let i = 0; i < traj.n; i++) {
        const x = traj.xs[i * 2];
        assert(Math.abs(x) < core.BOARD.wallX + 0.5, `target ${target}: x escaped at step ${i}`);
      }
    }
    console.log(`  (nudged ${nudgedCount}/${targets.length} — lower is better, any is acceptable)`);
    sim.free();
  });

  await runAsync('center bucket lands without the nudge in a reasonable attempt budget', async () => {
    const sim = core.createPhysicsSim(RAPIER);
    const rng = mulberry32(99);
    const traj = sim.findTrajectory(6, rng);
    assert.strictEqual(traj.bucket, 6);
    assert(!traj.nudged, 'center bucket should be findable without the safety net');
    sim.free();
  });

  await runAsync('async search produces the same outcome as sync (yielding does not bias results)', async () => {
    const sim = core.createPhysicsSim(RAPIER);
    // SAME starting seed for both runs — async search must produce the
    // same trajectory in the same attempt count so the UI yield can't
    // accidentally change the physics outcome.
    for (const target of [0, 6, 12]) {
      const rngS = mulberry32(target + 100);
      const rngA = mulberry32(target + 100);
      const syncRun = sim.findTrajectory(target, rngS);
      const asyncRun = await sim.findTrajectoryAsync(target, rngA, () => Promise.resolve());
      assert.strictEqual(asyncRun.bucket, syncRun.bucket, `${target}: bucket`);
      assert.strictEqual(asyncRun.attempts, syncRun.attempts, `${target}: attempts`);
      assert.strictEqual(asyncRun.n, syncRun.n, `${target}: trajectory length`);
    }
    sim.free();
  });

  console.log('Diamond Drop core tests complete');
})();
