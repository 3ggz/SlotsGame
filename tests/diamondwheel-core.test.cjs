const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'diamondwheel.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'diamondwheel.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const core = sandbox.globalThis.DiamondWheelCore;
assert(core, 'DiamondWheelCore must be exported');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// Deterministic RNG for the Monte-Carlo check.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXPECTED_COUNTS = { x1: 24, x2: 15, x5: 7, x10: 4, x20: 2, JOKER: 1, FLAG: 1 };
const EXPECTED_RTP = {
  x1: (24 / 54) * 2,
  x2: (15 / 54) * 3,
  x5: (7 / 54) * 6,
  x10: (4 / 54) * 11,
  x20: (2 / 54) * 21,
  JOKER: (1 / 54) * 46,
  FLAG: (1 / 54) * 46,
};

run('wheel has exactly 54 segments with the canonical distribution', () => {
  assert.strictEqual(core.SEGMENTS.length, 54);
  const counts = {};
  for (const s of core.SEGMENTS) counts[s] = (counts[s] || 0) + 1;
  assert.deepStrictEqual(counts, EXPECTED_COUNTS);
});

run('rare symbols are spread out (no adjacent duplicates above x2)', () => {
  for (let i = 0; i < 54; i++) {
    const a = core.SEGMENTS[i];
    const b = core.SEGMENTS[(i + 1) % 54];
    if (a === b) assert(a === 'x1' || a === 'x2', `adjacent duplicate ${a} at ${i}`);
  }
});

run('pickLanding maps [0,1) uniformly onto 0..53 and clamps garbage', () => {
  assert.strictEqual(core.pickLanding(0), 0);
  assert.strictEqual(core.pickLanding(0.999999), 53);
  assert.strictEqual(core.pickLanding(0.5), 27);
  assert.strictEqual(core.pickLanding(NaN), 0);
  assert.strictEqual(core.pickLanding(-1), 0);
  for (let i = 0; i < 54; i++) {
    assert.strictEqual(core.pickLanding((i + 0.5) / 54), i);
  }
});

run('targetRotation / segmentAtRotation are exact inverses across all 54 segments', () => {
  for (let i = 0; i < 54; i++) {
    for (const jit of [-0.3, -0.15, 0, 0.15, 0.3]) {
      for (const turns of [0, 5, 8]) {
        const rho = core.targetRotation(i, turns, jit);
        assert.strictEqual(core.segmentAtRotation(rho), i,
          `segment ${i} turns ${turns} jitter ${jit}`);
      }
    }
  }
});

run('resolveSpin pays a single winning spot at N:1', () => {
  // segment 13 is x20 in the canonical layout
  assert.strictEqual(core.SEGMENTS[13], 'x20');
  const r = core.resolveSpin(13, { x20: 10 });
  assert.strictEqual(r.symbol, 'x20');
  assert.strictEqual(r.totalStaked, 10);
  assert.strictEqual(r.grossReturn, 210); // stake * (20+1)
  assert.strictEqual(r.net, 200);
});

run('resolveSpin loses a single non-matching spot', () => {
  assert.strictEqual(core.SEGMENTS[1], 'x1');
  const r = core.resolveSpin(1, { x5: 25 });
  assert.strictEqual(r.symbol, 'x1');
  assert.strictEqual(r.totalStaked, 25);
  assert.strictEqual(r.grossReturn, 0);
  assert.strictEqual(r.net, -25);
});

run('resolveSpin settles mixed bets against one landed symbol', () => {
  // land on x1; bets on x1 + x10 + JOKER
  const r = core.resolveSpin(1, { x1: 50, x10: 20, JOKER: 5 });
  assert.strictEqual(r.totalStaked, 75);
  assert.strictEqual(r.grossReturn, 100); // 50 * (1+1)
  assert.strictEqual(r.net, 25);
});

run('resolveSpin pays JOKER and FLAG at 45:1', () => {
  assert.strictEqual(core.SEGMENTS[0], 'JOKER');
  assert.strictEqual(core.SEGMENTS[27], 'FLAG');
  const j = core.resolveSpin(0, { JOKER: 2 });
  assert.strictEqual(j.grossReturn, 92);
  assert.strictEqual(j.net, 90);
  const f = core.resolveSpin(27, { FLAG: 1, x1: 10 });
  assert.strictEqual(f.grossReturn, 46);
  assert.strictEqual(f.net, 35);
});

run('outcome is a pure function of the RNG value (animation-independent)', () => {
  const rng = mulberry32(99);
  for (let k = 0; k < 1000; k++) {
    const v = rng();
    const a = core.pickLanding(v);
    const b = core.pickLanding(v);
    assert.strictEqual(a, b);
    assert(a >= 0 && a < 54);
  }
});

run('Monte-Carlo: realized per-symbol RTP matches the paytable within 1.5%', () => {
  const N = 400000;
  const rng = mulberry32(1337);
  const returned = Object.fromEntries(core.SYMBOLS.map(s => [s, 0]));
  for (let k = 0; k < N; k++) {
    const idx = core.pickLanding(rng());
    const sym = core.SEGMENTS[idx];
    returned[sym] += core.PAYS[sym] + 1; // $1 staked on every symbol every spin
  }
  for (const s of core.SYMBOLS) {
    const rtp = returned[s] / N;
    const diff = Math.abs(rtp - EXPECTED_RTP[s]);
    assert(diff < 0.015, `${s}: realized ${rtp.toFixed(4)} vs expected ${EXPECTED_RTP[s].toFixed(4)} (diff ${diff.toFixed(4)})`);
  }
});

console.log('Diamond Wheel core tests complete');
