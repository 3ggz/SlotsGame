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

  function _ls() {
    // Resolve localStorage: prefer global.localStorage (browser window),
    // fall back to free-variable lookup (VM sandbox where window !== globalThis).
    try { if (global.localStorage) return global.localStorage; } catch (e) {}
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) {}
    return null;
  }

  function loadState() {
    try {
      const ls = _ls();
      const raw = ls && ls.getItem(STORAGE_KEY);
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
      const ls = _ls();
      if (ls) ls.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (e) {
      // Quota errors, private mode, etc. — keep in-memory state.
    }
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

  const api = {
    get() {
      const totalXp = 0;
      const p = progressInLevel(totalXp);
      return { level: p.level, xp: totalXp, xpInLevel: p.xpInLevel, xpForNext: p.xpForNext, totalXp };
    },
    onChange(_fn) { /* implemented in a later task */ },

    _loadState: loadState,
    _saveState: saveState,
    _xpForLevel: xpForLevel,
    _levelFromTotalXp: levelFromTotalXp,
    _progressInLevel: progressInLevel,
    _rewardForLevelUp: rewardForLevelUp,
    _totalRewardForJump: totalRewardForJump,
  };

  global.CasinoLevel = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
