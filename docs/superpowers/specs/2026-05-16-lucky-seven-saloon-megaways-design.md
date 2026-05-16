# Lucky Seven Saloon Megaways - Design Spec

**Date:** 2026-05-16  
**Game file:** `lucky7saloon.html`  
**Lobby integration:** new card in `index.html` alongside Diamond Deluxe, Kraken's Depths, and Blackjack  
**Shared systems:** `casino-audio.js` for settings/music UI and `casino.balance` localStorage key for shared virtual balance

## 1. Goals

Build a polished casino slot called **Lucky Seven Saloon**: a warm, old-Vegas saloon cabinet rebuilt as a modern Megaways-style game. The machine should feel tactile, generous in small feedback moments, and exciting when cascades chain together.

The game should not copy the design language of the existing AI-made games. It should keep the same basic local app conventions so it fits the project: standalone HTML page, shared balance, lobby link, add-chips modal, audio settings, first-run rules, auto spin, buy bonus, and optional odds boost.

The target feel is comparable to modern U.S. online casino slots on products such as DraftKings/Fanatics: medium-high volatility and a theoretical mid-90s RTP neighborhood. DraftKings describes RTP as a long-run theoretical return and notes that slot paytables expose RTP and volatility information; this game will present similar plain-language info in its rules modal. This is a virtual-currency game and not a regulated gambling product.

## 2. Theme

**Lucky Seven Saloon** uses a classic 7s identity through a western saloon lens:

- Dark green felt panels, oxblood lacquer, tarnished gold trim, warm marquee bulbs, and bright candy-red 7s.
- The reels sit inside a cabinet that feels heavy and mechanical rather than glassy or sci-fi.
- The feature is **High Noon Free Spins**, introduced by swinging saloon doors, a bell strike, and a rising multiplier badge.

The visual tone is playful and premium, not dusty or sepia. It should avoid a one-note brown/orange western palette by balancing green felt, red 7s, gold trim, cream typography, black cabinet shadows, and small cyan/emerald accent glows.

## 3. Core Game

### Reel Layout

- 6 reels.
- Each spin picks a visible reel height from 2 to 7 symbols per reel.
- The live ways count is the product of all visible reel heights.
- Maximum ways: `7 * 7 * 7 * 7 * 7 * 7 = 117,649`.

### Wins

- Wins pay left-to-right starting on reel 1.
- A symbol wins when it appears on consecutive reels from reel 1.
- Wild sheriff badges substitute for regular pay symbols.
- Scatters do not need adjacency and do not participate in normal ways wins.
- Only the highest matching count for each symbol is paid per cascade.

### Cascades

After every winning evaluation:

1. Winning symbols burst away.
2. Symbols above drop down within their reels.
3. New symbols enter from above.
4. The board re-evaluates.

Base-game cascades pay at `1x`. Free-spin cascades pay at the current feature multiplier.

### Symbols

Premiums:

| Symbol | Role |
|---|---|
| Golden 7 | top premium |
| Triple BAR | high premium |
| Star Badge | premium |
| Saloon Bell | premium |

Lows:

| Symbol | Role |
|---|---|
| A | low |
| K | low |
| Q | low |
| J | low |

Specials:

| Symbol | Role |
|---|---|
| Sheriff Badge | wild, substitutes for pays |
| Saloon Door | scatter, triggers High Noon Free Spins |

### Paytable Direction

Pays are expressed as multipliers of total bet. The exact values may be tuned during implementation, but the intended hierarchy is:

- Lows: frequent small returns, strongest at 5-6 reels.
- Mid premiums: satisfying visible hits from 4+ reels.
- Golden 7: rare and loud, meaningful at 4+ reels, marquee-worthy at 6 reels.
- Wild-assisted hits pay normally; wilds do not multiply by themselves.

## 4. Feature: High Noon Free Spins

### Trigger

- 4 scatters: 8 free spins.
- 5 scatters: 10 free spins.
- 6 scatters: 12 free spins.

### Multiplier Trail

- Feature multiplier starts at `1x`.
- Every winning cascade increases the feature multiplier by `+1`.
- The multiplier persists across the entire feature.
- The multiplier badge should become a central piece of feedback, with rising pitch and brighter lighting as it climbs.

### Retrigger

- 3 or more scatters during free spins awards `+5` free spins.
- Retrigger feedback should be shorter than the initial trigger but still satisfying: door flash, bell hit, spin counter bounce.

### Feature Pacing

The bonus should carry most of the big-win potential. A quiet feature should still feel alive through multiplier movement, sound staging, and suspense. A hot feature should build into a clear celebration state with escalating sounds, coin effects, and a big-win overlay.

## 5. Odds and Tuning Targets

Target volatility: **medium-high**.

Player-facing feel:

- Base game produces frequent low-value hits and occasional cascades.
- Bonus triggers are exciting but not constant.
- Free spins are where most large outcomes live.
- Buy bonus should feel fair relative to the feature value and use the same feature engine as natural triggers.

Implementation tuning targets:

- Theoretical RTP target: mid-90s, approximately `95%` to `96%`.
- Base/feature value split should lean feature-heavy.
- Bonus buy price starts at `100x` base bet unless testing shows it feels too stingy or too loose.
- Optional odds boost follows the existing local slot pattern: increased bet cost for higher trigger chance, with clear UI text.

The game will not claim certified RTP. The rules modal will say the odds are tuned for a modern online-slot feel and virtual currency only.

## 6. UI Structure

The page is a single self-contained `lucky7saloon.html` file with inline CSS and JS.

High-level layout:

