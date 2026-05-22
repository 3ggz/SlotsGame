/* ============================================================
   casino-level.js — Player leveling system
   ------------------------------------------------------------
   Bet-based XP. Players accrue XP for every wager (excluding
   bot entries). Level-ups grant chip rewards.
   See: docs/superpowers/specs/2026-05-22-leveling-system-design.md

   Public API (window.CasinoLevel):
     get()        -> { level, xp, xpInLevel, xpForNext, totalXp }
     onChange(fn) -> subscribe to state changes

   Underscore-prefixed members are test seams. Don't call from
   game code.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY      = 'casino.level.v1';
  const BALANCE_KEY      = 'casino.balance';
  const MAX_LEVEL        = 99;
  const REWARD_PER_LEVEL = 50;
  const CURVE_BASE       = 100;
  const CURVE_EXP        = 1.4;
  const DEFAULT_BALANCE  = 1000;

  function loadState() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { totalXp: 0 };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.totalXp !== 'number' || !isFinite(parsed.totalXp)) {
        return { totalXp: 0 };
      }
      return { totalXp: Math.max(0, Math.floor(parsed.totalXp)) };
    } catch (e) {
      return { totalXp: 0 };
    }
  }

  function saveState(state) {
    try {
      const safe = { totalXp: Math.max(0, Math.floor((state && state.totalXp) || 0)) };
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (e) {
      // Quota errors, private mode, etc. — keep in-memory state.
    }
  }

  function loadBalance() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(BALANCE_KEY);
      const n = parseFloat(raw);
      if (!isFinite(n) || n < 0) return DEFAULT_BALANCE;
      return n;
    } catch (e) { return DEFAULT_BALANCE; }
  }

  function persistBalance(v) {
    try {
      if (global.localStorage) global.localStorage.setItem(BALANCE_KEY, String(v));
    } catch (e) {}
  }

  function xpForLevel(n) {
    if (n < 1) return 0;
    if (n >= MAX_LEVEL) return 0;
    return Math.round(CURVE_BASE * Math.pow(n, CURVE_EXP));
  }

  function levelFromTotalXp(totalXp) {
    let lvl = 1;
    let remaining = Math.max(0, Math.floor(totalXp));
    while (lvl < MAX_LEVEL) {
      const need = xpForLevel(lvl);
      if (remaining < need) break;
      remaining -= need;
      lvl++;
    }
    return lvl;
  }

  function progressInLevel(totalXp) {
    const lvl = levelFromTotalXp(totalXp);
    let consumed = 0;
    for (let i = 1; i < lvl; i++) consumed += xpForLevel(i);
    const xpInLevel = Math.max(0, Math.floor(totalXp) - consumed);
    const xpForNext = lvl >= MAX_LEVEL ? 0 : xpForLevel(lvl);
    return { level: lvl, xpInLevel, xpForNext };
  }

  function rewardForLevelUp(newLevel) {
    if (newLevel < 2 || newLevel > MAX_LEVEL) return 0;
    return newLevel * REWARD_PER_LEVEL;
  }

  function totalRewardForJump(oldLevel, newLevel) {
    let sum = 0;
    for (let n = Math.max(2, oldLevel + 1); n <= newLevel; n++) {
      sum += rewardForLevelUp(n);
    }
    return sum;
  }

  const BOT_NOTE_RE = /^BOT\b/i;

  function cumulativeXpToReach(level) {
    let sum = 0;
    for (let n = 1; n < level; n++) sum += xpForLevel(n);
    return sum;
  }

  function applyEntry(entry, opts) {
    const creditBalance = !!(opts && opts.creditBalance);
    const note = entry && entry.note;
    if (note && BOT_NOTE_RE.test(String(note))) {
      const state = loadState();
      const p = progressInLevel(state.totalXp);
      return { xpGain: 0, oldLevel: p.level, newLevel: p.level, reward: 0, totalXp: state.totalXp };
    }
    const rawBet = entry ? Number(entry.bet) : 0;
    const gain = (!isFinite(rawBet) || rawBet <= 0) ? 0 : Math.floor(rawBet);

    const before = loadState();
    const oldLevel = levelFromTotalXp(before.totalXp);

    let nextTotal = before.totalXp + gain;
    const cap = cumulativeXpToReach(MAX_LEVEL);
    if (nextTotal > cap) nextTotal = cap;

    const newLevel = levelFromTotalXp(nextTotal);
    const reward = totalRewardForJump(oldLevel, newLevel);

    if (nextTotal !== before.totalXp) saveState({ totalXp: nextTotal });

    if (creditBalance && reward > 0) {
      persistBalance(loadBalance() + reward);
    }

    return { xpGain: nextTotal - before.totalXp, oldLevel, newLevel, reward, totalXp: nextTotal };
  }

  // ----- Change subscribers (browser only — also called in tests, but harmless) -----
  const changeListeners = [];
  function notifyChange() {
    const snap = api.get();
    for (const fn of changeListeners) {
      try { fn(snap); } catch (e) {}
    }
  }

  function onChange(fn) {
    if (typeof fn === 'function') changeListeners.push(fn);
  }

  const api = {
    get() {
      const state = loadState();
      const p = progressInLevel(state.totalXp);
      return {
        level: p.level,
        xp: state.totalXp,
        xpInLevel: p.xpInLevel,
        xpForNext: p.xpForNext,
        totalXp: state.totalXp,
      };
    },
    onChange: onChange,

    _applyEntry: applyEntry,
    _cumulativeXpToReach: cumulativeXpToReach,
    _loadState: loadState,
    _saveState: saveState,
    _xpForLevel: xpForLevel,
    _levelFromTotalXp: levelFromTotalXp,
    _progressInLevel: progressInLevel,
    _rewardForLevelUp: rewardForLevelUp,
    _totalRewardForJump: totalRewardForJump,
  };

  global.CasinoLevel = api;

  if (typeof document === 'undefined') return;

  const BAR_CSS = `
.casino-level-bar {
  position: fixed;
  /* Default position (games) — below the chip, top-right */
  top: 62px;
  right: 14px;
  z-index: 70;
  max-width: calc(100vw - 28px);
  display: flex; align-items: center; gap: 8px;
  padding: 4px 9px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(21,8,40,0.85), rgba(10,4,24,0.85));
  border: 1px solid rgba(184, 134, 11, 0.45);
  box-shadow: inset 0 1px 0 rgba(255,210,74,0.15), 0 4px 14px rgba(0,0,0,0.45);
  font-family: 'Bungee', 'Outfit', sans-serif;
  color: #fff0a8;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
  overflow: hidden;
  transition: width 320ms cubic-bezier(.2,.7,.2,1);
}

