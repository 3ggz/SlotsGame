# Crapless Bubble Craps — Design Spec

**Date:** 2026-05-15
**Game file:** `craplesscraps.html` (single self-contained page, sibling of `slots.html` / `kraken.html` / `blackjack.html`)
**Lobby card slot:** 4th tile in `index.html`, replacing any future placeholder

## 1. Goals

Build an authentic Plaza-Hotel-style electronic crapless bubble craps machine. Two dice tumble inside a glass dome powered by a fan; the player taps a digital felt to place bets; the come-out roll never loses. Aesthetic matches the existing Diamond Casino — dark purple base, gold rim, neon cyan/pink/violet/green accents, Bungee + Outfit + Geist Mono typography.

The game must feel **clean** and **satisfying** above all else. Tactile chip placement, weighty dice, kind seven-outs, generous winning glow.

## 2. Rules (Crapless Craps variant)

- **Single pass-only line.** No don't-pass (math doesn't work in crapless).
- **Come-out roll**
  - 7 → Pass Line wins 1:1, props/single-roll bets resolve, return to come-out.
  - Any other total (2, 3, 4, 5, 6, 8, 9, 10, 11, 12) → becomes the point. Puck flips ON to that number.
- **Point phase**
  - Point N → Pass + Odds win at posted payouts; point is recorded for Fire Bet; puck flips OFF; back to come-out.
  - 7 → Pass + Odds lose; all place + hardway bets lose; Fire / All-Small / All-Tall / Make-em-All resolve; shooter is over; puck flips OFF; back to come-out.
  - Anything else → resolve any bet that depends on that number (place, field, props, hardways), then re-roll.

## 3. Bet menu (full Vegas scope, no Repeater bets in v1)

### Always-visible felt

| Bet | Payout | Notes |
|---|---|---|
| **Pass Line** | 1:1 | Win on come-out 7; lose only on 7 after point set |
| **Pass Odds** | 2/12 → 6:1 · 3/11 → 3:1 · 4/10 → 2:1 · 5/9 → 3:2 · 6/8 → 6:5 | Backs the pass line at true odds; only placeable after point is set; max 5× line bet |
| **Place 2** | 11:2 | |
| **Place 3** | 11:4 | |
| **Place 4** | 9:5 | |
| **Place 5** | 7:5 | |
| **Place 6** | 7:6 | |
| **Place 8** | 7:6 | |
| **Place 9** | 7:5 | |
| **Place 10** | 9:5 | |
| **Place 11** | 11:4 | |
| **Place 12** | 11:2 | |
| **Field** | 2 → 3:1 · 12 → 2:1 · 3, 4, 9, 10, 11 → 1:1 | Single-roll; loses on 5, 6, 7, 8 |
| **Hard 4** | 7:1 | Resolves when 4 rolls easy OR any 7 |
| **Hard 6** | 9:1 | Resolves when 6 rolls easy OR any 7 |
| **Hard 8** | 9:1 | Resolves when 8 rolls easy OR any 7 |
| **Hard 10** | 7:1 | Resolves when 10 rolls easy OR any 7 |

### PROPS drawer (collapsed by default)

All single-roll unless noted.

| Bet | Payout |
|---|---|
| Any 7 | 4:1 |
| Any Craps (2/3/12) | 7:1 |
| Aces (2) | 30:1 |
| Boxcars (12) | 30:1 |
| Yo (11) | 15:1 |
| Ace-Deuce (3) | 15:1 |
| C & E | 3:1 on craps (2/3/12), 7:1 on 11 |
| Horn (4-way split, single roll) | 27:4 on 2/12, 3:1 on 3/11 (constituent rate minus 3 losing quarters; min 4-chip bet) |
| World/Whirl (5-way Horn + Any 7) | Same as Horn for 2/3/11/12; push on 7 (min 5-chip bet) |
| Hop — hard combos (1-1, 2-2, 3-3, 4-4, 5-5, 6-6) | 30:1 each |
| Hop — easy combos (other 15 distinct pairs) | 15:1 each |

Hop bets render as a 21-cell mini-grid: 6 hard cells across the top, 15 easy cells in a 5-column grid below.

### BONUS drawer (collapsed by default)

| Bet | Resolution | Payout |
|---|---|---|
| **Fire Bet** | Counts unique points made before any 7-out. Placeable only between shooters (come-out, no point set, no roll yet). | 4 unique → 24:1 · 5 unique → 249:1 · 6+ unique → 999:1 |
| **All Small** | Roll all of 2, 3, 4, 5, 6 before any 7. Placeable only on come-out. | 30:1 |
| **All Tall** | Roll all of 8, 9, 10, 11, 12 before any 7. Placeable only on come-out. | 30:1 |
| **Make-em-All** | Both All Small and All Tall in one shooter. Placeable only on come-out. | 150:1 |

