const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const rocket = read('rocket.html');
const roulette = read('roulette.html');
const plinko = read('plinko.html');
const bots = read('casino-bots.js');
const account = read('casino-account.js');
const sw = read('service-worker.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('Rocket caches hot control button queries and skips duplicate DOM writes', () => {
  assert(rocket.includes('const miniBetButtons = Array.from'), 'rocket should cache mini/bet buttons');
  assert(rocket.includes('const targetButtons = Array.from'), 'rocket should cache target buttons');
  assert(rocket.includes('State.controlsRenderKey === controlKey'), 'rocket controls should render only on state changes');
  assert(rocket.includes('State.activeCountRenderKey === key'), 'rocket active count should render only on count changes');
});

run('Roulette caches wheel geometry and winner pocket DOM state', () => {
  assert(roulette.includes('const wheelStageEl = document.querySelector'), 'roulette should cache the wheel stage element');
  assert(roulette.includes('function wheelMetrics()'), 'roulette should cache wheel metrics between resizes');
  assert(roulette.includes('State.winnerPocketEl'), 'roulette should retain the current winner pocket instead of querying all winners each frame');
});

run('Plinko animation loop sleeps while idle', () => {
  assert(plinko.includes('function plinkoWorkActive()'), 'plinko should detect active animation/physics work');
  assert(plinko.includes('if (plinkoWorkActive()) requestLoopNow();'), 'plinko should not keep scheduling idle frames');
  assert(plinko.includes('markBoardDirty();'), 'plinko state changes should wake and repaint the board');
});

run('Bot chat reply queue is bounded', () => {
  assert(bots.includes('const MAX_SCHEDULED_REPLIES'), 'bot reply queue should have a hard cap');
  assert(bots.includes('function pushScheduledReply'), 'bot replies should go through the capped queue');
});

run('Firebase live subscriptions back off on quota exhaustion', () => {
  assert(account.includes('const LIVE_BACKOFF_KEY'), 'account module should persist live-read backoff');
  assert(account.includes('function safeOnSnapshot'), 'live Firestore subscriptions should use a guarded wrapper');
  assert(account.includes('quota/resource exhausted'), 'resource exhaustion should produce one concise warning');
  assert(read('casino-jackpots.js').includes('const JACKPOT_BACKOFF_KEY'), 'jackpot transactions should also back off on quota exhaustion');
});

run('Service worker version and precache include all shipped game pages', () => {
  assert(sw.includes("const CACHE_VERSION = 'v78';"), 'service worker cache version should be bumped');
  ['dragontree.html', 'multihandblackjack.html', 'easycraps.html', 'standardcraps.html'].forEach(file => {
    assert(sw.includes(`'./${file}'`), `${file} should be in the precache list`);
  });
});

console.log('Performance guard tests complete');
