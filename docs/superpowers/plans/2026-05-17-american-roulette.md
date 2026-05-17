# American Roulette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `roulette.html`, an American roulette table with global Rocket-style shared rounds, full betting coverage, live side rails, lobby integration, and regression tests for roulette math.

**Architecture:** Keep roulette as one self-contained HTML page to match the existing casino games. Put deterministic outcome generation and bet resolution in a `CORE TESTABLE API` block exported as `window.RouletteCore`, then build DOM rendering and animation around those pure helpers. Extend `casino-account.js` with a `RouletteLive` surface that mirrors `RocketLive` and fails silently when Firebase or rules are unavailable.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Canvas-free DOM/CSS/SVG animation, localStorage, Firebase Firestore via existing `casino-account.js`, Node `vm` tests, Python `http.server` for manual browser verification.

---

## File Structure

- Create `roulette.html`: standalone roulette game, CSS, DOM, audio engine, global round loop, wheel animation, betting UI, rules modal, and `RouletteCore`.
- Create `tests/roulette-core.test.cjs`: Node `vm` tests that extract the core block from `roulette.html`.
- Modify `casino-account.js`: add `RouletteLive`, roulette presence key, roulette clock sync, round-win feed, and roulette chat.
- Modify `docs/firestore.rules`: allow append-only roulette wins/chat and owner-only roulette clock pings.
- Modify `index.html`: add roulette preview CSS and a roulette lobby card while preserving existing cards.
- Modify `service-worker.js`: bump cache version and precache `roulette.html`.
- Modify `manifest.webmanifest`: add Roulette shortcut and update description.

---

### Task 1: Roulette Core Tests

**Files:**
- Create: `tests/roulette-core.test.cjs`
- Create later in Task 2: `roulette.html`

- [ ] **Step 1: Write the failing test**

Create `tests/roulette-core.test.cjs` with tests for wheel order, color classification, deterministic outcomes, bet builders, payouts, `0`/`00` outside-bet losses, neighbors, and finals.

```js
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

run('uses American wheel order with 0 and 00', () => {
  assert.strictEqual(core.AMERICAN_WHEEL.length, 38);
  assert.deepStrictEqual(core.AMERICAN_WHEEL.slice(0, 6), ['0', '28', '9', '26', '30', '11']);
  assert(core.AMERICAN_WHEEL.includes('00'));
});

run('classifies roulette colors', () => {
  assert.strictEqual(core.numberColor('0'), 'green');
  assert.strictEqual(core.numberColor('00'), 'green');
  assert.strictEqual(core.numberColor('1'), 'red');
  assert.strictEqual(core.numberColor('2'), 'black');
});

run('returns stable deterministic pockets', () => {
  assert.strictEqual(core.seededPocket(0), core.seededPocket(0));
  assert.strictEqual(core.seededPocket(100), core.seededPocket(100));
  assert(core.AMERICAN_WHEEL.includes(core.seededPocket(54321)));
});

run('builds standard inside and outside bets', () => {
  assert.deepStrictEqual(numbersOf(core.createStraightBet('17', 5)), ['17']);
  assert.deepStrictEqual(numbersOf(core.createSplitBet('17', '20', 5)), ['17', '20']);
  assert.deepStrictEqual(numbersOf(core.createStreetBet(1, 5)), ['1', '2', '3']);
  assert.deepStrictEqual(numbersOf(core.createCornerBet(['1', '2', '4', '5'], 5)), ['1', '2', '4', '5']);
  assert.deepStrictEqual(numbersOf(core.createSixLineBet(1, 5)), ['1', '2', '3', '4', '5', '6']);
  assert.deepStrictEqual(numbersOf(core.createTopLineBet(5)), ['0', '00', '1', '2', '3']);
  assert.deepStrictEqual(numbersOf(core.createDozenBet(2, 5)), ['13','14','15','16','17','18','19','20','21','22','23','24']);
  assert.deepStrictEqual(numbersOf(core.createColumnBet(3, 5)), ['3','6','9','12','15','18','21','24','27','30','33','36']);
  assert.strictEqual(core.createOutsideBet('red', 5).numbers.length, 18);
});

run('resolves payouts including returned stake', () => {
  const bets = [
    core.createStraightBet('17', 5),
    core.createSplitBet('17', '20', 5),
    core.createOutsideBet('red', 10),
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
  assert.deepStrictEqual(bets.map(b => b.numbers[0]), ['14', '2', '0', '28', '9']);
  assert.strictEqual(bets.reduce((sum, b) => sum + b.amount, 0), 25);
});

run('builds finals as straight bets', () => {
  const bets = core.createFinalsBets(7, 5);
  assert.deepStrictEqual(bets.map(b => b.numbers[0]), ['7', '17', '27']);
  assert.strictEqual(bets.reduce((sum, b) => sum + b.amount, 0), 15);
});

console.log('Roulette core tests complete');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/roulette-core.test.cjs`  
Expected: FAIL because `roulette.html` does not exist yet.

- [ ] **Step 3: Continue to Task 2**

Do not write production roulette code before Step 2 has failed for the expected missing-file reason.

---

### Task 2: Core API And Game Page

**Files:**
- Create: `roulette.html`
- Test: `tests/roulette-core.test.cjs`

