# Leveling System — Design Spec

**Date:** 2026-05-22
**New shared script:** `casino-level.js`
**Shared systems touched:** `casino-audio.js` (`History.onChange`), `casino.balance` (read/write), every game `.html` + lobby (one script tag + one bar container)

## 1. Goals

Add a lightweight progression system for the local player. Players accrue **XP from every bet they place** (across every game) and **level up** as XP accumulates. Each level-up grants a chip reward credited directly to the bankroll, announced via a small auto-dismissing toast.

Design intent:

- **Not intrusive.** A thin progress bar lives next to the existing balance pill on each game and on the lobby balance bar. Spins update the bar silently — no XP animations, no per-spin flashes.
- **Rewarding.** Level-ups grant chips (`level * 50`) and a short toast celebrates the moment. This is the one explicit "you did a thing" cue.
- **Cohesive.** Reuses the existing gold/purple tokens, the existing `win_chime` SFX, and the existing toast visual language (same shape as jackpot toasts). No new design surface.
- **Generous.** XP is awarded for **wagering**, not winning. A player who loses ten spins still levels.

Out of scope for this spec:

- Per-game level perks, daily quests, leaderboards, prestige.
- Cross-device sync (level stays local to the device, like `casino.balance`).
- Bot leveling — bots have no concept of XP.

## 2. XP & Curve

### XP source

For every entry written to `History.record(game, bet, win, note)`:

- If `note` matches `/^BOT\b/i` → skip (bot bets contribute nothing).
- Otherwise → award `floor(max(0, bet))` XP.

XP is **bet-based** (not net or win). A $25 spin grants 25 XP regardless of outcome.

### Curve

```js
function xpForLevel(n) {
  // XP required to advance from level n to level n+1.
  return Math.round(100 * Math.pow(n, 1.4));
}
```

Sampling:

| From → To | XP required | Cumulative XP to reach the higher level |
|---:|---:|---:|
| 1 → 2   | 100    | 100       |
| 2 → 3   | 264    | 364       |
| 3 → 4   | 466    | 830       |
| 5 → 6   | 952    | 2,478     |
| 10 → 11 | 2,512  | 11,749    |
| 25 → 26 | 9,060  | 98,942    |
| 50 → 51 | 23,909 | 510,109   |
| 98 → 99 | 61,336 | 2,535,302 |

Levels start at **1** with **0 XP** for a fresh player. The system caps at **level 99** — any XP earned past `cumulativeXp(99)` is dropped on the floor (not stored). No level-100 reward.

### Reward

On every level-up, credit the player:

```js
reward = newLevel * 50;
```

So 1→2 = $100, 5→6 = $300, 10→11 = $550, 25→26 = $1,300, 50→51 = $2,550, 98→99 = $4,950.

Multi-level jumps from a single huge bet are summed and credited as one balance increment with one toast (see §5).

## 3. Storage

Single localStorage key:

```
casino.level.v1  →  { totalXp: number }
```

`totalXp` is the **only** persisted field. Current level, progress within level, and XP-to-next are all **derived** from `totalXp` on read. This keeps the data model trivial and self-consistent.

Helpers (exposed on `window.CasinoLevel`):

- `levelFromTotalXp(totalXp)` → integer 1..99
- `progressInLevel(totalXp)` → `{ level, xpInLevel, xpForNext }`
- `get()` → `{ level, xp, xpInLevel, xpForNext, totalXp }`

Default state when the key is missing or unparseable: `{ totalXp: 0 }` → level 1, 0/100.

Collisions: the `casino.` prefix is already established (see `casino.balance`, `casino.settings`, `casino.history`, `casino.bots.v5.*`). The `.v1` suffix lets us migrate later.

## 4. Architecture — `casino-level.js`

New shared script, vanilla JS (classic `<script>`, no module). Loaded **after `casino-audio.js`** in every page so that `window.History` is guaranteed to exist by the time we subscribe.

### Load order (every page + lobby)

```html
<script src="casino-audio.js"></script>
<script type="module" src="casino-account.js"></script>
<script src="casino-jackpots.js"></script>
<script src="casino-level.js"></script>   <!-- new -->
<script src="casino-bots.js"></script>
<script src="casino-chat.js"></script>
```

Placed **before** `casino-bots.js` because some future bot-vs-player hook could care about the player's level, but order is not load-bearing today.

### Module shape

```js
window.CasinoLevel = {
  get(),               // { level, xp, xpInLevel, xpForNext, totalXp }
  onChange(fn),        // subscribe to any state change
  // Internals (not part of the public surface, but useful for tests):
  _xpForLevel(n),
  _levelFromTotalXp(totalXp),
  _progressInLevel(totalXp),
};
```

