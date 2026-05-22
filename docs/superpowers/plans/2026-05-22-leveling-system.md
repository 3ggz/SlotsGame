# Leveling System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a casino-wide bet-based XP and leveling system that grants chip rewards on level-up, surfaced via a compact progress bar in the existing balance UI and a brief slide-down toast on level-up.

**Architecture:** New `casino-level.js` (vanilla IIFE, classic `<script>`) sits alongside the existing shared modules. It subscribes to `History.onChange` (the wrap-order-safe seam in `casino-audio.js`), skips bot entries via the `^BOT` note convention, derives the current level from a single persisted scalar (`totalXp`), and on level-up credits chips to `casino.balance` and shows a toast. UI is mounted into a per-page `<div class="level-bar-slot"></div>` marker so each game can position the bar precisely. All CSS is injected once by the script (no per-page CSS edits).

**Tech Stack:** Vanilla JS (no module system; matches existing shared scripts), vanilla CSS injected at runtime, `localStorage`, `History` from `casino-audio.js`, Node CJS unit tests using the `vm` sandbox pattern from `tests/lucky7saloon-core.test.cjs`.

**Spec:** `docs/superpowers/specs/2026-05-22-leveling-system-design.md`

---

## File Plan

**New:**

- `casino-level.js` — single IIFE module. Sections inside the file:
  1. Constants (`STORAGE_KEY = 'casino.level.v1'`, `BALANCE_KEY = 'casino.balance'`, `MAX_LEVEL = 99`, `REWARD_PER_LEVEL = 50`, `CURVE_BASE = 100`, `CURVE_EXP = 1.4`).
  2. Pure helpers (`xpForLevel`, `levelFromTotalXp`, `progressInLevel`, `rewardForLevelUp`, `totalRewardForJump`).
  3. Storage layer (`loadState`, `saveState`).
  4. XP engine (`applyEntry(entry, opts)`).
  5. Public API on `window.CasinoLevel` (`get`, `onChange`, plus underscore-prefixed test seams).
  6. Browser-only side effects gated by `typeof document !== 'undefined'`: bar mount, toast mount, History subscription, `storage` event listener.
- `tests/casino-level-core.test.cjs` — Node CJS tests that load `casino-level.js` in a `vm` sandbox with mocked `localStorage` and exercise the pure helpers + the engine.

**Modified:**

- `index.html` — add `<script src="casino-level.js"></script>` and a `<div class="level-bar-slot"></div>` in `.balance-bar`.
- 14 game HTML files (`slots.html`, `kraken.html`, `lucky7saloon.html`, `dragontree.html`, `blackjack.html`, `multihandblackjack.html`, `roulette.html`, `rocket.html`, `plinko.html`, `mines.html`, `easycraps.html`, `standardcraps.html`, `craplesscraps.html`, `diamondpoker.html`) — add the script tag and the slot div.
- `service-worker.js` — add `'./casino-level.js'` to `PRECACHE_URLS`, bump `CACHE_VERSION` from `'v78'` to `'v79'`.
- `AGENTS.md` — add one paragraph to "Shared scripts" and one row to "Other localStorage keys in active use".

**Not modified:** `casino-audio.js`, `casino-account.js`, `casino-jackpots.js`, `casino-bots.js`, `casino-chat.js`, `manifest.webmanifest`, `launcher.html`.

---

## Task 1: Scaffold `casino-level.js` with pure helpers (curve + level + progress)

**Files:**
- Create: `casino-level.js`
- Create: `tests/casino-level-core.test.cjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/casino-level-core.test.cjs`:

```js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC_PATH = path.join(__dirname, '..', 'casino-level.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

function makeSandbox(initialStorage = {}) {
  const store = Object.assign({}, initialStorage);
  const listeners = [];
  const localStorage = {
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
    _store: store,
  };
  const sandbox = {
    console,
    Math,
    JSON,
    Date,
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
    localStorage,
    globalThis: {},
  };
  sandbox.window = sandbox.globalThis;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { sandbox, Level: sandbox.globalThis.CasinoLevel, localStorage };
}

function run(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}`); throw err; }
}

run('xpForLevel returns expected values for early levels', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._xpForLevel(1), 100);
  assert.strictEqual(Level._xpForLevel(2), 264);
  assert.strictEqual(Level._xpForLevel(10), 2512);
});

run('levelFromTotalXp clamps at level 1 floor', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._levelFromTotalXp(0), 1);
  assert.strictEqual(Level._levelFromTotalXp(99), 1);
  assert.strictEqual(Level._levelFromTotalXp(100), 2);
  assert.strictEqual(Level._levelFromTotalXp(364), 3);
});

run('levelFromTotalXp caps at 99', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._levelFromTotalXp(Number.MAX_SAFE_INTEGER), 99);
});

run('progressInLevel returns level + xpInLevel + xpForNext', () => {
  const { Level } = makeSandbox();
  const p = Level._progressInLevel(150);
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.xpInLevel, 50);
  assert.strictEqual(p.xpForNext, 264);
});

