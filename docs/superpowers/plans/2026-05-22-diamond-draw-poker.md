# Diamond Draw Poker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Classic Jacks or Better video poker game as `diamondpoker.html`.

**Architecture:** Keep the poker math in a `CORE TESTABLE API` block exported as `globalThis.DiamondPokerCore`; the page UI consumes that API for dealing, holding, drawing, payouts, balance, SFX, and History records. Integrate the page with lobby, presence, bots, and service worker using the same one-file static pattern as existing casino games.

**Tech Stack:** Vanilla HTML/CSS/JS, localStorage shared balance, existing Diamond Casino shared scripts, Node CJS core tests.

---

### Task 1: Poker Core Tests

**Files:**
- Create: `tests/diamondpoker-core.test.cjs`
- Create/Modify: `diamondpoker.html`

- [ ] Write a failing test that extracts `DiamondPokerCore` from `diamondpoker.html`.
- [ ] Assert classic Jacks or Better rankings and payouts.
- [ ] Run `node tests/diamondpoker-core.test.cjs` and confirm it fails before implementation.

### Task 2: Diamond Poker Page

**Files:**
- Create: `diamondpoker.html`

- [ ] Create the single-file game with shared script tags at the top of `<body>`.
- [ ] Add the branded cabinet UI, paytable, card row, hold toggles, bet controls, and status display.
- [ ] Wire deal/draw/new-hand flow to shared balance and `History.record('diamondpoker', bet, net, note)`.
- [ ] Reuse existing SFX and a current music track.

### Task 3: Casino Integration

**Files:**
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `casino-account.js`
- Modify: `casino-bots.js`

- [ ] Add the lobby card and CSS preview for Diamond Draw Poker.
- [ ] Add `diamondpoker.html` to `PRECACHE_URLS` and bump `CACHE_VERSION`.
- [ ] Add the page to real-player presence mapping.
- [ ] Add bot/presence display config for the new game.

### Task 4: Verification

**Files:**
- Test: `tests/diamondpoker-core.test.cjs`
- Test: existing focused tests touched by shared integration

- [ ] Run `node tests/diamondpoker-core.test.cjs`.
- [ ] Run representative existing tests: `node tests/lucky7saloon-core.test.cjs`, `node tests/dragontree-math.test.cjs`.
- [ ] Start or reuse a local static server and open `diamondpoker.html`.
- [ ] Verify the UI renders, a hand can be dealt/drawn, balance updates, and no obvious console errors appear.
