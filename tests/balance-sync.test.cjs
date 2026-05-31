// Regression tests for cross-device balance sync in casino-account.js.
// Verifies the wiring stays in place — a future edit that drops any of
// these pieces would silently regress the "same account, same chips on
// every device" guarantee.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'casino-account.js'), 'utf8');

function run(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); throw e; }
}

run('balance sync mirrors casino.balance to users/{uid}.balance', () => {
  assert(/const SYNCED_KEY_PREFIX = 'casino\.balance\.synced:';/.test(src),
    'per-UID synced snapshot key prefix should be casino.balance.synced:');
  assert(/function startBalanceSync\(uid\)/.test(src),
    'startBalanceSync(uid) must exist');
  assert(/function stopBalanceSync\(\)/.test(src),
    'stopBalanceSync() must exist');
  assert(/balance:\s*increment\(delta\)/.test(src),
    'outgoing writes must use increment(delta) so concurrent device writes compose');
});

run('balance sync only runs for non-anonymous users', () => {
  assert(/if \(u && !u\.isAnonymous\) startBalanceSync\(u\.uid\);/.test(src),
    'auth listener should call startBalanceSync only for non-anon users');
  assert(/else stopBalanceSync\(\);/.test(src),
    'auth listener should call stopBalanceSync when transitioning to anon/signed-out');
});

run('first sync trusts remote when remote has a balance', () => {
  assert(/if \(lastSyncedBalance == null\)[\s\S]*writeLiveBalance\(remoteBal\)/.test(src),
    'first sync from this device must mirror remote balance into local');
});

run('first sync seeds remote when remote field is missing', () => {
  assert(/if \(remoteBal == null\)[\s\S]*setDoc\(doc\(db, 'users', uid\), \{[\s\S]*balance:\s*local/.test(src),
    'missing remote balance must be seeded from current local');
});

run('subsequent remote updates apply as a delta to preserve in-flight local changes', () => {
  assert(/const remoteDelta = remoteBal - lastSyncedBalance;/.test(src),
    'remote-driven updates must compute a delta against lastSyncedBalance');
  assert(/Math\.max\(0, Math\.round\(\(localBal \+ remoteDelta\) \* 100\) \/ 100\)/.test(src),
    'remote delta must be added to the LIVE local balance (not assigned), to preserve in-flight changes');
});

run('outgoing sync is debounced and flushed on page-hide / visibility-hidden', () => {
  assert(/const SYNC_DEBOUNCE_MS = 1500;/.test(src),
    'outgoing sync should debounce ~1.5 s');
  assert(/pendingSyncTimer = setTimeout\(flushBalanceSync, SYNC_DEBOUNCE_MS\);/.test(src),
    'local-balance watcher should schedule a debounced flush');
  assert(/window\.addEventListener\('pagehide', flushBalanceSync\);/.test(src),
    'pagehide should flush pending balance sync');
  assert(/visibilityState === 'hidden'\) flushBalanceSync\(\);/.test(src),
    'visibilitychange to hidden should flush pending balance sync');
});

console.log('Balance sync wiring tests complete');
