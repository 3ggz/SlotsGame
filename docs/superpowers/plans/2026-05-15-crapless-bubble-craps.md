# Crapless Bubble Craps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vegas-authentic crapless bubble craps game as a self-contained `craplesscraps.html` page in the Diamond Casino, with full bet menu (pass, place 2-12, field, hardways, props, hop, Fire Bet, All-Tall/Small/Make), CSS-3D dice in a CSS-rendered bubble dome, and matching aesthetic.

**Architecture:** One self-contained HTML file (mirroring `blackjack.html`/`kraken.html`/`slots.html`). Shared infrastructure (`casino-audio.js`, `casino.balance` in localStorage) is reused as-is. All logic is plain JS inside the page; bet resolution is a pure function on a single `game` state object. SFX go through a small audio pool layer (same pattern as the other games). Visual is CSS-3D for dice, CSS gradients/SVG for the bubble dome, no external libraries.

**Tech Stack:** HTML5, CSS3 (3D transforms, animations, gradients), vanilla JS, Web Audio via `<audio>` element pool, existing `casino-audio.js` for music + settings + balance integration, ElevenLabs (offline, via the existing `sfx/generate_sfx.py` script) for new sound effects.

**Spec:** `docs/superpowers/specs/2026-05-15-crapless-bubble-craps-design.md`

**Working directory:** `C:\Users\markh\OneDrive\Desktop\SlotsGame`

**Note on environment:** This project is vanilla HTML/JS with no test framework and is **not** a git repository. Tasks use **browser-based verification** instead of unit tests, and **save checkpoints** instead of commits. Each task is structured so its result can be confirmed by opening the file in a browser and performing a specific check before moving on.

**Local server:** Existing `serve.bat` (or run `npx http-server -p 8080` from project root). Open `http://localhost:8080/craplesscraps.html`. All testing is done in a real browser, not via file:// (clipboard / certain APIs require http).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `craplesscraps.html` | Create | Entire game — HTML structure, all CSS, all JS, references shared `casino-audio.js` |
| `index.html` | Modify | Append 4th game card (Crapless Craps) after the blackjack card; add CSS for `preview.craps` |
| `sfx/generate_sfx.py` | Modify | Append 11 new SFX entries to the `SFX` list |
| `sfx/bubble_shake.mp3` ... | Create (via Python script) | 11 new audio files |
| `Music/Bubble Craps Lounge.wav` | Out of scope | Music generation handled externally |

The single-file approach is the existing pattern. Don't split into modules.

---

## Task Index

1. Create page skeleton (shell, links, settings)
2. Bubble dome visual (static, no dice yet)
3. CSS-3D dice cubes with pip faces
4. `rollDice()` animation, lands on target face
5. `game` state object + `resolveRoll` pure function (with console-log verification)
6. Felt layout: PLACE strip + FIELD + HARDWAYS + PASS + ODDS (visual only)
7. Chip rail with denomination chips, CLEAR, ROLL/SHAKE buttons
8. Chip placement on bet zones (click handlers + stack rendering)
9. Wire SHAKE → resolver → balance + winning-zone glow
10. Puck (ON/OFF flip + slide to point number)
11. Indicator row (last roll, fire dots, shooter status, point state)
12. PROPS drawer (any 7, any craps, aces, boxcars, yo, ace-deuce, C&E, horn, world, hop grid)
13. BONUS drawer + Fire Bet + All-Small + All-Tall + Make-em-All logic
14. Audio engine + SFX hookups
15. Append 11 ElevenLabs prompts to `sfx/generate_sfx.py`
16. Lobby integration: add 4th card to `index.html`
17. Mobile polish + final test pass per spec section 11

---

## Task 1: Create page skeleton

**Files:**
- Create: `craplesscraps.html`

- [ ] **Step 1: Create the file with HEAD, fonts, and global styles**

Create `craplesscraps.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Diamond Casino — Crapless Craps</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Bungee+Shade&family=Outfit:wght@400;600;800&family=Geist+Mono:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root {
  --bg-0: #0a0418;
  --bg-1: #150828;
  --gold-0: #fff0a8;
  --gold-1: #ffd24a;
  --gold-2: #b8860b;
  --gold-deep: #5c3d00;
  --neon-pink: #ff2e93;
  --neon-cyan: #22d3ee;
  --neon-violet: #a855f7;
  --neon-green: #5cffa1;
  --felt-deep: #1a0838;
  --felt-mid: #2a0d4e;
  --felt-edge: #0a031f;
  --die-face: #f5f0e2;
  --die-pip: #1a0608;
  --shadow-deep: 0 30px 60px -10px rgba(0,0,0,0.7), 0 18px 36px -18px rgba(0,0,0,0.5);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  font-family: 'Outfit', sans-serif;
  color: #fff;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(168,85,247,0.18) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(255,46,147,0.15) 0%, transparent 55%),
    linear-gradient(180deg, var(--bg-0), var(--bg-1) 60%, var(--bg-0));
  background-attachment: fixed;
  user-select: none;
  -webkit-user-select: none;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/></svg>");
}

/* LOBBY + BALANCE LINKS — copied pattern from blackjack.html */
.lobby-link {
  position: fixed;
  top: 12px; left: 12px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px 8px;
  border-radius: 12px;
  text-decoration: none;
  font-family: 'Bungee', cursive;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--gold-1);
  background: linear-gradient(180deg, rgba(42,18,77,0.85), rgba(15,4,30,0.85));
  backdrop-filter: blur(8px);
  box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.35), 0 3px 0 rgba(0,0,0,0.5);
  transition: transform 0.1s, filter 0.15s;
}
.lobby-link::before { content: '←'; font-size: 14px; }
.lobby-link:hover { filter: brightness(1.15); }
.lobby-link:active { transform: translateY(2px); }

.balance-link {
  position: fixed;
  top: 12px; right: 12px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px 8px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(42,18,77,0.85), rgba(15,4,30,0.85));
  backdrop-filter: blur(8px);
  box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.35), 0 3px 0 rgba(0,0,0,0.5);
}
.balance-link .label {
  font-family: 'Bungee', cursive;
  font-size: 9px;
  letter-spacing: 0.22em;
  color: rgba(255,210,74,0.75);
}
.balance-link .value {
  font-family: 'Geist Mono', monospace;
  font-weight: 800;
  font-size: 14px;
  color: #fff;
}
.balance-link .btn-add {
  width: 26px; height: 26px;
  border-radius: 7px;
  border: 0;
  font-family: 'Bungee', cursive;
  font-size: 14px;
  cursor: pointer;
  color: #0a0418;
  background: linear-gradient(180deg, #5cffa1, #14b85a);
  box-shadow: 0 2px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4);
}
.balance-link .btn-add:active { transform: translateY(1px); }

/* STAGE — main content container */
.stage {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  max-width: 1080px;
  margin: 0 auto;
  padding: 70px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
</head>
<body>

<a class="lobby-link" href="index.html">LOBBY</a>
<div class="balance-link">
  <span class="label">BAL</span>
  <span class="value">$<span id="balance">0</span></span>
  <button class="btn-add" id="btn-add" title="Add chips">+</button>
</div>

<div class="stage">
  <!-- dome + indicator + felt + drawers + chip rail will go here -->
  <div style="color:#888; text-align:center; padding:40px;">SKELETON</div>
</div>

<script src="casino-audio.js"></script>
<script>
if (window.SettingsUI) SettingsUI.mount();

/* shared balance — same pattern as other games */
const BALANCE_KEY = 'casino.balance';
function loadBalance() {
  const v = parseFloat(localStorage.getItem(BALANCE_KEY));
  return isNaN(v) || v < 0 ? 1000 : v;
}
function persistBalance(v) {
  try { localStorage.setItem(BALANCE_KEY, String(v)); } catch (e) {}
}
function fmt(n) {
  const cents = Math.round(n * 100) / 100;
  if (Number.isInteger(cents)) return cents.toLocaleString('en-US');
  return cents.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
let balance = loadBalance();
function refreshBalance() {
  document.getElementById('balance').textContent = fmt(balance);
}
refreshBalance();

document.getElementById('btn-add').addEventListener('click', () => {
  // Open inline add-funds modal here in a later task. For now, navigate to lobby.
  window.location.href = 'index.html';
});

/* Music — initialize; will fail gracefully if the file isn't there yet */
if (window.Music) {
  Music.init('Music/Bubble%20Craps%20Lounge.wav');
}
</script>

</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Start the local server (`serve.bat` or `npx http-server -p 8080`).
Open `http://localhost:8080/craplesscraps.html`.

