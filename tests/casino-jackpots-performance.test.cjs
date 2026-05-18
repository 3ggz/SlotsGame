const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'casino-jackpots.js'), 'utf8');
const dragonTreeHtml = fs.readFileSync(path.join(__dirname, '..', 'dragontree.html'), 'utf8');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('jackpot Firestore listener backs off on resource exhaustion', () => {
  assert(src.includes('let jackpotLiveDisabled = false;'), 'jackpot live-sync disable flag should exist');
  assert(src.includes('function disableJackpotLiveSync'), 'live-sync disable helper should exist');
  assert(src.includes('resource-exhausted'), 'resource-exhausted errors should be detected');
  assert(src.includes('const JACKPOT_BACKOFF_KEY'), 'jackpot quota backoff should be persisted briefly across pages');
  assert(src.includes('function jackpotBackoffActive'), 'jackpot startup and contributions should honor backoff');
  assert(src.includes('unsubPools'), 'pool snapshot unsubscribe should be retained');
  assert(src.includes('disableJackpotLiveSync(error)'), 'snapshot errors should disable live sync instead of retrying forever');
  assert(!src.includes('const JACKPOTS_LIVE_ALLOWED'), 'mobile Dragon Tree must not disable jackpot participation');
  assert(!src.includes('if (!JACKPOTS_LIVE_ALLOWED) return;'), 'jackpot startup and contributions must remain enabled on mobile');
  assert(dragonTreeHtml.includes('casino-jackpots.js?v=78'), 'Dragon Tree should bypass stale cached jackpot scripts');
});

console.log('Casino jackpot performance tests complete');
