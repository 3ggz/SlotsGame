# American Roulette - Design Spec

**Date:** 2026-05-17  
**Game file:** `roulette.html`  
**Lobby integration:** new card in `index.html` alongside Rocket, Plinko, Blackjack, Craps, and slots  
**Shared systems:** `casino-audio.js`, `casino-account.js`, `casino-jackpots.js`, `casino.balance`, Firebase-backed presence/chat/live feed when available

## 1. Goals

Build a full **American roulette** game for Diamond Casino with the same global-table feel as Rocket. Every player sees the same betting window, same wheel spin, and same outcome for each round. The game should feel clean, classy, and tactile: a large gold-rimmed wheel is the star, with useful live-table information in side rails.

The chosen direction is **Wheel First + Live Side Rails**:

- Big roulette wheel and ball animation as the visual centerpiece.
- Compact American betting felt below the wheel.
- Side display elements inspired by Rocket: global countdown, live players, last 20, hot/cold numbers, chat, and recent winning bets.
- Deterministic global outcomes so all browsers compute the same winning pocket for the same round.

This is virtual currency only. No backend balance, no real money, no regulated gambling claims.

## 2. Rules

Variant: **American roulette** with `0` and `00`.

Wheel pockets:

```text
0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1,
00, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2
```

Table numbers `1..36` use the standard American red/black layout. `0` and `00` are green.

Supported bets:

| Bet | Coverage | Payout |
|---|---:|---:|
| Straight | 1 number, including `0` or `00` | 35:1 |
| Split | 2 adjacent numbers | 17:1 |
| Street | 3-number row | 11:1 |
| Corner | 4-number block | 8:1 |
| Six-line | 2 adjacent rows | 5:1 |
| Top line / first five | `0`, `00`, `1`, `2`, `3` | 6:1 |
| Dozen | `1-12`, `13-24`, `25-36` | 2:1 |
| Column | each vertical column of 12 numbers | 2:1 |
| Low / High | `1-18`, `19-36` | 1:1 |
| Even / Odd | `2,4,...,36` or `1,3,...,35` | 1:1 |
| Red / Black | standard color groups | 1:1 |

All bets lose on `0` and `00` except bets that explicitly include that pocket.

## 3. Quick Covers

The game includes a compact **Quick Covers** drawer for bets players think of as side bets, while keeping payouts grounded in standard roulette math. These are not special payout contracts; they are shortcuts that place multiple ordinary bets at once.

- **Top Line**: places the first-five bet.
- **Neighbors**: pick a wheel pocket and cover it plus two pockets on each side with straight bets.
- **Finals**: cover all table numbers ending in a selected digit, excluding `0` and `00`.

Quick Covers must show the resulting total stake before placement. Example: a `$5` neighbors cover places five `$5` straight bets for `$25` total.

## 4. Round Model

Roulette follows Rocket's global pattern but with fixed-length phases.

Timing target:

- Betting window: 15 seconds.
- Spin / reveal: 8 seconds.
- Result hold: 4 seconds.
- Total round length: 27 seconds.

The exact constants may be tuned during implementation, but all clients must use the same constants.

Global round data:

```js
const ROULETTE_EPOCH_MS = Date.UTC(2026, 4, 17, 0, 0, 0);
const BETTING_MS = 15000;
const SPIN_MS = 8000;
const RESULT_MS = 4000;
const ROUND_MS = BETTING_MS + SPIN_MS + RESULT_MS;
```

Clients compute:

```js
roundIndex = Math.floor((casinoNow() - ROULETTE_EPOCH_MS) / ROUND_MS);
phase = betting | spinning | result;
roundId = "roulette-" + roundIndex;
outcome = seededPocket(roundIndex);
```

Clock sync mirrors Rocket:

- Use Firebase server timestamp ping when `RouletteLive.syncClock()` is available.
- Fall back to local `Date.now()` if Firebase is unavailable.
- Keep the game playable even when live features are no-op.

## 5. Deterministic Outcome

Each round index maps to one of 38 pockets through a small deterministic PRNG. The result must be unbiased over the long run and stable across browsers.

Implementation direction:

```js
function seededUnit(roundIndex, salt) {
  let x = (Math.imul((roundIndex >>> 0) ^ salt, 0x9e3779b1) + salt) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function seededPocket(roundIndex) {
  const idx = Math.floor(seededUnit(roundIndex, 0x72507711) * 38);
  return AMERICAN_WHEEL[idx];
}
```

The animation should derive its final wheel angle from the same winning pocket. The outcome is known before the animation starts; the visual drama is in how the ball lands, not in client-local randomness.

## 6. Page Layout

Top chrome:

