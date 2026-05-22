# Level-up Fireworks & Fanfare — Design Spec

**Date:** 2026-05-22
**Scope:** Visual flourish on level-up. Touches only `casino-level.js`, `service-worker.js`, and AGENTS.md.
**Builds on:** `docs/superpowers/specs/2026-05-22-leveling-system-design.md`

## 1. Goals

Make the level-up moment feel like an actual celebration:

- **Better sound** — swap the muted `win_chime` for the existing `blackjack_fanfare.mp3` so the audio matches the visual energy.
- **Small firework burst** — ~10 colorful particles spray from the toast and fade, ~700 ms.

Constraint carried forward from the leveling spec: **not too intrusive**. No full-screen takeover, no sustained animation, no per-spin effects — only on level-up, only at the toast's location.

## 2. Sound

Replace the `Audio` source in `ensureToast()`:

```js
toastChime = new Audio('sfx/blackjack_fanfare.mp3');
```

Everything else stays the same — `Settings.sfxVolume()` gate, `play().catch(() => {})`, mute honor. The file already lives in `/sfx` per the existing library; no new asset shipped.

## 3. Firework Burst

### Visual

~10 small circular particles spawned at the bottom-center of the toast. Each particle:

- 6 px diameter, `border-radius: 50%`
- One of five neon colors picked at spawn: gold (`#ffd24a`), pink (`#ff2e93`), cyan (`#22d3ee`), violet (`#a855f7`), green (`#5cffa1`)
- Animated via a single CSS keyframe that translates outward in a random direction (the JS injects per-particle CSS custom properties `--dx` / `--dy` for the end position; range ~80–140 px each axis), scales from 1 → 0.4, fades from 1 → 0 opacity
- Duration 700 ms, easing `cubic-bezier(.1, .7, .2, 1)` — quick start, gentle landing
- Removed from the DOM after `animationend`

### Architecture

New helper in `casino-level.js`:

```
spawnFireworks() — called from showToast() after toastEl.classList.add('show')
```

The function:

1. Reads `toastEl.getBoundingClientRect()` to find the toast's bottom-center anchor.
2. Creates a positioned container (`<div class="casino-level-fireworks">`) appended to `document.body`, positioned at the toast's anchor.
3. Spawns 10 `<span class="clf-particle">` children with random `--dx`, `--dy`, color, and `animation-delay` (0–80 ms staggered).
4. Removes the container after 1 s (single `setTimeout` cleanup — animation is 700 ms + 80 ms max delay).

The container is throwaway per burst (not pooled). Cheap enough at this scale.

### CSS (appended to existing `BAR_CSS`)

```css
.casino-level-fireworks {
  position: fixed;
  z-index: 9998;
  pointer-events: none;
  /* top/left set inline by spawnFireworks() */
}
.casino-level-fireworks .clf-particle {
  position: absolute;
  top: 0; left: 0;
  width: 6px; height: 6px;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
  box-shadow: 0 0 6px currentColor;
  animation: clf-burst 700ms cubic-bezier(.1, .7, .2, 1) forwards;
}
@keyframes clf-burst {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.4); opacity: 0; }
}
```

`currentColor` lets us color particles via inline `color: <hex>` on each span — same value drives both the dot and its glow.

### Coalesce interaction

When multiple level-ups overlap (rare — multi-level jump from one bet, or back-to-back spins) and the toast coalesces, fireworks fire AGAIN for each `level-up` event. This is intentional — extra bursts read as extra celebration, even if the toast text is being mutated in place. Cheap, harmless.

## 4. Service Worker

Bump `CACHE_VERSION` from `'v80'` to `'v81'`. No new file precached (CSS is injected, `blackjack_fanfare.mp3` was already in `/sfx`).

## 5. Edge Cases

| Case | Behavior |
|---|---|
| Toast not yet mounted (`toastEl === null`) | `spawnFireworks` early-returns; no DOM. |
| Reduced-motion preference (`@media (prefers-reduced-motion: reduce)`) | Particles render with 0-duration animation (snap straight to faded state — effectively invisible). Toast still shows; SFX still plays. |
| Tab in background | `animationend` still fires on visibility return; `setTimeout` cleanup catches it regardless. No leak. |
| 100 level-ups in quick succession | Each burst is independent; ~100 transient DOM nodes peak. Cleaned up within ~1 s of each burst. Not pooled — if perf ever matters, we can pool later. |

## 6. Files Touched

**Modified:**
- `casino-level.js` — `ensureToast()` audio swap, `BAR_CSS` particle styles, new `spawnFireworks()` function, call site in `showToast()`.
- `service-worker.js` — `CACHE_VERSION` v80 → v81.
- `AGENTS.md` — one-sentence note in the `casino-level.js` section that level-ups also fire a small particle burst.

**No changes:** every HTML page, every test, every other shared module.

## 7. Testing

Pure unit tests stay at 29 PASS (no engine changes). Visual is verified by manual smoke:

1. Load the lobby, force a level-up (e.g., temporarily set `localStorage['casino.level.v1'] = JSON.stringify({totalXp: 99})` in DevTools, then spin $5).
2. Confirm:
   - Toast slides in with `LEVEL UP · LVL 2 · +$100`.
   - `blackjack_fanfare.mp3` plays (instead of the muted chime).
   - ~10 colored particles spray downward + outward from the toast, fading out within ~700 ms.
   - DOM panel under DevTools shows the `.casino-level-fireworks` container removed within ~1 s.
3. Mute SFX — confirm the burst still renders, but no audio plays.
4. Trigger a multi-level jump (set `totalXp` to 99, place a $1000 bet) — confirm a single burst fires (the toast coalesce path) or two bursts fire in immediate succession (depending on timing). Both are acceptable.
