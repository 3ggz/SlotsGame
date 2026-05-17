const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'roulette.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'roulette.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, Date, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const core = sandbox.globalThis.RouletteCore;
assert(core, 'RouletteCore must be exported');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function numbersOf(bet) {
  return bet.numbers.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

run('uses American wheel order with 0 and 00', () => {
  assert.strictEqual(core.AMERICAN_WHEEL.length, 38);
  assert.deepStrictEqual(plain(core.AMERICAN_WHEEL.slice(0, 6)), ['0', '28', '9', '26', '30', '11']);
  assert(core.AMERICAN_WHEEL.includes('00'));
});

run('classifies roulette colors', () => {
  assert.strictEqual(core.numberColor('0'), 'green');
  assert.strictEqual(core.numberColor('00'), 'green');
  assert.strictEqual(core.numberColor('1'), 'red');
  assert.strictEqual(core.numberColor('2'), 'black');
  assert.strictEqual(core.numberColor('23'), 'red');
  assert.strictEqual(core.numberColor('27'), 'red');
  assert.strictEqual(core.numberColor('31'), 'black');
  assert.strictEqual(core.numberColor('35'), 'black');
});

run('returns stable deterministic pockets', () => {
  assert.strictEqual(core.seededPocket(0), core.seededPocket(0));
  assert.strictEqual(core.seededPocket(100), core.seededPocket(100));
  assert(core.AMERICAN_WHEEL.includes(core.seededPocket(54321)));
});

run('builds standard inside and outside bets', () => {
  assert.deepStrictEqual(plain(numbersOf(core.createStraightBet('17', 5))), ['17']);
  assert.deepStrictEqual(plain(numbersOf(core.createSplitBet('17', '20', 5))), ['17', '20']);
  assert.deepStrictEqual(plain(numbersOf(core.createStreetBet(1, 5))), ['1', '2', '3']);
  assert.deepStrictEqual(plain(numbersOf(core.createCornerBet(['1', '2', '4', '5'], 5))), ['1', '2', '4', '5']);
  assert.deepStrictEqual(plain(numbersOf(core.createSixLineBet(1, 5))), ['1', '2', '3', '4', '5', '6']);
  assert.deepStrictEqual(plain(numbersOf(core.createTopLineBet(5))), ['0', '00', '1', '2', '3']);
  assert.deepStrictEqual(plain(numbersOf(core.createDozenBet(2, 5))), ['13','14','15','16','17','18','19','20','21','22','23','24']);
  assert.deepStrictEqual(plain(numbersOf(core.createColumnBet(3, 5))), ['3','6','9','12','15','18','21','24','27','30','33','36']);
  assert.strictEqual(core.createOutsideBet('red', 5).numbers.length, 18);
});

run('rejects invalid split and corner geometry', () => {
  assert.throws(() => core.createSplitBet('17', '22', 5), /Invalid split/);
  assert.throws(() => core.createCornerBet(['1', '2', '3', '4'], 5), /Invalid corner/);
});

run('resolves payouts including returned stake', () => {
  const bets = [
    core.createStraightBet('17', 5),
    core.createSplitBet('17', '20', 5),
    core.createOutsideBet('black', 10),
  ];
  const result = core.resolveBets(bets, '17');
  assert.strictEqual(result.totalBet, 20);
  assert.strictEqual(result.grossPaid, 5 * 36 + 5 * 18 + 10 * 2);
  assert.strictEqual(result.net, result.grossPaid - result.totalBet);
});

run('makes outside bets lose on 0 and 00', () => {
  assert.strictEqual(core.resolveBets([core.createOutsideBet('red', 10)], '0').grossPaid, 0);
  assert.strictEqual(core.resolveBets([core.createOutsideBet('even', 10)], '00').grossPaid, 0);
});

run('builds quick-cover neighbors from wheel order', () => {
  const bets = core.createNeighborsBets('0', 5, 2);
  assert.deepStrictEqual(plain(bets.map(b => b.numbers[0])), ['14', '2', '0', '28', '9']);
  assert.strictEqual(bets.reduce((sum, b) => sum + b.amount, 0), 25);
});

run('builds finals as straight bets', () => {
  const bets = core.createFinalsBets(7, 5);
  assert.deepStrictEqual(plain(bets.map(b => b.numbers[0])), ['7', '17', '27']);
  assert.strictEqual(bets.reduce((sum, b) => sum + b.amount, 0), 15);
});

console.log('Roulette core tests complete');