### Limits (v1)

- Min bet per spot: $1.
- Max bet per spot: $500.
- Max single roll exposure (total wagered): no cap in v1 (virtual currency).

## 4. Visual design

### Layout (top to bottom)

1. **Header strip** (fixed): lobby link top-left, balance/+chips top-right, settings gear (auto-injected by `casino-audio.js`).
2. **Bubble dome** (sticky-ish, centered): the centerpiece. Round CSS dome with gold rim, inner glass shine, fan grill SVG below. Two CSS-3D dice tumbling inside.
3. **Indicator row**: POINT puck state (ON N / OFF), LAST roll total, FIRE BET indicator (6 dot lights), SHOOTER status (small text like "NEW SHOOTER" or "ON A ROLL").
4. **Felt panels** (always visible): PLACE strip → FIELD + HARDWAYS row → PASS + ODDS row.
5. **Drawer tabs**: `▾ PROPS` and `▾ BONUS` buttons. Each expands an in-place panel below the tabs.
6. **Chip rail** (sticky at bottom on mobile, normal on desktop): denomination selector ($1, $5, $25, $100, $500), CLEAR button, **ROLL/SHAKE** primary button (the largest interactive element).

### Aesthetic

- **Background**: same dark gradient stack as other games (purple → black radials, fixed attachment).
- **Felt color**: deep purple-black with a low-contrast diamond-quilted pattern. Implemented in pure CSS via `repeating-linear-gradient` cross-hatch + radial vignette + thin gold inner ring.
- **Bet zones**: rounded rectangles with subtle inset gold border (`inset 0 0 0 1px rgba(255,210,74,0.3)`). Hover lifts the zone slightly + brightens. Active (chip placed) zones get a steady cyan halo.
- **Winning zones**: a 700ms gold flash keyframe + a particle burst (6-10 small radial gradient dots fading outward).
- **Losing zones (on 7-out)**: a single muted red dim + chip dissolve.
- **Puck**: 80px circle with `ON`/`OFF` Bungee text. ON side is glossy gold with the point number; OFF side is matte black-on-charcoal. Flips with a 600ms `rotateY` keyframe.
- **Fire indicator**: row of 6 small circles above the dome. Each lights as a unique point is made — soft cyan at first, escalating to gold and pulsing at 4+.

### Bubble dome (the centerpiece)

```
            ╭────────────────────╮     ← gold rim (3px conic-gradient ring)
          ╱                       ╲
        ╱   ┌─────────────────┐    ╲   ← glass dome (radial linear-gradient
       │    │                  │    │     with white inner highlight at 30% 20%)
       │    │   [die][die]     │    │
       │    │                  │    │
        ╲   └─────────────────┘    ╱
          ╲                       ╱
            ╰────────────────────╯
            ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏    ← fan grill (SVG horizontal slats with
                                       gold rim, fan blades fading behind)
```

Dome is ~280px on desktop, ~200px on mobile. Inner "air-pulse" effect during a shake is a radial gradient that scales up + fades during the 1.4s animation. Tiny dust motes (3-5 absolute-positioned dots animating slowly upward) provide ambient liveliness between rolls.

### Dice

Each die is a CSS 3D cube (`transform-style: preserve-3d`, six face divs with translateZ + rotation per face, pip-dotted face content). The container animates:

```
@keyframes diceTumble {
  0%   { transform: rotateX(0) rotateY(0) translate(0,0); }
  25%  { transform: rotateX(720deg) rotateY(540deg) translate(-30px, -20px); }
  50%  { transform: rotateX(1440deg) rotateY(1080deg) translate(20px, -40px); }
  75%  { transform: rotateX(2160deg) rotateY(1620deg) translate(-15px, 30px); }
  100% { transform: rotateX(<final>) rotateY(<final>) translate(0, 0); }
}
```

The final transform is computed per die to land on the target face. Outcome is rolled first (`Math.floor(Math.random()*6)+1` for each die — fair 1d6), then the animation is generated with the final rotations targeting that face. Animation duration: 1.4s, ease-out at the tail.

## 5. Architecture

Single self-contained HTML file `craplesscraps.html`. Structure:

```
<style>           ← all CSS scoped to this page
<body>
  <header> lobby link / balance link
  <div class="stage">
    <div class="dome-wrap"> dome + dice + fan + dust
    <div class="indicator-row"> point puck, last-roll, fire dots, shooter status
    <div class="felt"> place strip, field, hardways, pass, odds, drawer tabs
    <div class="drawer drawer-props">
    <div class="drawer drawer-bonus">
    <div class="chip-rail"> denom chips, clear, shake button
  </div>
  <div class="message-toast"> transient win/lose messages
<script src="casino-audio.js"></script>
<script>          ← all game logic inline
```