run('progressInLevel at max level returns xpForNext 0', () => {
  const { Level } = makeSandbox();
  const p = Level._progressInLevel(10_000_000);
  assert.strictEqual(p.level, 99);
  assert.strictEqual(p.xpForNext, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/casino-level-core.test.cjs`
Expected: FAIL with `ENOENT: no such file or directory, open '...casino-level.js'`.

- [ ] **Step 3: Implement minimal `casino-level.js`**

Create `casino-level.js`:

```js
/* ============================================================
   casino-level.js — Player leveling system
   ------------------------------------------------------------
   Bet-based XP. Players accrue XP for every wager (excluding
   bot entries). Level-ups grant chip rewards.
   See: docs/superpowers/specs/2026-05-22-leveling-system-design.md

   Public API (window.CasinoLevel):
     get()        -> { level, xp, xpInLevel, xpForNext, totalXp }
     onChange(fn) -> subscribe to state changes

   Underscore-prefixed members are test seams. Don't call from
   game code.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY      = 'casino.level.v1';
  const BALANCE_KEY      = 'casino.balance';
  const MAX_LEVEL        = 99;
  const REWARD_PER_LEVEL = 50;
  const CURVE_BASE       = 100;
  const CURVE_EXP        = 1.4;

  function xpForLevel(n) {
    if (n < 1) return 0;
    if (n >= MAX_LEVEL) return 0;
    return Math.round(CURVE_BASE * Math.pow(n, CURVE_EXP));
  }

  function levelFromTotalXp(totalXp) {
    let lvl = 1;
    let remaining = Math.max(0, Math.floor(totalXp));
    while (lvl < MAX_LEVEL) {
      const need = xpForLevel(lvl);
      if (remaining < need) break;
      remaining -= need;
      lvl++;
    }
    return lvl;
  }

  function progressInLevel(totalXp) {
    const lvl = levelFromTotalXp(totalXp);
    let consumed = 0;
    for (let i = 1; i < lvl; i++) consumed += xpForLevel(i);
    const xpInLevel = Math.max(0, Math.floor(totalXp) - consumed);
    const xpForNext = lvl >= MAX_LEVEL ? 0 : xpForLevel(lvl);
    return { level: lvl, xpInLevel, xpForNext };
  }

  const api = {
    get() {
      const totalXp = 0;
      const p = progressInLevel(totalXp);
      return { level: p.level, xp: totalXp, xpInLevel: p.xpInLevel, xpForNext: p.xpForNext, totalXp };
    },
    onChange(_fn) { /* implemented in a later task */ },

    _xpForLevel: xpForLevel,
    _levelFromTotalXp: levelFromTotalXp,
    _progressInLevel: progressInLevel,
  };

  global.CasinoLevel = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 5 `PASS` lines, no `FAIL`.

- [ ] **Step 5: Commit**

```bash
git add casino-level.js tests/casino-level-core.test.cjs
git commit -m "level: scaffold casino-level.js with pure curve helpers + tests"
```

---

## Task 2: Reward calculation (per-level + multi-level jumps)

**Files:**
- Modify: `casino-level.js`
- Modify: `tests/casino-level-core.test.cjs`

- [ ] **Step 1: Append failing tests**

Append to `tests/casino-level-core.test.cjs` (before any existing trailing `run('...')` block — order doesn't matter, just append at the end of file):

```js
run('rewardForLevelUp = newLevel * 50', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._rewardForLevelUp(2), 100);
  assert.strictEqual(Level._rewardForLevelUp(11), 550);
  assert.strictEqual(Level._rewardForLevelUp(51), 2550);
});

run('totalRewardForJump sums rewards across all crossed levels', () => {
  const { Level } = makeSandbox();
  // 1 -> 4: rewards for L2 + L3 + L4 = 100 + 150 + 200 = 450
  assert.strictEqual(Level._totalRewardForJump(1, 4), 450);
  // same level -> 0
  assert.strictEqual(Level._totalRewardForJump(7, 7), 0);
  // 1 -> 99: sum of 50*(2+3+...+99)
  const expected = 50 * (99 * 100 / 2 - 1); // = 50 * 4949 = 247450
  assert.strictEqual(Level._totalRewardForJump(1, 99), expected);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/casino-level-core.test.cjs`
Expected: FAIL with `TypeError: Level._rewardForLevelUp is not a function`.

- [ ] **Step 3: Implement reward helpers**

In `casino-level.js`, add these two functions immediately after `progressInLevel`:

```js
  function rewardForLevelUp(newLevel) {
    if (newLevel < 2 || newLevel > MAX_LEVEL) return 0;
    return newLevel * REWARD_PER_LEVEL;
  }

  function totalRewardForJump(oldLevel, newLevel) {
    let sum = 0;
    for (let n = Math.max(2, oldLevel + 1); n <= newLevel; n++) {
      sum += rewardForLevelUp(n);
    }
    return sum;
  }
```

Then add to the `api` object:

```js
    _rewardForLevelUp: rewardForLevelUp,
    _totalRewardForJump: totalRewardForJump,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 7 `PASS` lines, no `FAIL`.

- [ ] **Step 5: Commit**

```bash
git add casino-level.js tests/casino-level-core.test.cjs
git commit -m "level: add per-level + multi-level reward calculations"
```

---

## Task 3: Storage layer (loadState / saveState + malformed handling)

**Files:**
- Modify: `casino-level.js`
- Modify: `tests/casino-level-core.test.cjs`

- [ ] **Step 1: Append failing tests**

Append to `tests/casino-level-core.test.cjs`:

```js
run('loadState returns 0 totalXp for missing key', () => {
  const { Level } = makeSandbox();
  assert.deepStrictEqual(Level._loadState(), { totalXp: 0 });
});

run('loadState reads persisted totalXp', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': JSON.stringify({ totalXp: 1234 }) });
  assert.deepStrictEqual(Level._loadState(), { totalXp: 1234 });
});

run('loadState handles malformed JSON by returning default', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': 'not json' });
  assert.deepStrictEqual(Level._loadState(), { totalXp: 0 });
});

run('loadState handles wrong shape by returning default', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': JSON.stringify({ foo: 'bar' }) });
  assert.deepStrictEqual(Level._loadState(), { totalXp: 0 });
});