- [ ] **Step 1: Create `roulette.html` with the core block and page shell**

The file must load shared scripts at the top of `<body>` in this order:

```html
<script src="casino-audio.js"></script>
<script type="module" src="casino-account.js"></script>
<script src="casino-jackpots.js"></script>
```

Add a `/* CORE TESTABLE API START */` / `/* CORE TESTABLE API END */` block that exports:

```js
global.RouletteCore = {
  AMERICAN_WHEEL,
  RED_NUMBERS,
  BLACK_NUMBERS,
  numberColor,
  seededUnit,
  seededPocket,
  createStraightBet,
  createSplitBet,
  createStreetBet,
  createCornerBet,
  createSixLineBet,
  createTopLineBet,
  createDozenBet,
  createColumnBet,
  createOutsideBet,
  createNeighborsBets,
  createFinalsBets,
  resolveBets,
};
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node tests/roulette-core.test.cjs`  
Expected: PASS all roulette core tests.

- [ ] **Step 3: Build the playable UI**

Add the wheel-first DOM, betting felt, chips, undo/clear/rebet/double, global round loop, rules modal, chat, live side rails, and result animation. Use the pure helpers from `RouletteCore`; do not duplicate payout math in event handlers.

- [ ] **Step 4: Run core test again**

Run: `node tests/roulette-core.test.cjs`  
Expected: PASS all roulette core tests after UI code is added.

---

### Task 3: Live Roulette Hooks

**Files:**
- Modify: `casino-account.js`
- Modify: `docs/firestore.rules`

- [ ] **Step 1: Add no-op `RouletteLive` stub**

Add beside `window.RocketLive`:

```js
window.RouletteLive = {
  configured: false,
  playerLabel: () => 'Player',
  syncClock() { return Promise.resolve(0); },
  subscribeWins(roundId, fn) { try { fn([]); } catch (e) {} return () => {}; },
  recordWin() { return Promise.resolve(); },
  subscribeChat(fn) { try { fn([]); } catch (e) {} return () => {}; },
  sendChat() { return Promise.resolve(); },
};
```

- [ ] **Step 2: Add real Firebase methods**

Mirror Rocket helpers with `rouletteClock`, `rouletteRoundWins`, and `rouletteChat`. Use `waitForCurrentUser()`, `playerLabel(currentUser)`, `serverTimestamp()`, `addDoc()`, `collection()`, `query()`, `orderBy()`, `limit()`, and `onSnapshot()` exactly as Rocket does.

- [ ] **Step 3: Add roulette presence key**

Add `'roulette.html': 'roulette'` to `GAME_BY_FILE`.

- [ ] **Step 4: Update Firestore rules**

Add append-only rules for:

```text
/rouletteRoundWins/{roundId}/wins/{id}
/rouletteChat/{id}
/rouletteClock/{uid}
```

The win rule should require positive numeric `bet` and `payout`, string `roundId`, string `number`, string `color`, string `label`, and string `player`.

---

### Task 4: Lobby And PWA Integration

**Files:**
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `manifest.webmanifest`

- [ ] **Step 1: Add roulette preview CSS**

Add `.preview.roulette` styles near the other preview styles. Keep the preview CSS-only/SVG-like: gold wheel, red/black/green pockets, ball trail, small felt strip.

- [ ] **Step 2: Add lobby card**

Insert a card near Rocket:

```html
<a class="game-card" href="roulette.html" data-game="roulette">
  <div class="preview roulette">...</div>
  <div class="game-title">ROULETTE</div>
  <div class="game-tagline">GLOBAL AMERICAN WHEEL</div>
  <div class="game-desc">Join shared American roulette spins with 0 and 00, full inside and outside betting, quick covers, chat, and live table wins.</div>
  <div class="game-meta">
    <span class="meta-pill">GLOBAL</span>
    <span class="meta-pill">0 + 00</span>
    <span class="meta-pill hot">NEW</span>
  </div>
  <div class="play-cta">PLAY</div>
</a>
```

- [ ] **Step 3: Update PWA files**

In `service-worker.js`, bump `CACHE_VERSION` and add `./roulette.html` to `PRECACHE_URLS`.  
In `manifest.webmanifest`, update the description and add a Roulette shortcut.

---

### Task 5: Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run automated tests**

Run:

```powershell
node tests/roulette-core.test.cjs
node tests/lucky7saloon-core.test.cjs
```

Expected: both commands exit 0.

- [ ] **Step 2: Start or reuse local server**

Run from repo root if port 8080 is free:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

If port 8080 is busy, use another port and report it.

- [ ] **Step 3: Browser smoke test**

Open `http://localhost:8080/index.html`, navigate to Roulette, and verify:

- Page identity is `Diamond Casino - Roulette`.
- First meaningful screen is not blank.
- No framework error overlay.
- No relevant console errors after load.
- Betting controls accept chips during betting.
- Clear/undo/rebet/double alter visible chip stacks and balance.
- Betting locks during spin/result.
- Wheel animation lands on a visible result.
- Balance and history update after result.
- Mobile viewport has no overlapping primary controls.

- [ ] **Step 4: Final status**

Only claim completion after automated tests and browser smoke testing have fresh passing evidence.
