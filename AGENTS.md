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
├── index.html                      Lobby — game grid + balance + add-funds modal
├── launcher.html                   QR code / phone-share screen
├── slots.html                      Diamond Deluxe — 5×3 hold-and-win slot
├── kraken.html                     Kraken's Depths — slot with two side wheels
├── lucky7saloon.html               Lucky 7 Saloon — Megaways-style slot
├── blackjack.html                  Classic 6-deck blackjack
├── craplesscraps.html              Crapless bubble craps (Plaza-style)
├── casino-audio.js                 Shared runtime — Settings / Music / SettingsUI / Loader
├── serve.bat                       Local static server (python -m http.server 8080)
├── sfx/                            SFX library (mp3) + generator
│   ├── generate_sfx.py             ElevenLabs SFX generator (skips existing)
│   └── *.mp3                       Card/chip/dice/UI/outcome sounds
├── Music/                          Background tracks (AAC m4a @ 128k, externally sourced; .wav masters kept locally but gitignored)
│   ├── Diamond Spin.m4a            → slots.html
│   ├── Kraken's Haunted Jackpots.m4a → kraken.html
│   ├── Blackjack Velvet.m4a        → blackjack.html
│   ├── Snake Eyes Shuffle.m4a      → lucky7saloon.html
│   └── High Roller's Room.m4a      → craplesscraps.html
├── docs/superpowers/               Specs and implementation plans (when used)
│   ├── specs/
│   └── plans/
└── node_modules/                   Mostly unused (http-server is an option)
```

**This IS a git repo** (initialized 2026-05-16). Commits welcome; the user runs `git push` themselves. No CI yet. No automated tests beyond `tests/lucky7saloon-core.test.cjs`.

`.gitignore` excludes the `.wav` audio masters under `/Music` — only the `.m4a` web transcodes ship to the repo (and to Netlify). Don't commit `node_modules`, `nanobanana-output/`, or `.superpowers/`.

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

## Shared runtime — `casino-audio.js`

Loaded near the **top of `<body>`** in every page (this matters — see "Gotchas"). Exposes four global modules:

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

Default starting balance: **$1,000** (a fresh tab gets handed a stack). Lobby and games both refresh the balance on `focus` / `pageshow`, so you can switch tables without re-loading. Don't store anything else in localStorage besides settings (`casino.settings`) and balance (`casino.balance`).

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

6. **No git, no tests.** Don't suggest commit messages, don't ask the user to "run the test suite." Verification is `open the page → click stuff → confirm visually`. Build small, ship small, let the user click.

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

## The spirit

This casino runs on three values:

- **Tactile.** Every action has weight — chips clack, dice clatter, buttons depress. Bias toward more SFX, not fewer. Bias toward shorter, satisfying animations (~150–400 ms) over long flourishes.
- **Generous.** The house is virtual; the player isn't here to lose. Wins should feel big — gold flashes, toast popups, chips flying back to the rail, fanfares. Losses should be quick and respectful — a dim, a sweep, no rubbing it in.
- **Cohesive.** Same gold gradients. Same Bungee Shade headers. Same dark felt. Same diamond loader. If you find yourself building a one-off visual treatment, ask whether you can express it with the existing tokens first.

When in doubt: **classy, satisfying, not garish.** Imagine a vintage-Vegas neon sign, not a free-to-play mobile app.

Now go shuffle something.