run('saveState writes serialized totalXp', () => {
  const { Level, localStorage } = makeSandbox();
  Level._saveState({ totalXp: 500 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 500 }));
});

run('saveState clamps negative totalXp to 0', () => {
  const { Level, localStorage } = makeSandbox();
  Level._saveState({ totalXp: -50 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 0 }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/casino-level-core.test.cjs`
Expected: FAIL with `TypeError: Level._loadState is not a function`.

- [ ] **Step 3: Implement storage layer**

In `casino-level.js`, add immediately after the constants block (before the pure helpers):

```js
  function loadState() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { totalXp: 0 };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.totalXp !== 'number' || !isFinite(parsed.totalXp)) {
        return { totalXp: 0 };
      }
      return { totalXp: Math.max(0, Math.floor(parsed.totalXp)) };
    } catch (e) {
      return { totalXp: 0 };
    }
  }

  function saveState(state) {
    try {
      const safe = { totalXp: Math.max(0, Math.floor((state && state.totalXp) || 0)) };
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (e) {
      // Quota errors, private mode, etc. — keep in-memory state.
    }
  }
```

Then add to the `api` object:

```js
    _loadState: loadState,
    _saveState: saveState,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 13 `PASS` lines.

- [ ] **Step 5: Commit**

```bash
git add casino-level.js tests/casino-level-core.test.cjs
git commit -m "level: persist totalXp to localStorage with malformed handling"
```

---

## Task 4: XP engine — `applyEntry` with BOT skip and level-up detection

**Files:**
- Modify: `casino-level.js`
- Modify: `tests/casino-level-core.test.cjs`

- [ ] **Step 1: Append failing tests**

Append to `tests/casino-level-core.test.cjs`:

```js
run('applyEntry awards floor(bet) XP and does not change level when below threshold', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 25.7, win: 0, note: null, ts: 1 });
  assert.strictEqual(r.xpGain, 25);
  assert.strictEqual(r.oldLevel, 1);
  assert.strictEqual(r.newLevel, 1);
  assert.strictEqual(r.reward, 0);
});

run('applyEntry detects single level-up and returns reward', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 150, win: 0, note: null, ts: 1 });
  assert.strictEqual(r.xpGain, 150);
  assert.strictEqual(r.oldLevel, 1);
  assert.strictEqual(r.newLevel, 2);
  assert.strictEqual(r.reward, 100);
});

run('applyEntry detects multi-level jump and sums rewards', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 1000, win: 0, note: null, ts: 1 });
  assert.strictEqual(r.newLevel, 4);
  assert.strictEqual(r.reward, 450); // 100 + 150 + 200
});

run('applyEntry skips BOT entries (no XP, no reward)', () => {
  const { Level } = makeSandbox();
  const r = Level._applyEntry({ bet: 500, win: 0, note: 'BOT', ts: 1 });
  assert.strictEqual(r.xpGain, 0);
  assert.strictEqual(r.newLevel, 1);
  assert.strictEqual(r.reward, 0);
});

run('applyEntry skips BOT-prefixed notes (case-insensitive, word boundary)', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._applyEntry({ bet: 500, note: 'bot' }).xpGain, 0);
  assert.strictEqual(Level._applyEntry({ bet: 500, note: 'BOT chat' }).xpGain, 0);
  // 'BOTTOM' is not a bot note (no word boundary after BOT)
  assert.strictEqual(Level._applyEntry({ bet: 500, note: 'BOTTOM' }).xpGain, 500);
});

run('applyEntry treats 0/negative/NaN bet as 0 XP', () => {
  const { Level } = makeSandbox();
  assert.strictEqual(Level._applyEntry({ bet: 0 }).xpGain, 0);
  assert.strictEqual(Level._applyEntry({ bet: -10 }).xpGain, 0);
  assert.strictEqual(Level._applyEntry({ bet: NaN }).xpGain, 0);
});

run('applyEntry persists updated totalXp to storage', () => {
  const { Level, localStorage } = makeSandbox();
  Level._applyEntry({ bet: 50 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 50 }));
  Level._applyEntry({ bet: 30 });
  assert.strictEqual(localStorage._store['casino.level.v1'], JSON.stringify({ totalXp: 80 }));
});

run('applyEntry caps at level 99 and drops excess XP', () => {
  // Set totalXp to one short of MAX cumulative; gain a huge amount.
  const { Level, localStorage } = makeSandbox({
    'casino.level.v1': JSON.stringify({ totalXp: 2_535_300 }),
  });
  const r = Level._applyEntry({ bet: 1_000_000_000 });
  assert.strictEqual(r.newLevel, 99);
  // Persisted totalXp must equal the threshold to reach 99 exactly (no overflow stored).
  const persisted = JSON.parse(localStorage._store['casino.level.v1']);
  assert.strictEqual(persisted.totalXp, 2_535_302);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/casino-level-core.test.cjs`
Expected: FAIL with `TypeError: Level._applyEntry is not a function`.

- [ ] **Step 3: Implement `applyEntry`**

In `casino-level.js`, add immediately after `totalRewardForJump`:

```js
  const BOT_NOTE_RE = /^BOT\b/i;

  function cumulativeXpToReach(level) {
    let sum = 0;
    for (let n = 1; n < level; n++) sum += xpForLevel(n);
    return sum;
  }

  function applyEntry(entry) {
    const note = entry && entry.note;
    if (note && BOT_NOTE_RE.test(String(note))) {
      const state = loadState();
      const p = progressInLevel(state.totalXp);
      return { xpGain: 0, oldLevel: p.level, newLevel: p.level, reward: 0, totalXp: state.totalXp };
    }
    const rawBet = entry ? Number(entry.bet) : 0;
    const gain = (!isFinite(rawBet) || rawBet <= 0) ? 0 : Math.floor(rawBet);

    const before = loadState();
    const oldLevel = levelFromTotalXp(before.totalXp);

    let nextTotal = before.totalXp + gain;
    // Cap at level 99 — drop XP past that threshold.
    const cap = cumulativeXpToReach(MAX_LEVEL);
    if (nextTotal > cap) nextTotal = cap;

    const newLevel = levelFromTotalXp(nextTotal);
    const reward = totalRewardForJump(oldLevel, newLevel);

    saveState({ totalXp: nextTotal });
    return { xpGain: gain, oldLevel, newLevel, reward, totalXp: nextTotal };
  }
```

Add to the `api` object:

```js
    _applyEntry: applyEntry,
    _cumulativeXpToReach: cumulativeXpToReach,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 21 `PASS` lines.

- [ ] **Step 5: Commit**

```bash
git add casino-level.js tests/casino-level-core.test.cjs
git commit -m "level: add XP engine — BOT skip, multi-level rewards, level-99 cap"
```

---

## Task 5: Balance credit on level-up + `get()` returns real state

**Files:**
- Modify: `casino-level.js`
- Modify: `tests/casino-level-core.test.cjs`

- [ ] **Step 1: Append failing tests**

Append to `tests/casino-level-core.test.cjs`:

```js
run('get() returns current persisted state derived from storage', () => {
  const { Level } = makeSandbox({ 'casino.level.v1': JSON.stringify({ totalXp: 500 }) });
  const s = Level.get();
  assert.strictEqual(s.level, 3);
  assert.strictEqual(s.totalXp, 500);
  assert.strictEqual(s.xpInLevel, 500 - 100 - 264); // 136
  assert.strictEqual(s.xpForNext, 466);
});

run('applyEntry credits balance on level-up when creditBalance:true', () => {
  const { Level, localStorage } = makeSandbox({ 'casino.balance': '1000' });
  Level._applyEntry({ bet: 150 }, { creditBalance: true });
  assert.strictEqual(localStorage._store['casino.balance'], '1100'); // 1000 + reward 100
});

run('applyEntry does NOT credit when creditBalance is omitted (pure mode)', () => {
  const { Level, localStorage } = makeSandbox({ 'casino.balance': '1000' });
  Level._applyEntry({ bet: 150 });
  assert.strictEqual(localStorage._store['casino.balance'], '1000');
});

run('applyEntry skips credit when no level-up', () => {
  const { Level, localStorage } = makeSandbox({ 'casino.balance': '1000' });
  Level._applyEntry({ bet: 25 }, { creditBalance: true });
  assert.strictEqual(localStorage._store['casino.balance'], '1000');
});

run('creditBalance guards against another tab crediting first', () => {
  // Tab A's snapshot says level=1, but storage already shows level=2 from Tab B.
  const { Level, localStorage } = makeSandbox({
    'casino.balance': '1000',
    'casino.level.v1': JSON.stringify({ totalXp: 200 }), // already at L2
  });
  // Simulate Tab A applying its entry against the now-stale starting point.
  // (Internally, applyEntry re-reads state — so oldLevel will already be 2,
  // and a small bet that doesn't push past L3 won't credit anything.)
  Level._applyEntry({ bet: 25 }, { creditBalance: true });
  assert.strictEqual(localStorage._store['casino.balance'], '1000');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/casino-level-core.test.cjs`
Expected: FAIL on `get() returns current persisted state derived from storage` — current `get()` hard-codes `totalXp = 0`.

- [ ] **Step 3: Implement balance credit + real `get()`**

Add constant near other constants in `casino-level.js`:

```js
  const DEFAULT_BALANCE = 1000;
```

Replace the `applyEntry` function with this version (signature accepts opts):

```js
  function loadBalance() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(BALANCE_KEY);
      const n = parseFloat(raw);
      if (!isFinite(n) || n < 0) return DEFAULT_BALANCE;
      return n;
    } catch (e) { return DEFAULT_BALANCE; }
  }

  function persistBalance(v) {
    try {
      if (global.localStorage) global.localStorage.setItem(BALANCE_KEY, String(v));
    } catch (e) {}
  }

  function applyEntry(entry, opts) {
    const creditBalance = !!(opts && opts.creditBalance);
    const note = entry && entry.note;
    if (note && BOT_NOTE_RE.test(String(note))) {
      const state = loadState();
      const p = progressInLevel(state.totalXp);
      return { xpGain: 0, oldLevel: p.level, newLevel: p.level, reward: 0, totalXp: state.totalXp };
    }
    const rawBet = entry ? Number(entry.bet) : 0;
    const gain = (!isFinite(rawBet) || rawBet <= 0) ? 0 : Math.floor(rawBet);

    const before = loadState();
    const oldLevel = levelFromTotalXp(before.totalXp);

    let nextTotal = before.totalXp + gain;
    const cap = cumulativeXpToReach(MAX_LEVEL);
    if (nextTotal > cap) nextTotal = cap;

    const newLevel = levelFromTotalXp(nextTotal);
    const reward = totalRewardForJump(oldLevel, newLevel);

    saveState({ totalXp: nextTotal });

    if (creditBalance && reward > 0) {
      persistBalance(loadBalance() + reward);
    }

    return { xpGain: gain, oldLevel, newLevel, reward, totalXp: nextTotal };
  }
```

Replace the placeholder `get` with:

```js
    get() {
      const state = loadState();
      const p = progressInLevel(state.totalXp);
      return {
        level: p.level,
        xp: state.totalXp,
        xpInLevel: p.xpInLevel,
        xpForNext: p.xpForNext,
        totalXp: state.totalXp,
      };
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines.

- [ ] **Step 5: Commit**

```bash
git add casino-level.js tests/casino-level-core.test.cjs
git commit -m "level: credit casino.balance on level-up + wire get() to storage"
```

---

## Task 6: Subscribe to `History.onChange` with ts-dedup

**Files:**
- Modify: `casino-level.js`

This task wires the browser side-effect path. Because it depends on `window.History` and `document`, the tests in Task 1–5 are unaffected. We'll smoke-test manually after Task 10 once everything is wired.

- [ ] **Step 1: Add the subscription wiring**

In `casino-level.js`, replace the existing `onChange` stub with a real listener registry, and add a History subscription block. Put this near the end of the IIFE, **before** the public `api` export:

```js
  // ----- Change subscribers (browser only) -----
  const changeListeners = [];
  function notifyChange() {
    const snap = api.get();
    for (const fn of changeListeners) {
      try { fn(snap); } catch (e) {}
    }
  }

  function onChange(fn) {
    if (typeof fn === 'function') changeListeners.push(fn);
  }
```

Then update the `api` object's `onChange` to `onChange: onChange,`.

Add the History-poll block at the very end of the IIFE, after the `global.CasinoLevel = api;` line — but only when running in a browser:

```js
  if (typeof document === 'undefined') return;

  // ----- History subscription (browser only) -----
  let lastSeenTs = 0;
  function ingestNewEntries() {
    if (!global.History || typeof global.History.getAll !== 'function') return;
    const all = global.History.getAll();
    const fresh = [];
    for (const e of all) {
      if (typeof e.ts === 'number' && e.ts > lastSeenTs) fresh.push(e);
    }
    if (!fresh.length) return;
    fresh.sort((a, b) => a.ts - b.ts);
    let mutated = false;
    for (const e of fresh) {
      const r = applyEntry(e, { creditBalance: true });
      lastSeenTs = e.ts;
      if (r.xpGain > 0 || r.reward > 0) mutated = true;
      if (r.reward > 0) {
        try {
          document.dispatchEvent(new CustomEvent('level-up', {
            detail: { oldLevel: r.oldLevel, newLevel: r.newLevel, reward: r.reward },
          }));
        } catch (e2) {}
      }
    }
    if (mutated) notifyChange();
  }

  function attachHistory() {
    if (!global.History || typeof global.History.onChange !== 'function') return false;
    // Seed lastSeenTs to "now" so we only react to NEW rounds, not the existing log.
    const all = global.History.getAll ? global.History.getAll() : [];
    for (const e of all) if (typeof e.ts === 'number' && e.ts > lastSeenTs) lastSeenTs = e.ts;
    global.History.onChange(ingestNewEntries);
    return true;
  }

  // Poll for History (matches the pattern in casino-jackpots.js).
  (function pollForHistory(attempt) {
    if (attachHistory()) return;
    if (attempt > 60) return; // ~3s max
    setTimeout(function () { pollForHistory(attempt + 1); }, 50);
  })(0);
```

- [ ] **Step 2: Verify tests still pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines. (The new code is gated on `typeof document !== 'undefined'`, which is false in the vm sandbox.)

- [ ] **Step 3: Commit**

```bash
git add casino-level.js
git commit -m "level: subscribe to History.onChange with ts dedup + level-up event"
```

---

## Task 7: Level bar UI — injected CSS + mount

**Files:**
- Modify: `casino-level.js`

This is browser-only and visual. No unit tests; manual smoke comes after Task 10.

- [ ] **Step 1: Add the injected stylesheet**

Right after `if (typeof document === 'undefined') return;` in `casino-level.js`, add:

```js
  const BAR_CSS = `
.casino-level-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(21,8,40,0.85), rgba(10,4,24,0.85));
  border: 1px solid rgba(184, 134, 11, 0.45);
  box-shadow: inset 0 1px 0 rgba(255,210,74,0.15), 0 4px 14px rgba(0,0,0,0.45);
  font-family: 'Bungee', 'Outfit', sans-serif;
  color: #fff0a8;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
}
.casino-level-bar .clb-lvl {
  font-weight: 700;
  color: #ffd24a;
  text-shadow: 0 1px 0 rgba(0,0,0,0.6);
}
.casino-level-bar .clb-track {
  position: relative;
  flex: 1 1 auto;
  height: 6px;
  min-width: 60px;
  background: rgba(20, 8, 36, 0.9);
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.5);
}
.casino-level-bar .clb-fill {
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 0%;
  background: linear-gradient(90deg, #b8860b 0%, #ffd24a 60%, #fff0a8 100%);
  box-shadow: 0 0 6px rgba(255,210,74,0.5);
  transition: width 250ms ease-out;
}
.casino-level-bar .clb-num {
  font-family: 'Geist Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.02em;
  color: rgba(255, 240, 168, 0.85);
  text-transform: none;
}
@media (max-width: 480px) {
  .casino-level-bar .clb-num { display: none; }
}
`;

  function injectBarCss() {
    if (document.getElementById('casino-level-bar-css')) return;
    const s = document.createElement('style');
    s.id = 'casino-level-bar-css';
    s.textContent = BAR_CSS;
    document.head.appendChild(s);
  }
```

- [ ] **Step 2: Add the bar mount + render**

After the CSS block:

```js
  let barEl = null;
  let barFillEl = null;
  let barLvlEl = null;
  let barNumEl = null;

  function buildBar() {
    const wrap = document.createElement('div');
    wrap.className = 'casino-level-bar';
    wrap.innerHTML = `
      <span class="clb-lvl"></span>
      <div class="clb-track"><div class="clb-fill"></div></div>
      <span class="clb-num"></span>
    `;
    return wrap;
  }

  function renderBar() {
    if (!barEl) return;
    const s = api.get();
    barLvlEl.textContent = 'LVL ' + s.level;
    if (s.xpForNext <= 0) {
      barFillEl.style.width = '100%';
      barNumEl.textContent = 'MAX';
    } else {
      const pct = Math.max(0, Math.min(100, (s.xpInLevel / s.xpForNext) * 100));
      barFillEl.style.width = pct.toFixed(1) + '%';
      barNumEl.textContent = s.xpInLevel.toLocaleString() + ' / ' + s.xpForNext.toLocaleString();
    }
  }

  function mountBar() {
    if (barEl) return;
    const slot = document.querySelector('.level-bar-slot');
    if (!slot) return;
    injectBarCss();
    barEl = buildBar();
    barFillEl = barEl.querySelector('.clb-fill');
    barLvlEl  = barEl.querySelector('.clb-lvl');
    barNumEl  = barEl.querySelector('.clb-num');
    slot.appendChild(barEl);
    renderBar();
  }

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  whenReady(mountBar);
  onChange(renderBar);
```

- [ ] **Step 3: Verify tests still pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines.

- [ ] **Step 4: Commit**

```bash
git add casino-level.js
git commit -m "level: add progress bar UI with injected CSS + slot-based mount"
```

---

## Task 8: Level-up toast UI (slide-in, auto-dismiss, coalesce)

**Files:**
- Modify: `casino-level.js`

- [ ] **Step 1: Add toast CSS**

In `casino-level.js`, append to the end of the existing `BAR_CSS` template literal (just before the closing backtick) — keep one stylesheet, one inject call:

```js
.casino-level-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translate(-50%, -120%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-radius: 14px;
  background: linear-gradient(180deg, #2a1148, #150828);
  border: 1px solid rgba(255, 210, 74, 0.55);
  box-shadow: 0 18px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,210,74,0.2);
  font-family: 'Bungee', sans-serif;
  color: #fff0a8;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  opacity: 0;
  transition: transform 320ms cubic-bezier(.2,.7,.2,1), opacity 320ms ease;
  pointer-events: none;
}
.casino-level-toast.show {
  transform: translate(-50%, 0);
  opacity: 1;
}
.casino-level-toast .clt-emblem {
  font-size: 22px;
  color: #ffd24a;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
}
.casino-level-toast .clt-body {
  display: flex; flex-direction: column; gap: 2px;
}
.casino-level-toast .clt-head {
  font-size: 11px; color: #ffd24a;
}
.casino-level-toast .clt-detail {
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
  color: #fff0a8;
  letter-spacing: 0.04em;
  text-transform: none;
}
```

- [ ] **Step 2: Add toast mount + show with coalesce**

Append to `casino-level.js` after the `renderBar` mount block:

```js
  let toastEl = null;
  let toastHeadEl = null;
  let toastDetailEl = null;
  let toastTimer = 0;
  let toastChime = null;
  let pendingToast = null; // { newLevel, reward } accumulated while a toast is visible

  function ensureToast() {
    if (toastEl) return;
    injectBarCss(); // shares the same stylesheet as the bar
    toastEl = document.createElement('div');
    toastEl.className = 'casino-level-toast';
    toastEl.innerHTML = `
      <span class="clt-emblem">&#9670;</span>
      <div class="clt-body">
        <span class="clt-head">Level Up</span>
        <span class="clt-detail"></span>
      </div>
    `;
    document.body.appendChild(toastEl);
    toastHeadEl = toastEl.querySelector('.clt-head');
    toastDetailEl = toastEl.querySelector('.clt-detail');
    try {
      toastChime = new Audio('sfx/win_chime.mp3');
      toastChime.preload = 'auto';
    } catch (e) { toastChime = null; }
  }

  function playChime() {
    if (!toastChime) return;
    try {
      const vol = (global.Settings && global.Settings.sfxVolume) ? global.Settings.sfxVolume() : 1;
      if (vol <= 0) return;
      toastChime.currentTime = 0;
      toastChime.volume = Math.min(1, vol);
      toastChime.play().catch(() => {});
    } catch (e) {}
  }

  function showToast(newLevel, reward) {
    ensureToast();
    // Coalesce: if a toast is already showing, accumulate.
    if (toastTimer && pendingToast) {
      pendingToast.newLevel = Math.max(pendingToast.newLevel, newLevel);
      pendingToast.reward += reward;
    } else {
      pendingToast = { newLevel, reward };
    }
    toastDetailEl.textContent = 'LVL ' + pendingToast.newLevel + '  ·  +$' + pendingToast.reward.toLocaleString();
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    playChime();
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
      toastTimer = 0;
      pendingToast = null;
    }, 3000);
  }

  document.addEventListener('level-up', function (ev) {
    const d = (ev && ev.detail) || {};
    if (typeof d.newLevel === 'number' && typeof d.reward === 'number') {
      showToast(d.newLevel, d.reward);
    }
  });
```

- [ ] **Step 3: Verify tests still pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines.

- [ ] **Step 4: Commit**

```bash
git add casino-level.js
git commit -m "level: add level-up toast with coalesce + win_chime"
```

---

## Task 9: Cross-tab `storage` event refresh

**Files:**
- Modify: `casino-level.js`

- [ ] **Step 1: Add the storage listener**

In `casino-level.js`, immediately after the `document.addEventListener('level-up', ...)` block from Task 8, add:

```js
  global.addEventListener('storage', function (ev) {
    if (!ev) return;
    if (ev.key === STORAGE_KEY) {
      // Another tab updated the player's XP — re-render the bar
      // WITHOUT crediting balance again (that tab already did).
      renderBar();
      notifyChange();
    } else if (ev.key === BALANCE_KEY) {
      // Balance changed elsewhere — nothing to do for level UI,
      // but keep this branch for parity with other shared modules.
    }
  });
```

- [ ] **Step 2: Verify tests still pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines.

- [ ] **Step 3: Commit**

```bash
git add casino-level.js
git commit -m "level: re-render bar on cross-tab storage event"
```

---

## Task 10: Wire `casino-level.js` into every page

**Files:**
- Modify: `index.html`
- Modify: `slots.html`, `kraken.html`, `lucky7saloon.html`, `dragontree.html`
- Modify: `blackjack.html`, `multihandblackjack.html`, `roulette.html`, `rocket.html`, `plinko.html`, `mines.html`, `easycraps.html`, `standardcraps.html`, `craplesscraps.html`, `diamondpoker.html`

The script tag is uniform across all 15 pages: insert `<script src="casino-level.js"></script>` immediately after `<script src="casino-jackpots.js"></script>`. The level-bar-slot placement varies by page layout (see substeps).

- [ ] **Step 1: Insert the script tag in all 15 pages**

For each file in `index.html`, `slots.html`, `kraken.html`, `lucky7saloon.html`, `dragontree.html`, `blackjack.html`, `multihandblackjack.html`, `roulette.html`, `rocket.html`, `plinko.html`, `mines.html`, `easycraps.html`, `standardcraps.html`, `craplesscraps.html`, `diamondpoker.html`:

Find the existing line `<script src="casino-jackpots.js"></script>` and insert directly below it:

```html
<script src="casino-level.js"></script>
```

**Note on `dragontree.html`**: it uses a versioned form `<script src="casino-jackpots.js?v=78"></script>`. Use the matching form for level: `<script src="casino-level.js?v=79"></script>`.

- [ ] **Step 2: Add the bar slot to `index.html` (lobby)**

In `index.html`, find:

```html
  <div class="balance-bar">
    <span class="label">BALANCE</span>
    <span class="value">$<span id="balance">1,000</span></span>
    <button class="btn-add" id="btn-add" title="Add chips">+</button>
  </div>
```

Replace it with:

```html
  <div class="balance-bar">
    <span class="label">BALANCE</span>
    <span class="value">$<span id="balance">1,000</span></span>
    <button class="btn-add" id="btn-add" title="Add chips">+</button>
    <div class="level-bar-slot" style="flex-basis: 100%; margin-top: 8px;"></div>
  </div>
```

The inline `flex-basis: 100%; margin-top: 8px` forces the slot onto its own row inside the balance bar's flex container; the bar's intrinsic styling handles the rest.

- [ ] **Step 3: Add the bar slot to each `.balance-link` page**

For each of these 10 files: `blackjack.html`, `multihandblackjack.html`, `roulette.html`, `rocket.html`, `plinko.html`, `mines.html`, `easycraps.html`, `standardcraps.html`, `craplesscraps.html`, `diamondpoker.html`.

Find the existing `<div class="balance-link">...</div>` block (typically 3–6 lines). Immediately AFTER its closing `</div>` tag, add:

```html
<div class="level-bar-slot" style="position: fixed; top: 56px; right: 10px; z-index: 50; max-width: 220px;"></div>
```

This pins the bar just under the balance pill in the top-right corner across these pages. The inline style avoids needing to add page-specific CSS.

- [ ] **Step 4: Add the bar slot to the HUD-panel slot games**

**`slots.html`** — find:

```html
      <div class="panel balance">
        <div class="panel-label">BALANCE</div>
        <div class="balance-row">
          <div class="panel-value">$<span id="balance">1,000</span></div>
```

After the `</div>` that closes the `<div class="panel balance">` block (look at the closing tag of the entire panel — typically a few lines below the snippet shown), add as a sibling:

```html
        <div class="level-bar-slot" style="margin-top: 6px; padding: 0 4px;"></div>
```

Place it as the **last child of `<div class="panel balance">`** (i.e., inside the panel, after `<div class="balance-row">`).

**`kraken.html`** — same pattern as slots.html. Find `<div class="panel balance">` and insert the slot as its last child:

```html
        <div class="level-bar-slot" style="margin-top: 6px; padding: 0 4px;"></div>
```

**`lucky7saloon.html`** — same pattern but the panel is named `balance-panel`. Find `<div class="panel balance-panel">` and insert the slot as its last child:

```html
        <div class="level-bar-slot" style="margin-top: 6px; padding: 0 4px;"></div>
```

- [ ] **Step 5: Add the bar slot to `dragontree.html`**

Find:

```html
      <div class="hud-cell balance balance-control">
        <div class="lbl">BALANCE</div>
        <div class="balance-row">
          <div class="val" id="balance">0</div>
          <button class="hud-add" id="hud-add" title="Add chips" aria-label="Add chips">+</button>
        </div>
      </div>
```

Replace with:

```html
      <div class="hud-cell balance balance-control">
        <div class="lbl">BALANCE</div>
        <div class="balance-row">
          <div class="val" id="balance">0</div>
          <button class="hud-add" id="hud-add" title="Add chips" aria-label="Add chips">+</button>
        </div>
        <div class="level-bar-slot" style="margin-top: 6px; padding: 0 4px;"></div>
      </div>
```

- [ ] **Step 6: Verify pure-math tests still pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines.

- [ ] **Step 7: Manual smoke test**

Start the local server: `./serve.bat` (or `python -m http.server 8080`).

In a browser at `http://localhost:8080/`:

1. **Lobby:** open `index.html`. Confirm a level bar appears under the BALANCE row reading `LVL 1   ▱▱▱▱▱   0 / 100`.
2. **Blackjack (.balance-link page):** open `blackjack.html`. Confirm the bar appears just below the balance pill in the top-right.
3. **Slots (HUD-panel page):** open `slots.html`. Confirm the bar appears inside the BALANCE panel in the HUD.
4. **Dragontree (custom):** open `dragontree.html`. Confirm the bar appears in the action console under the BALANCE cell.
5. **Earn XP:** in slots, place a $50 spin. After the round resolves, return to lobby — bar should now read `LVL 1  ▰▱▱▱  50 / 100`.
6. **Level up:** keep spinning until the bar fills. On crossing 100 XP, confirm:
   - The bar resets and shows `LVL 2  …  0 / 264` (or wherever the overflow puts you).
   - A toast slides down top-center: `LEVEL UP · LVL 2 · +$100`.
   - The toast disappears after ~3 s.
   - The balance has increased by $100.
   - `win_chime.mp3` plays (assuming SFX isn't muted).
7. **BOT immunity:** open DevTools, watch the bar for ~30 s while bots run rounds in the background. The XP value should NOT increase from bot activity.
8. **Cross-tab:** open `index.html` in two tabs. Spin in tab 1; tab 2's bar should update on the next focus/storage event.
9. **Mute SFX:** open Settings (gear top-right), set SFX to 0, trigger a level-up. Toast still shows, no chime plays.

- [ ] **Step 8: Commit**

```bash
git add index.html slots.html kraken.html lucky7saloon.html dragontree.html blackjack.html multihandblackjack.html roulette.html rocket.html plinko.html mines.html easycraps.html standardcraps.html craplesscraps.html diamondpoker.html
git commit -m "level: wire casino-level.js + bar slot into lobby and every game"
```

---

## Task 11: Service worker precache + AGENTS.md documentation

**Files:**
- Modify: `service-worker.js`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `service-worker.js`**

Find:

```js
const CACHE_VERSION = 'v78';
```

Change to:

```js
const CACHE_VERSION = 'v79';
```

Find the `PRECACHE_URLS` array. After the line `'./casino-jackpots.js',` add:

```js
  './casino-level.js',
```

(Place it next to the other `casino-*.js` entries so the section stays grouped.)

- [ ] **Step 2: Update `AGENTS.md`**

Find the "Shared scripts" section (the one listing the five `<script>` tags that every game loads). Replace the load-order example:

```html
<script src="casino-audio.js"></script>
<script type="module" src="casino-account.js"></script>
<script src="casino-jackpots.js"></script>
<script src="casino-bots.js"></script>
<script src="casino-chat.js"></script>
```

With:

```html
<script src="casino-audio.js"></script>
<script type="module" src="casino-account.js"></script>
<script src="casino-jackpots.js"></script>
<script src="casino-level.js"></script>
<script src="casino-bots.js"></script>
<script src="casino-chat.js"></script>
```

Update the surrounding prose from "five shared scripts" to "six shared scripts" (and update "The lobby (`index.html`) loads the same five." to "the same six.").

Find the existing section header `## casino-bots.js` (or the like). Immediately before it, insert a new section:

```markdown
## `casino-level.js`

Bet-based XP and player leveling. Subscribes to `History.onChange` (skips entries with notes matching `/^BOT\b/i`), persists a single `totalXp` scalar to `casino.level.v1`, and on level-up credits chips to `casino.balance` and shows a slide-down toast top-center.

- `CasinoLevel.get()` → `{ level, xp, xpInLevel, xpForNext, totalXp }`
- `CasinoLevel.onChange(fn)` — subscribe.
- Dispatches `'level-up'` `CustomEvent` on `document` with `{ oldLevel, newLevel, reward }`.

Mounts a progress bar into any element matching `.level-bar-slot` (one per page). The bar's CSS is injected at runtime — no per-page styling needed. Reward formula: `newLevel * 50` chips per level-up, summed across multi-level jumps. Caps at level 99.

Underscore-prefixed members (`_xpForLevel`, `_applyEntry`, etc.) are test seams — don't call from game code.
```

Find the "Other localStorage keys in active use" list (under the "## The shared bankroll" section). Add a new row:

```markdown
- `casino.level.v1` — player XP (single field: `{ totalXp: number }`); current level/progress derived on read
```

- [ ] **Step 3: Verify tests still pass**

Run: `node tests/casino-level-core.test.cjs`
Expected: 26 `PASS` lines.

- [ ] **Step 4: Verify the precached file is reachable**

Start the server: `./serve.bat`. Open `http://localhost:8080/casino-level.js` in a browser. Expected: file contents render as plain text, no 404.

- [ ] **Step 5: Final manual smoke**

Hard-refresh the lobby (Ctrl+F5) to force the new SW version to install. Open DevTools → Application → Service Workers and confirm the active worker is `v79`. Open DevTools → Cache Storage and confirm `diamond-casino-shell-v79` contains `casino-level.js`.

- [ ] **Step 6: Commit**

```bash
git add service-worker.js AGENTS.md
git commit -m "level: precache casino-level.js (v79) and document in AGENTS.md"
```

---

## Done

After Task 11, the leveling system is fully shipped:

- Pure curve + reward math is unit-tested.
- XP accrues silently as the player wagers across any game.
- Level-ups credit chips and show a brief toast with `win_chime`.
- The progress bar is visible on lobby + every game, mounted into the existing balance UI.
- Bots cannot contribute XP or trigger toasts.
- Service worker ships the new file with cache version `v79`.
