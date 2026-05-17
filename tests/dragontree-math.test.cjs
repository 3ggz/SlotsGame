const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'dragontree.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function readConstNumber(name) {
  const match = html.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`));
  assert(match, `${name} must be defined as a top-level constant`);
  return Number(match[1]);
}

function readConstArray(name) {
  const match = html.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`));
  assert(match, `${name} must be defined as a top-level array`);
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(`globalThis.value = ${match[1]};`, sandbox);
  return sandbox.globalThis.value;
}

const triggerChance = readConstNumber('BONUS_TRIGGER_CHANCE');
const prizes = readConstArray('PRIZES');
const revealWeights = readConstArray('REVEAL_COUNT_WEIGHTS');

const totalPrizeWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0);
const leafAverage = prizes.reduce((sum, prize) => sum + prize.mult * prize.weight, 0) / totalPrizeWeight;
const chanceForTier = (...tiers) =>
  prizes
    .filter(prize => tiers.includes(prize.tier))
    .reduce((sum, prize) => sum + prize.weight, 0) / totalPrizeWeight;
const revealWeightTotal = revealWeights.reduce((sum, item) => sum + item.weight, 0);
const averageRevealCount = revealWeights.reduce((sum, item) => sum + item.count * item.weight, 0) / revealWeightTotal;
const averageBonusPayout = leafAverage * averageRevealCount;

run('Lanternfall bonus does not trigger too frequently', () => {
  assert(triggerChance >= 0.10, 'bonus should still appear often enough to feel alive');
  assert(triggerChance <= 0.16, 'bonus trigger should be meaningfully below the old 25% rate');
});

run('lower lamps dominate the prize table', () => {
  assert(chanceForTier('common') >= 0.72, 'common low lamps should be most picks');
  assert(chanceForTier('rare', 'epic', 'legendary', 'mythic') <= 0.055, 'rare and higher lamps should be uncommon');
  assert(chanceForTier('legendary', 'mythic') <= 0.006, 'top lamps should feel special');
});

run('bonus payout is exciting but no longer runaway generous', () => {
  assert(leafAverage <= 2.1, `per-leaf average ${leafAverage.toFixed(2)}x is too high`);
  assert(averageRevealCount <= 3.55, `average reveal count ${averageRevealCount.toFixed(2)} is too high`);
  assert(averageBonusPayout >= 4.5, 'bonus round should still feel worthwhile');
  assert(averageBonusPayout <= 7.0, `average bonus ${averageBonusPayout.toFixed(2)}x is too high`);
  const grossReturn = triggerChance * averageBonusPayout;
  assert(grossReturn >= 0.75, 'overall return should not feel stingy');
  assert(grossReturn <= 0.98, `overall return ${grossReturn.toFixed(2)} is too loose`);
});

console.log('Dragon Tree math tests complete');
