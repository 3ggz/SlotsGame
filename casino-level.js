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

    saveState({ totalXp: nextTotal });

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
