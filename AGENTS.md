# AGENTS.md — Diamond Casino

> Welcome to the floor. This is a small collection of browser games sharing a single visual brand, a shared chip stack, and a soundtrack-driven vibe. The dealer is generous, the dice are fair, the chips are virtual, the lights never go out.

Read this before touching code. It will save you time, save the user time, and keep the felt smooth.

---

## What this is

Diamond Casino is a **single-machine, single-player web casino**. Each game is **one self-contained HTML file** sitting next to its siblings, sharing a thin runtime (`casino-audio.js`), a thin asset library (`/sfx`, `/Music`), and a single localStorage key for the chip balance.

- No real money, no backend, no auth, no servers beyond a static HTTP host.
- The user runs `serve.bat` (Python's `http.server` on port 8080) and opens `http://localhost:8080/index.html`.
- Phones join via the same LAN — see `launcher.html` for the QR/share screen.

**The casino is meant to feel classy.** Dark purple felt, gold rims, neon accents, weighty interactions. Not garish, not mobile-game spammy. A little Vegas, a little neon-noir, a lot of "satisfying."

---

## Project structure

```
SlotsGame/                          (repo root, "OneDrive\Desktop\SlotsGame")
├── index.html                      Lobby — game grid + balance + add-funds modal + LIVE FROM THE FLOOR
├── launcher.html                   QR code / phone-share screen
├── slots.html                      Diamond Deluxe — 5×3 hold-and-win slot
├── kraken.html                     Kraken's Depths — slot with two side wheels
├── lucky7saloon.html               Lucky 7 Saloon — Megaways-style slot
├── dragontree.html                 Dragon Tree — Japanese-themed slot
├── blackjack.html                  Classic 6-deck blackjack
├── multihandblackjack.html         3-hand blackjack
├── roulette.html                   American roulette (global wheel, Firestore-backed)
├── rocket.html                     Rocket crash game (global rounds, Firestore-backed)
├── plinko.html                     Risk-adjustable plinko
├── mines.html                      Mines — uncover cells, avoid bombs
├── easycraps.html                  Simplified craps
├── standardcraps.html              Standard rules craps
├── craplesscraps.html              Crapless bubble craps (Plaza-style)
├── casino-audio.js                 Settings / Music / SettingsUI / Loader / History
├── casino-account.js               Firebase auth + CasinoStats + RocketLive + RouletteLive (ES module)
├── casino-jackpots.js              Community Mini/Minor/Major/Grand jackpot pools
├── casino-bots.js                  Bot players, presence, per-game wins feed, lobby pills
├── casino-chat.js                  Slide-up chat panel (roulette + rocket only)
├── service-worker.js               PWA shell — precache + runtime caches (bump CACHE_VERSION to ship)
├── manifest.webmanifest            PWA manifest
├── serve.bat                       Local static server (python -m http.server 8080)
├── sfx/                            SFX library (mp3) + generator
├── Music/                          Background tracks (AAC m4a @ 128k, externally sourced)
├── tests/                          Node CJS unit tests for game cores
│   ├── lucky7saloon-core.test.cjs
│   ├── roulette-core.test.cjs
│   ├── dragontree-math.test.cjs
│   └── dragontree-audio.test.cjs
├── docs/superpowers/               Specs and implementation plans (when used)
└── node_modules/                   Mostly unused (firebase is a runtime dep, fetched off CDN)
```

**This IS a git repo** (initialized 2026-05-16). The user runs `git push` themselves unless they explicitly ask you to commit/push.

`.gitignore` excludes the `.wav` audio masters under `/Music` — only the `.m4a` web transcodes ship to the repo (and to Netlify). Don't commit `node_modules`, `nanobanana-output/`, or `.superpowers/`.

The site is live on Netlify. The PWA precaches a small shell via `service-worker.js`; you MUST bump `CACHE_VERSION` whenever you change a shipped asset or the SW will serve the stale cached copy to existing clients. See "Service worker" below.

---

## House style — the visual brand

All games share these CSS custom properties (defined in each game's `:root`):

```css
--bg-0: #0a0418;          /* deep purple-black background */
--bg-1: #150828;          /* mid-purple */
--gold-0: #fff0a8;        /* highlight gold */
--gold-1: #ffd24a;        /* core gold */
--gold-2: #b8860b;        /* dark gold */
--gold-deep: #5c3d00;     /* shadow gold */
--neon-pink: #ff2e93;
--neon-cyan: #22d3ee;
--neon-violet: #a855f7;
--neon-green: #5cffa1;
--shadow-deep: 0 30px 60px -10px rgba(0,0,0,0.7), 0 18px 36px -18px rgba(0,0,0,0.5);
```

**Typography:**
- `Bungee Shade` — splashy titles (the "DIAMOND CASINO" logo, game titles)
- `Bungee` — labels, buttons, tags (uppercase, wide letter-spacing)
- `Outfit` — body text, descriptions (400 / 600 / 800 weights)
- `Geist Mono` — numbers (balance, payouts, chip denominations)

All loaded from Google Fonts via `<link>` in each game's head. Match the existing preconnect pattern when you copy.

**Background:** every game uses a stack of radial-gradients over a vertical linear-gradient, plus an SVG fractal-noise overlay (`body::before`, low opacity, mix-blend-mode overlay). Don't reinvent — copy from `blackjack.html` lines ~32–55 if you need it on a new page.

**Top chrome (each game):**
- Lobby link top-left (`.lobby-link` with `←` pseudo-element)
- Balance pill top-right (`.balance-link` with `BAL` label, `$X,XXX` value, green `+` button to add funds)
- Settings gear top-right (auto-injected by `SettingsUI.mount()` — appears at top-right corner)

---

## Shared scripts

Every game loads six shared scripts near the top of `<body>` in this order:

```html
<script src="casino-audio.js"></script>
<script type="module" src="casino-account.js"></script>
<script src="casino-jackpots.js"></script>
<script src="casino-level.js"></script>
<script src="casino-bots.js"></script>
<script src="casino-chat.js"></script>
```

`casino-account.js` is a real ES module — the others are classic scripts. The lobby (`index.html`) loads the same six.

---

## `casino-audio.js`

Loaded near the **top of `<body>`** in every page (this matters — see "Gotchas"). Exposes five global modules:

### `window.Settings`
Persists audio prefs across the whole casino under localStorage key `casino.settings`.
- `Settings.get()` → `{master, music, sfx, muteMusic, muteSfx}` (0–1 floats + bools)
- `Settings.set(patch)` — partial updates, fires listeners
- `Settings.onChange(fn)` — subscribe
- `Settings.musicVolume()` → effective music volume (0 if muted)
- `Settings.sfxVolume()` → effective SFX multiplier (each game's audio engine multiplies its gain by this)

### `window.Music`
A single `<audio>` element looped at body level.
- `Music.init(srcUrl)` — load a track. Volume auto-tracks `Settings.musicVolume()`.
- `Music.start()` — best-effort play (browsers gate audio behind a user gesture; `casino-audio.js` already listens for the first click/keydown/touchstart and unlocks automatically).
- `Music.pause()` — stops, lets the next gesture restart.

**Filenames with spaces or apostrophes:** wrap with `encodeURI("Music/High Roller's Room.m4a")`. Don't manually percent-encode.

### `window.SettingsUI`
- `SettingsUI.mount()` — injects the settings gear button + modal. Call once per page, typically right after the page's main init runs.
- `SettingsUI.open()` / `close()` — programmatic toggle.

### `window.Loader`
The brand-consistent diamond loading screen. **Auto-shows the moment `casino-audio.js` executes**, and auto-hides when:
1. `document.readyState === 'complete'` (window.load has fired)
2. Music has buffered enough to play (`readyState >= 2`) or failed (404 etc.)
3. Minimum 1.2 s display time elapsed
4. Or 8 s safety timeout

You shouldn't need to touch it. If you must:
- `Loader.hide()` — force-hide (e.g., if you finish init early)
- `Loader.show()` — show again (idempotent)

The loader is the canonical Diamond Casino brand moment. **Don't add a different loader to any individual game.**

### `window.History`
Per-game round log + the single source of truth for "a round happened."
- `History.record(game, bet, net, note)` — call at end of every round. `bet` is the wagered amount, `net` is profit (positive = win, negative = loss, 0 = push). `note` is freeform; specific strings trigger downstream behaviour (see below).
- `History.onChange(fn)` — fires after every `record()`. Use THIS for cross-cutting listeners (it survives wrap order); only wrap `History.record` itself if you need to mutate args or block the call.
- `History.getSession()` / `getAll()` — recent entries.

Three other shared scripts piggyback on `History.record`:
- `casino-audio.js` itself forwards the round to `CasinoStats.recordRound` (global stats).
- `casino-jackpots.js` wraps `History.record` to contribute every bet to the four pool tiers and roll for a trigger.
- `casino-bots.js` subscribes via `History.onChange` to post player big-wins into the recent-wins feed.

---

## `casino-account.js`  (ES module)

Firebase wiring. Provides `window.CasinoAccount`, `window.CasinoStats`, `window.RocketLive`, `window.RouletteLive`. The script ships a **no-op stub** synchronously and replaces it once the Firebase dynamic import resolves (`configured: true`). **Always poll for `configured === true` before subscribing** — subscribing to the stub gives you one fn(empty) call and silence forever.

- `CasinoAccount.user()` — current Firebase user (anonymous by default).
- `CasinoStats.subscribe(fn)` — global counters (`totalSpins`, `totalWagered`, `totalWon`, `jackpotsHit`).
- `CasinoStats.subscribePresence(fn)` — `{ gameKey: count }` of real players currently on each page (5 s heartbeat, 60 s stale).
- `CasinoStats.recordRound({ game, bet, win, note })` — writes a Firestore round entry. **Called automatically by `History.record`; don't call directly.** Honours the `BOT` note convention (see below).
- `CasinoStats.subscribeJackpots(fn, n)` — most-recent jackpot wins (cross-casino flyby banner data source).
- `RocketLive` / `RouletteLive` — per-round chat + cashout subscriptions for those two games' global multiplayer rounds.

---

## `casino-jackpots.js`

Four community pools (`mini` / `minor` / `major` / `grand`) shared across the casino. Reads/writes `/globals/jackpots` in Firestore. Wraps `History.record` to:
1. Contribute a percentage of every bet to all four pools.
2. Roll a per-tier per-spin probability — if true, fires a jackpot for the local player, credits balance, dispatches `'jackpot-win'` on `document`, and records the entry under the player's name.

Skips both contribution and trigger for entries with `note` containing `JACKPOT` (re-records of jackpot wins) and skips the trigger roll for entries with `note` matching `^BOT` (bot bets feed the pool but can never award a prize).

---

## `casino-level.js`

Bet-based XP and player leveling. Subscribes to `History.onChange` (skips entries with notes matching `/^BOT\b/i`), persists a single `totalXp` scalar to `casino.level.v1`, and on level-up credits chips to `casino.balance`, shows a slide-down toast top-center with a `blackjack_fanfare` SFX, and spawns a small ~700ms particle burst from the toast.

- `CasinoLevel.get()` → `{ level, xp, xpInLevel, xpForNext, totalXp }`
- `CasinoLevel.onChange(fn)` — subscribe.
- Dispatches `'level-up'` `CustomEvent` on `document` with `{ oldLevel, newLevel, reward }`.

Mounts a progress bar into any element matching `.level-bar-slot` (one per page). The bar's CSS is injected at runtime — no per-page styling needed. Reward formula: `newLevel * 50` chips per level-up, summed across multi-level jumps. Caps at level 99.

Underscore-prefixed members (`_xpForLevel`, `_applyEntry`, etc.) are test seams — don't call from game code.

The bar auto-mounts to `<body>` as a fixed-position element just below the `.cu-chip` (the auto-injected account avatar in the top-right). No per-page wiring needed — every game and the lobby get the bar automatically.

---

## `casino-bots.js`

The bot players + presence + per-game wins feed + per-game chat buffers. Big module; see "Bot players and presence" section below for the full picture.

---

## `casino-chat.js`

Slide-up chat panel. Mounts **only on `roulette.html` and `rocket.html`** (the rest of the games stay chat-free). Closed by default, never auto-opens. Hides those pages' native rail-card chats so the slide-up is the only chat surface. Reads/writes via `CasinoBots.subscribeChat(game, fn)` and `CasinoBots.sendChat(game, text)`.

---

## The shared bankroll

Every game reads and writes the same localStorage key:

```js
const BALANCE_KEY = 'casino.balance';
function loadBalance() {
  const v = parseFloat(localStorage.getItem(BALANCE_KEY));
  return isNaN(v) || v < 0 ? 1000 : v;
}
function persistBalance(v) {
  try { localStorage.setItem(BALANCE_KEY, String(v)); } catch (e) {}
}
```

Default starting balance: **$1,000** (a fresh tab gets handed a stack). Lobby and games both refresh the balance on `focus` / `pageshow`, so you can switch tables without re-loading.

**Other localStorage keys in active use** (don't collide with these):
- `casino.balance` — the chip stack
- `casino.settings` — audio prefs
- `casino.history.v1` — recent round entries (capped, written by `History.record`)
- `casino.bots.v5.*` — bot roster, feeds, chat, leader-election, presence heartbeats (current version is **v5**; bump when you change the bot schema)
- `casino.presence.tab` (sessionStorage) — per-tab id for Firestore presence
- `casino.level.v1` — player XP (single field: `{ totalXp: number }`); current level/progress derived on read

If you add a new key, prefix it `casino.` and keep it small — quota is shared per-origin.

---

## SFX library — `/sfx`

Every audio file is **mp3, 44.1kHz, 128kbps** (`output_format="mp3_44100_128"` in the generator). Existing categories:

| Prefix | What it is |
|---|---|
| `card_deal_a/b/c.mp3`, `card_hit`, `card_flip`, `card_peek`, `shuffle` | Blackjack cards |
| `chip_place_a/b/c`, `chip_stack_a/b`, `chip_select`, `chip_payout`, `chip_clear` | Clay-chip clacks |
| `win_chime`, `blackjack_fanfare`, `push_neutral`, `bust_thud`, `lose_low` | Outcome stings |
| `button_soft` | Generic UI press |
| `bubble_shake`, `bubble_settle`, `puck_on/off`, `seven_out`, `point_made`, `field_win`, `hardway_win`, `props_win`, `fire_light`, `fire_big` | Craps |

**Generating new SFX** (`sfx/generate_sfx.py`):
- Requires `ELEVENLABS_API_KEY` env var.
- Auto-skips existing files (idempotent — safe to re-run).
- Append `(filename, prompt, duration, prompt_influence)` tuples to the `SFX = [...]` list.
- **ElevenLabs minimum duration is 0.5 s.** Don't request 0.4 s — the API rejects it.
- For high-quality, very-short percussive SFX: keep duration ≤ 1.5 s, `prompt_influence` 0.75–0.90, and include phrases like "completely dry, close microphone, no reverb, no music, no continuation."

**Audio engines:** Each game has its own small audio engine (look at `playSfx` in `craplesscraps.html` for the pooled-`<audio>` pattern, or `AudioFX` in `slots.html`/`kraken.html`/`blackjack.html` for the WebAudio-synthesized pattern). Both multiply their output by `Settings.sfxVolume()`. **Missing SFX files must fail silently** — browsers will console-404 the file but the game must keep playing. The pattern is `audio.play().catch(() => {})`.

---

## Music library — `/Music`

`.m4a` files at AAC 128 kbps (transcoded from `.wav` masters via `ffmpeg -c:a aac -b:a 128k -movflags +faststart`). Total deploy weight ≈ 10.5 MB instead of ~121 MB of WAV. Filenames intentionally have spaces and curly apostrophes — preserve them, use `encodeURI` to load. Masters live in the same folder but are gitignored.

| Game | Track |
|---|---|
| Slots | `Diamond Spin.m4a` |
| Kraken | `Kraken's Haunted Jackpots.m4a` (note: curly `'`, not straight `'`) |
| Blackjack | `Blackjack Velvet.m4a` |
| Lucky 7 Saloon | `Snake Eyes Shuffle.m4a` |
| Crapless Craps | `High Roller's Room.m4a` |

Loaded via `Music.init(encodeURI("Music/<filename>.m4a"))` once per page.

---

## Gotchas — things that have bitten us

These will save you a debugging session:

1. **`casino-audio.js` must be loaded near the TOP of `<body>`**, not the bottom. The Loader auto-mounts when the script executes; if you put the script tag at the end of body, the user sees the page render briefly before the loader covers it. Every game already has `<script src="casino-audio.js"></script>` as the first child of body — leave it there.

2. **Single `<script>` block per game.** When you append to a game's inline JS, do NOT close and reopen `<script>` tags. Function declarations don't hoist across script-tag boundaries — `function foo() {}` in block #1 is not visible in block #2. We were burned on `rerenderAllStacks` for hours. One script block, all your code goes inside it.

3. **Percentage heights in flexbox containers don't always resolve.** If you put a child with `height: 78%` inside a flex item whose own height isn't fully definite, you'll get `0px`. Use explicit pixel sizes for the dice tray and similar fixed-size containers. (We learned this when the bubble dome collapsed.)

4. **CSS-3D `transform-style: preserve-3d` works fine, but make sure the parent has `perspective`** and the chain isn't broken by a `display:` that flattens 3D contexts. When in doubt, debug with a giant `outline: 3px solid magenta` on the element — if you can see THAT but not the content, it's a 3D issue, not a positioning issue.

5. **Local server + browser cache.** `python -m http.server` doesn't aggressively cache, but Chrome does. After a CSS or JS edit, hard-refresh (Ctrl+F5) or open DevTools → Network → check "Disable cache." If the user reports "I changed it and nothing happened," 80% it's cache.

6. **Git + a few tests.** Repo is initialized. There are Node CJS unit tests under `tests/` (run individually: `node tests/<name>.test.cjs`). They cover game cores (lucky7saloon, roulette, dragontree math + audio). No CI yet. Most verification is still `open the page → click stuff → confirm visually` — UI behaviour can't be tested headlessly here.

7. **Don't import external CSS or JS libraries** unless explicitly asked. The casino is vanilla on purpose — adds up quickly when every game would otherwise drag in its own framework. The only cross-page dependency is `casino-audio.js`.

8. **HTML entities in dispatch prompts can get over-decoded.** If you spawn an Agent and paste code that includes `%25` or `%23` (legitimate percent-encoding in SVG data URIs), the agent may "decode" those to `%` and `#`. Either pass raw code (preferred) or instruct the agent explicitly: "Do not interpret percent-encoded characters as HTML entities."

---

## Adding a new game

Rough recipe — adapt to taste:

1. **Copy a sibling** (e.g., `blackjack.html`) and gut the body/logic, keeping the head + `:root` + top-chrome CSS + the script tag at the top of body.
2. **Pick a music track**, drop the `.m4a` in `/Music` (transcode the `.wav` master with `ffmpeg -i master.wav -c:a aac -b:a 128k -movflags +faststart out.m4a`), wire `Music.init(encodeURI("Music/<file>.m4a"))` after `SettingsUI.mount()`.
3. **Reuse SFX** from `/sfx` where possible. Generate new ones via `sfx/generate_sfx.py` only when the existing library doesn't cover the moment.
4. **Add the lobby card** in `index.html` (4th item in `.games` grid). Each card has a `.preview.<gamename>` with a small CSS/SVG visual hint of the game.
5. **Test the full loop:** load lobby → click card → game loads → loader hides → music starts on first click → balance debits on bet → wins credit back → return to lobby → balance persists.

Keep the game self-contained in one HTML file. The casino's superpower is that each game can be opened in isolation and just works.

---

## Bot players and presence

`casino-bots.js` runs a simulated population of ~22 permanent regulars + procedurally-generated guests that wander the casino. They show up as:
- **Lobby presence pills** on every `.game-card[data-game]` (`● N PLAYING` / `QUIET`). The pill merges real-player count (from `CasinoStats.subscribePresence`) with bot count and renders the sum. **Don't add a separate presence indicator** — `casino-bots.js` owns the pill.
- **Recent-wins feed** per game. Roulette merges into the native `#recent-list`; rocket's bot cashouts merge into the existing `mergedCashouts()` flow (so they appear as dots on the trail and pills in the right rail); other games get a small fixed-position banner pinned top-center.
- **Chat** on roulette + rocket only (via `casino-chat.js`).

### The `BOT` note convention

When a bot completes a round, the engine calls `History.record(game, bet, net, 'BOT')`. Two downstream wrappers check for this:
- `casino-jackpots.js` — contributes the bet to the pool but **skips the trigger roll**. Bots can never award the local player a jackpot prize.
- `casino-account.js` `recordRound` — writes to `globals/stats` (so bot activity shows in `LIVE FROM THE FLOOR`) but **skips the per-user write** to `users/{uid}`. The signed-in player's personal stats are never inflated by bot bets.

**If you add new code that reacts to `History.record`, you almost certainly want to skip BOT entries.** Pattern:
```js
if (note && /^BOT\b/i.test(String(note))) return; // bot bet, leave it alone
```

### Listening for player wins

Prefer `History.onChange(fn)` over wrapping `History.record`. Wrap order with `casino-jackpots.js` and `casino-bots.js` is not guaranteed (both `setTimeout`-poll until `window.History` exists), and a poorly-ordered wrap chain will silently swallow your hook. `onChange` is fired by `casino-audio.js` itself and is wrap-independent. Track the last seen `ts` to dedup.

### Leader election

Only one tab simulates at a time. Tabs claim leadership via a heartbeat on `casino.bots.v5.leader` (4 s lease, 1.5 s refresh). Follower tabs read state from `localStorage` and listen for `storage` events. Cross-tab broadcasts piggyback on a `casino.bots.v5.bus` key whose value rotates with each message.

---

## Service worker

`service-worker.js` precaches the app shell on install and uses content-type-based runtime caches (audio: cache-first, html: network-first, assets: stale-while-revalidate).

**Bump `CACHE_VERSION` (currently `v75`) on EVERY shipped change to JS/CSS/HTML/SW itself.** Without a bump, existing PWA clients keep serving the stale cached copy from `RUNTIME_ASSET` and your fix never reaches them. The version string also rolls the precache name, which triggers eviction of old caches on `activate`.

If a user reports "I shipped a fix but they still see the old behaviour", first ask them to **hard-refresh** (Ctrl+F5). If that doesn't do it, confirm you bumped `CACHE_VERSION`.

Precached files are listed in `PRECACHE_URLS` at the top of the SW. New shared `.js` files and new game `.html` files should be added there.

---

## The spirit

This casino runs on three values:

- **Tactile.** Every action has weight — chips clack, dice clatter, buttons depress. Bias toward more SFX, not fewer. Bias toward shorter, satisfying animations (~150–400 ms) over long flourishes.
- **Generous.** The house is virtual; the player isn't here to lose. Wins should feel big — gold flashes, toast popups, chips flying back to the rail, fanfares. Losses should be quick and respectful — a dim, a sweep, no rubbing it in.
- **Cohesive.** Same gold gradients. Same Bungee Shade headers. Same dark felt. Same diamond loader. If you find yourself building a one-off visual treatment, ask whether you can express it with the existing tokens first.

When in doubt: **classy, satisfying, not garish.** Imagine a vintage-Vegas neon sign, not a free-to-play mobile app.

Now go shuffle something.
