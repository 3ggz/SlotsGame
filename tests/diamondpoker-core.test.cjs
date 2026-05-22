const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'diamondpoker.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'diamondpoker.html must contain a CORE TESTABLE API block');

const sandbox = {
  console,
  Math,
  globalThis: {},
};
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const core = sandbox.globalThis.DiamondPokerCore;
assert(core, 'DiamondPokerCore must be exported');

function c(rank, suit) {
  return { rank, suit };
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

run('recognizes a royal flush as the top 800x hand', () => {
  const result = core.evaluateHand([
    c('10', 'hearts'),
    c('J', 'hearts'),
    c('Q', 'hearts'),
    c('K', 'hearts'),
    c('A', 'hearts'),
  ]);
  assert.strictEqual(result.key, 'royal_flush');
  assert.strictEqual(result.label, 'Royal Flush');
  assert.strictEqual(result.multiplier, 800);
});

run('recognizes ace-low straights without treating A-2-3-4-5 as royal', () => {
  const result = core.evaluateHand([
    c('A', 'spades'),
    c('2', 'clubs'),
    c('3', 'diamonds'),
    c('4', 'hearts'),
    c('5', 'spades'),
  ]);
  assert.strictEqual(result.key, 'straight');
  assert.strictEqual(result.label, 'Straight');
  assert.strictEqual(result.multiplier, 4);
});

run('pays only pairs of jacks or better for one-pair hands', () => {
  const jacks = core.evaluateHand([
    c('J', 'spades'),
    c('J', 'diamonds'),
    c('9', 'clubs'),
    c('5', 'hearts'),
    c('2', 'spades'),
  ]);
  const tens = core.evaluateHand([
    c('10', 'spades'),
    c('10', 'diamonds'),
    c('9', 'clubs'),
    c('5', 'hearts'),
    c('2', 'spades'),
  ]);
  assert.strictEqual(jacks.key, 'jacks_or_better');
  assert.strictEqual(jacks.multiplier, 1);
  assert.strictEqual(tens.key, 'nothing');
  assert.strictEqual(tens.multiplier, 0);
});

run('distinguishes full house, flush, straight, and four of a kind', () => {
  assert.strictEqual(core.evaluateHand([
    c('9', 'spades'), c('9', 'hearts'), c('9', 'clubs'), c('K', 'spades'), c('K', 'diamonds'),
  ]).key, 'full_house');
  assert.strictEqual(core.evaluateHand([
    c('2', 'clubs'), c('6', 'clubs'), c('8', 'clubs'), c('J', 'clubs'), c('K', 'clubs'),
  ]).key, 'flush');
  assert.strictEqual(core.evaluateHand([
    c('6', 'clubs'), c('7', 'spades'), c('8', 'hearts'), c('9', 'diamonds'), c('10', 'clubs'),
  ]).key, 'straight');
  assert.strictEqual(core.evaluateHand([
    c('Q', 'clubs'), c('Q', 'spades'), c('Q', 'hearts'), c('Q', 'diamonds'), c('3', 'clubs'),
  ]).key, 'four_kind');
});

run('calculates gross payout and net result from a finished hand', () => {
  const settled = core.settleHand([
    c('9', 'spades'),
    c('9', 'hearts'),
    c('9', 'clubs'),
    c('K', 'spades'),
    c('K', 'diamonds'),
  ], 5);
  assert.strictEqual(settled.outcome.key, 'full_house');
  assert.strictEqual(settled.gross, 45);
  assert.strictEqual(settled.net, 40);
});

run('draw replaces unheld cards and keeps held cards in place', () => {
  const hand = [
    c('A', 'spades'),
    c('A', 'hearts'),
    c('4', 'clubs'),
    c('7', 'diamonds'),
    c('9', 'clubs'),
  ];
  const deck = [
    c('K', 'spades'),
    c('Q', 'spades'),
    c('J', 'spades'),
  ];
  const result = core.drawReplacementCards(hand, [true, true, false, false, false], deck);
  assert.deepStrictEqual(result.hand, [
    c('A', 'spades'),
    c('A', 'hearts'),
    c('K', 'spades'),
    c('Q', 'spades'),
    c('J', 'spades'),
  ]);
  assert.strictEqual(result.drawn, 3);
  assert.deepStrictEqual(result.remainingDeck, []);
});

console.log('Diamond Draw Poker core tests complete');
