# Lucky Seven Saloon Megaways Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `Lucky Seven Saloon`, a polished 6-reel Megaways-style cascading slot with High Noon Free Spins, saloon-themed Web Audio, and lobby integration.

**Architecture:** Keep the game as a standalone HTML page to match the existing project. Put pure game math inside a marked core block in `lucky7saloon.html` and expose it as `Lucky7Core` so a Node test can extract and verify it without a browser. Keep UI, animation, and Web Audio in the same HTML file, with shared balance/settings from `casino-audio.js`.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Web Audio API, localStorage, Node `vm` tests, existing Python HTTP server for manual browser verification.

---

### Task 1: Add Test Harness For Slot Math

**Files:**
- Create: `tests/lucky7saloon-core.test.cjs`

- [ ] **Step 1: Write the failing test**

Create `tests/lucky7saloon-core.test.cjs` with this content:

```js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'lucky7saloon.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'lucky7saloon.html must contain a CORE TESTABLE API block');

const sandbox = {
  console,
  Math,
  globalThis: {},
};
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const core = sandbox.globalThis.Lucky7Core;
assert(core, 'Lucky7Core must be exported');

function sym(id) {
  return { id };
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('calculates Megaways product from reel heights', () => {
  assert.strictEqual(core.calcWays([2, 4, 7, 6, 5, 3]), 10080);
  assert.strictEqual(core.calcWays([7, 7, 7, 7, 7, 7]), 117649);
});

run('awards only left-to-right adjacent ways from reel 1', () => {
  const grid = [
    [sym('seven'), sym('seven')],
    [sym('wild'), sym('seven'), sym('king')],
    [sym('seven'), sym('bar')],
    [sym('seven'), sym('queen')],
    [sym('ace'), sym('bar')],
    [sym('seven'), sym('seven')],
  ];
  const result = core.evaluateWays(grid, 2);
  const sevenWin = result.wins.find(win => win.symbolId === 'seven');
  assert(sevenWin, 'expected seven win');
  assert.strictEqual(sevenWin.reels, 4);
  assert.strictEqual(sevenWin.ways, 8);
  assert.strictEqual(sevenWin.amount, core.PAYTABLE.seven[4] * 8 * 2);
  assert.strictEqual(result.wins.some(win => win.reels === 6), false);
});

run('identifies scatter trigger spin awards', () => {
  assert.deepStrictEqual(core.getFreeSpinAward(3), { triggers: false, spins: 0 });
  assert.deepStrictEqual(core.getFreeSpinAward(4), { triggers: true, spins: 8 });
  assert.deepStrictEqual(core.getFreeSpinAward(5), { triggers: true, spins: 10 });
  assert.deepStrictEqual(core.getFreeSpinAward(6), { triggers: true, spins: 12 });
});

run('keeps reel heights stable after cascade refill', () => {
  const rng = core.makeRng(1234);
  const grid = [
    [sym('seven'), sym('ace')],
    [sym('seven'), sym('king'), sym('wild')],
    [sym('seven'), sym('bar')],
    [sym('queen'), sym('jack')],
    [sym('ace'), sym('king')],
    [sym('bar'), sym('bell')],
  ];
  const result = core.evaluateWays(grid, 1);
  const next = core.applyCascade(grid, result.positions, rng);
  assert.deepStrictEqual(next.map(reel => reel.length), grid.map(reel => reel.length));
  assert(next.every(reel => reel.every(Boolean)), 'every reel position should be filled');
});

console.log('Lucky Seven Saloon core tests complete');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/lucky7saloon-core.test.cjs`  
Expected: FAIL because `lucky7saloon.html` does not exist or does not contain `Lucky7Core`.

### Task 2: Create Lucky Seven Saloon Page And Core Math

**Files:**
- Create: `lucky7saloon.html`
- Test: `tests/lucky7saloon-core.test.cjs`

- [ ] **Step 1: Add a standalone page skeleton**

Create `lucky7saloon.html` with:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lucky Seven Saloon - Megaways</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Rye&family=Outfit:wght@500;700;900&family=Geist+Mono:wght@600;800&display=swap" rel="stylesheet">
<style>
/* Full cabinet, reel, modal, and responsive styles live here. */
</style>
</head>
<body>
<a class="lobby-link" href="index.html">LOBBY</a>
<main class="stage">
  <section class="cabinet" id="cabinet"></section>
</main>
<script src="casino-audio.js"></script>
<script>
/* CORE TESTABLE API START */
(function (global) {
  'use strict';
  const SYMBOLS = [];
  const PAYTABLE = {};
  function calcWays(heights) { return heights.reduce((product, height) => product * height, 1); }
  global.Lucky7Core = { SYMBOLS, PAYTABLE, calcWays };
})(typeof window !== 'undefined' ? window : globalThis);
/* CORE TESTABLE API END */
</script>
</body>
</html>
```

- [ ] **Step 2: Implement core math**

Replace the placeholder `SYMBOLS`, `PAYTABLE`, and core export with complete definitions for:

```js
const SYMBOLS = [
  { id: 'seven', label: '7', kind: 'pay', weight: 4 },
  { id: 'bar', label: 'BAR', kind: 'pay', weight: 7 },
  { id: 'badge', label: 'STAR', kind: 'pay', weight: 9 },
  { id: 'bell', label: 'BELL', kind: 'pay', weight: 11 },
  { id: 'ace', label: 'A', kind: 'pay', weight: 15 },
  { id: 'king', label: 'K', kind: 'pay', weight: 17 },
  { id: 'queen', label: 'Q', kind: 'pay', weight: 18 },
  { id: 'jack', label: 'J', kind: 'pay', weight: 19 },
  { id: 'wild', label: 'WILD', kind: 'wild', weight: 4 },
  { id: 'scatter', label: 'DOOR', kind: 'scatter', weight: 3 },
];

