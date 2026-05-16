const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'lucky7saloon.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'lucky7saloon.html must contain a CORE TESTABLE API block');

const sandbox = {
  console,
  Math,
  setTimeout,
  clearTimeout,
  globalThis: {},
};
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const core = sandbox.globalThis.Lucky7Core;
assert(core, 'Lucky7Core must be exported');

function sym(id) {
  return { id };
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

run('calculates Megaways product from reel heights', () => {
  assert.strictEqual(core.calcWays([2, 4, 7, 6, 5, 3]), 5040);
  assert.strictEqual(core.calcWays([7, 7, 7, 7, 7, 7]), 117649);
});

run('awards only left-to-right adjacent ways from reel 1', () => {
  const grid = [
    [sym('seven'), sym('seven')],
    [sym('wild'), sym('seven'), sym('king')],
    [sym('seven'), sym('bar')],
    [sym('seven'), sym('queen')],
    [sym('ace'), sym('bar')],
    [sym('seven'), sym('seven')],
  ];
  const result = core.evaluateWays(grid, 2);
  const sevenWin = result.wins.find(win => win.symbolId === 'seven');
  assert(sevenWin, 'expected seven win');
  assert.strictEqual(sevenWin.reels, 4);
  assert.strictEqual(sevenWin.ways, 4);
  assert.strictEqual(sevenWin.amount, core.PAYTABLE.seven[4] * 4 * 2);
  assert.strictEqual(result.wins.some(win => win.reels === 6), false);
});

run('pays pure wild ways once as the top symbol only', () => {
  const grid = [
    [sym('wild')],
    [sym('wild')],
    [sym('wild')],
    [sym('ace')],
    [sym('king')],
    [sym('queen')],
  ];
  const result = core.evaluateWays(grid, 1);
  assert.strictEqual(result.wins.length, 1);
  assert.strictEqual(result.wins[0].symbolId, 'seven');
  assert.strictEqual(result.wins[0].reels, 3);
  assert.strictEqual(result.wins[0].ways, 1);
  assert.strictEqual(result.amount, core.PAYTABLE.seven[3]);
});

run('identifies scatter trigger spin awards', () => {
  assert.deepStrictEqual(plain(core.getFreeSpinAward(3)), { triggers: false, spins: 0 });
  assert.deepStrictEqual(plain(core.getFreeSpinAward(4)), { triggers: true, spins: 8 });
  assert.deepStrictEqual(plain(core.getFreeSpinAward(5)), { triggers: true, spins: 10 });
  assert.deepStrictEqual(plain(core.getFreeSpinAward(6)), { triggers: true, spins: 12 });
});

run('keeps reel heights stable after cascade refill', () => {
  const rng = core.makeRng(1234);
  const grid = [
    [sym('seven'), sym('ace')],
    [sym('seven'), sym('king'), sym('wild')],
    [sym('seven'), sym('bar')],
    [sym('queen'), sym('jack')],
    [sym('ace'), sym('king')],
    [sym('bar'), sym('bell')],
  ];
  const result = core.evaluateWays(grid, 1);
  const next = core.applyCascade(grid, result.positions, rng);
  assert.deepStrictEqual(plain(next.map(reel => reel.length)), grid.map(reel => reel.length));
  assert(next.every(reel => reel.every(Boolean)), 'every reel position should be filled');
});

console.log('Lucky Seven Saloon core tests complete');
