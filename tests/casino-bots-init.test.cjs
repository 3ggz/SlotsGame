const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'casino-bots.js'), 'utf8');
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

run('scheduled bot replies are initialized before tick loop starts', () => {
  const scheduledAt = src.indexOf('const scheduledReplies = [];');
  const tickAt = src.indexOf('function tickOnce');
  const intervalAt = src.indexOf('setInterval(() => { if (leader) tickOnce(now()); }, 1000);');
  assert(scheduledAt > -1 && tickAt > -1 && intervalAt > -1, 'expected scheduled replies, tickOnce, and interval loop');
  assert(scheduledAt < tickAt, 'scheduledReplies must be initialized before tickOnce can flush replies');
  assert(scheduledAt < intervalAt, 'scheduledReplies must be initialized before the interval starts');
  assert(src.includes('const MAX_SCHEDULED_REPLIES'), 'scheduled replies should be bounded');
  assert(dragonTreeHtml.includes('casino-bots.js?v=78'), 'Dragon Tree should bypass stale cached bot scripts');
});

console.log('Casino bot init tests complete');
