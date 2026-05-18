const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    get length() { return store.size; },
    key(i) { return Array.from(store.keys())[i] || null; },
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}`);
}

const round = {
  roundId: 'rocket-test-1',
  index: 1,
  phase: 'betting',
  crashAt: 3,
  multiplier: 1,
};

const roster = [
  { id: 101, name: 'Mike', online: true, game: 'rocket', seedBalance: 2000, brokeUntil: 0, cashoutStyle: 'normal' },
  { id: 102, name: 'sarahb', online: true, game: 'rocket', seedBalance: 2400, brokeUntil: 0, cashoutStyle: 'conservative' },
];

const storage = makeStorage({
  'casino.bots.v5.roster': JSON.stringify(roster),
  'casino.bots.v5.leader': JSON.stringify({ id: 'other-tab', at: 1000000 }),
});
const intervals = [];

const context = {
  console,
  window: null,
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, className: '', appendChild() {}, set textContent(v) {} }; },
    head: { appendChild() {} },
    body: { appendChild() {} },
  },
  location: { pathname: '/rocket.html' },
  localStorage: storage,
  addEventListener() {},
  removeEventListener() {},
  setInterval(fn) { intervals.push(fn); return intervals.length; },
  clearInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  Date: class extends Date {
    static now() { return 1000000; }
  },
  Math: Object.create(Math),
  State: { activeRound: round, multiplier: 1 },
  getGlobalRound() { return round; },
  casinoNow() { return Date.now(); },
  seededCrashPoint() { return 3; },
  renderRecent() {},
  renderActiveCount() {},
  mergedCashouts() { return []; },
};
context.window = context;
context.Math.random = () => 0.01;

vm.createContext(context);
const code = fs.readFileSync(path.join(__dirname, '..', 'casino-bots.js'), 'utf8');
vm.runInContext(code, context, { filename: 'casino-bots.js' });

const state = context.window.CasinoBots.rocketRoundState(round.roundId);
assertEqual(state.total, 2, 'Rocket active counter includes all bots in room during betting');
assertEqual(state.left, 2, 'Rocket active counter treats all bot bettors as still in before launch');

round.phase = 'running';
round.multiplier = 2;
context.State.multiplier = 2;
for (const fn of intervals) {
  try { fn(); } catch (e) {}
}
const runningState = context.window.CasinoBots.rocketRoundState(round.roundId);
assertEqual(runningState.left, 0, 'Rocket active counter drops bots after their cashouts fire');