const PAYTABLE = {
  seven: { 3: 0.5, 4: 1.8, 5: 8, 6: 30 },
  bar: { 3: 0.35, 4: 1.2, 5: 5, 6: 16 },
  badge: { 3: 0.25, 4: 0.8, 5: 3.5, 6: 10 },
  bell: { 3: 0.2, 4: 0.6, 5: 2.2, 6: 7 },
  ace: { 3: 0.12, 4: 0.28, 5: 0.9, 6: 3 },
  king: { 3: 0.1, 4: 0.24, 5: 0.75, 6: 2.4 },
  queen: { 3: 0.08, 4: 0.2, 5: 0.65, 6: 2 },
  jack: { 3: 0.08, 4: 0.18, 5: 0.55, 6: 1.8 },
};
```

Implement and export `makeRng`, `pickReelHeights`, `pickSymbol`, `generateGrid`, `calcWays`, `countScatters`, `getFreeSpinAward`, `evaluateWays`, and `applyCascade`.

- [ ] **Step 3: Run tests to verify core passes**

Run: `node tests/lucky7saloon-core.test.cjs`  
Expected: PASS for all four core tests.

### Task 3: Build Cabinet UI, Reels, Controls, And Modals

**Files:**
- Modify: `lucky7saloon.html`

- [ ] **Step 1: Add full HTML inside `.cabinet`**

Add topper, marquee title, reel frame, ways/multiplier HUD, auto/buy/boost buttons, balance/bet/win controls, add-chips modal, auto modal, buy modal, intro rules modal, feature rules modal, bonus overlay, big-win overlay, and particle layer.

- [ ] **Step 2: Add saloon visual CSS**

Use CSS variables for green felt, oxblood, gold, cream, red 7s, emerald accents, and stable responsive dimensions. Add reel-height classes, symbol skins, tumble/burst animations, bulb chase, big-win tiers, and mobile breakpoints.

- [ ] **Step 3: Wire state and rendering**

Implement `State`, `BonusState`, `setBalance`, `setBet`, `renderReels`, `renderHud`, `setWin`, `open/close` modal helpers, and button state guards.

### Task 4: Implement Spin, Cascades, Free Spins, Auto, Buy, And Boost

**Files:**
- Modify: `lucky7saloon.html`
- Test: `tests/lucky7saloon-core.test.cjs`

- [ ] **Step 1: Implement base spin flow**

Subtract effective bet, generate reel heights/grid, animate reel stops, display ways, evaluate wins, run cascades until no wins remain, then award total win.

- [ ] **Step 2: Implement High Noon Free Spins**

Trigger from 4+ scatters or buy bonus, show feature overlay, run free spins with persistent multiplier, add `+1` per winning cascade, retrigger `+5` spins on 3+ scatters, and collect total at the end.

- [ ] **Step 3: Implement auto, buy bonus, and boost**

Auto spin supports 10/25/50 spins and stop-at-feature. Buy bonus costs `100x` base bet and uses the same feature engine. Boost costs `1.5x` bet and doubles scatter trigger weight during base spin generation.

- [ ] **Step 4: Re-run core tests**

Run: `node tests/lucky7saloon-core.test.cjs`  
Expected: PASS.

### Task 5: Add Saloon Audio And Lobby Card

**Files:**
- Modify: `lucky7saloon.html`
- Modify: `index.html`

- [ ] **Step 1: Implement Web Audio engine**

Add `AudioFX` with `ensure`, `tone`, `noise`, `thud`, `chord`, `slide`, and named cues for click, spinStart, reelStop, waysTick, tumble, smallWin, mediumWin, bigWin, scatterTease, bonusTrigger, multiplierUp, retrigger, addCash, and lowFunds. Route through compressor/master gain and respect `Settings.sfxVolume()`.

- [ ] **Step 2: Add lobby preview card**

Add `Lucky Seven Saloon` card to `index.html` with a small saloon reel preview, route to `lucky7saloon.html`, and meta pills `MEGAWAYS`, `FREE SPINS`, `NEW`.

### Task 6: Verify In Browser

**Files:**
- Verify: `lucky7saloon.html`
- Verify: `index.html`

- [ ] **Step 1: Start or reuse local server**

Run: `python -m http.server 8765 --bind 127.0.0.1` from the project root if no server is already listening.

- [ ] **Step 2: Open in browser**

Open: `http://127.0.0.1:8765/lucky7saloon.html`

- [ ] **Step 3: Manual verification**

Check initial render, spin, cascade, buy bonus, add chips, settings, rules, auto modal, and lobby navigation.

- [ ] **Step 4: Console and screenshot verification**

Use browser tooling to confirm no console errors and capture desktop/mobile screenshots for overlap/blank-state checks.