### Game state object

```js
const game = {
  phase: 'comeOut',        // 'comeOut' | 'point'
  point: null,             // 2..12 (except 7) when phase==='point'
  lastRoll: null,          // [die1, die2, total] of most recent roll
  shooter: {
    pointsMade: new Set(), // unique points hit this shooter (for Fire Bet)
    smallHit: new Set(),   // subset of {2,3,4,5,6} for All Small
    tallHit:  new Set(),   // subset of {8,9,10,11,12} for All Tall
    rolling: false,        // currently animating
  },
  bets: {
    pass: 0,
    odds: 0,
    place: { 2:0, 3:0, 4:0, 5:0, 6:0, 8:0, 9:0, 10:0, 11:0, 12:0 },
    field: 0,
    hard: { 4:0, 6:0, 8:0, 10:0 },
    props: { any7:0, anyCraps:0, aces:0, boxcars:0, yo:0, aceDeuce:0,
             ceCraps:0, ceEleven:0, horn:0, world:0, hop:{} },
    bonus: { fire:0, allSmall:0, allTall:0, makeAll:0 },
  },
  chipDenom: 5,            // currently selected denomination
};
```

### Roll resolver

```js
function resolveRoll(d1, d2) {
  const total = d1 + d2;
  const hard  = (d1 === d2);
  const wins  = [];   // [{ zone, amount }]
  const losses = [];  // [{ zone, amount }]

  // 1. Field — resolve every roll (single-roll bet).
  // 2. Props — resolve every roll (all are single-roll in v1).
  // 3. Place — always working in v1 (resolve on every roll, including come-out).
  // 4. Hardways — win on the hard total, lose on easy total or any 7.
  // 5. Pass / Odds — resolve per phase rules above.
  // 6. Bonus — update set state on every roll; resolve Fire on 7-out,
  //    All-Small/All-Tall/Make on either set completion or 7-out.
  // 7. Phase transition at the end (come-out → point, point → made/seven-out).

  return { wins, losses, phaseChange, makesPoint, sevenOut };
}
```

State transitions and bet resolutions are pure given `(state, d1, d2)`, which makes them easy to unit-test mentally if not formally.

### Animations sequence per roll

1. Disable inputs (`game.shooter.rolling = true`).
2. Play `bubble_shake.mp3` + fan grill glow on.
3. Compute outcome, generate dice tumble keyframes targeting final faces.
4. Wait for animation end (~1.4s).
5. Play `bubble_settle.mp3` + fan glow fades.
6. Update `lastRoll`. Pulse the rolled number on the felt (a brief gold halo).
7. Resolve wins/losses one zone-class at a time with ~80ms stagger so payouts feel layered, not simultaneous.
8. Play outcome sting (pass win, point made, seven-out, etc.).
9. If 7-out: resolve bonus bets, flip puck off, reset shooter.
10. Re-enable inputs.

## 6. Sounds (ElevenLabs additions to `sfx/generate_sfx.py`)

New entries appended to the `SFX` list:

| Filename | Prompt sketch | Duration |
|---|---|---|
| `bubble_shake.mp3` | "Two casino dice clattering rapidly inside a clear acrylic dome, sharp plastic-on-plastic rattle, dry close microphone, no music, no reverb" | 1.4s |
| `bubble_settle.mp3` | "Single final dice clack inside acrylic dome, brief and dry, coming to rest, close microphone" | 0.4s |
| `puck_on.mp3` | "Heavy plastic casino puck snapping firmly onto felt, single tight chunky thump, dry, no reverb" | 0.4s |
| `puck_off.mp3` | "Heavy plastic casino puck flipping off, soft thud lower than puck_on, dry, no music" | 0.4s |
| `seven_out.mp3` | "Brief descending three-note disappointment sting, low warm synth, gentle, casino seven-out, no reverb tail" | 0.9s |
| `point_made.mp3` | "Bright ascending two-note bell chime, casino point-made win, clean, no reverb tail" | 0.7s |
| `field_win.mp3` | "Very short sparkly flutter, tiny celebratory ding, casino field bet win, dry and brief" | 0.5s |
| `hardway_win.mp3` | "Crisp bright bell ping, single triumphant note, casino hardway win, no reverb" | 0.5s |
| `props_win.mp3` | "Short bright chime, casino prop bet win, sparkly and brief, no music" | 0.6s |
| `fire_light.mp3` | "Single soft cyan ping, like a UI light turning on, brief and clean, no reverb" | 0.4s |
| `fire_big.mp3` | "Triumphant short fanfare with bells and glittery rise, casino fire bet jackpot, bright and compact" | 1.2s |