1. Lobby link.
2. Cabinet stage.
3. Topper with jackpot-style feature labels or saloon marquee.
4. Game title and subtitle.
5. Reel screen with 6 variable-height reels.
6. Ways counter and multiplier/feature status badges.
7. Corner controls: auto spin, buy bonus, odds boost.
8. Bottom controls: balance, bet stepper, win display, spin button.
9. Shared footnote: virtual currency, not real money.
10. Modals: add chips, auto spin, buy bonus, intro rules, feature rules.
11. Bonus overlay for High Noon Free Spins.

The first screen is the playable machine, not a landing page.

## 7. Visual Interaction

Spin sequence:

1. Spin button compresses and glows.
2. Reels blur into motion with slight vertical stagger.
3. Reels stop left-to-right with chunky cabinet impacts.
4. Ways counter rapidly counts up to the current ways count.
5. Scatters tease on reels 4-6 with door/hinge visual pulses.
6. Wins draw soft gold paths or reel-group highlights.
7. Winning symbols pop, tumble, and refill.
8. Total win counts up with tiered celebration.

Celebration tiers:

- Small win: quick symbol flash and piano lick.
- Medium win: coin ticks, cabinet light pulse.
- Big win: saloon piano run, coin trough, larger overlay.
- Huge/Mega win: longer count-up, bulbs chase around the cabinet, coin shower.

Layout must be responsive:

- Desktop: cabinet centered, reels large, controls underneath.
- Mobile: cabinet fills width, controls remain tappable, reel symbols and labels must not overflow.
- Fixed-format UI such as reels, counters, buttons, and chips uses stable dimensions so text and animations do not shift the layout.

## 8. Audio Design

Use Web Audio synthesis for the new saloon-specific sound design, with shared audio settings from `casino-audio.js`. Existing SFX files may be reused only where they fit; the saloon machine should have its own sonic identity.

Sound palette:

- Reel start: motor whirr, leather belt flutter, low cabinet vibration.
- Reel stop: wood block, coin tick, subtle cabinet thump.
- Ways counter: fast mechanical ticks ending in a small slam.
- Tumble: glass chip scatter and card snap.
- Small win: short honky-tonk piano lick.
- Medium win: piano chord, coin trickle, bulb buzz.
- Big win: saloon piano run, coin trough, crowd-swell-style filtered noise.
- Scatter tease: door hinge creak and rising piano note.
- Bonus trigger: swinging saloon doors, high-noon bell, huge coin hit.
- Multiplier climb: sheriff badge metallic ping that rises in pitch.
- Retrigger: bell hit, door flash, spin counter bounce.

Audio should be layered and compressed through a master chain so loud moments pop without becoming harsh. All SFX must respect `Settings.sfxVolume()`.

## 9. State Model

Primary state:

```js
const State = {
  balance,
  bet,
  betSteps,
  spinning,
  inBonus,
  autoSpin,
  autoCount,
  stopAtFeature,
  boost,
  lastWin,
  bigWinShowing,
};
```

Spin result:

```js
const Spin = {
  reelHeights: [2, 4, 7, 6, 5, 3],
  grid: Symbol[][],
  ways: 10080,
  cascades: [],
  scatterCount: 0,
  totalWin: 0,
};
```

Bonus state:

```js
const BonusState = {
  active,
  spinsLeft,
  multiplier,
  total,
  betSnapshot,
};
```

The resolver should be separated into small functions:

- `pickReelHeights()`
- `generateGrid(heights, options)`
- `evaluateWays(grid, multiplier)`
- `applyCascade(grid, wins)`
- `runCascadeSequence(grid, multiplierMode)`
- `triggerFreeSpins(scatterCount, bought)`
- `runFreeSpin()`

## 10. Error Handling and Guardrails

- Disable spin/bet/boost/buy controls while a spin, cascade sequence, big-win overlay, or bonus is active.
- If balance is below the effective bet, shake the balance panel and play a low-funds sound.
- If localStorage fails, keep the in-memory balance and continue gracefully.
- If audio context creation fails, the game remains fully playable without sound.
- If a browser blocks audio before a user gesture, defer sound until the first click/tap/keypress.
- Modals close on explicit buttons and background click where consistent with existing games.

## 11. Testing and Verification

Manual verification:

- Open the game from `index.html`.
- Spin at each bet level.
- Confirm balance decreases by effective bet and increases by wins.
- Confirm ways count matches the displayed reel heights.
- Confirm wins pay left-to-right from reel 1 only.
- Confirm cascades continue until no wins remain.
- Confirm 4/5/6 scatters trigger 8/10/12 free spins.
- Confirm free-spin multiplier starts at `1x`, increases by `+1` per winning cascade, and persists across the feature.
- Confirm 3+ scatters in feature retrigger `+5` spins.
- Confirm auto spin stops at feature when configured.
- Confirm buy bonus subtracts cost and enters the same feature engine.
- Confirm boost updates the effective bet and trigger chance copy.
- Confirm add-chips and shared balance work across lobby and games.
- Confirm settings modal affects SFX and music volume.
- Confirm desktop and mobile layouts have no text overlap.

Implementation verification:

- Run a local HTTP server and open the game in the in-app browser.
- Use browser screenshots at desktop and mobile widths.
- Run a lightweight simulation in the browser console or a Node-compatible extracted math snippet to estimate RTP/volatility before finalizing pay weights.
- Verify no console errors during base spins, cascades, bonus trigger, bonus completion, buy bonus, and auto spin.

## 12. Deliverables

- `lucky7saloon.html`
- `index.html` updated with a Lucky Seven Saloon lobby card
- Optional new music file in `Music/` if generated or synthesized separately
- No required external assets beyond Google Fonts and existing local shared scripts