- Lobby link.
- Balance pill with add-funds button.
- Profile/account chip from `casino-account.js`.
- History button hidden by account UI, with history still available through profile.
- Rules button for roulette rules.

Main layout:

1. Header strip with title, last 20 result pills, and table status.
2. Wheel stage centered. The wheel is large on desktop and still prominent on mobile.
3. Side rails around or beside the wheel:
   - Round countdown / phase.
   - Live player count.
   - Recent winners for the current result.
   - Hot/cold numbers from recent deterministic outcomes.
   - Table chat.
4. Betting felt below:
   - American `0` / `00` green strip.
   - 3x12 number grid.
   - Dozens and columns.
   - Outside bets.
   - Quick Covers drawer.
5. Sticky chip rail:
   - Denominations: `$1`, `$5`, `$25`, `$100`, `$500`.
   - Clear, Undo, Rebet, Double.
   - Total bet display.
   - Lock-state display during spin/result.

The first screen is the game itself, not a landing page.

## 7. Visual Design

Use the existing Diamond Casino visual brand:

- Deep purple-black background stack with subtle noise overlay.
- Gold wheel rim, dark felt, neon cyan/pink/violet/green accents.
- Bungee Shade title, Bungee labels/buttons, Outfit body, Geist Mono numbers.
- Cards only for functional panels, not nested decorative card stacks.

Wheel:

- CSS/SVG roulette wheel with 38 pockets and a real American pocket order.
- Gold outer rim, dark inner bowl, alternating red/black/green pockets.
- White/ivory ball with glow and subtle trail.
- Small deflector pegs around the bowl.

Animation:

1. Betting closes with a subtle felt lock pulse.
2. Wheel accelerates clockwise.
3. Ball orbits counter-clockwise with a brighter trail.
4. Ball slows, jitters across deflectors, and drops into the target pocket.
5. Wheel eases to the final target angle.
6. Winning pocket emits a gold/cyan spotlight.
7. Winning zones on the felt pulse; losing chips sweep away.
8. Payout chips fly back to the rail for winners.

Motion should be satisfying but not too long. Respect `prefers-reduced-motion` by shortening the spin and avoiding intense trails.

## 8. Betting Interaction

Placement:

- Tap/click a betting zone to add the selected chip denomination.
- Chips stack visually on the zone.
- For inside bets requiring boundaries, the felt should expose clear interactive hit targets:
  - Number cells for straight bets.
  - Thin split lanes between adjacent cells.
  - Street row handles.
  - Corner nodes.
  - Six-line row-pair handles.
- On mobile, tiny hit targets should be assisted by a zoomed bet picker or enlarged overlay when tapping near intersections.

Controls:

- **Undo** removes the most recent placed chip group.
- **Clear** returns all current-round chips to the balance before betting closes.
- **Rebet** restores the previous spin's bet layout if affordable.
- **Double** doubles all current bets if affordable.

Balance:

- Deduct stake when the player places a chip, matching the tactile chip-stack behavior in craps.
- Return stake on clear/undo before betting closes.
- On result, add gross payout plus returned winning stake for winning bets.
- Record net result through `History.record("roulette", totalBet, net, note)`.

## 9. Live Features

Extend `casino-account.js` with a `RouletteLive` global, mirroring `RocketLive`:

```js
window.RouletteLive = {
  configured: false,
  playerLabel: () => "Player",
  syncClock() { return Promise.resolve(0); },
  subscribeWins(roundId, fn) { try { fn([]); } catch (e) {} return () => {}; },
  recordWin() { return Promise.resolve(); },
  subscribeChat(fn) { try { fn([]); } catch (e) {} return () => {}; },
  sendChat() { return Promise.resolve(); },
};
```

Firestore collections:

- `/rouletteRoundWins/{roundId}/wins/{id}`: append-only winning bet summaries.
- `/rouletteChat/{id}`: table chat, same 160-character limit as Rocket.
- `/rouletteClock/{uid}`: server-time sync pings.

Presence:

- Add `roulette.html: "roulette"` to `GAME_BY_FILE` in `casino-account.js`.
- Existing `/tablePresence` powers lobby badges and in-table player count.

Live feed payload:

```js
{
  roundId,
  number: "17",
  color: "black",
  bet,
  payout,
  label: "Straight 17",
  player,
  uid,
  ts
}
```

If Firebase rules are not updated yet, all live calls fail silently and local roulette still works.

## 10. State Model

Core state:

```js
const State = {
  balance,
  chipDenom: 5,
  activeRound: null,
  roundOffsetMs: 0,
  phase: "betting",
  currentBets: [],
  previousBets: [],
  undoStack: [],
  liveWins: [],
  hotColdWindow: 120,
  lastResultRoundId: null,
  spinning: false,
};
```