### Wiring

1. On script load: read `casino.level.v1`, parse, store `totalXp` in memory.
2. Poll for `window.History` (same idempotent pattern `casino-jackpots.js` uses — `setTimeout` until present, max ~3 s).
3. Once `History` is available, call `History.onChange(handleEntry)`.
4. `handleEntry()` reads `History.getSession()` and tracks the highest-seen `ts` to dedup, then for each new non-BOT entry:
   - Compute XP gain (`floor(max(0, bet))`).
   - Compute pre-level and post-level from `totalXp` and `totalXp + gain`.
   - Persist new `totalXp` to localStorage.
   - If post-level > pre-level: compute reward, credit `casino.balance`, queue level-up toast.
   - Notify subscribers.

`History.onChange` is the correct subscription point (per AGENTS.md gotchas): wrap-order with `casino-jackpots.js` and `casino-bots.js` is not guaranteed, but `onChange` is fired by `casino-audio.js` itself.

### Cross-tab consistency

`History.record` only fires in the tab that ran the round, so cross-tab double-counting is not a real risk. But two tabs may both refresh their view of the level bar via `storage` events. The script listens for `'storage'` with `key === 'casino.level.v1'` and refreshes its in-memory `totalXp` + notifies subscribers (without re-crediting any reward — only the originating tab credits).

**Reward guard:** before crediting a level-up, re-read `casino.level.v1` from localStorage. If the stored level is already `>=` the new level (e.g., another tab beat us to it), skip the credit. This is defensive — in practice only one tab plays at a time.

## 5. UI — Level Bar + Toast

### Level bar

A compact horizontal bar. Anatomy:

```
┌──────────────────────────────────────────────┐
│ LVL 7   ▰▰▰▰▰▱▱▱▱▱   720 / 1,260 XP          │
└──────────────────────────────────────────────┘
```

- Left: `LVL N` in `Bungee` uppercase, gold-1.
- Middle: filled progress track. Gold gradient fill on a dark purple track. `transition: width 250ms ease-out`.
- Right: `xpInLevel / xpForNext` in `Geist Mono`, gold-0, slightly muted.

At level 99 the bar reads `LVL 99 · MAX` (full bar, no numeric suffix).

CSS lives inline in each page's existing `<style>` block (no external stylesheet — the casino doesn't ship one) OR — preferred — inline in `casino-level.js` as a single `<style>` element it injects once. **We'll go with the injected-style approach**: keeps the visual contract in one file with the JS that owns it, no need to copy CSS into 16 HTML files.

### Mount points

- **Lobby** (`index.html`): inserted as a thin row directly under `.balance-bar`. Full width of the balance container.
- **Each game**: anchored to the top-right under the existing balance pill. Width matches the pill, sits in the same column. Below ~480 px width, the numeric suffix collapses (just `LVL 7  ▰▰▰▰▰▱▱▱▱▱`).

The script auto-mounts on `DOMContentLoaded`. Mount strategy:

1. If `#casino-level-bar` already exists (test fixtures, manual override), reuse it.
2. Else, look for `.balance-bar` (lobby case) — append a child.
3. Else, look for `.balance-link` (game case) — insert a sibling immediately after.
4. Else — silently skip (page intentionally has no bar slot).

### Level-up toast

A small slide-in/slide-out element. Pattern mirrors the existing `cb-banner` (`casino-bots.js`) — a single fixed-position element injected into `<body>` with its own scoped `<style>` block, mounted once and reused for every event. Mounted into `<body>` after the bar's CSS is injected.

Anatomy:

```
┌─────────────────────────────────────┐
│  ⬢  LEVEL UP                        │
│     LVL 8 · +$400                   │
└─────────────────────────────────────┘
```

- Top-center, ~80 px from top edge.
- Slides down on show, fades + slides up on hide.
- Visible for **3,000 ms** then auto-dismisses.
- Plays `win_chime.mp3` via a single `<audio>` element gated on `Settings.sfxVolume()`. Silent if SFX is muted.
- If a second level-up arrives while the toast is visible (e.g., from a massive multi-level jump that races into a follow-up spin), the existing toast updates in place (new level, new reward summed) and the timer resets — no stacking, no queue.

### No other UI

- No per-spin XP popup.
- No "+N XP" floating numbers.
- No level-up modal.
- No lobby leaderboard.
- No Settings option to mute the toast specifically (Settings.sfx already covers the chime).