Expected:
- Page loads with dark purple gradient background.
- Top-left: gold "← LOBBY" link, clicking it goes to `index.html`.
- Top-right: balance pill showing current balance (1,000 if first-time), green + button.
- Top-right corner: settings gear icon (auto-injected by `casino-audio.js`); clicking opens the audio settings modal.
- Center placeholder text "SKELETON".
- Browser console: no errors. (A 404 on `Music/Bubble Craps Lounge.wav` is acceptable — file doesn't exist yet.)

- [ ] **Step 3: Save checkpoint**

The file is saved. Move to Task 2.

---

## Task 2: Bubble dome visual (static)

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append dome CSS inside the existing `<style>` block (before the closing `</style>`)**

```css
/* BUBBLE DOME */
.dome-wrap {
  position: relative;
  margin: 0 auto;
  width: 320px;
  height: 320px;
  display: grid;
  place-items: center;
}
@media (max-width: 720px) {
  .dome-wrap { width: 240px; height: 240px; }
}

.dome {
  position: relative;
  width: 100%;
  height: 78%;
  border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%;
  background:
    radial-gradient(ellipse 60% 28% at 50% 14%, rgba(255,255,255,0.45), transparent 70%),
    radial-gradient(circle at 50% 60%, rgba(168,85,247,0.12), rgba(10,4,24,0.6) 70%),
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.35));
  box-shadow:
    inset 0 0 30px rgba(168,85,247,0.25),
    inset 0 -8px 22px rgba(0,0,0,0.5),
    inset 0 4px 12px rgba(255,255,255,0.15),
    0 14px 44px rgba(0,0,0,0.6),
    0 0 40px rgba(255,210,74,0.08);
  overflow: hidden;
  display: grid;
  place-items: center;
}

/* Gold rim — thin ring around the dome */
.dome::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  padding: 3px;
  background: conic-gradient(from 220deg,
    var(--gold-0), var(--gold-1) 18%, var(--gold-deep) 28%,
    var(--gold-1) 42%, var(--gold-0) 55%, var(--gold-deep) 70%,
    var(--gold-1) 84%, var(--gold-0));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  filter: drop-shadow(0 0 6px rgba(255,210,74,0.5));
  pointer-events: none;
}

/* Air-pulse layer that swells while shaking */
.dome::after {
  content: '';
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,210,74,0.18), transparent 70%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
.dome.shaking::after { opacity: 1; animation: airPulse 0.7s ease-in-out infinite; }
@keyframes airPulse {
  0%, 100% { transform: scale(0.85); }
  50%      { transform: scale(1.15); }
}

/* Fan grill below the dome */
.fan {
  position: relative;
  width: 70%;
  height: 18%;
  border-radius: 0 0 14px 14px;
  background: linear-gradient(180deg, #1a0838 0%, #0a0319 100%);
  box-shadow:
    inset 0 0 0 1.5px rgba(255,210,74,0.4),
    0 10px 24px rgba(0,0,0,0.6);
  margin-top: 6px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 3px;
  padding: 6px;
}
.fan-slat {
  background: linear-gradient(180deg, rgba(0,0,0,0.7), rgba(168,85,247,0.18));
  border-radius: 2px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
.fan.glowing .fan-slat {
  background: linear-gradient(180deg, rgba(255,210,74,0.25), rgba(168,85,247,0.3));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 0 8px rgba(255,210,74,0.4);
}

/* Dust motes — small bright dots */
.dust {
  position: absolute;
  width: 3px; height: 3px;
  border-radius: 50%;
  background: rgba(255,210,74,0.6);
  filter: blur(0.5px);
  pointer-events: none;
  animation: drift 5s linear infinite;
}
@keyframes drift {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  20%  { opacity: 0.8; }
  100% { transform: translateY(-180px) translateX(20px); opacity: 0; }
}
```

- [ ] **Step 2: Replace the SKELETON placeholder with the dome markup**

Find `<div style="color:#888; ...">SKELETON</div>` in the body. Replace with:

```html
<div class="dome-wrap">
  <div class="dome" id="dome">
    <div id="dice-container" style="color: var(--gold-1); font-family: 'Bungee', cursive; font-size: 22px;">⚀ ⚄</div>
    <div class="dust" style="left: 30%; bottom: 20%; animation-delay: 0s;"></div>
    <div class="dust" style="left: 60%; bottom: 30%; animation-delay: 1.5s;"></div>
    <div class="dust" style="left: 45%; bottom: 15%; animation-delay: 3s;"></div>
  </div>
  <div class="fan" id="fan">
    <span class="fan-slat"></span><span class="fan-slat"></span>
    <span class="fan-slat"></span><span class="fan-slat"></span>
    <span class="fan-slat"></span><span class="fan-slat"></span>
    <span class="fan-slat"></span>
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

Reload `craplesscraps.html`.

Expected:
- Centered dome with gold rim and a subtle glassy gradient.
- Two unicode dice symbols inside in gold (will be replaced with real dice in Task 3).
- Fan grill below the dome with 7 vertical slats and a gold inset border.
- Three tiny gold dust motes drifting upward inside the dome (CSS animation).
- On mobile-sized viewport (≤720px), dome shrinks to ~240px.

- [ ] **Step 4: Save checkpoint**

---

## Task 3: CSS-3D dice cubes

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append dice CSS to the `<style>` block**

```css
/* DICE — CSS 3D cubes */
.dice-stage {
  position: relative;
  width: 110px;
  height: 70px;
  perspective: 600px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  place-items: center;
}
.die {
  position: relative;
  width: 44px;
  height: 44px;
  transform-style: preserve-3d;
  transition: transform 0s; /* set explicitly when rolling */
}
.die .face {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(160deg, var(--die-face), #d8d1bf);
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,0.15),
    inset 0 -3px 6px rgba(0,0,0,0.18),
    inset 0 2px 4px rgba(255,255,255,0.6),
    0 4px 10px rgba(0,0,0,0.4);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  padding: 5px;
  gap: 1px;
}
.die .face .pip {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #555, var(--die-pip) 70%);
  align-self: center;
  justify-self: center;
}

/* Face positioning — each face translated to its cube position */
.die .face.f1 { transform: rotateY(  0deg) translateZ(22px); }
.die .face.f2 { transform: rotateY( 90deg) translateZ(22px); }
.die .face.f3 { transform: rotateY(180deg) translateZ(22px); }
.die .face.f4 { transform: rotateY(-90deg) translateZ(22px); }
.die .face.f5 { transform: rotateX( 90deg) translateZ(22px); }
.die .face.f6 { transform: rotateX(-90deg) translateZ(22px); }

/* Pip layouts — grid areas a1..c3 mapped via grid-area: row col / row col */
.die .face .pip.a1 { grid-area: 1 / 1; }
.die .face .pip.a2 { grid-area: 1 / 2; }
.die .face .pip.a3 { grid-area: 1 / 3; }
.die .face .pip.b1 { grid-area: 2 / 1; }
.die .face .pip.b2 { grid-area: 2 / 2; }
.die .face .pip.b3 { grid-area: 2 / 3; }
.die .face .pip.c1 { grid-area: 3 / 1; }
.die .face .pip.c2 { grid-area: 3 / 2; }
.die .face .pip.c3 { grid-area: 3 / 3; }

@media (max-width: 720px) {
  .dice-stage { width: 90px; height: 56px; gap: 10px; }
  .die { width: 36px; height: 36px; }
  .die .face.f1 { transform: rotateY(  0deg) translateZ(18px); }
  .die .face.f2 { transform: rotateY( 90deg) translateZ(18px); }
  .die .face.f3 { transform: rotateY(180deg) translateZ(18px); }
  .die .face.f4 { transform: rotateY(-90deg) translateZ(18px); }
  .die .face.f5 { transform: rotateX( 90deg) translateZ(18px); }
  .die .face.f6 { transform: rotateX(-90deg) translateZ(18px); }
  .die .face .pip { width: 6px; height: 6px; }
}
```

- [ ] **Step 2: Replace the placeholder `#dice-container` with real dice markup**

Find the `<div id="dice-container" ...>⚀ ⚄</div>` line and replace with:

```html
<div class="dice-stage">
  <div class="die" id="die1">
    <div class="face f1"><span class="pip b2"></span></div>
    <div class="face f2"><span class="pip a1"></span><span class="pip c3"></span></div>
    <div class="face f3"><span class="pip a1"></span><span class="pip b2"></span><span class="pip c3"></span></div>
    <div class="face f4"><span class="pip a1"></span><span class="pip a3"></span><span class="pip c1"></span><span class="pip c3"></span></div>
    <div class="face f5"><span class="pip a1"></span><span class="pip a3"></span><span class="pip b2"></span><span class="pip c1"></span><span class="pip c3"></span></div>
    <div class="face f6"><span class="pip a1"></span><span class="pip a3"></span><span class="pip b1"></span><span class="pip b3"></span><span class="pip c1"></span><span class="pip c3"></span></div>
  </div>
  <div class="die" id="die2">
    <div class="face f1"><span class="pip b2"></span></div>
    <div class="face f2"><span class="pip a1"></span><span class="pip c3"></span></div>
    <div class="face f3"><span class="pip a1"></span><span class="pip b2"></span><span class="pip c3"></span></div>
    <div class="face f4"><span class="pip a1"></span><span class="pip a3"></span><span class="pip c1"></span><span class="pip c3"></span></div>
    <div class="face f5"><span class="pip a1"></span><span class="pip a3"></span><span class="pip b2"></span><span class="pip c1"></span><span class="pip c3"></span></div>
    <div class="face f6"><span class="pip a1"></span><span class="pip a3"></span><span class="pip b1"></span><span class="pip b3"></span><span class="pip c1"></span><span class="pip c3"></span></div>
  </div>
</div>
```

- [ ] **Step 3: Add JS to set each die to a starting face (1 and 1)**

Inside the final `<script>` block, after the `Music.init` call, append:

```js
/* DICE — rotation per face */
const FACE_ROTATIONS = {
  1: { x:   0, y:   0 },
  2: { x:   0, y: -90 },
  3: { x:   0, y: 180 },
  4: { x:   0, y:  90 },
  5: { x: -90, y:   0 },
  6: { x:  90, y:   0 },
};
function setDieFace(dieEl, value) {
  const r = FACE_ROTATIONS[value];
  dieEl.style.transition = 'none';
  dieEl.style.transform = `rotateX(${r.x}deg) rotateY(${r.y}deg)`;
}
setDieFace(document.getElementById('die1'), 1);
setDieFace(document.getElementById('die2'), 1);
```

- [ ] **Step 4: Verify in browser**

Reload `craplesscraps.html`.

Expected:
- Inside the bubble dome, two ivory cube dice each showing a single pip (face 1).
- Pips have a subtle 3D-ish look (radial gradient).
- No console errors.

To sanity-check face mapping, in DevTools console run:
```js
setDieFace(document.getElementById('die1'), 6);
setDieFace(document.getElementById('die2'), 3);
```
Expected: Die 1 shows 6 pips in a 3x2 layout, die 2 shows 3 pips on a diagonal.

- [ ] **Step 5: Save checkpoint**

---

## Task 4: `rollDice()` animation

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append a `rollDice()` function that animates a tumble to target faces**

In the `<script>` block, after the dice initialization, append:

```js
/* Roll outcome + tumble animation */
function rollDie() { return 1 + Math.floor(Math.random() * 6); }

function tumbleDie(dieEl, finalValue, durationMs) {
  const final = FACE_ROTATIONS[finalValue];
  // Add several full rotations on top of the final orientation so it spins.
  const spinsX = 3 + Math.floor(Math.random() * 2);   // 3-4 full X spins
  const spinsY = 3 + Math.floor(Math.random() * 2);
  const dirX = Math.random() < 0.5 ? 1 : -1;
  const dirY = Math.random() < 0.5 ? 1 : -1;
  const endX = final.x + dirX * 360 * spinsX;
  const endY = final.y + dirY * 360 * spinsY;

  // Set start transform to current (no transition) so we tumble from where we are.
  dieEl.style.transition = 'none';
  // Force a reflow so the upcoming transition starts cleanly.
  void dieEl.offsetWidth;
  dieEl.style.transition = `transform ${durationMs}ms cubic-bezier(.22,.62,.28,1)`;
  dieEl.style.transform = `rotateX(${endX}deg) rotateY(${endY}deg)`;
}

function rollDice() {
  const d1 = rollDie();
  const d2 = rollDie();
  const dur = 1400;
  document.getElementById('dome').classList.add('shaking');
  document.getElementById('fan').classList.add('glowing');
  tumbleDie(document.getElementById('die1'), d1, dur);
  tumbleDie(document.getElementById('die2'), d2, dur + 80);
  setTimeout(() => {
    document.getElementById('dome').classList.remove('shaking');
    document.getElementById('fan').classList.remove('glowing');
  }, dur + 180);
  console.log('rolled', d1, d2, 'total', d1 + d2);
  return { d1, d2, total: d1 + d2 };
}

/* Temporary dev button — remove later */
window.rollDice = rollDice;
```

- [ ] **Step 2: Add a temporary on-page button for testing**

Inside the `.stage` div, just under `</div>` for the dome-wrap (i.e., after the fan but before the closing `</div>` of stage), add:

```html
<button id="dev-roll" style="margin: 20px auto; padding: 12px 24px; border:0; border-radius:10px; font-family:'Bungee',cursive; letter-spacing:0.2em; background:linear-gradient(180deg,#fff0a8,#ffd24a 50%,#b8860b); color:#0a0418; cursor:pointer; box-shadow:0 5px 0 #3a2200; font-size:14px;">DEV: ROLL</button>
```

Wire it at the bottom of the `<script>` block:

```js
document.getElementById('dev-roll').addEventListener('click', rollDice);
```

- [ ] **Step 3: Verify in browser**

Reload. Click "DEV: ROLL" repeatedly.

Expected:
- Dice tumble inside the dome for ~1.4s.
- Dome's gold air-pulse blooms while shaking.
- Fan slats glow gold while shaking.
- Each die lands on a face from 1-6, varies between rolls.
- Console logs `rolled X Y total Z` with sane values.
- Spam-clicking doesn't break anything (animations interrupt cleanly).

- [ ] **Step 4: Save checkpoint**

The DEV ROLL button stays for now — it's replaced in Task 9.

---

## Task 5: `game` state + `resolveRoll` pure function

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append the state object and resolver to the `<script>` block**

After the rollDice function, append:

```js
/* ============================================================
   GAME STATE + RESOLVER
   ============================================================ */
const PLACE_PAYS = {
  2:  [11, 2],
  3:  [11, 4],
  4:  [9,  5],
  5:  [7,  5],
  6:  [7,  6],
  8:  [7,  6],
  9:  [7,  5],
  10: [9,  5],
  11: [11, 4],
  12: [11, 2],
};
const ODDS_PAYS = {
  2:  [6, 1],  12: [6, 1],
  3:  [3, 1],  11: [3, 1],
  4:  [2, 1],  10: [2, 1],
  5:  [3, 2],   9: [3, 2],
  6:  [6, 5],   8: [6, 5],
};
const HARD_PAYS = { 4:[7,1], 6:[9,1], 8:[9,1], 10:[7,1] };
const FIRE_PAYS = { 4: 24, 5: 249, 6: 999 };  // 'to 1'

function freshShooter() {
  return {
    pointsMade: new Set(),
    smallHit:   new Set(),
    tallHit:    new Set(),
    rolling:    false,
  };
}
function freshBets() {
  return {
    pass: 0,
    odds: 0,
    place: { 2:0, 3:0, 4:0, 5:0, 6:0, 8:0, 9:0, 10:0, 11:0, 12:0 },
    field: 0,
    hard:  { 4:0, 6:0, 8:0, 10:0 },
    props: { any7:0, anyCraps:0, aces:0, boxcars:0, yo:0, aceDeuce:0,
             ceCraps:0, ceEleven:0, horn:0, world:0, hop:{} },
    bonus: { fire:0, allSmall:0, allTall:0, makeAll:0 },
  };
}
const game = {
  phase:    'comeOut',  // 'comeOut' | 'point'
  point:    null,
  lastRoll: null,       // { d1, d2, total }
  shooter:  freshShooter(),
  bets:     freshBets(),
  chipDenom: 5,
};

/* Pay helper: stake * num/den (returns the winnings, not stake + winnings) */
function pay(stake, [num, den]) {
  return Math.round((stake * num) / den * 100) / 100;
}

/* Pure resolver: given (state, d1, d2) returns a list of effects.
   Caller applies them to balance and animates. Resolver also returns
   the next-state mutations (phase, point, shooter changes) for the caller
   to apply. */
function resolveRoll(state, d1, d2) {
  const total = d1 + d2;
  const hard  = (d1 === d2);
  const events = [];   // [{ kind:'win', zone, amount, stakeReturn } | { kind:'lose', zone, amount } | { kind:'push', zone }]

  /* ----- 1. FIELD (single roll) ----- */
  if (state.bets.field > 0) {
    if (total === 2)      events.push({ kind:'win',  zone:'field', amount: pay(state.bets.field, [3,1]), stakeReturn: state.bets.field });
    else if (total === 12)events.push({ kind:'win',  zone:'field', amount: pay(state.bets.field, [2,1]), stakeReturn: state.bets.field });
    else if ([3,4,9,10,11].includes(total))
                          events.push({ kind:'win',  zone:'field', amount: state.bets.field, stakeReturn: state.bets.field });
    else                  events.push({ kind:'lose', zone:'field', amount: state.bets.field });
  }

  /* ----- 2. PROPS (all single-roll) ----- */
  const p = state.bets.props;
  // Any 7
  if (p.any7 > 0) {
    if (total === 7) events.push({ kind:'win',  zone:'any7', amount: pay(p.any7, [4,1]), stakeReturn: p.any7 });
    else             events.push({ kind:'lose', zone:'any7', amount: p.any7 });
  }
  // Any Craps (2/3/12)
  if (p.anyCraps > 0) {
    if (total === 2 || total === 3 || total === 12)
                     events.push({ kind:'win',  zone:'anyCraps', amount: pay(p.anyCraps, [7,1]), stakeReturn: p.anyCraps });
    else             events.push({ kind:'lose', zone:'anyCraps', amount: p.anyCraps });
  }
  // Aces (2)
  if (p.aces > 0) {
    if (total === 2) events.push({ kind:'win',  zone:'aces', amount: pay(p.aces, [30,1]), stakeReturn: p.aces });
    else             events.push({ kind:'lose', zone:'aces', amount: p.aces });
  }
  // Boxcars (12)
  if (p.boxcars > 0) {
    if (total === 12)events.push({ kind:'win',  zone:'boxcars', amount: pay(p.boxcars, [30,1]), stakeReturn: p.boxcars });
    else             events.push({ kind:'lose', zone:'boxcars', amount: p.boxcars });
  }
  // Yo (11)
  if (p.yo > 0) {
    if (total === 11)events.push({ kind:'win',  zone:'yo', amount: pay(p.yo, [15,1]), stakeReturn: p.yo });
    else             events.push({ kind:'lose', zone:'yo', amount: p.yo });
  }
  // Ace-Deuce (3)
  if (p.aceDeuce > 0) {
    if (total === 3) events.push({ kind:'win',  zone:'aceDeuce', amount: pay(p.aceDeuce, [15,1]), stakeReturn: p.aceDeuce });
    else             events.push({ kind:'lose', zone:'aceDeuce', amount: p.aceDeuce });
  }
  // C & E (split: half on Craps, half on Eleven; resolved as two separate stakes)
  if (p.ceCraps > 0) {
    if ([2,3,12].includes(total)) events.push({ kind:'win',  zone:'ceCraps', amount: pay(p.ceCraps, [3,1]), stakeReturn: p.ceCraps });
    else                          events.push({ kind:'lose', zone:'ceCraps', amount: p.ceCraps });
  }
  if (p.ceEleven > 0) {
    if (total === 11) events.push({ kind:'win',  zone:'ceEleven', amount: pay(p.ceEleven, [7,1]), stakeReturn: p.ceEleven });
    else              events.push({ kind:'lose', zone:'ceEleven', amount: p.ceEleven });
  }
  // Horn (4-way split across 2/3/11/12; min 4-chip bet)
  if (p.horn > 0) {
    const quarter = p.horn / 4;
    if (total === 2 || total === 12)
                       events.push({ kind:'win',  zone:'horn', amount: pay(quarter, [30,1]) - 3*quarter, stakeReturn: p.horn });
    else if (total === 3 || total === 11)
                       events.push({ kind:'win',  zone:'horn', amount: pay(quarter, [15,1]) - 3*quarter, stakeReturn: p.horn });
    else               events.push({ kind:'lose', zone:'horn', amount: p.horn });
  }
  // World/Whirl (Horn + Any 7; min 5-chip bet)
  if (p.world > 0) {
    const fifth = p.world / 5;
    if (total === 2 || total === 12)
                       events.push({ kind:'win',  zone:'world', amount: pay(fifth, [30,1]) - 4*fifth, stakeReturn: p.world });
    else if (total === 3 || total === 11)
                       events.push({ kind:'win',  zone:'world', amount: pay(fifth, [15,1]) - 4*fifth, stakeReturn: p.world });
    else if (total === 7)
                       events.push({ kind:'push', zone:'world', stakeReturn: p.world });
    else               events.push({ kind:'lose', zone:'world', amount: p.world });
  }
  // Hop bets — stored as map keyed by `${a}-${b}` where a<=b
  for (const key in p.hop) {
    const stake = p.hop[key];
    if (stake <= 0) continue;
    const [a, b] = key.split('-').map(Number);
    const isHard = (a === b);
    const matchedExact = (d1 === a && d2 === b) || (d1 === b && d2 === a);
    if (matchedExact && isHard) {
      events.push({ kind:'win',  zone:'hop:'+key, amount: pay(stake, [30,1]), stakeReturn: stake });
    } else if (matchedExact) {
      events.push({ kind:'win',  zone:'hop:'+key, amount: pay(stake, [15,1]), stakeReturn: stake });
    } else {
      events.push({ kind:'lose', zone:'hop:'+key, amount: stake });
    }
  }

  /* ----- 3. PLACE BETS (always working) ----- */
  for (const n of [2,3,4,5,6,8,9,10,11,12]) {
    const stake = state.bets.place[n];
    if (stake <= 0) continue;
    if (total === n) {
      events.push({ kind:'win',  zone:'place:'+n, amount: pay(stake, PLACE_PAYS[n]), stakeReturn: stake });
    } else if (total === 7) {
      events.push({ kind:'lose', zone:'place:'+n, amount: stake });
    }
    // else: bet stays; no event
  }

  /* ----- 4. HARDWAYS ----- */
  for (const n of [4,6,8,10]) {
    const stake = state.bets.hard[n];
    if (stake <= 0) continue;
    if (total === n && hard) {
      events.push({ kind:'win',  zone:'hard:'+n, amount: pay(stake, HARD_PAYS[n]), stakeReturn: stake });
    } else if (total === n && !hard) {
      events.push({ kind:'lose', zone:'hard:'+n, amount: stake });
    } else if (total === 7) {
      events.push({ kind:'lose', zone:'hard:'+n, amount: stake });
    }
  }

  /* ----- 5. PASS LINE + ODDS ----- */
  let phase = state.phase;
  let point = state.point;
  let sevenOut = false;
  let pointMade = false;

  if (phase === 'comeOut') {
    if (total === 7) {
      if (state.bets.pass > 0) events.push({ kind:'win', zone:'pass', amount: state.bets.pass, stakeReturn: state.bets.pass });
      // pass stays at same stake for next come-out (real Vegas: line bet remains; player can press/take down)
      // For v1, leave pass stake in place — same chip stays on the line.
    } else {
      // Any other roll: point is set. Pass stays as a contract bet.
      phase = 'point';
      point = total;
    }
  } else {
    // phase === 'point'
    if (total === point) {
      pointMade = true;
      if (state.bets.pass > 0) events.push({ kind:'win', zone:'pass', amount: state.bets.pass, stakeReturn: state.bets.pass });
      if (state.bets.odds > 0) events.push({ kind:'win', zone:'odds', amount: pay(state.bets.odds, ODDS_PAYS[point]), stakeReturn: state.bets.odds });
      phase = 'comeOut';
      point = null;
      // Odds bet is taken down on point made (returned to player); pass stays.
    } else if (total === 7) {
      sevenOut = true;
      if (state.bets.pass > 0) events.push({ kind:'lose', zone:'pass', amount: state.bets.pass });
      if (state.bets.odds > 0) events.push({ kind:'lose', zone:'odds', amount: state.bets.odds });
      phase = 'comeOut';
      point = null;
    }
  }

  /* ----- 6. BONUS — set tracking + resolution ----- */
  // Track unique points (made = rolled twice with point set, then 7 OR re-rolled)
  // Actually Fire Bet counts UNIQUE points MADE (i.e., point established AND then re-rolled before 7-out).
  // Standard interpretation: when a point is made, add to pointsMade set.
  const newPointsMade = new Set(state.shooter.pointsMade);
  if (pointMade) newPointsMade.add(state.point);  // state.point was the just-made point

  // Track small/tall sets — each roll's total goes into the relevant set (as long as shooter alive).
  const newSmall = new Set(state.shooter.smallHit);
  const newTall  = new Set(state.shooter.tallHit);
  if ([2,3,4,5,6].includes(total)) newSmall.add(total);
  if ([8,9,10,11,12].includes(total)) newTall.add(total);

  // Resolve bonus on either 7-out or set completion
  const smallComplete = newSmall.size === 5;  // {2,3,4,5,6}
  const tallComplete  = newTall.size  === 5;  // {8,9,10,11,12}

  // Make-em-All wins ONLY when both complete (resolves the moment both are full)
  if (state.bets.bonus.makeAll > 0 && smallComplete && tallComplete) {
    events.push({ kind:'win', zone:'bonus:makeAll', amount: pay(state.bets.bonus.makeAll, [150,1]), stakeReturn: state.bets.bonus.makeAll });
  }
  // All Small resolves on completion (win) or 7-out (loss)
  if (state.bets.bonus.allSmall > 0 && smallComplete) {
    events.push({ kind:'win', zone:'bonus:allSmall', amount: pay(state.bets.bonus.allSmall, [30,1]), stakeReturn: state.bets.bonus.allSmall });
  }
  if (state.bets.bonus.allTall > 0 && tallComplete) {
    events.push({ kind:'win', zone:'bonus:allTall', amount: pay(state.bets.bonus.allTall, [30,1]), stakeReturn: state.bets.bonus.allTall });
  }
  // On seven-out: lose any bonus that hasn't yet been won
  let bonusClearOnSevenOut = false;
  if (sevenOut) {
    bonusClearOnSevenOut = true;
    if (state.bets.bonus.fire > 0) {
      const ptsMade = newPointsMade.size;
      if (ptsMade >= 6)      events.push({ kind:'win', zone:'bonus:fire', amount: pay(state.bets.bonus.fire, [FIRE_PAYS[6],1]), stakeReturn: state.bets.bonus.fire });
      else if (ptsMade === 5)events.push({ kind:'win', zone:'bonus:fire', amount: pay(state.bets.bonus.fire, [FIRE_PAYS[5],1]), stakeReturn: state.bets.bonus.fire });
      else if (ptsMade === 4)events.push({ kind:'win', zone:'bonus:fire', amount: pay(state.bets.bonus.fire, [FIRE_PAYS[4],1]), stakeReturn: state.bets.bonus.fire });
      else                   events.push({ kind:'lose', zone:'bonus:fire', amount: state.bets.bonus.fire });
    }
    // All-Small/Tall/Make that weren't already won are losses
    if (state.bets.bonus.allSmall > 0 && !smallComplete) events.push({ kind:'lose', zone:'bonus:allSmall', amount: state.bets.bonus.allSmall });
    if (state.bets.bonus.allTall  > 0 && !tallComplete)  events.push({ kind:'lose', zone:'bonus:allTall',  amount: state.bets.bonus.allTall });
    if (state.bets.bonus.makeAll  > 0 && !(smallComplete && tallComplete)) events.push({ kind:'lose', zone:'bonus:makeAll', amount: state.bets.bonus.makeAll });
  }

  /* ----- 7. RETURN ----- */
  return {
    events,
    nextPhase: phase,
    nextPoint: point,
    sevenOut,
    pointMade,
    rolledPoint: pointMade ? state.point : null,
    newPointsMade,
    newSmall,
    newTall,
    bonusClearOnSevenOut,
    total, d1, d2,
  };
}
```

- [ ] **Step 2: Add a `<script>` block at the very end of body that runs console verification tests**

Just before `</body>`, add:

```html
<script>
/* DEV verification — verify resolver outputs. Logs PASS/FAIL to console.
   Remove this entire block before shipping (Task 17 cleanup step). */
(function devTests() {
  function clone(o) { return JSON.parse(JSON.stringify(o, (k,v) => v instanceof Set ? [...v] : v)); }
  function mk(initial = {}) {
    return Object.assign({
      phase: 'comeOut', point: null, lastRoll: null,
      shooter: { pointsMade: new Set(), smallHit: new Set(), tallHit: new Set(), rolling: false },
      bets: { pass:0, odds:0, place:{2:0,3:0,4:0,5:0,6:0,8:0,9:0,10:0,11:0,12:0}, field:0,
              hard:{4:0,6:0,8:0,10:0},
              props:{ any7:0,anyCraps:0,aces:0,boxcars:0,yo:0,aceDeuce:0,ceCraps:0,ceEleven:0,horn:0,world:0,hop:{} },
              bonus:{ fire:0, allSmall:0, allTall:0, makeAll:0 } },
    }, initial);
  }
  function expect(label, cond, extra) {
    console.log((cond ? '✓ PASS  ' : '✗ FAIL  ') + label, extra || '');
  }

  // Pass come-out 7
  {
    const s = mk({ bets: { ...mk().bets, pass: 5 } });
    const r = resolveRoll(s, 3, 4);
    const winEv = r.events.find(e => e.zone === 'pass' && e.kind === 'win');
    expect('Pass come-out 7 wins $5', winEv && winEv.amount === 5);
    expect('Stays comeOut after natural', r.nextPhase === 'comeOut' && r.nextPoint === null);
  }
  // Pass come-out 4 sets point
  {
    const s = mk({ bets: { ...mk().bets, pass: 5 } });
    const r = resolveRoll(s, 1, 3);
    expect('Come-out 4 sets point to 4', r.nextPhase === 'point' && r.nextPoint === 4);
    expect('No pass win on point set', !r.events.some(e => e.zone === 'pass' && e.kind === 'win'));
  }
  // Point 4 made — pass + odds
  {
    const s = mk({ phase:'point', point:4, bets: { ...mk().bets, pass: 5, odds: 10 } });
    const r = resolveRoll(s, 2, 2);
    const passWin = r.events.find(e => e.zone === 'pass' && e.kind === 'win');
    const oddsWin = r.events.find(e => e.zone === 'odds' && e.kind === 'win');
    expect('Point 4 made: pass wins $5', passWin && passWin.amount === 5);
    expect('Point 4 made: odds wins $20 (2:1 on $10)', oddsWin && oddsWin.amount === 20);
    expect('Phase resets to comeOut', r.nextPhase === 'comeOut');
  }
  // Seven-out
  {
    const s = mk({ phase:'point', point:8, bets: { ...mk().bets, pass: 5, odds: 6, place: {...mk().bets.place, 6: 6} } });
    const r = resolveRoll(s, 3, 4);
    const passLose = r.events.find(e => e.zone === 'pass' && e.kind === 'lose');
    const oddsLose = r.events.find(e => e.zone === 'odds' && e.kind === 'lose');
    const placeLose = r.events.find(e => e.zone === 'place:6' && e.kind === 'lose');
    expect('Seven-out: pass loses', passLose && passLose.amount === 5);
    expect('Seven-out: odds loses', oddsLose && oddsLose.amount === 6);
    expect('Seven-out: place 6 loses', placeLose && placeLose.amount === 6);
  }
  // Place 4 hits
  {
    const s = mk({ phase:'point', point:8, bets: { ...mk().bets, place: { ...mk().bets.place, 4: 5 } } });
    const r = resolveRoll(s, 1, 3);
    const win = r.events.find(e => e.zone === 'place:4' && e.kind === 'win');
    expect('Place 4 hits, wins $9 (9:5 on $5)', win && win.amount === 9);
  }
  // Field $5 on 12
  {
    const s = mk({ bets: { ...mk().bets, field: 5 } });
    const r = resolveRoll(s, 6, 6);
    const win = r.events.find(e => e.zone === 'field' && e.kind === 'win');
    expect('Field $5 on 12: wins $10 (2:1)', win && win.amount === 10);
  }
  // Hard 8 wins
  {
    const s = mk({ phase:'point', point:5, bets: { ...mk().bets, hard: { ...mk().bets.hard, 8: 5 } } });
    const r = resolveRoll(s, 4, 4);
    const win = r.events.find(e => e.zone === 'hard:8' && e.kind === 'win');
    expect('Hard 8 hits (4-4), wins $45 (9:1)', win && win.amount === 45);
  }
  // Hard 8 loses on easy 8
  {
    const s = mk({ phase:'point', point:5, bets: { ...mk().bets, hard: { ...mk().bets.hard, 8: 5 } } });
    const r = resolveRoll(s, 5, 3);
    const lose = r.events.find(e => e.zone === 'hard:8' && e.kind === 'lose');
    expect('Hard 8 easy 5-3, loses', lose && lose.amount === 5);
  }
  // Horn $4 on 2
  {
    const s = mk({ bets: { ...mk().bets, props: { ...mk().bets.props, horn: 4 } } });
    const r = resolveRoll(s, 1, 1);
    const win = r.events.find(e => e.zone === 'horn' && e.kind === 'win');
    expect('Horn $4 on 2: net $27 (27:4)', win && win.amount === 27);
  }
  // Horn $4 on 3
  {
    const s = mk({ bets: { ...mk().bets, props: { ...mk().bets.props, horn: 4 } } });
    const r = resolveRoll(s, 1, 2);
    const win = r.events.find(e => e.zone === 'horn' && e.kind === 'win');
    expect('Horn $4 on 3: net $12 (12:4)', win && win.amount === 12);
  }
  // Hop hard 4-4 $1
  {
    const s = mk({ bets: { ...mk().bets, props: { ...mk().bets.props, hop: { '4-4': 1 } } } });
    const r = resolveRoll(s, 4, 4);
    const win = r.events.find(e => e.zone === 'hop:4-4' && e.kind === 'win');
    expect('Hop hard 4-4 $1: wins $30 (30:1)', win && win.amount === 30);
  }
  // Fire Bet, 4 points made, then 7-out
  {
    let s = mk({ bets: { ...mk().bets, bonus: { ...mk().bets.bonus, fire: 5 } } });
    s.shooter.pointsMade = new Set([2, 5, 8, 10]); // already 4 unique made
    s.phase = 'point';
    s.point = 6;
    // 7-out
    const r = resolveRoll(s, 3, 4);
    const fireWin = r.events.find(e => e.zone === 'bonus:fire' && e.kind === 'win');
    expect('Fire Bet $5 with 4 points: wins $120 (24:1)', fireWin && fireWin.amount === 120);
  }
})();
</script>
```

- [ ] **Step 3: Verify in browser**

Reload `craplesscraps.html`. Open DevTools console.

Expected:
- Every line in the console starts with `✓ PASS`.
- No `✗ FAIL` lines.
- No JS errors.

If any test fails: read the failure label, find the corresponding resolver branch, fix, reload.

- [ ] **Step 4: Save checkpoint**

The dev test block stays through Task 16 and gets removed in Task 17.

---

## Task 6: Felt layout (PLACE, FIELD, HARDWAYS, PASS, ODDS)

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append felt CSS to the `<style>` block**

```css
/* FELT — bet zone styling */
.felt {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background:
    repeating-linear-gradient(45deg, transparent 0 20px, rgba(255,210,74,0.04) 20px 21px),
    repeating-linear-gradient(-45deg, transparent 0 20px, rgba(168,85,247,0.04) 20px 21px),
    radial-gradient(ellipse at 50% 50%, var(--felt-mid), var(--felt-deep) 80%);
  box-shadow:
    inset 0 0 0 2px rgba(255,210,74,0.32),
    inset 0 0 0 4px rgba(0,0,0,0.4),
    inset 0 0 60px rgba(0,0,0,0.5),
    var(--shadow-deep);
  position: relative;
}

.felt-row {
  display: grid;
  gap: 6px;
}
.felt-row.place-strip { grid-template-columns: 90px repeat(10, 1fr); align-items: stretch; }
.felt-row.field-row   { grid-template-columns: 90px 1fr 1fr; align-items: stretch; }
.felt-row.line-row    { grid-template-columns: 90px 1fr 1fr; align-items: stretch; }

@media (max-width: 720px) {
  .felt-row.place-strip { grid-template-columns: 56px repeat(5, 1fr); grid-template-rows: auto auto; }
  /* Wrap: the first 5 cells go in row 1 after the label; remaining 5 fill row 2 (full-width because no label). */
  .felt-row.place-strip .felt-label { grid-row: 1 / span 2; }
}

.felt-label {
  font-family: 'Bungee', cursive;
  font-size: 12px;
  letter-spacing: 0.22em;
  color: var(--gold-1);
  text-shadow: 0 0 8px rgba(255,210,74,0.45);
  display: grid;
  place-items: center;
}

.bet-zone {
  position: relative;
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 10px 8px;
  min-height: 56px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.35));
  box-shadow:
    inset 0 0 0 1px rgba(255,210,74,0.3),
    inset 0 -3px 0 rgba(0,0,0,0.3);
  cursor: pointer;
  transition: filter 0.15s, transform 0.08s, box-shadow 0.15s;
  text-align: center;
}
.bet-zone:hover {
  filter: brightness(1.18);
  box-shadow: inset 0 0 0 1.5px var(--gold-1), inset 0 -3px 0 rgba(0,0,0,0.3);
}
.bet-zone:active { transform: translateY(1px); }
.bet-zone.has-chips {
  box-shadow: inset 0 0 0 1.5px var(--neon-cyan), inset 0 -3px 0 rgba(0,0,0,0.3), 0 0 16px rgba(34,211,238,0.3);
}
.bet-zone .bz-num {
  font-family: 'Bungee Shade', cursive;
  font-size: 22px;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 8px rgba(255,255,255,0.35);
}
.bet-zone .bz-pay {
  font-family: 'Geist Mono', monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: rgba(255,210,74,0.85);
}
.bet-zone.field-zone .bz-pay { font-size: 9px; }
.bet-zone .bz-stack {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-family: 'Geist Mono', monospace;
  font-size: 11px;
  font-weight: 800;
  color: var(--neon-cyan);
  text-shadow: 0 0 6px rgba(34,211,238,0.6);
}

/* Winning flash — applied to any zone (bet-zone, hop-cell, bonus-zone) */
.win-flash {
  animation: winFlash 0.7s ease-out;
}
@keyframes winFlash {
  0%   { background: linear-gradient(180deg, rgba(255,210,74,0.7), rgba(255,210,74,0.4)) !important; box-shadow: inset 0 0 0 2px var(--gold-1), 0 0 32px rgba(255,210,74,0.8); }
  100% { /* falls back to element's default background after animation completes */ }
}
.lose-fade {
  animation: loseFade 0.6s ease-out;
}
@keyframes loseFade {
  0%   { background: linear-gradient(180deg, rgba(220,40,60,0.4), rgba(0,0,0,0.5)) !important; }
  100% { /* falls back */ }
}

/* Field's larger merged feel */
.bet-zone.field-zone {
  grid-column: span 2;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  align-items: center;
}
.bet-zone.field-zone .fz-cell {
  display: grid;
  place-items: center;
  font-family: 'Bungee', cursive;
  font-size: 14px;
  color: #fff;
}
.bet-zone.field-zone .fz-cell.big-pay {
  color: var(--gold-1);
  text-shadow: 0 0 6px rgba(255,210,74,0.6);
}
.bet-zone.field-zone .fz-cell .mult {
  font-family: 'Geist Mono', monospace;
  font-size: 9px;
  color: rgba(255,210,74,0.8);
  margin-left: 4px;
}

.hard-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
```

- [ ] **Step 2: Add felt markup inside `.stage`, after the dome-wrap and before the dev-roll button**

Insert this whole block right after the closing `</div>` of `dome-wrap` (and the fan):

```html
<div class="felt" id="felt">

  <!-- PLACE STRIP -->
  <div class="felt-row place-strip">
    <div class="felt-label">PLACE</div>
    <button class="bet-zone" data-bet="place:2"><div class="bz-num">2</div><div class="bz-pay">11:2</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:3"><div class="bz-num">3</div><div class="bz-pay">11:4</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:4"><div class="bz-num">4</div><div class="bz-pay">9:5</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:5"><div class="bz-num">5</div><div class="bz-pay">7:5</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:6"><div class="bz-num">6</div><div class="bz-pay">7:6</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:8"><div class="bz-num">8</div><div class="bz-pay">7:6</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:9"><div class="bz-num">9</div><div class="bz-pay">7:5</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:10"><div class="bz-num">10</div><div class="bz-pay">9:5</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:11"><div class="bz-num">11</div><div class="bz-pay">11:4</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="place:12"><div class="bz-num">12</div><div class="bz-pay">11:2</div><span class="bz-stack"></span></button>
  </div>

  <!-- FIELD + HARDWAYS -->
  <div class="felt-row field-row">
    <div class="felt-label">FIELD</div>
    <button class="bet-zone field-zone" data-bet="field">
      <span class="fz-cell big-pay">2<span class="mult">3x</span></span>
      <span class="fz-cell">3</span>
      <span class="fz-cell">4</span>
      <span class="fz-cell">9</span>
      <span class="fz-cell">10</span>
      <span class="fz-cell">11</span>
      <span class="fz-cell big-pay">12<span class="mult">2x</span></span>
      <span class="bz-stack"></span>
    </button>
    <div>
      <div class="felt-label" style="margin-bottom: 6px;">HARDWAYS</div>
      <div class="hard-grid">
        <button class="bet-zone" data-bet="hard:4"><div class="bz-num">4</div><div class="bz-pay">7:1</div><span class="bz-stack"></span></button>
        <button class="bet-zone" data-bet="hard:6"><div class="bz-num">6</div><div class="bz-pay">9:1</div><span class="bz-stack"></span></button>
        <button class="bet-zone" data-bet="hard:8"><div class="bz-num">8</div><div class="bz-pay">9:1</div><span class="bz-stack"></span></button>
        <button class="bet-zone" data-bet="hard:10"><div class="bz-num">10</div><div class="bz-pay">7:1</div><span class="bz-stack"></span></button>
      </div>
    </div>
  </div>

  <!-- PASS LINE + ODDS -->
  <div class="felt-row line-row">
    <div class="felt-label">PASS</div>
    <button class="bet-zone" data-bet="pass"><div class="bz-num">LINE</div><div class="bz-pay">1:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone" data-bet="odds" id="zone-odds"><div class="bz-num">ODDS</div><div class="bz-pay">TRUE</div><span class="bz-stack"></span></button>
  </div>

</div>
```

- [ ] **Step 3: Verify in browser**

Reload.

Expected:
- Below the bubble dome, a dark purple felt panel.
- PLACE row with label and 10 number buttons (2,3,4,5,6,8,9,10,11,12) — each shows its payout in gold beneath.
- FIELD zone showing 2(3x), 3, 4, 9, 10, 11, 12(2x).
- HARDWAYS column with 4 small zones.
- PASS LINE and ODDS zones.
- Hover any zone → it brightens with a gold outline.
- On mobile viewport, place strip wraps to 2 rows.

- [ ] **Step 4: Save checkpoint**

---

## Task 7: Chip rail + denomination selector

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append chip rail CSS to the `<style>` block**

```css
/* CHIP RAIL */
.chip-rail {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.18), transparent 60%),
    linear-gradient(180deg, #1a0838, #0a0319);
  box-shadow: var(--shadow-deep), inset 0 0 0 1.5px rgba(255,210,74,0.28);
  position: sticky;
  bottom: 8px;
  z-index: 10;
}
@media (max-width: 720px) {
  .chip-rail { grid-template-columns: 1fr; gap: 8px; }
}

.chip-denoms {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}
.chip {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0;
  position: relative;
  cursor: pointer;
  color: #fff;
  font-family: 'Geist Mono', monospace;
  font-weight: 800;
  font-size: 14px;
  text-shadow: 0 1px 0 rgba(0,0,0,0.6);
  background:
    radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), transparent 50%),
    radial-gradient(circle at 50% 50%, var(--chip-c1, #2b2b2b), var(--chip-c2, #111));
  box-shadow:
    inset 0 0 0 4px var(--chip-rim, rgba(255,255,255,0.7)),
    inset 0 0 0 6px var(--chip-c1, #2b2b2b),
    0 6px 0 rgba(0,0,0,0.55),
    0 0 12px rgba(0,0,0,0.4);
  transition: transform 0.08s, filter 0.15s, box-shadow 0.2s;
}
.chip:hover { filter: brightness(1.15); }
.chip:active { transform: translateY(2px); box-shadow: inset 0 0 0 4px var(--chip-rim, rgba(255,255,255,0.7)), inset 0 0 0 6px var(--chip-c1, #2b2b2b), 0 3px 0 rgba(0,0,0,0.55); }
.chip.selected {
  transform: translateY(-6px);
  box-shadow:
    inset 0 0 0 4px var(--chip-rim, rgba(255,255,255,0.7)),
    inset 0 0 0 6px var(--chip-c1, #2b2b2b),
    0 10px 0 rgba(0,0,0,0.55),
    0 0 24px rgba(255,210,74,0.55);
}

/* Chip color palette per denomination */
.chip.d1   { --chip-c1: #f5f5f5; --chip-c2: #c5c5c5; --chip-rim: #4a4a4a; color: #1a0608; text-shadow: none; }
.chip.d5   { --chip-c1: #d62433; --chip-c2: #800a14; --chip-rim: #fff; }
.chip.d25  { --chip-c1: #1e9a4d; --chip-c2: #0a4d23; --chip-rim: #fff; }
.chip.d100 { --chip-c1: #1a1a1a; --chip-c2: #050505; --chip-rim: #ffd24a; color: #ffd24a; }
.chip.d500 { --chip-c1: #a855f7; --chip-c2: #4a1a8e; --chip-rim: #fff0a8; }

.chip-actions {
  display: flex;
  gap: 10px;
}
.btn-action {
  padding: 14px 18px;
  border-radius: 12px;
  border: 0;
  font-family: 'Bungee', cursive;
  font-size: 13px;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: filter 0.15s, transform 0.08s;
}
.btn-action:active { transform: translateY(2px); }
.btn-clear {
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.45));
  color: rgba(255,255,255,0.75);
  box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.18), 0 4px 0 rgba(0,0,0,0.4);
}
.btn-clear:hover { color: #fff; filter: brightness(1.15); }
.btn-shake {
  background: linear-gradient(180deg, #5cffa1, #14b85a);
  color: #0a0418;
  box-shadow: 0 5px 0 #0a4a23, inset 0 1px 0 rgba(255,255,255,0.3);
  min-width: 130px;
}
.btn-shake:disabled {
  filter: grayscale(0.5) brightness(0.7);
  cursor: not-allowed;
}
.btn-shake:hover:not(:disabled) { filter: brightness(1.08); }
```

- [ ] **Step 2: Add chip rail markup to `.stage`, after the felt closing `</div>`**

```html
<div class="chip-rail">
  <div class="chip-denoms" id="chip-denoms">
    <button class="chip d1"   data-denom="1">$1</button>
    <button class="chip d5 selected"   data-denom="5">$5</button>
    <button class="chip d25"  data-denom="25">$25</button>
    <button class="chip d100" data-denom="100">$100</button>
    <button class="chip d500" data-denom="500">$500</button>
  </div>
  <div class="chip-actions">
    <button class="btn-action btn-clear" id="btn-clear">CLEAR</button>
    <button class="btn-action btn-shake" id="btn-shake" disabled>SHAKE</button>
  </div>
</div>
```

- [ ] **Step 3: Remove the temporary DEV ROLL button**

Find and delete:
```html
<button id="dev-roll" ...>DEV: ROLL</button>
```
And its event listener line at the bottom of the script:
```js
document.getElementById('dev-roll').addEventListener('click', rollDice);
```

- [ ] **Step 4: Wire denomination selection**

In the `<script>` block, append:

```js
/* CHIP RAIL — denomination select + buttons */
const denomButtons = document.querySelectorAll('#chip-denoms .chip');
denomButtons.forEach(b => {
  b.addEventListener('click', () => {
    denomButtons.forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    game.chipDenom = parseInt(b.dataset.denom, 10);
  });
});
```

- [ ] **Step 5: Verify in browser**

Reload.

Expected:
- Chip rail at the bottom: 5 chips ($1 white, $5 red, $25 green, $100 black-with-gold-rim, $500 purple).
- $5 chip is selected (raised, gold glow).
- Clicking another chip — selection moves to it.
- CLEAR button visible on the right.
- SHAKE button disabled (greyed out).
- No DEV ROLL button anywhere.

- [ ] **Step 6: Save checkpoint**

---

## Task 8: Chip placement on bet zones

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append CSS for chip toast / fly animation**

In the `<style>` block, append:

```css
/* Bet zone stack badge styling already in Task 6; add a place-pulse */
.bet-zone.placed-pulse { animation: placedPulse 0.4s ease-out; }
@keyframes placedPulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.04); box-shadow: inset 0 0 0 1.5px var(--neon-cyan), 0 0 24px rgba(34,211,238,0.6); }
  100% { transform: scale(1); }
}
```

- [ ] **Step 2: Append bet-placement JS to the `<script>` block**

```js
/* BET PLACEMENT */
function getBetStake(key) {
  // key examples: 'pass', 'odds', 'field', 'place:6', 'hard:8',
  //               'props:any7', 'props:horn', 'hop:4-4', 'bonus:fire'
  if (key === 'pass')  return game.bets.pass;
  if (key === 'odds')  return game.bets.odds;
  if (key === 'field') return game.bets.field;
  if (key.startsWith('place:')) return game.bets.place[parseInt(key.slice(6),10)];
  if (key.startsWith('hard:'))  return game.bets.hard[parseInt(key.slice(5),10)];
  if (key.startsWith('hop:'))   return game.bets.props.hop[key.slice(4)] || 0;
  if (key.startsWith('props:')) return game.bets.props[key.slice(6)] || 0;
  if (key.startsWith('bonus:')) return game.bets.bonus[key.slice(6)] || 0;
  return 0;
}
function setBetStake(key, value) {
  if (key === 'pass')  { game.bets.pass = value; return; }
  if (key === 'odds')  { game.bets.odds = value; return; }
  if (key === 'field') { game.bets.field = value; return; }
  if (key.startsWith('place:')) { game.bets.place[parseInt(key.slice(6),10)] = value; return; }
  if (key.startsWith('hard:'))  { game.bets.hard[parseInt(key.slice(5),10)] = value; return; }
  if (key.startsWith('hop:'))   { game.bets.props.hop[key.slice(4)] = value; return; }
  if (key.startsWith('props:')) { game.bets.props[key.slice(6)] = value; return; }
  if (key.startsWith('bonus:')) { game.bets.bonus[key.slice(6)] = value; return; }
}

/* Validation: can this bet be placed right now? */
function canPlace(key) {
  // Odds: only when point set, capped at 5× current pass bet.
  if (key === 'odds') {
    if (game.phase !== 'point' || game.bets.pass <= 0) return false;
    if (game.bets.odds + game.chipDenom > game.bets.pass * 5) return false;
  }
  // Bonus bets: only between shooters (no point, no in-flight roll, AND no bet on bonus yet from prior shooter)
  if (key.startsWith('bonus:')) {
    if (game.phase !== 'comeOut') return false;
    // Also: must not have any roll yet for this shooter.
    if (game.shooter.pointsMade.size > 0 ||
        game.shooter.smallHit.size  > 0 ||
        game.shooter.tallHit.size   > 0) return false;
  }
  return true;
}

function totalWagered() {
  let total = game.bets.pass + game.bets.odds + game.bets.field;
  for (const n in game.bets.place) total += game.bets.place[n];
  for (const n in game.bets.hard)  total += game.bets.hard[n];
  for (const k in game.bets.props) {
    if (k === 'hop') {
      for (const hk in game.bets.props.hop) total += game.bets.props.hop[hk];
    } else {
      total += game.bets.props[k];
    }
  }
  for (const k in game.bets.bonus) total += game.bets.bonus[k];
  return total;
}

function renderZoneStack(key) {
  const el = document.querySelector(`.bet-zone[data-bet="${key}"] .bz-stack`);
  if (!el) return;
  const stake = getBetStake(key);
  el.textContent = stake > 0 ? '$' + fmt(stake) : '';
  el.parentElement.classList.toggle('has-chips', stake > 0);
}

function placeChip(key) {
  if (!canPlace(key)) return false;
  if (balance < game.chipDenom) return false;
  balance -= game.chipDenom;
  persistBalance(balance);
  setBetStake(key, getBetStake(key) + game.chipDenom);
  refreshBalance();
  renderZoneStack(key);
  const el = document.querySelector(`.bet-zone[data-bet="${key}"]`);
  if (el) {
    el.classList.remove('placed-pulse');
    void el.offsetWidth;  // restart animation
    el.classList.add('placed-pulse');
  }
  updateShakeEnabled();
  return true;
}

function clearAllBets() {
  // Return all wagered chips to balance.
  balance += totalWagered();
  persistBalance(balance);
  game.bets = freshBets();
  refreshBalance();
  document.querySelectorAll('.bet-zone').forEach(z => {
    z.classList.remove('has-chips');
    const s = z.querySelector('.bz-stack');
    if (s) s.textContent = '';
  });
  updateShakeEnabled();
}

function updateShakeEnabled() {
  const btn = document.getElementById('btn-shake');
  // Shooter can shake when:
  //   come-out: a pass bet is required (otherwise nothing to play). v1: allow shaking with any bet at all.
  //   point: pass must remain (you can't take it down once a point is set); pressing SHAKE just rolls.
  // Simplest rule: SHAKE enabled whenever totalWagered > 0 OR phase === 'point' (forced to roll out the shooter).
  btn.disabled = (totalWagered() === 0 && game.phase === 'comeOut');
}

/* Wire zone click handlers — these run for the always-visible zones.
   Props/Bonus zone handlers are wired in later tasks once those zones exist. */
document.querySelectorAll('#felt .bet-zone').forEach(z => {
  z.addEventListener('click', () => {
    placeChip(z.dataset.bet);
  });
});

/* CLEAR */
document.getElementById('btn-clear').addEventListener('click', clearAllBets);

/* Initial render */
['pass','odds','field','place:2','place:3','place:4','place:5','place:6','place:8','place:9','place:10','place:11','place:12','hard:4','hard:6','hard:8','hard:10'].forEach(renderZoneStack);
updateShakeEnabled();
```

- [ ] **Step 3: Verify in browser**

Reload.

Expected:
- Select $5 chip, click "Pass Line" zone → balance drops by $5, zone shows "$5" in cyan in the corner, zone gets a cyan outline.
- Click Pass again → balance drops another $5, zone shows "$10".
- Click "Place 6" → balance drops $5, zone shows "$5".
- Click "Odds" → nothing happens (no point set yet, and odds can't be placed on come-out). Balance unchanged.
- Click "Hard 8" → balance drops $5, zone shows "$5".
- Click CLEAR → all stakes return to balance, all zones empty.
- SHAKE button enables when at least one bet is on the felt.
- Switch denom to $100, place a $100 bet on Pass — works. Balance drops $100.

- [ ] **Step 4: Save checkpoint**

---

## Task 9: Wire SHAKE → resolver → balance + win/lose visuals

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append the roll-and-resolve loop to the `<script>` block**

```js
/* SHAKE → ROLL → RESOLVE */
function applyEvents(events) {
  // Apply payouts to balance. Win = stakeReturn + amount; Lose = stake already deducted on placement.
  let payoutTotal = 0;
  for (const ev of events) {
    if (ev.kind === 'win') {
      payoutTotal += ev.amount + (ev.stakeReturn || 0);
    } else if (ev.kind === 'push' && ev.stakeReturn) {
      payoutTotal += ev.stakeReturn;
    }
  }
  if (payoutTotal > 0) {
    balance += payoutTotal;
    persistBalance(balance);
    refreshBalance();
  }
}

function flashZone(zoneKey, won) {
  // Map zone keys to DOM elements. Some zones share a single bet-zone element.
  let selector = null;
  if (['pass','odds','field'].includes(zoneKey)) selector = `.bet-zone[data-bet="${zoneKey}"]`;
  else if (zoneKey.startsWith('place:')) selector = `.bet-zone[data-bet="${zoneKey}"]`;
  else if (zoneKey.startsWith('hard:'))  selector = `.bet-zone[data-bet="${zoneKey}"]`;
  else if (zoneKey.startsWith('hop:'))   selector = `.hop-cell[data-bet="${zoneKey}"]`;
  // props/bonus zones handled when those exist (Tasks 12/13).
  else if (zoneKey === 'any7' || zoneKey === 'anyCraps' || zoneKey === 'aces' || zoneKey === 'boxcars' || zoneKey === 'yo' || zoneKey === 'aceDeuce' || zoneKey === 'ceCraps' || zoneKey === 'ceEleven' || zoneKey === 'horn' || zoneKey === 'world') selector = `.bet-zone[data-bet="props:${zoneKey}"]`;
  else if (zoneKey.startsWith('bonus:')) selector = `.bet-zone[data-bet="${zoneKey}"]`;

  if (!selector) return;
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.remove('win-flash','lose-fade');
  void el.offsetWidth;
  el.classList.add(won ? 'win-flash' : 'lose-fade');
}

function clearLosingStakesFromBets(events) {
  // Bets that have been resolved get their stake removed.
  // - Single-roll bets (field, props, hop, world, horn, C&E): always resolve. Wins are paid; losses are removed.
  // - Place/hardway: stake stays unless they hit (then they are returned via stakeReturn) or 7-out (then they lose).
  //   Real Vegas: place bets pay AND the stake remains for the next roll ("press" or "down" is a player call).
  //   v1: same — keep place stake after a win (stakeReturn does NOT zero out the stake; payout is just winnings).
  // - Pass: stake stays until line decision (made or seven-out).
  // - Odds: comes down on win or loss.
  // - Bonus: come down once resolved.

  for (const ev of events) {
    const z = ev.zone;
    if (z === 'pass') {
      // Pass stake remains as a contract bet (re-used for next come-out cycle).
      // No change.
    } else if (z === 'odds') {
      if (ev.kind === 'win' || ev.kind === 'lose') game.bets.odds = 0;
    } else if (z === 'field') {
      game.bets.field = 0;
    } else if (z.startsWith('place:')) {
      const n = parseInt(z.slice(6),10);
      if (ev.kind === 'lose') game.bets.place[n] = 0;
      // wins: stake remains
    } else if (z.startsWith('hard:')) {
      const n = parseInt(z.slice(5),10);
      if (ev.kind === 'lose') game.bets.hard[n] = 0;
      // wins: stake remains
    } else if (z.startsWith('hop:')) {
      game.bets.props.hop[z.slice(4)] = 0;
    } else if (z.startsWith('bonus:')) {
      game.bets.bonus[z.slice(6)] = 0;
    } else if (['any7','anyCraps','aces','boxcars','yo','aceDeuce','ceCraps','ceEleven','horn','world'].includes(z)) {
      game.bets.props[z] = 0;
    }
  }
}

function rerenderAllStacks() {
  document.querySelectorAll('.bet-zone[data-bet]').forEach(z => renderZoneStack(z.dataset.bet));
}

/* The full shake handler — animates dice, then resolves. */
async function shake() {
  if (game.shooter.rolling) return;
  if (document.getElementById('btn-shake').disabled) return;
  game.shooter.rolling = true;
  document.getElementById('btn-shake').disabled = true;
  document.getElementById('btn-clear').disabled = true;

  // Roll the dice (animation)
  const { d1, d2, total } = rollDice();

  // Wait for animation end
  await new Promise(r => setTimeout(r, 1500));

  // Set dice to their final faces (anchoring after animation)
  setDieFace(document.getElementById('die1'), d1);
  setDieFace(document.getElementById('die2'), d2);

  // Resolve
  const result = resolveRoll(game, d1, d2);
  game.lastRoll = { d1, d2, total };

  // Animate wins/losses with stagger
  for (let i = 0; i < result.events.length; i++) {
    const ev = result.events[i];
    setTimeout(() => flashZone(ev.zone, ev.kind === 'win'), i * 80);
  }

  // Apply payouts to balance
  applyEvents(result.events);
  // Pull resolved stakes out of state
  clearLosingStakesFromBets(result.events);

  // Update phase + shooter
  game.phase = result.nextPhase;
  game.point = result.nextPoint;
  game.shooter.pointsMade = result.newPointsMade;
  game.shooter.smallHit   = result.newSmall;
  game.shooter.tallHit    = result.newTall;
  if (result.bonusClearOnSevenOut) {
    // After 7-out, reset shooter for a new shooter
    game.shooter = freshShooter();
  }

  // Re-render
  rerenderAllStacks();

  // Wait a beat for animations to settle, then re-enable
  await new Promise(r => setTimeout(r, 600));
  game.shooter.rolling = false;
  document.getElementById('btn-clear').disabled = false;
  updateShakeEnabled();
}

document.getElementById('btn-shake').addEventListener('click', shake);
```

- [ ] **Step 2: Verify in browser**

Reload.

Test scenario A — pass line win on come-out 7:
1. Place $5 on Pass. Balance should drop to (start - 5).
2. SHAKE.
3. Re-roll until you get a 7 on come-out (or use the console: `setDieFace(document.getElementById('die1'),3); setDieFace(document.getElementById('die2'),4);` then `resolveRoll(game, 3, 4)` to verify the logic). For the visual check, just keep clicking SHAKE.
4. When 7 comes out: Pass zone flashes gold, balance increases by $5, stake stays on Pass for next come-out.

Test scenario B — point set then made:
1. Start fresh. Place $5 on Pass.
2. SHAKE until anything but 7 comes out — phase should now be point.
3. SHAKE until the point repeats — Pass flashes gold, balance +$5.

Test scenario C — seven-out:
1. With a point set, keep SHAKEing.
2. When 7 hits: Pass flashes red/dims, balance loss confirmed (no payout).

Test scenario D — place 6 lifecycle:
1. Place $6 on place:6.
2. SHAKE until 6 rolls — place 6 zone flashes gold, balance +$7 (7:6 payout on $6).
3. Note that place 6 stake remains. SHAKE again. If 7 hits, the stake is lost.

Expected console output: no errors. Each SHAKE logs `rolled X Y total Z`.

- [ ] **Step 3: Save checkpoint**

---

## Task 10: Puck (ON/OFF flip + slide)

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append puck CSS**

```css
/* PUCK */
.puck {
  position: absolute;
  width: 56px;
  height: 56px;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(.4,1.4,.6,1), left 0.5s ease, top 0.5s ease;
  pointer-events: none;
  z-index: 4;
}
.puck-face {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: 'Bungee', cursive;
  font-size: 16px;
  letter-spacing: 0.06em;
  backface-visibility: hidden;
}
.puck-face.on {
  background:
    radial-gradient(circle at 35% 30%, #fff7d1, var(--gold-1) 55%, var(--gold-2));
  color: #2a1500;
  text-shadow: 0 1px 0 rgba(255,255,255,0.4);
  box-shadow:
    inset 0 0 0 3px rgba(255,255,255,0.4),
    inset 0 0 0 5px rgba(0,0,0,0.4),
    0 6px 10px rgba(0,0,0,0.5),
    0 0 18px rgba(255,210,74,0.5);
}
.puck-face.off {
  background:
    radial-gradient(circle at 35% 30%, #5a5a5a, #1a1a1a 70%);
  color: rgba(255,255,255,0.85);
  transform: rotateY(180deg);
  box-shadow:
    inset 0 0 0 3px rgba(255,255,255,0.18),
    inset 0 0 0 5px rgba(0,0,0,0.6),
    0 6px 10px rgba(0,0,0,0.5);
}
.puck.is-off { transform: rotateY(180deg); }
```

- [ ] **Step 2: Make `#felt` a positioned parent and add puck markup**

Edit the `.felt` rule in CSS — add `position: relative;` (it's already there in Task 6).

Inside `<div class="felt" id="felt">` at the very top (just after the opening tag), insert:

```html
<div class="puck is-off" id="puck">
  <div class="puck-face on" id="puck-on">8</div>
  <div class="puck-face off">OFF</div>
</div>
```

- [ ] **Step 3: Append puck logic to JS**

```js
/* PUCK */
const puck = document.getElementById('puck');
const puckOnText = document.getElementById('puck-on');

function positionPuckAtZone(zoneKey) {
  // Snap the puck to sit above a bet zone.
  const target = document.querySelector(`.bet-zone[data-bet="${zoneKey}"]`);
  const felt   = document.getElementById('felt');
  if (!target || !felt) return;
  const targetRect = target.getBoundingClientRect();
  const feltRect   = felt.getBoundingClientRect();
  const cx = targetRect.left + targetRect.width / 2 - feltRect.left - 28; // half puck width
  const cy = targetRect.top - feltRect.top - 28; // sit on top edge
  puck.style.left = Math.max(8, cx) + 'px';
  puck.style.top  = Math.max(8, cy) + 'px';
}
function setPuck(point) {
  if (point === null) {
    puck.classList.add('is-off');
    // park OFF puck in a corner of the felt
    puck.style.left = '12px';
    puck.style.top  = '12px';
  } else {
    puck.classList.remove('is-off');
    puckOnText.textContent = String(point);
    positionPuckAtZone('place:' + point);
  }
}
setPuck(null);
window.addEventListener('resize', () => { if (game.point !== null) positionPuckAtZone('place:' + game.point); });
```

- [ ] **Step 4: Update shake() to also update the puck**

In the `shake()` function, after `game.point = result.nextPoint;` add:

```js
  setPuck(game.point);
```

(There's already a `game.point = result.nextPoint;` line; add the setPuck call right after it.)

- [ ] **Step 5: Verify in browser**

Reload.

Expected:
- Puck shows OFF and sits in the top-left corner of the felt.
- Place $5 on Pass, SHAKE.
- On any non-7 come-out: puck flips to ON (gold side), shows the point number, slides to sit above the corresponding place zone.
- SHAKE again until the point hits or 7-out: puck flips back to OFF and returns to its corner.

- [ ] **Step 6: Save checkpoint**

---

## Task 11: Indicator row (last roll, shooter status, fire dots)

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append indicator CSS**

```css
/* INDICATOR ROW */
.indicator-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(0,0,0,0.35);
  box-shadow: inset 0 0 0 1px rgba(255,210,74,0.22);
}
.ind-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ind-label {
  font-family: 'Bungee', cursive;
  font-size: 9px;
  letter-spacing: 0.28em;
  color: rgba(34,211,238,0.85);
  text-shadow: 0 0 6px rgba(34,211,238,0.5);
}
.ind-value {
  font-family: 'Geist Mono', monospace;
  font-weight: 800;
  font-size: 16px;
  color: #fff;
}
.fire-dots {
  display: flex;
  gap: 5px;
}
.fire-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
}
.fire-dot.lit {
  background: radial-gradient(circle at 35% 30%, #fff7d1, var(--gold-1) 55%, var(--gold-2));
  box-shadow: 0 0 10px rgba(255,210,74,0.7);
  animation: dotPulse 1.4s ease-in-out infinite alternate;
}
@keyframes dotPulse {
  0%   { transform: scale(1); }
  100% { transform: scale(1.15); }
}
@media (max-width: 720px) {
  .indicator-row { gap: 12px; padding: 8px 10px; flex-wrap: wrap; }
}
```

- [ ] **Step 2: Add indicator markup between dome-wrap and felt**

After the closing `</div>` of `dome-wrap` (and its sibling `<div class="fan">...</div>`), insert:

```html
<div class="indicator-row">
  <div class="ind-block">
    <div class="ind-label">POINT</div>
    <div class="ind-value" id="ind-point">OFF</div>
  </div>
  <div class="ind-block">
    <div class="ind-label">LAST</div>
    <div class="ind-value" id="ind-last">—</div>
  </div>
  <div class="ind-block">
    <div class="ind-label">FIRE</div>
    <div class="fire-dots" id="fire-dots">
      <span class="fire-dot"></span>
      <span class="fire-dot"></span>
      <span class="fire-dot"></span>
      <span class="fire-dot"></span>
      <span class="fire-dot"></span>
      <span class="fire-dot"></span>
    </div>
  </div>
  <div class="ind-block">
    <div class="ind-label">SHOOTER</div>
    <div class="ind-value" id="ind-shooter">NEW</div>
  </div>
</div>
```

- [ ] **Step 3: Append indicator-update logic**

```js
/* INDICATOR */
function updateIndicators() {
  document.getElementById('ind-point').textContent =
    game.point === null ? 'OFF' : String(game.point);
  document.getElementById('ind-last').textContent =
    game.lastRoll === null ? '—' :
      `${game.lastRoll.d1}+${game.lastRoll.d2}=${game.lastRoll.total}`;
  // Fire dots — light up min(pointsMade, 6) dots
  const dots = document.querySelectorAll('#fire-dots .fire-dot');
  const lit  = Math.min(6, game.shooter.pointsMade.size);
  dots.forEach((d, i) => d.classList.toggle('lit', i < lit));
  // Shooter status text
  document.getElementById('ind-shooter').textContent =
    game.shooter.pointsMade.size === 0 ? 'NEW' :
    (game.shooter.pointsMade.size + ' PT' + (game.shooter.pointsMade.size === 1 ? '' : 'S'));
}
updateIndicators();
```

- [ ] **Step 4: Call `updateIndicators()` at the end of `shake()`**

Inside `shake()`, after `rerenderAllStacks();`, add:

```js
  updateIndicators();
```

- [ ] **Step 5: Verify in browser**

Reload.

Expected:
- Indicator row between dome and felt: POINT, LAST, FIRE (6 dim dots), SHOOTER.
- After first roll: LAST updates to e.g. "3+4=7", SHOOTER stays "NEW" or shows "1 PT" if a point was made.
- Make a point — one fire dot lights up gold and pulses.
- Make more points — more dots light up.
- Seven-out — dots reset to empty, SHOOTER → "NEW".

- [ ] **Step 6: Save checkpoint**

---

## Task 12: PROPS drawer

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append drawer CSS**

```css
/* DRAWERS — collapsible panels for Props and Bonus */
.drawer-tabs {
  display: flex;
  gap: 8px;
}
.tab-btn {
  flex: 1;
  padding: 12px;
  border: 0;
  border-radius: 10px 10px 0 0;
  font-family: 'Bungee', cursive;
  font-size: 12px;
  letter-spacing: 0.22em;
  cursor: pointer;
  color: rgba(255,255,255,0.7);
  background: linear-gradient(180deg, rgba(168,85,247,0.18), rgba(15,4,30,0.85));
  box-shadow: inset 0 0 0 1.5px rgba(168,85,247,0.4);
  transition: filter 0.15s, color 0.15s;
}
.tab-btn:hover { filter: brightness(1.18); color: #fff; }
.tab-btn.active {
  color: var(--gold-1);
  background: linear-gradient(180deg, rgba(255,210,74,0.18), rgba(15,4,30,0.85));
  box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.5);
}
.drawer {
  display: none;
  padding: 14px;
  border-radius: 0 0 14px 14px;
  background:
    repeating-linear-gradient(45deg, transparent 0 20px, rgba(255,210,74,0.04) 20px 21px),
    repeating-linear-gradient(-45deg, transparent 0 20px, rgba(168,85,247,0.04) 20px 21px),
    radial-gradient(ellipse at 50% 50%, var(--felt-mid), var(--felt-deep) 80%);
  box-shadow:
    inset 0 0 0 2px rgba(255,210,74,0.32),
    inset 0 0 0 4px rgba(0,0,0,0.4);
}
.drawer.open { display: block; }

/* Props grid */
.props-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.bet-zone.prop-zone { min-height: 64px; padding: 8px 6px; }
.bet-zone.prop-zone .bz-num { font-family: 'Bungee', cursive; font-size: 13px; letter-spacing: 0.08em; }

/* Hop bets grid — 6 hard cells top, 15 easy cells in 5x3 grid */
.hop-section {
  border-top: 1px solid rgba(255,210,74,0.18);
  padding-top: 10px;
}
.hop-label {
  font-family: 'Bungee', cursive;
  font-size: 10px;
  letter-spacing: 0.25em;
  color: var(--gold-1);
  margin-bottom: 6px;
}
.hop-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}
.hop-cell {
  display: grid;
  place-items: center;
  font-family: 'Geist Mono', monospace;
  font-size: 11px;
  font-weight: 800;
  padding: 8px 2px;
  min-height: 38px;
  border-radius: 6px;
  border: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.35));
  box-shadow: inset 0 0 0 1px rgba(255,210,74,0.25);
  color: #fff;
  cursor: pointer;
  position: relative;
  transition: filter 0.15s, box-shadow 0.15s, transform 0.08s;
}
.hop-cell.hard { background: linear-gradient(180deg, rgba(255,46,147,0.18), rgba(0,0,0,0.4)); box-shadow: inset 0 0 0 1px rgba(255,46,147,0.4); }
.hop-cell:hover { filter: brightness(1.18); }
.hop-cell:active { transform: translateY(1px); }
.hop-cell.has-chips { box-shadow: inset 0 0 0 1.5px var(--neon-cyan), 0 0 10px rgba(34,211,238,0.3); }
.hop-cell .hc-stake {
  font-size: 9px;
  color: var(--neon-cyan);
  position: absolute;
  bottom: 1px;
  right: 2px;
}
.easy-row { grid-column: span 6; display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
```

- [ ] **Step 2: Add drawer tabs + props drawer markup, after the closing `</div>` of `#felt` and before the chip rail**

```html
<div class="drawer-tabs">
  <button class="tab-btn" id="tab-props">▾ PROPS</button>
  <button class="tab-btn" id="tab-bonus">▾ BONUS</button>
</div>

<div class="drawer" id="drawer-props">
  <div class="props-grid">
    <button class="bet-zone prop-zone" data-bet="props:any7"><div class="bz-num">ANY 7</div><div class="bz-pay">4:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:anyCraps"><div class="bz-num">ANY CRAPS</div><div class="bz-pay">7:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:aces"><div class="bz-num">ACES (2)</div><div class="bz-pay">30:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:boxcars"><div class="bz-num">BOXCARS (12)</div><div class="bz-pay">30:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:yo"><div class="bz-num">YO (11)</div><div class="bz-pay">15:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:aceDeuce"><div class="bz-num">ACE-DEUCE (3)</div><div class="bz-pay">15:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:ceCraps"><div class="bz-num">C (CRAPS)</div><div class="bz-pay">3:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:ceEleven"><div class="bz-num">E (ELEVEN)</div><div class="bz-pay">7:1</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:horn"><div class="bz-num">HORN</div><div class="bz-pay">2,3,11,12</div><span class="bz-stack"></span></button>
    <button class="bet-zone prop-zone" data-bet="props:world"><div class="bz-num">WORLD</div><div class="bz-pay">HORN+7</div><span class="bz-stack"></span></button>
  </div>

  <div class="hop-section">
    <div class="hop-label">HOP BETS — HARD (30:1)</div>
    <div class="hop-grid">
      <button class="hop-cell hard" data-bet="hop:1-1">1-1<span class="hc-stake"></span></button>
      <button class="hop-cell hard" data-bet="hop:2-2">2-2<span class="hc-stake"></span></button>
      <button class="hop-cell hard" data-bet="hop:3-3">3-3<span class="hc-stake"></span></button>
      <button class="hop-cell hard" data-bet="hop:4-4">4-4<span class="hc-stake"></span></button>
      <button class="hop-cell hard" data-bet="hop:5-5">5-5<span class="hc-stake"></span></button>
      <button class="hop-cell hard" data-bet="hop:6-6">6-6<span class="hc-stake"></span></button>
    </div>
    <div class="hop-label" style="margin-top: 10px;">HOP BETS — EASY (15:1)</div>
    <div class="hop-grid">
      <div class="easy-row">
        <button class="hop-cell" data-bet="hop:1-2">1-2<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:1-3">1-3<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:1-4">1-4<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:1-5">1-5<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:1-6">1-6<span class="hc-stake"></span></button>
      </div>
      <div class="easy-row">
        <button class="hop-cell" data-bet="hop:2-3">2-3<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:2-4">2-4<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:2-5">2-5<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:2-6">2-6<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:3-4">3-4<span class="hc-stake"></span></button>
      </div>
      <div class="easy-row">
        <button class="hop-cell" data-bet="hop:3-5">3-5<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:3-6">3-6<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:4-5">4-5<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:4-6">4-6<span class="hc-stake"></span></button>
        <button class="hop-cell" data-bet="hop:5-6">5-6<span class="hc-stake"></span></button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Append drawer toggle + handler wiring**

```js
/* DRAWERS */
function toggleDrawer(name) {
  const propsBtn  = document.getElementById('tab-props');
  const bonusBtn  = document.getElementById('tab-bonus');
  const propsDr   = document.getElementById('drawer-props');
  const bonusDr   = document.getElementById('drawer-bonus');
  if (name === 'props') {
    const open = !propsDr.classList.contains('open');
    propsDr.classList.toggle('open', open);
    bonusDr && bonusDr.classList.remove('open');
    propsBtn.classList.toggle('active', open);
    bonusBtn && bonusBtn.classList.remove('active');
  } else if (name === 'bonus') {
    const open = !bonusDr.classList.contains('open');
    bonusDr && bonusDr.classList.toggle('open', open);
    propsDr.classList.remove('open');
    bonusBtn && bonusBtn.classList.toggle('active', open);
    propsBtn.classList.remove('active');
  }
}
document.getElementById('tab-props').addEventListener('click', () => toggleDrawer('props'));
document.getElementById('tab-bonus').addEventListener('click', () => toggleDrawer('bonus'));

/* PROP zones — wire same handler */
document.querySelectorAll('#drawer-props .bet-zone').forEach(z => {
  z.addEventListener('click', () => placeChip(z.dataset.bet));
});

/* HOP cells — slightly different rendering (text in `.hc-stake`) */
function renderHopStack(key) {
  const cell = document.querySelector(`.hop-cell[data-bet="${key}"]`);
  if (!cell) return;
  const stake = getBetStake(key);
  cell.querySelector('.hc-stake').textContent = stake > 0 ? '$' + fmt(stake) : '';
  cell.classList.toggle('has-chips', stake > 0);
}
document.querySelectorAll('.hop-cell').forEach(c => {
  c.addEventListener('click', () => {
    if (placeChip(c.dataset.bet)) renderHopStack(c.dataset.bet);
  });
});

/* Extend rerenderAllStacks to also re-render hop and prop stacks */
const HOP_KEYS = ['1-1','2-2','3-3','4-4','5-5','6-6',
                  '1-2','1-3','1-4','1-5','1-6',
                  '2-3','2-4','2-5','2-6','3-4',
                  '3-5','3-6','4-5','4-6','5-6'];
const PROP_KEYS = ['any7','anyCraps','aces','boxcars','yo','aceDeuce','ceCraps','ceEleven','horn','world'];
const _origRerender = rerenderAllStacks;
rerenderAllStacks = function() {
  _origRerender();
  HOP_KEYS.forEach(k => renderHopStack(k));
  PROP_KEYS.forEach(k => renderZoneStack('props:' + k));
};
```

- [ ] **Step 4: Add Horn/World min-bet enforcement to canPlace()**

Find the `canPlace(key)` function and extend it before the final `return true;`:

```js
  // Horn requires 4-chip minimum; World requires 5-chip minimum.
  if (key === 'props:horn') {
    if (game.chipDenom * 4 > balance) return false;
    // place 4 units at once: handle in placeChip below
  }
  if (key === 'props:world') {
    if (game.chipDenom * 5 > balance) return false;
  }
```

Then update `placeChip(key)` so Horn/World place the full multi-unit bet at once:

Replace the `placeChip` function body's first lines (between `if (!canPlace(key)) return false;` and the existing single-chip deduction) with:

```js
function placeChip(key) {
  if (!canPlace(key)) return false;
  let chipAmount = game.chipDenom;
  if (key === 'props:horn')  chipAmount = game.chipDenom * 4;
  if (key === 'props:world') chipAmount = game.chipDenom * 5;
  if (balance < chipAmount) return false;
  balance -= chipAmount;
  persistBalance(balance);
  setBetStake(key, getBetStake(key) + chipAmount);
  refreshBalance();
  // Hop cells rerender separately; everything else uses renderZoneStack.
  if (key.startsWith('hop:')) renderHopStack(key); else renderZoneStack(key);
  const el = document.querySelector(`[data-bet="${key}"]`);
  if (el) {
    el.classList.remove('placed-pulse');
    void el.offsetWidth;
    el.classList.add('placed-pulse');
  }
  updateShakeEnabled();
  return true;
}
```

Delete the old `placeChip()` function definition (it had the single-chip-only logic).

- [ ] **Step 5: Verify in browser**

Reload.

Expected:
- Two tabs below the felt: PROPS and BONUS.
- Click PROPS → drawer slides open showing all 10 prop bets + a 21-cell hop grid (6 hard pink-tinted cells across the top, 15 easy cells below in 3 rows of 5).
- Click PROPS again → drawer closes.
- Click BONUS → does nothing (no drawer yet — Task 13).
- Place $5 on "Any 7" → balance drops $5, zone shows "$5".
- SHAKE — if 7 rolls, Any 7 flashes gold, balance +$20 (4:1), stake cleared.
- If not 7, Any 7 flashes red, stake cleared.
- Place $5 on "Horn" → balance drops $20 (4 units × $5).
- Roll an 11 → Horn flashes gold, balance gets the right payout.
- Place $1 on "4-4" hop → balance drops $1. Roll 4-4 → +$30.

- [ ] **Step 6: Save checkpoint**

---

## Task 13: BONUS drawer + Fire/All-Small/All-Tall/Make-em-All

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append bonus drawer CSS**

```css
.bonus-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.bonus-zone {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 14px 10px;
  min-height: 92px;
  border-radius: 12px;
  border: 0;
  cursor: pointer;
  text-align: center;
  background: linear-gradient(180deg, rgba(168,85,247,0.16), rgba(0,0,0,0.45));
  box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.4);
  transition: filter 0.15s, transform 0.08s, box-shadow 0.15s;
  color: #fff;
  position: relative;
}
.bonus-zone:hover { filter: brightness(1.18); }
.bonus-zone:active { transform: translateY(1px); }
.bonus-zone.has-chips { box-shadow: inset 0 0 0 2px var(--neon-cyan), 0 0 14px rgba(34,211,238,0.4); }
.bonus-zone.disabled {
  filter: grayscale(0.7) brightness(0.5);
  cursor: not-allowed;
}
.bonus-zone .bz-title {
  font-family: 'Bungee Shade', cursive;
  font-size: 16px;
  line-height: 1.1;
  background: linear-gradient(180deg, #fff7d1, var(--gold-1) 50%, var(--gold-2));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.5));
  letter-spacing: 0.04em;
}
.bonus-zone .bz-pay-big {
  font-family: 'Geist Mono', monospace;
  font-size: 12px;
  font-weight: 800;
  color: var(--neon-pink);
  text-shadow: 0 0 8px rgba(255,46,147,0.5);
}
.bonus-zone .bz-sub {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: rgba(255,255,255,0.6);
}

/* Progress dots for All Small / All Tall */
.bonus-progress {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.bp-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(255,255,255,0.12);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
}
.bp-dot.lit {
  background: radial-gradient(circle at 30% 30%, #5cffa1, #14b85a);
  box-shadow: 0 0 6px rgba(92,255,161,0.5);
}
```

- [ ] **Step 2: Add bonus drawer markup, right after the props drawer closes (after `</div>` of `#drawer-props`)**

```html
<div class="drawer" id="drawer-bonus">
  <div class="bonus-grid">
    <button class="bonus-zone" data-bet="bonus:fire">
      <div class="bz-title">FIRE BET</div>
      <div class="bz-sub">4 PTS · 5 PTS · 6+ PTS</div>
      <div class="bz-pay-big">24 · 249 · 999 : 1</div>
      <span class="bz-stack"></span>
    </button>
    <button class="bonus-zone" data-bet="bonus:allSmall">
      <div class="bz-title">ALL SMALL</div>
      <div class="bz-sub">2 · 3 · 4 · 5 · 6 BEFORE 7</div>
      <div class="bz-pay-big">30:1</div>
      <div class="bonus-progress" id="bp-small">
        <span class="bp-dot" data-n="2"></span>
        <span class="bp-dot" data-n="3"></span>
        <span class="bp-dot" data-n="4"></span>
        <span class="bp-dot" data-n="5"></span>
        <span class="bp-dot" data-n="6"></span>
      </div>
      <span class="bz-stack"></span>
    </button>
    <button class="bonus-zone" data-bet="bonus:allTall">
      <div class="bz-title">ALL TALL</div>
      <div class="bz-sub">8 · 9 · 10 · 11 · 12 BEFORE 7</div>
      <div class="bz-pay-big">30:1</div>
      <div class="bonus-progress" id="bp-tall">
        <span class="bp-dot" data-n="8"></span>
        <span class="bp-dot" data-n="9"></span>
        <span class="bp-dot" data-n="10"></span>
        <span class="bp-dot" data-n="11"></span>
        <span class="bp-dot" data-n="12"></span>
      </div>
      <span class="bz-stack"></span>
    </button>
    <button class="bonus-zone" data-bet="bonus:makeAll">
      <div class="bz-title">MAKE 'EM ALL</div>
      <div class="bz-sub">ALL SMALL + ALL TALL</div>
      <div class="bz-pay-big">150:1</div>
      <span class="bz-stack"></span>
    </button>
  </div>
</div>
```

- [ ] **Step 3: Append bonus-zone wiring + UI update logic**

```js
/* BONUS zones */
document.querySelectorAll('#drawer-bonus .bonus-zone').forEach(z => {
  z.addEventListener('click', () => placeChip(z.dataset.bet));
});

const BONUS_KEYS = ['fire','allSmall','allTall','makeAll'];

function renderBonusStack(key) {
  const el = document.querySelector(`.bonus-zone[data-bet="bonus:${key}"]`);
  if (!el) return;
  const stake = getBetStake('bonus:' + key);
  let stackSpan = el.querySelector('.bz-stack');
  stackSpan.textContent = stake > 0 ? '$' + fmt(stake) : '';
  stackSpan.style.cssText = 'position:absolute; bottom:6px; right:8px; font-family:"Geist Mono",monospace; font-size:11px; font-weight:800; color:var(--neon-cyan); text-shadow:0 0 6px rgba(34,211,238,0.6);';
  el.classList.toggle('has-chips', stake > 0);
  // disable visual when not placeable
  const placeable = canPlace('bonus:' + key);
  el.classList.toggle('disabled', !placeable && stake === 0);
}

function renderBonusProgress() {
  document.querySelectorAll('#bp-small .bp-dot').forEach(d => {
    d.classList.toggle('lit', game.shooter.smallHit.has(parseInt(d.dataset.n, 10)));
  });
  document.querySelectorAll('#bp-tall .bp-dot').forEach(d => {
    d.classList.toggle('lit', game.shooter.tallHit.has(parseInt(d.dataset.n, 10)));
  });
}

/* Extend rerenderAllStacks to include bonus */
const _rerenderWithoutBonus = rerenderAllStacks;
rerenderAllStacks = function() {
  _rerenderWithoutBonus();
  BONUS_KEYS.forEach(k => renderBonusStack(k));
  renderBonusProgress();
};

/* Extend updateIndicators chain to also refresh bonus disable states */
const _updateIndicatorsOrig = updateIndicators;
updateIndicators = function() {
  _updateIndicatorsOrig();
  BONUS_KEYS.forEach(k => renderBonusStack(k));
  renderBonusProgress();
};
updateIndicators();
```

- [ ] **Step 4: Update `flashZone()` to handle bonus zones**

The existing `flashZone` already has a branch for `bonus:*` so it should "just work". Verify the selector is `.bonus-zone[data-bet="bonus:xxx"]` not `.bet-zone[data-bet="bonus:xxx"]`. Update `flashZone()`'s bonus branch:

Find:
```js
  else if (zoneKey.startsWith('bonus:')) selector = `.bet-zone[data-bet="${zoneKey}"]`;
```

Replace with:
```js
  else if (zoneKey.startsWith('bonus:')) selector = `.bonus-zone[data-bet="${zoneKey}"]`;
```

- [ ] **Step 5: Verify in browser**

Reload.

Expected:
- Click BONUS tab → drawer opens with 4 large bonus tiles (Fire / All Small / All Tall / Make-em-All).
- Each tile shows title, paytable, progress dots where applicable.
- On come-out (no point yet, no rolls yet): all 4 are placeable. Click Fire Bet → balance -$5, tile shows "$5".
- SHAKE — a non-7 sets a point.
- BONUS tab tiles should now be visually disabled (cannot place new ones mid-shooter).
- As rolls happen and small/tall numbers land, the green progress dots in All Small / All Tall tiles light up.
- Make a point — Fire indicator (top indicator row, gold dots) gets one lit.
- 7-out — Fire Bet resolves: if ≥4 unique points were made, win; else lose. Progress dots reset. Bonus zones become placeable again.

Specific scenario for Fire Bet:
```js
// in DevTools console after placing Fire Bet and pass-line:
// Force scenario: make 4 points, then 7-out.
// You can hand-roll by manipulating game.point and shaking, or just play through.
```
A faster way to verify visually: open the console, observe `game.shooter.pointsMade` grows each time you successfully make a point.

- [ ] **Step 6: Save checkpoint**

---

## Task 14: Audio engine + SFX hookups

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Append a small audio pool to the `<script>` block**

```js
/* ============================================================
   AUDIO
   ============================================================ */
const SFX_PATHS = {
  shake:       'sfx/bubble_shake.mp3',
  settle:      'sfx/bubble_settle.mp3',
  puckOn:      'sfx/puck_on.mp3',
  puckOff:     'sfx/puck_off.mp3',
  sevenOut:    'sfx/seven_out.mp3',
  pointMade:   'sfx/point_made.mp3',
  fieldWin:    'sfx/field_win.mp3',
  hardwayWin:  'sfx/hardway_win.mp3',
  propsWin:    'sfx/props_win.mp3',
  fireLight:   'sfx/fire_light.mp3',
  fireBig:     'sfx/fire_big.mp3',
  passWin:     'sfx/win_chime.mp3',       // reuse
  chipPlace:   'sfx/chip_place_a.mp3',    // rotated among place_a/b/c at runtime
  chipPlaceB:  'sfx/chip_place_b.mp3',
  chipPlaceC:  'sfx/chip_place_c.mp3',
  chipSelect:  'sfx/chip_select.mp3',
  chipPayout:  'sfx/chip_payout.mp3',
  chipClear:   'sfx/chip_clear.mp3',
  buttonSoft:  'sfx/button_soft.mp3',
};
const sfxPool = {};
function preloadSfx() {
  Object.entries(SFX_PATHS).forEach(([key, path]) => {
    const pool = [];
    for (let i = 0; i < 3; i++) {
      const a = new Audio(path);
      a.preload = 'auto';
      pool.push(a);
    }
    sfxPool[key] = { pool, idx: 0 };
  });
}
preloadSfx();

function playSfx(key, volMul = 1) {
  const entry = sfxPool[key];
  if (!entry) return;
  const a = entry.pool[entry.idx];
  entry.idx = (entry.idx + 1) % entry.pool.length;
  try {
    a.currentTime = 0;
    a.volume = (window.Settings ? Settings.sfxVolume() : 0.85) * volMul;
    a.play().catch(() => { /* file may be missing — silent */ });
  } catch (e) { /* swallow */ }
}

/* Place-chip sound rotation among 3 variants */
let chipPlaceCycle = 0;
function playChipPlaceSound() {
  const keys = ['chipPlace','chipPlaceB','chipPlaceC'];
  playSfx(keys[chipPlaceCycle]);
  chipPlaceCycle = (chipPlaceCycle + 1) % 3;
}
```

- [ ] **Step 2: Hook SFX into actions**

Find `placeChip()`. Just after `balance -= chipAmount;` add:
```js
  playChipPlaceSound();
```

Find the denomination select listener (in the chip rail wiring). After `game.chipDenom = parseInt(b.dataset.denom, 10);` add:
```js
    playSfx('chipSelect');
```

Find the `clearAllBets()` function. At the start, add:
```js
  playSfx('chipClear');
```

Find the `shake()` function. Update it as follows:

- At the very start (right after the `if (game.shooter.rolling) return;` and friends), add:
```js
  playSfx('buttonSoft');
```

- After `const { d1, d2, total } = rollDice();`, add:
```js
  playSfx('shake');
```

- After `setDieFace(...)` calls and BEFORE applying events, add:
```js
  playSfx('settle');
```

- After resolving events, before the `for (let i = 0; ...)` stagger loop, add:
```js
  // Outcome stings
  if (result.pointMade)        playSfx('pointMade');
  else if (result.sevenOut)    playSfx('sevenOut');
```

- Inside the event loop body, change to also play per-zone sounds with the existing stagger:
```js
  for (let i = 0; i < result.events.length; i++) {
    const ev = result.events[i];
    setTimeout(() => {
      flashZone(ev.zone, ev.kind === 'win');
      if (ev.kind === 'win') {
        if (ev.zone === 'pass' || ev.zone === 'odds') playSfx('passWin');
        else if (ev.zone === 'field')                  playSfx('fieldWin');
        else if (ev.zone.startsWith('hard:'))          playSfx('hardwayWin');
        else if (ev.zone.startsWith('place:'))         playSfx('chipPayout');
        else if (ev.zone.startsWith('hop:'))           playSfx('propsWin');
        else if (ev.zone.startsWith('bonus:fire'))     playSfx('fireBig');
        else if (ev.zone.startsWith('bonus:'))         playSfx('fireBig');
        else                                            playSfx('propsWin');
      }
    }, i * 80);
  }
```
(Replace the existing version of that loop wholesale.)

Now hook puck sound. Update `setPuck(point)`:
```js
function setPuck(point) {
  const wasOff = puck.classList.contains('is-off');
  if (point === null) {
    if (!wasOff) playSfx('puckOff');
    puck.classList.add('is-off');
    puck.style.left = '12px';
    puck.style.top  = '12px';
  } else {
    if (wasOff) playSfx('puckOn');
    puck.classList.remove('is-off');
    puckOnText.textContent = String(point);
    positionPuckAtZone('place:' + point);
  }
}
```

Hook fire-light sound. After each successful point made (in `shake()`, just after the `if (result.pointMade) playSfx('pointMade');`), add:
```js
  if (result.pointMade) {
    // We just lit a new fire dot
    setTimeout(() => playSfx('fireLight'), 350);
  }
```

- [ ] **Step 3: Verify in browser**

Reload.

Expected:
- Clicking a denomination chip plays a brief click.
- Placing a chip on a bet zone plays a chip-on-felt clack (rotating through 3 variants).
- CLEAR plays a cascade.
- SHAKE: soft button press → dice rattling shake sound for ~1.4s → final settle clack → outcome sting (pass win / point made / seven-out) → per-zone payout sounds.
- Puck flipping ON or OFF plays a chunky plastic thump.
- Fire dot lighting on a made point plays a soft ping.

Note: if any of the new ElevenLabs files are missing, that specific sound is silently skipped (`.play().catch(() => {})`). Existing chip/button/win files are present and will play.

- [ ] **Step 4: Save checkpoint**

---

## Task 15: Append SFX prompts to `generate_sfx.py`

**Files:**
- Modify: `sfx/generate_sfx.py`

- [ ] **Step 1: Append 11 new entries to the `SFX` list**

Find the closing `]` of the `SFX = [` list (after the `button_soft.mp3` entry). Just before that closing bracket, insert:

```python

    # CRAPS — bubble dome, dice, puck, outcomes
    ("bubble_shake.mp3",
     "Two casino dice clattering rapidly inside a clear acrylic dome, sharp plastic-on-plastic rattle, dry close microphone, no music, no reverb",
     1.4, 0.8),
    ("bubble_settle.mp3",
     "Single final dice clack inside acrylic dome, brief and dry, coming to rest, close microphone, no reverb",
     0.4, 0.85),
    ("puck_on.mp3",
     "Heavy plastic casino puck snapping firmly onto felt, single tight chunky thump, dry, no reverb",
     0.4, 0.85),
    ("puck_off.mp3",
     "Heavy plastic casino puck flipping off, soft thud slightly lower than puck_on, dry, no music, no reverb",
     0.4, 0.85),
    ("seven_out.mp3",
     "Brief descending three-note disappointment sting, low warm synth, gentle, casino seven-out, no long reverb tail",
     0.9, 0.65),
    ("point_made.mp3",
     "Bright ascending two-note bell chime, casino point-made win, clean and triumphant, no reverb tail",
     0.7, 0.65),
    ("field_win.mp3",
     "Very short sparkly flutter, tiny celebratory ding, casino field bet win, dry and brief, no music",
     0.5, 0.7),
    ("hardway_win.mp3",
     "Crisp bright bell ping, single triumphant note, casino hardway win, no reverb",
     0.5, 0.75),
    ("props_win.mp3",
     "Short bright chime, casino prop bet win, sparkly and brief, no music, no reverb tail",
     0.6, 0.7),
    ("fire_light.mp3",
     "Single soft cyan ping like a UI light turning on, brief and clean, no reverb",
     0.4, 0.8),
    ("fire_big.mp3",
     "Triumphant short fanfare with bells and glittery rise, casino fire bet jackpot, bright and compact, no long reverb",
     1.2, 0.55),
```

- [ ] **Step 2: Verify the Python script is syntactically valid**

Run a syntax-only check:
```bash
python -c "import ast; ast.parse(open('sfx/generate_sfx.py').read()); print('OK')"
```
Expected: `OK`

- [ ] **Step 3: (Optional) Generate the new SFX**

If you have `ELEVENLABS_API_KEY` set in env, run:
```bash
cd sfx
python generate_sfx.py
```
The script auto-skips existing files, so it generates only the 11 new ones (~30 seconds total).

If you don't have an API key, skip this step — the game silently no-ops on missing files and is fully playable without them. Generate later when convenient.

- [ ] **Step 4: Verify in browser (only if SFX were generated)**

Reload `craplesscraps.html`. Roll the dice. You should hear:
- Distinct dice clatter for the shake (different from blackjack's card sounds).
- A snappy puck thump on each puck flip.
- A descending sting on seven-out, a bright bell on point-made.
- A small ping each time a new Fire Bet point is made.

- [ ] **Step 5: Save checkpoint**

---

## Task 16: Lobby integration (`index.html`)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Append `preview.craps` CSS to the existing `<style>` block in `index.html`**

Find the existing `/* BLACKJACK PREVIEW ... */` block. Right after the last selector for `.preview.blackjack .c3 ...`, insert:

```css
/* CRAPS PREVIEW — mini bubble dome with two dice */
.preview.craps {
  background:
    radial-gradient(ellipse at 50% 50%, rgba(255,210,74,0.14), transparent 65%),
    radial-gradient(ellipse at 20% 0%, rgba(168,85,247,0.30), transparent 70%),
    linear-gradient(180deg, #0a0418, #1a0838 100%);
  box-shadow: inset 0 0 0 1px rgba(255,210,74,0.32);
  overflow: hidden;
}
.preview.craps .cr-dome {
  position: relative;
  width: 130px;
  height: 100px;
  border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%;
  background:
    radial-gradient(ellipse 60% 28% at 50% 14%, rgba(255,255,255,0.45), transparent 70%),
    radial-gradient(circle at 50% 60%, rgba(168,85,247,0.18), rgba(10,4,24,0.6) 70%);
  box-shadow:
    inset 0 0 22px rgba(168,85,247,0.3),
    inset 0 -6px 14px rgba(0,0,0,0.5),
    inset 0 3px 8px rgba(255,255,255,0.18),
    0 0 28px rgba(255,210,74,0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  animation: craprBob 3s ease-in-out infinite alternate;
}
.preview.craps .cr-dome::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  padding: 2px;
  background: conic-gradient(from 220deg, #fff0a8, #ffd24a 25%, #5c3d00 40%, #ffd24a 55%, #fff0a8);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none;
}
@keyframes craprBob {
  0%   { transform: translateY(-2px); }
  100% { transform: translateY(2px); }
}
.preview.craps .cr-die {
  width: 28px; height: 28px;
  border-radius: 5px;
  background: linear-gradient(160deg, #f5f0e2, #d8d1bf);
  box-shadow: inset 0 -2px 4px rgba(0,0,0,0.18), inset 0 1px 2px rgba(255,255,255,0.5), 0 3px 6px rgba(0,0,0,0.4);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  padding: 3px;
}
.preview.craps .cr-die .pip {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #1a0608;
  align-self: center; justify-self: center;
}
.preview.craps .cr-die .pip.a1 { grid-area: 1 / 1; }
.preview.craps .cr-die .pip.a3 { grid-area: 1 / 3; }
.preview.craps .cr-die .pip.b2 { grid-area: 2 / 2; }
.preview.craps .cr-die .pip.c1 { grid-area: 3 / 1; }
.preview.craps .cr-die .pip.c3 { grid-area: 3 / 3; }

@media (max-width: 720px) {
  .preview.craps .cr-dome { width: 96px; height: 74px; gap: 6px; }
  .preview.craps .cr-die { width: 22px; height: 22px; padding: 2px; }
  .preview.craps .cr-die .pip { width: 3px; height: 3px; }
}
```

- [ ] **Step 2: Add the new game card markup**

In the `<div class="games">` section, after the blackjack `<a class="game-card" href="blackjack.html">...</a>` block (and before its closing `</div>` of `.games`), insert:

```html
    <a class="game-card" href="craplesscraps.html">
      <div class="preview craps">
        <div class="cr-dome">
          <div class="cr-die">
            <span class="pip a1"></span>
            <span class="pip a3"></span>
            <span class="pip b2"></span>
            <span class="pip c1"></span>
            <span class="pip c3"></span>
          </div>
          <div class="cr-die">
            <span class="pip a1"></span>
            <span class="pip a3"></span>
            <span class="pip c1"></span>
            <span class="pip c3"></span>
          </div>
        </div>
      </div>
      <div class="game-title">CRAPLESS CRAPS</div>
      <div class="game-tagline">BUBBLE · NEVER LOSE THE COME-OUT</div>
      <div class="game-desc">Plaza-style bubble craps. Every number is a point. Pass, place, field, hardways, props, plus Fire Bet and All-Tall/Small bonus bets.</div>
      <div class="game-meta">
        <span class="meta-pill">CRAPLESS</span>
        <span class="meta-pill">BUBBLE</span>
        <span class="meta-pill hot">NEW</span>
      </div>
      <div class="play-cta">PLAY</div>
    </a>
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:8080/index.html`.

Expected:
- Lobby shows 4 game cards now: Slots, Kraken, Blackjack, Crapless Craps.
- The Craps card has a mini bubble dome with two ivory dice (5 and 4 pips) softly bobbing.
- Hovering the card lifts it.
- Clicking → loads `craplesscraps.html`.

- [ ] **Step 4: Save checkpoint**

---

## Task 17: Mobile polish + final test pass + dev-test cleanup

**Files:**
- Modify: `craplesscraps.html`

- [ ] **Step 1: Remove the dev test block**

In `craplesscraps.html`, find the comment block:
```html
<script>
/* DEV verification — verify resolver outputs. ...
```
Delete the entire `<script>...</script>` block that contains the `devTests()` function.

- [ ] **Step 2: Test mobile viewport**

Open `http://localhost:8080/craplesscraps.html` in DevTools, toggle device mode to 375×812 (iPhone X size).

Verify:
- Lobby and balance pills don't overlap; both visible.
- Dome shrinks but stays centered.
- Indicator row wraps or stays compact.
- Place strip wraps to 2 rows (5+5).
- Field/Hardways stack vertically (or stay side-by-side if there's room).
- PROPS drawer hop grid is scrollable / wraps; hop cells stay tappable.
- Chip rail sticks to bottom; chips stay tappable.

If any element overflows or overlaps, edit the corresponding `@media (max-width: 720px)` block. Common fixes:
- Reduce padding.
- Reduce `gap` between rows.
- Set `min-height` lower on bet zones.

- [ ] **Step 3: Run the full test pass from spec section 11**

For each scenario, perform the action in the browser and verify the result:

- [ ] Place $5 on Pass, roll until 7 on come-out → +$5, back to come-out.
- [ ] Place $5 on Pass, roll until point set → puck flips ON to that point.
- [ ] With point N set, place max odds (5× pass = $25) → roll point → win pass $5 + odds at true odds.
- [ ] Same scenario, roll 7 → -$5 pass -$25 odds, seven-out, puck flips OFF.
- [ ] Place $5 on each Place 2-12 zone (×9 = $45) → roll a 4 → +$9 on place 4 only.
- [ ] Field $5, roll 12 → +$10 (2:1).
- [ ] Hard 8 $5, roll 4-4 → +$45 (9:1).
- [ ] Hard 8 $5, roll 5-3 → -$5.
- [ ] On a fresh shooter, place $5 Fire Bet, roll until 4 unique points made and then 7-out → +$120 (24:1).
- [ ] On a fresh shooter, place $5 All Small, roll until 2/3/4/5/6 are all hit before any 7 → +$150 (30:1).
- [ ] Mobile 375×812: rotate to portrait/landscape, no horizontal overflow, all touch targets ≥ 36px.
- [ ] Click the settings gear: toggle music mute on/off; sliders should update SFX volume in real time (play a chip-place to verify).
- [ ] Reload the page mid-bet: balance restored from localStorage; bets reset (expected — bets are session-only).
- [ ] Switch back to the lobby (`← LOBBY`): the 4 cards including Crapless Craps are visible; balance is the same.

Note any failures and fix in the corresponding code section. After all green, save the file.

- [ ] **Step 4: Final visual polish pass**

Cosmetic checks (fix anything that grates):
- Gold gradient text consistent with other games.
- Bungee + Outfit + Geist Mono used consistently.
- No console errors at any point during play.
- Hover states feel snappy (no laggy transitions over 200ms on interactive elements).
- Win-flash and lose-fade keyframes return to default background cleanly (no leftover tint).

- [ ] **Step 5: Save checkpoint and announce done**

---

## Self-Review

After writing the plan above, I did a fresh pass.

**Spec coverage:**
- Rules (crapless craps) — Task 5 resolver + Task 9 shake/state-transition handling ✓
- Pass / Pass Odds — Task 6 (visual) + Task 5 (logic) + Task 9 (wiring) ✓
- Place 2-12 — Task 6 (visual) + Task 5 (logic) ✓
- Field — Task 6 + Task 5 ✓
- Hardways — Task 6 + Task 5 ✓
- Props (any 7, any craps, aces, boxcars, yo, ace-deuce, C&E, horn, world, hop) — Task 12 ✓
- Bonus (Fire, All Small, All Tall, Make-em-All) — Task 13 ✓
- Bubble dome visual — Task 2 ✓
- CSS 3D dice — Task 3, Task 4 ✓
- Puck flip + slide — Task 10 ✓
- Indicator row + fire dots — Task 11 ✓
- SFX hookups — Task 14 ✓
- ElevenLabs prompts append — Task 15 ✓
- Lobby card — Task 16 ✓
- Mobile — Task 17 ✓

**Placeholder scan:** No "TBD", no "implement later", no "similar to Task N" with code omitted. Every step has actual code.

**Type/name consistency:**
- `freshBets()` / `freshShooter()` defined in Task 5, used in Tasks 9, 11, 13 ✓
- `placeChip()` defined Task 8, fully replaced in Task 12 Step 4 (with delete instruction) ✓
- `rerenderAllStacks` extended in Task 12 and again in Task 13 — both use the `_orig...` capture pattern correctly ✓
- `updateIndicators` extended in Task 13 — captured via `_updateIndicatorsOrig`, no name conflicts ✓
- Selector strings: bonus zones use `.bonus-zone[data-bet="bonus:xxx"]`, fixed in Task 13 Step 4 ✓
- Bet key namespaces: `place:N`, `hard:N`, `hop:A-B`, `props:NAME`, `bonus:NAME` — consistent across resolver, getBetStake/setBetStake, placeChip, flashZone, and all renderers ✓

**Scope:** Single self-contained HTML file is a tight unit. Three changes outside it (`index.html`, `sfx/generate_sfx.py`, optional SFX file generation) are minimal. Plan stays focused.

No issues found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-crapless-bubble-craps.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best for this plan since each task produces a visually verifiable artifact.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch through with checkpoints.

Which approach?
