const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC_PATH = path.join(__dirname, '..', 'casino-level.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

function makeSandbox(initialStorage = {}) {
  const store = Object.assign({}, initialStorage);
  const listeners = [];
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