## 6. Edge Cases

| Case | Behavior |
|---|---|
| BOT entry | Skipped (no XP, no toast, no balance credit). |
| Bet is 0 (free spin, push-only entry) | 0 XP gained, no level change. |
| Bet is negative or NaN | Treated as 0. |
| Single bet pushes player up multiple levels | One toast showing the final level and **total** reward across all crossed levels. |
| Already at level 99 | XP gain is dropped, no persistence write, no toast. |
| localStorage write fails (quota, private mode) | Catch silently, keep in-memory state, no crash. |
| `casino.level.v1` value is malformed | Reset to `{ totalXp: 0 }` (don't try to repair). |
| User clears `casino.history` | XP is unaffected (totalXp lives in its own key). |
| User clears `casino.balance` | Level is unaffected (reward already credited at the time of level-up). |
| Two tabs open, both subscribed | Only the active-bet tab credits; the other tab refreshes its view via `'storage'` events without re-crediting. |
| `History` never appears (script broken upstream) | Poll gives up after ~3 s; bar still renders read-only, just never updates. |

## 7. Files Touched

**New:**

- `casino-level.js` — XP store, level derivation, History subscription, balance credit, bar + toast mount, injected CSS.

**Modified:**

- `index.html` — add `<script src="casino-level.js"></script>` in the shared script block; ensure a mountable `.balance-bar` (already present).
- `slots.html`, `kraken.html`, `lucky7saloon.html`, `dragontree.html`, `blackjack.html`, `multihandblackjack.html`, `roulette.html`, `rocket.html`, `plinko.html`, `mines.html`, `easycraps.html`, `standardcraps.html`, `craplesscraps.html` — add the same `<script src="casino-level.js"></script>` line.
- `service-worker.js` — append `'/casino-level.js'` to `PRECACHE_URLS`; bump `CACHE_VERSION` (next integer, e.g. `v76`).
- `AGENTS.md` — short paragraph under "Shared scripts" documenting `casino-level.js`, and a new `casino.level.v1` row under "Other localStorage keys in active use".

**No changes:** `casino-audio.js`, `casino-account.js`, `casino-jackpots.js`, `casino-bots.js`, `casino-chat.js`, `manifest.webmanifest`.

## 8. Testing

The codebase uses Node CJS unit tests under `tests/`. Pure math is testable headlessly; UI mount + toast behavior is not.

**New test file:** `tests/casino-level-core.test.cjs`

Cases:

- `xpForLevel(1) === 100`, `xpForLevel(10) === 2512` (regression on the curve constants).
- `levelFromTotalXp(0) === 1`, `levelFromTotalXp(99) === 1`, `levelFromTotalXp(100) === 2`, `levelFromTotalXp(364) === 3`.
- `progressInLevel(150)` returns `{ level: 2, xpInLevel: 50, xpForNext: 264 }`.
- Level cap: `levelFromTotalXp(Number.MAX_SAFE_INTEGER) === 99`.
- Reward formula: 1→2 gives 100, 10→11 gives 550, 50→51 gives 2550.
- Multi-level jump: starting from level 1 with 0 XP and gaining 1,000 XP → ends at level 4 (since 100+264+466=830 ≤ 1000 < 1526), total reward `2*50 + 3*50 + 4*50 = 450`.

To make this testable, `casino-level.js` must export its pure helpers when `module.exports` exists (the same conditional `module.exports` shim pattern used by `lucky7saloon-core` and `roulette-core`).

Manual smoke (UI):

1. Fresh localStorage, open lobby → bar shows `LVL 1   ▱▱▱▱▱▱▱▱▱▱   0 / 100`.
2. Open slots, spin $5 → bar updates to `5 / 100`.
3. Win or lose 20+ spins, watch the fill grow.
4. Hit level-up boundary → toast slides in, balance jumps by `level * 50`, SFX plays.
5. Open a second tab, spin in the first → second tab's bar updates via `storage` event without re-crediting.
6. Mute SFX in Settings → no chime on next level-up; toast still shows.
7. Set `casino.level.v1` to `{"totalXp": 999999}` manually → level reads 18, bar shows correct progress.

## 9. Future (not in this spec)

- Firestore-backed per-user XP via `CasinoAccount` (cross-device).
- Level-locked games/themes/cosmetics.
- A "PROGRESS" rail card on the lobby with all-time wagered, biggest level-up reward, etc.
- Prestige past level 99.

Out of scope, but the localStorage `.v1` suffix and the single `totalXp` field make any of these straightforward later.