Bet object:

```js
{
  id: "straight:17",
  type: "straight",
  label: "17",
  numbers: ["17"],
  amount: 5,
  payout: 35
}
```

Resolver:

```js
function resolveBets(bets, outcome) {
  const wins = [];
  const losses = [];
  let totalBet = 0;
  let grossPaid = 0;

  for (const bet of bets) {
    totalBet += bet.amount;
    if (bet.numbers.includes(outcome)) {
      const payout = bet.amount * bet.payout + bet.amount;
      grossPaid += payout;
      wins.push({ bet, payout });
    } else {
      losses.push({ bet });
    }
  }

  return { wins, losses, totalBet, grossPaid, net: grossPaid - totalBet };
}
```

Keep roulette math in small pure functions and expose a `window.RouletteCore` object for tests.

## 11. Audio

Use the existing SFX library where possible:

- `chip_select`, `chip_place_a/b/c`, `chip_clear`, `chip_payout`
- `button_soft`, `win_chime`, `lose_low`, `push_neutral`

Add generated roulette-specific SFX only if the current library is not enough:

| Filename | Use | Duration |
|---|---|---:|
| `roulette_spin.mp3` | wheel acceleration and steady spin loop-style bed | 1.5s |
| `roulette_ball_tick.mp3` | dry ivory ball ticking over deflectors | 0.7s |
| `roulette_ball_drop.mp3` | ball drops into pocket with small clatter | 0.8s |
| `roulette_result_win.mp3` | bright compact result sting | 0.9s |

All audio must respect `Settings.sfxVolume()`. Missing SFX fail silently.

Music:

- Prefer reusing an existing lounge/casino track if it fits.
- If a new track is added later, load via `Music.init(encodeURI("Music/<file>.m4a"))`.
- Do not add WAV masters to git.

## 12. Lobby Integration

Add a roulette card to `index.html`:

- `href="roulette.html"`
- `data-game="roulette"`
- Title: `ROULETTE`
- Tagline: `GLOBAL AMERICAN WHEEL`
- Description: shared global spins, American `0`/`00`, inside/outside bets, live table feed.
- Meta: `GLOBAL`, `0 + 00`, `SIDE BETS`

Preview:

- Small gold-rimmed roulette wheel with red/black/green pockets.
- Tiny ball trail.
- Compact felt strip underneath.

Also update:

- `service-worker.js` cache list, if it enumerates game files.
- `manifest.webmanifest` shortcuts, if game shortcuts are present.
- `casino-account.js` `GAME_BY_FILE`.
- `docs/firestore.rules` with roulette live collections.

## 13. Error Handling

- If localStorage balance write fails, keep in-memory balance and continue.
- If a player cannot afford a chip placement, shake the balance pill and play a low sound.
- If Firebase is unavailable, no-op live features and keep deterministic rounds local.
- If the page loads during spin/result, render the current global phase immediately.
- If a player arrives after betting closes, disable placement until the next round.
- If an active local bet exists and the browser sleeps through a result, resolve it on the next frame using the round outcome.
- If audio context fails, the game remains playable.

## 14. Testing

Automated:

- Add `tests/roulette-core.test.cjs`.
- Test deterministic outcomes are stable for known round indexes.
- Test red/black/green classification.
- Test all bet coverage builders.
- Test payouts for straight, split, street, corner, six-line, top line, dozens, columns, outside bets.
- Test `0` and `00` make outside bets lose.
- Test quick-cover stake expansion for neighbors and finals.

Manual browser verification:

- Open lobby, click Roulette, loader hides.
- Confirm wheel-first layout with live side rails on desktop.
- Confirm mobile layout stacks cleanly with tappable bet controls.
- Place straight, outside, and top-line bets during betting window.
- Confirm betting locks during spin.
- Confirm same round outcome is shown from a hard refresh during the same round.
- Confirm payout and balance update correctly.
- Confirm clear, undo, rebet, and double controls.
- Confirm chat and live player count degrade gracefully if Firebase is unavailable.
- Confirm no console errors during initial load, betting, spin, result, and next round.

## 15. Out Of Scope

- Real-money wagering, backend balances, withdrawals, deposits, or regulated gambling workflows.
- European/French roulette, single-zero rules, La Partage, En Prison.
- Certified RTP language.
- External JS/CSS game libraries.
- Multiplayer account-to-account settlement.
- Saving active bet layouts across browser restarts.

## 16. Open Questions

None blocking. The user approved American roulette and selected the Wheel First layout with Rocket-style live side panels.