Reuse existing `chip_place_*`, `chip_payout`, `chip_clear`, `chip_select`, `button_soft`, `win_chime` (for pass-line wins).

The Python script's `generate()` function already skips files that exist, so appending entries is safe to re-run.

## 7. Music

Add `Music/Bubble Craps Lounge.wav` — slow, lounge-y, low rhythmic bass, soft rim taps, no melody. ~2 minute loop. Loaded with `Music.init('Music/Bubble%20Craps%20Lounge.wav')` then `Music.start()` on first user gesture (same pattern as other games).

Music generation itself is outside scope of the craps page; the page will simply reference the file. (Existing music files in `/Music` appear to be sourced externally — same approach here.)

## 8. Lobby integration

In `index.html`, add a 4th `<a class="game-card" href="craplesscraps.html">` between the kraken and blackjack cards (or after blackjack — TBD by user, default: after blackjack so order is Slots → Kraken → Blackjack → Craps).

Preview block (CSS/SVG, matching the existing visual quality of slots/kraken/blackjack previews):

- Background: deep purple-black with a faint felt diamond pattern.
- Centerpiece: small CSS bubble dome with two dice peeking through, gold rim glow.
- Subtle pulse animation on the dome (`animation: domePulse 3s ease-in-out infinite alternate`).

```html
<a class="game-card" href="craplesscraps.html">
  <div class="preview craps">
    <div class="craps-row">
      <div class="cr-dome">
        <div class="cr-die"><!-- pips --></div>
        <div class="cr-die"><!-- pips --></div>
      </div>
    </div>
  </div>
  <div class="game-title">CRAPLESS CRAPS</div>
  <div class="game-tagline">BUBBLE · NEVER LOSE THE COME-OUT</div>
  <div class="game-desc">
    Plaza-style bubble craps. Every number is a point. Pass, place, field,
    hardways, props, plus Fire Bet and All-Tall/Small bonus bets.
  </div>
  <div class="game-meta">
    <span class="meta-pill">CRAPLESS</span>
    <span class="meta-pill">BUBBLE</span>
    <span class="meta-pill hot">NEW</span>
  </div>
  <div class="play-cta">PLAY</div>
</a>
```

CSS for the preview is co-located with the existing previews in `index.html`.

## 9. Mobile

Layout collapses to a single column under 720px:

- Bubble dome shrinks to ~200px and moves into normal flow (not sticky — sticky elements steal viewport on phones).
- Place strip wraps to 2 rows (5 + 5) on narrow screens.
- Drawer panels become full-width when open.
- Chip rail becomes sticky at the bottom with `position: sticky; bottom: 0`.
- Touch targets ≥ 44px per WCAG.

## 10. Out of scope (v1)

- Don't-pass / don't-come (no math in crapless).
- Come bets (would mean a 2nd come-point puck — UI complexity ↑).
- Repeater bets (rare even at Plaza).
- Multi-shooter pass-the-dice flow (this is electronic; player is always the shooter).
- Player-controlled "place bets working/off on come-out" toggle (v1: always working).
- Sound effects for Fire Bet near-misses.
- Save/restore active bets across sessions (bets are session-only; balance persists).

## 11. Testing checklist (manual)

A loose post-build list, not a formal test suite:

- [ ] Place $5 on pass, roll 7 come-out → +$5, back to come-out.
- [ ] Place $5 on pass, roll 2 → puck flips ON 2, can now place odds.
- [ ] With point 2 set, place max odds ($25) → roll 2 → +$5 pass + $150 odds (6:1).
- [ ] Same scenario, roll 7 → -$5 pass -$25 odds, seven-out.
- [ ] Place $5 on each place bet, roll 4 → +$9 on place 4 only.
- [ ] Field $5, roll 12 → +$10 (2:1).
- [ ] Hard 8 $5, roll 4-4 → +$45 (9:1).
- [ ] Hard 8 $5, roll 5-3 → -$5.
- [ ] Fire Bet $5 on come-out, make 4 unique points → +$120 (24:1).
- [ ] All Small $5 on come-out, hit 2/3/4/5/6 before any 7 → +$150 (30:1).
- [ ] Mobile: rotate phone, layout doesn't break.
- [ ] Settings gear: toggle music/SFX mute, sliders update in real time.
- [ ] Reload page mid-session: balance restored, bets reset.

## 12. Open questions

None blocking. The user has approved scope (full Vegas + bonus bets, no Repeaters), dice tech (CSS 3D), imagery (CSS/SVG only), file naming (`craplesscraps.html`), and the drawer pattern for Props/Bonus.
