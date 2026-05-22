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
    globalThis: { localStorage },
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

run('loadState returns 0 totalXp for missing key', () => {
  const { Level } = makeSandbox();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Level._loadState())), { totalXp: 0 });
});

run('loadState reads persisted totalXp', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': JSON.stringify({ totalXp: 1234 }) });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Level._loadState())), { totalXp: 1234 });
});

run('loadState handles malformed JSON by returning default', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': 'not json' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Level._loadState())), { totalXp: 0 });
});

run('loadState handles wrong shape by returning default', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': JSON.stringify({ foo: 'bar' }) });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Level._loadState())), { totalXp: 0 });
});

run('saveState writes serialized totalXp', () => {
  const { Level, localStorage } = makeSandbox();
  Level._saveState({ totalXp: 500 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 500 }));
});

run('saveState clamps negative totalXp to 0', () => {
  const { Level, localStorage } = makeSandbox();
  Level._saveState({ totalXp: -50 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 0 }));
});

run('loadState handles non-finite totalXp by returning default', () => {
  // Infinity serializes to null inside JSON.stringify — emulate the bad-data shape directly.
  const a = makeSandbox({ 'casino.level.v1': '{"totalXp": null}' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.Level._loadState())), { totalXp: 0 });
  const b = makeSandbox({ 'casino.level.v1': '{"totalXp": "fifty"}' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(b.Level._loadState())), { totalXp: 0 });
});

run('applyEntry awards floor(bet) XP and does not change level when below threshold', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 25.7, win: 0, note: null, ts: 1 });
  assert.strictEqual(r.xpGain, 25);
  assert.strictEqual(r.oldLevel, 1);
  assert.strictEqual(r.newLevel, 1);
  assert.strictEqual(r.reward, 0);
});

run('applyEntry detects single level-up and returns reward', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 150, win: 0, note: null, ts: 1 });
  assert.strictEqual(r.xpGain, 150);
  assert.strictEqual(r.oldLevel, 1);
  assert.strictEqual(r.newLevel, 2);
  assert.strictEqual(r.reward, 100);
});

run('applyEntry detects multi-level jump and sums rewards', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 1000, win: 0, note: null, ts: 1 });
  assert.strictEqual(r.newLevel, 4);
  assert.strictEqual(r.reward, 450); // 100 + 150 + 200
});

run('applyEntry skips BOT entries (no XP, no reward)', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 500, win: 0, note: 'BOT', ts: 1 });
  assert.strictEqual(r.xpGain, 0);
  assert.strictEqual(r.newLevel, 1);
  assert.strictEqual(r.reward, 0);
});

run('applyEntry skips BOT-prefixed notes (case-insensitive, word boundary)', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._applyEntry({ bet: 500, note: 'bot' }).xpGain, 0);
  assert.strictEqual(Level._applyEntry({ bet: 500, note: 'BOT chat' }).xpGain, 0);
  // 'BOTTOM' is not a bot note (no word boundary after BOT)
  assert.strictEqual(Level._applyEntry({ bet: 500, note: 'BOTTOM' }).xpGain, 500);
});

run('applyEntry treats 0/negative/NaN bet as 0 XP', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._applyEntry({ bet: 0 }).xpGain, 0);
  assert.strictEqual(Level._applyEntry({ bet: -10 }).xpGain, 0);
  assert.strictEqual(Level._applyEntry({ bet: NaN }).xpGain, 0);
});

run('applyEntry persists updated totalXp to storage', () => {
  const { Level, localStorage } = makeSandbox();
  Level._applyEntry({ bet: 50 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 50 }));
  Level._applyEntry({ bet: 30 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 80 }));
});

run('applyEntry caps at level 99 and drops excess XP', () => {
  // Set totalXp to one short of MAX cumulative; gain a huge amount.
  const { Level, localStorage } = makeSandbox({
    'casino.level.v1': JSON.stringify({ totalXp: 2_535_300 }),
  });
  const r = Level._applyEntry({ bet: 1_000_000_000 });
  assert.strictEqual(r.newLevel, 99);
  // Persisted totalXp must equal the threshold to reach 99 exactly (no overflow stored).
  const persisted = JSON.parse(localStorage._store['casino.level.v1']);
  assert.strictEqual(persisted.totalXp, 2_535_302);
});

run('applyEntry returns actually-applied xpGain on cap (not raw input)', () => {
  const { Level } = makeSandbox({
    'casino.level.v1': JSON.stringify({ totalXp: 2_535_300 }),
  });
  const r = Level._applyEntry({ bet: 1_000_000_000 });
  // Only 2 XP was actually applied (2_535_302 - 2_535_300).
  assert.strictEqual(r.xpGain, 2);
});
