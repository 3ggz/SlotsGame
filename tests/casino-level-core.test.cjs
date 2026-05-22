const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC_PATH = path.join(__dirname, '..', 'casino-level.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

function makeSandbox(initialStorage = {}) {
  const store = Object.assign({}, initialStorage);
  const localStorage = {
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
    _store: store,
  };
  const sandbox = {
    console,
    Math,
    JSON,
    Date,
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
    localStorage,
    globalThis: {},
  };
  sandbox.window = sandbox.globalThis;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { sandbox, Level: sandbox.globalThis.CasinoLevel, localStorage };
}

function run(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}`); throw err; }
}

run('xpForLevel returns expected values for early levels', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._xpForLevel(1), 100);
  assert.strictEqual(Level._xpForLevel(2), 264);
  assert.strictEqual(Level._xpForLevel(10), 2512);
});

run('levelFromTotalXp clamps at level 1 floor', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._levelFromTotalXp(0), 1);
  assert.strictEqual(Level._levelFromTotalXp(99), 1);
  assert.strictEqual(Level._levelFromTotalXp(100), 2);
  assert.strictEqual(Level._levelFromTotalXp(364), 3);
});

run('levelFromTotalXp caps at 99', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._levelFromTotalXp(Number.MAX_SAFE_INTEGER), 99);
});

run('progressInLevel returns level + xpInLevel + xpForNext', () => {
  const { Level } = makeSandbox();
  const p = Level._progressInLevel(150);
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.xpInLevel, 50);
  assert.strictEqual(p.xpForNext, 264);
});

run('progressInLevel at max level returns xpForNext 0', () => {
  const { Level } = makeSandbox();
  const p = Level._progressInLevel(10_000_000);
  assert.strictEqual(p.level, 99);
  assert.strictEqual(p.xpForNext, 0);
});

run('get() returns derived state shape for the stub (totalXp=0)', () => {
  const { Level } = makeSandbox();
  const s = JSON.parse(JSON.stringify(Level.get()));
  assert.deepStrictEqual(s, { level: 1, xp: 0, xpInLevel: 0, xpForNext: 100, totalXp: 0 });
});

run('rewardForLevelUp = newLevel * 50', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._rewardForLevelUp(2), 100);
  assert.strictEqual(Level._rewardForLevelUp(11), 550);
  assert.strictEqual(Level._rewardForLevelUp(51), 2550);
});

run('totalRewardForJump sums rewards across all crossed levels', () => {
  const { Level } = makeSandbox();
  // 1 -> 4: rewards for L2 + L3 + L4 = 100 + 150 + 200 = 450
  assert.strictEqual(Level._totalRewardForJump(1, 4), 450);
  // same level -> 0
  assert.strictEqual(Level._totalRewardForJump(7, 7), 0);
  // 1 -> 99: sum of 50*(2+3+...+99)
  const expected = 50 * (99 * 100 / 2 - 1); // = 50 * 4949 = 247450
  assert.strictEqual(Level._totalRewardForJump(1, 99), expected);
});
