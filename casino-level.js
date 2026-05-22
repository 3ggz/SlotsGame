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

  const api = {
    get() {
      const totalXp = 0;
      const p = progressInLevel(totalXp);
      return { level: p.level, xp: totalXp, xpInLevel: p.xpInLevel, xpForNext: p.xpForNext, totalXp };
    },
    onChange(_fn) { /* implemented in a later task */ },

    _xpForLevel: xpForLevel,
    _levelFromTotalXp: levelFromTotalXp,
    _progressInLevel: progressInLevel,
  };

  global.CasinoLevel = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
