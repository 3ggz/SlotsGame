// Regression tests for:
//   1. Bots can NEVER trigger a jackpot for the local player.
//      Bot bets feed the pools (so growth looks real) but their
//      History.record entries are tagged 'BOT' and casino-jackpots.js
//      must skip the per-spin trigger roll for them.
//   2. The owner-only botsEnabled toggle still gates the whole bot
//      runtime — when off, casino-bots.js installs a stub and never
//      starts the population manager.
//   3. diamondpoker.html docks the casino-bots recent-wins banner
//      the same way every other game does (anchored into the page
//      layout instead of the default fixed top-58px overlay).

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const jackpotsSrc = fs.readFileSync(path.join(__dirname, '..', 'casino-jackpots.js'), 'utf8');
const botsSrc     = fs.readFileSync(path.join(__dirname, '..', 'casino-bots.js'),     'utf8');
const dpHtml      = fs.readFileSync(path.join(__dirname, '..', 'diamondpoker.html'),  'utf8');

function run(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); throw e; }
}

run('casino-jackpots skips trigger roll for BOT-noted bets', () => {
  assert(
    /isBotBet\s*=\s*note\s*&&\s*\/\^BOT\\b\/i\.test\(String\(note\)\)/.test(jackpotsSrc),
    'History.record wrapper should detect ^BOT\\b notes'
  );
  assert(
    /processBet\(String\(game\s*\|\|\s*'unknown'\),\s*betNum,\s*isBotBet\)/.test(jackpotsSrc),
    'isBotBet must be forwarded to processBet as the skipTrigger argument'
  );
  assert(
    /if \(!skipTrigger\)\s*\{[\s\S]*for \(const t of TIERS\)[\s\S]*Math\.random\(\) < t\.triggerPerSpin/.test(jackpotsSrc),
    'processBet must gate the per-tier trigger roll behind !skipTrigger'
  );
});

run('casino-bots always tags bot rounds with the BOT note', () => {
  assert(
    /window\.History\.record\(game,\s*bet,\s*net,\s*'BOT'\)/.test(botsSrc),
    "recordBotBet must call History.record with the literal 'BOT' note"
  );
  const allCalls = botsSrc.match(/window\.History\.record\([^)]*\)/g) || [];
  for (const call of allCalls) {
    assert(/['"]BOT['"]/.test(call), `Every bot History.record call must pass 'BOT' as the note (offender: ${call})`);
  }
});

run('owner-only botsEnabled toggle still gates the whole bot runtime', () => {
  assert(
    /localStorage\.getItem\('casino\.config\.botsEnabled'\)\s*===\s*'true'/.test(botsSrc),
    'botsEnabled flag must be read synchronously from localStorage at boot'
  );
  assert(
    /if \(!botsEnabled\) \{[\s\S]*window\.CasinoBots\s*=\s*\{[\s\S]*disabled:\s*true/.test(botsSrc),
    'When botsEnabled is false, casino-bots must install a no-op stub and return'
  );
});

run('diamondpoker docks the recent-wins banner like the other games', () => {
  assert(
    /window\.CB_BANNER_PLACEMENT\s*=\s*\{[^}]*anchor:\s*['"]\.cabinet['"]/.test(dpHtml),
    'diamondpoker.html should set CB_BANNER_PLACEMENT anchored to .cabinet'
  );
  const placementIdx = dpHtml.indexOf('CB_BANNER_PLACEMENT');
  const botsIdx      = dpHtml.indexOf('casino-bots.js');
  assert(placementIdx > 0 && botsIdx > 0 && placementIdx < botsIdx,
    'CB_BANNER_PLACEMENT must be set BEFORE casino-bots.js loads');
});

console.log('Bots / jackpots guard tests complete');
