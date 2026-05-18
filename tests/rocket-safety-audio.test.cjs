const fs = require('fs');

const html = fs.readFileSync('rocket.html', 'utf8');

function assertMatch(pattern, label) {
  if (!pattern.test(html)) {
    throw new Error(`${label}: missing ${pattern}`);
  }
  console.log(`PASS ${label}`);
}

assertMatch(/const POST_CRASH_BET_LOCK_MS\s*=\s*1000;/, 'Rocket has a one-second post-crash bet lock constant');
assertMatch(/function betSafetyLocked\(/, 'Rocket exposes a post-crash bet lock helper');
assertMatch(/function armPostCrashBetLock\(/, 'Rocket arms the bet lock on bust');
assertMatch(/const canPlace\s*=\s*phase === 'betting' && !localBetInRound && !betSafetyLocked\(\)/, 'Rocket disables place-bet controls while crash is settling');
assertMatch(/if \(betSafetyLocked\(\)\) \{[\s\S]*?return;/, 'Rocket startRound refuses clicks during the post-crash lock');
assertMatch(/if \(betSafetyLocked\(\)\) return;[\s\S]*?State\.lastAutoBetRoundId = round\.roundId;/, 'Rocket auto-bet waits through the lock instead of burning the next round');
assertMatch(/const THRUST_VOLUME_BOOST\s*=\s*1\.[3-9]/, 'Rocket thrust engine has an explicit volume boost');
assertMatch(/const vol = sfxVolume\(\) \* THRUST_VOLUME_BOOST;/, 'Rocket thrust boost is scoped to the engine layer');