/* Lobby — positioned to the LEFT of the chip, vertically centered.
   Collapsed by default (just "LVL N"), tap to expand the bar leftward. */
body.cl-on-lobby .casino-level-bar {
  top: 20px;
  right: 62px;
  width: 64px;
  cursor: pointer;
}
body.cl-on-lobby .casino-level-bar.cl-expanded {
  width: 200px;
}

/* Games — always shown, compact (about balance-pill sized). */
body:not(.cl-on-lobby) .casino-level-bar {
  width: 130px;
  cursor: default;
}
body:not(.cl-on-lobby) .casino-level-bar .clb-track {
  height: 5px;
}

/* Mobile positioning */
@media (max-width: 720px) {
  body.cl-on-lobby .casino-level-bar {
    top: 11px;
    right: 50px;
    width: 56px;
  }
  body.cl-on-lobby .casino-level-bar.cl-expanded {
    width: 170px;
  }
  body:not(.cl-on-lobby) .casino-level-bar {
    top: 50px;
    right: 8px;
    width: 110px;
    padding: 3px 8px;
  }
}

.casino-level-bar .clb-lvl {
  font-weight: 700;
  color: #ffd24a;
  text-shadow: 0 1px 0 rgba(0,0,0,0.6);
  flex: 0 0 auto;
}
.casino-level-bar .clb-track {
  position: relative;
  flex: 1 1 0;
  height: 6px;
  min-width: 0;
  background: rgba(20, 8, 36, 0.9);
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.5);
}
.casino-level-bar .clb-fill {
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 0%;
  background: linear-gradient(90deg, #b8860b 0%, #ffd24a 60%, #fff0a8 100%);
  box-shadow: 0 0 6px rgba(255,210,74,0.5);
  transition: width 250ms ease-out;
}
.casino-level-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translate(-50%, -120%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-radius: 14px;
  background: linear-gradient(180deg, #2a1148, #150828);
  border: 1px solid rgba(255, 210, 74, 0.55);
  box-shadow: 0 18px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,210,74,0.2);
  font-family: 'Bungee', sans-serif;
  color: #fff0a8;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  opacity: 0;
  transition: transform 320ms cubic-bezier(.2,.7,.2,1), opacity 320ms ease;
  pointer-events: none;
}
.casino-level-toast.show {
  transform: translate(-50%, 0);
  opacity: 1;
}
.casino-level-toast .clt-emblem {
  font-size: 22px;
  color: #ffd24a;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
}
.casino-level-toast .clt-body {
  display: flex; flex-direction: column; gap: 2px;
}
.casino-level-toast .clt-head {
  font-size: 11px; color: #ffd24a;
}
.casino-level-toast .clt-detail {
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
  color: #fff0a8;
  letter-spacing: 0.04em;
  text-transform: none;
}
.casino-level-fireworks {
  position: fixed;
  z-index: 9998;
  pointer-events: none;
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
@media (prefers-reduced-motion: reduce) {
  .casino-level-fireworks .clf-particle {
    animation-duration: 0.01ms;
  }
}
`;

  function injectBarCss() {
    if (document.getElementById('casino-level-bar-css')) return;
    const s = document.createElement('style');
    s.id = 'casino-level-bar-css';
    s.textContent = BAR_CSS;
    document.head.appendChild(s);
  }

  let barEl = null;
  let barFillEl = null;
  let barLvlEl = null;

  function buildBar() {
    const wrap = document.createElement('div');
    wrap.className = 'casino-level-bar';
    wrap.innerHTML = `
      <span class="clb-lvl"></span>
      <div class="clb-track"><div class="clb-fill"></div></div>
    `;
    return wrap;
  }

  function renderBar() {
    if (!barEl) return;
    const s = api.get();
    barLvlEl.textContent = 'LVL ' + s.level;
    if (s.xpForNext <= 0) {
      barFillEl.style.width = '100%';
    } else {
      const pct = Math.max(0, Math.min(100, (s.xpInLevel / s.xpForNext) * 100));
      barFillEl.style.width = pct.toFixed(1) + '%';
    }
  }

  let lobbyExpandTimer = 0;
  function lobbyExpand() {
    if (!barEl) return;
    barEl.classList.add('cl-expanded');
    if (lobbyExpandTimer) clearTimeout(lobbyExpandTimer);
    lobbyExpandTimer = setTimeout(function () {
      if (barEl) barEl.classList.remove('cl-expanded');
      lobbyExpandTimer = 0;
    }, 3500);
  }

  function mountBar() {
    if (barEl) return;
    if (!document.body) return;
    injectBarCss();
    barEl = buildBar();
    barFillEl = barEl.querySelector('.clb-fill');
    barLvlEl  = barEl.querySelector('.clb-lvl');
    document.body.appendChild(barEl);
    if (document.body.classList.contains('cl-on-lobby')) {
      barEl.addEventListener('click', lobbyExpand);
    }
    renderBar();
  }

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  whenReady(function () {
    // The lobby has a centered `.balance-bar`; games never do.
    if (document.querySelector('.balance-bar')) {
      document.body.classList.add('cl-on-lobby');
    }
    mountBar();
  });
  onChange(renderBar);

  let toastEl = null;
  let toastHeadEl = null;
  let toastDetailEl = null;
  let toastTimer = 0;
  let toastChime = null;
  let pendingToast = null; // { newLevel, reward } accumulated while a toast is visible

  function ensureToast() {
    if (toastEl) return;
    injectBarCss(); // shares the same stylesheet as the bar
    toastEl = document.createElement('div');
    toastEl.className = 'casino-level-toast';
    toastEl.innerHTML = `
      <span class="clt-emblem">&#9670;</span>
      <div class="clt-body">
        <span class="clt-head">Level Up</span>
        <span class="clt-detail"></span>
      </div>
    `;
    document.body.appendChild(toastEl);
    toastHeadEl = toastEl.querySelector('.clt-head');
    toastDetailEl = toastEl.querySelector('.clt-detail');
    try {
      toastChime = new Audio('sfx/blackjack_fanfare.mp3');
      toastChime.preload = 'auto';
    } catch (e) { toastChime = null; }
  }

  function playChime() {
    if (!toastChime) return;
    try {
      const vol = (global.Settings && global.Settings.sfxVolume) ? global.Settings.sfxVolume() : 1;
      if (vol <= 0) return;
      toastChime.currentTime = 0;
      toastChime.volume = Math.min(1, vol);
      toastChime.play().catch(() => {});
    } catch (e) {}
  }

  function showToast(newLevel, reward) {
    ensureToast();
    // Coalesce: if a toast is already showing, accumulate.
    if (toastTimer && pendingToast) {
      pendingToast.newLevel = Math.max(pendingToast.newLevel, newLevel);
      pendingToast.reward += reward;
    } else {
      pendingToast = { newLevel, reward };
    }
    toastDetailEl.textContent = 'LVL ' + pendingToast.newLevel + '  ·  +$' + pendingToast.reward.toLocaleString();
    toastEl.classList.add('show');
    spawnFireworks();
    if (toastTimer) clearTimeout(toastTimer);
    playChime();
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
      toastTimer = 0;
      pendingToast = null;
    }, 3000);
  }

  const FIREWORK_COLORS = ['#ffd24a', '#ff2e93', '#22d3ee', '#a855f7', '#5cffa1'];

  function spawnFireworks() {
    if (!toastEl) return;
    const rect = toastEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom;
    const container = document.createElement('div');
    container.className = 'casino-level-fireworks';
    container.style.left = cx + 'px';
    container.style.top = cy + 'px';
    document.body.appendChild(container);
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('span');
      p.className = 'clf-particle';
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 60;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.85; // slightly squashed vertical spread
      p.style.setProperty('--dx', dx.toFixed(1) + 'px');
      p.style.setProperty('--dy', dy.toFixed(1) + 'px');
      p.style.color = FIREWORK_COLORS[i % FIREWORK_COLORS.length];
      p.style.animationDelay = (Math.random() * 80).toFixed(0) + 'ms';
      container.appendChild(p);
    }
    setTimeout(function () {
      if (container.parentNode) container.parentNode.removeChild(container);
    }, 1000);
  }

  document.addEventListener('level-up', function (ev) {
    const d = (ev && ev.detail) || {};
    if (typeof d.newLevel === 'number' && typeof d.reward === 'number') {
      showToast(d.newLevel, d.reward);
    }
  });

  global.addEventListener('storage', function (ev) {
    if (!ev) return;
    if (ev.key === STORAGE_KEY) {
      // Another tab updated the player's XP — re-render the bar
      // WITHOUT crediting balance again (that tab already did).
      renderBar();
      notifyChange();
    } else if (ev.key === BALANCE_KEY) {
      // Balance changed elsewhere — nothing to do for level UI,
      // but keep this branch for parity with other shared modules.
    }
  });

  // ----- History subscription (browser only) -----
  let lastSeenTs = 0;
  function ingestNewEntries() {
    if (!global.History || typeof global.History.getAll !== 'function') return;
    const all = global.History.getAll();
    const fresh = [];
    for (const e of all) {
      if (typeof e.ts === 'number' && e.ts > lastSeenTs) fresh.push(e);
    }
    if (!fresh.length) return;
    fresh.sort((a, b) => a.ts - b.ts);
    let mutated = false;
    for (const e of fresh) {
      const r = applyEntry(e, { creditBalance: true });
      lastSeenTs = e.ts;
      if (r.xpGain > 0 || r.reward > 0) mutated = true;
      if (r.reward > 0) {
        try {
          document.dispatchEvent(new CustomEvent('level-up', {
            detail: { oldLevel: r.oldLevel, newLevel: r.newLevel, reward: r.reward },
          }));
        } catch (e2) {}
      }
    }
    if (mutated) notifyChange();
  }

  function attachHistory() {
    if (!global.History || typeof global.History.onChange !== 'function') return false;
    // Seed lastSeenTs to "now" so we only react to NEW rounds, not the existing log.
    const all = global.History.getAll ? global.History.getAll() : [];
    for (const e of all) if (typeof e.ts === 'number' && e.ts > lastSeenTs) lastSeenTs = e.ts;
    global.History.onChange(ingestNewEntries);
    return true;
  }

  // Poll for History (matches the pattern in casino-jackpots.js).
  (function pollForHistory(attempt) {
    if (attachHistory()) return;
    if (attempt > 60) return; // ~3s max
    setTimeout(function () { pollForHistory(attempt + 1); }, 50);
  })(0);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
