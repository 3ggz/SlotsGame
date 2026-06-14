/* ============================================================
   casino-bots.js — persistent bot players + native UI hooks
   ============================================================
   A small, rotating cast of "other players" inhabits the casino.

   Roster shape:
   - ~22 PERMANENT regulars with realistic-feeling names that
     come back over and over (and remember their balance).
   - GUESTS, procedurally generated, that pass through and don't
     stick around.

   Population manager (leader-tab only):
   - Tabs heartbeat which game they're on, so the engine knows
     where the real players are.
   - Each game has an idle floor and a "per real player" ramp.
     Quiet slot rooms keep 1 regular around. Roulette and rocket
     idle with 2 and ramp to 5–8 when a real player joins.
   - Bots have session lengths (8–40 min). When their session
     ends they log off; the manager spins up replacements.

   Chat:
   - Generative templates × per-bot 12-line memory → no repeats.
   - Win-context aware so nobody yells "pump it" in a dry room.
   - Reactive to player chat (intent-classified, probabilistic
     bot reply addressing the player by name).
   - Only roulette and rocket have a chat surface (casino-chat.js
     mounts on those pages only); other games get tempo 0 so the
     engine doesn't waste cycles generating lines no one sees.

   Wins:
   - Roulette: bot wins layer into the existing #recent-list.
   - Other games (slots, kraken, ..., rocket, plinko): a SMALL
     fixed-position banner at top-center showing the last few
     bot wins. Never disturbs the game's layout flow.

   Public API (window.CasinoBots):
     game / isLobby
     bots()
     recentWins(g, n?), recentChat(g, n?), presence()
     subscribeWins(g, fn), subscribeChat(g, fn), subscribePresence(fn)
     sendChat(g, text)
   ============================================================ */

(() => {
  'use strict';

  if (window.CasinoBots) return;

  // -----------------------------------------------------------
  // Owner-controlled global gate.
  //   /config/global { botsEnabled } is mirrored to localStorage
  //   by casino-account.js. We read it SYNCHRONOUSLY here so we
  //   never start the population manager / chat engine when bots
  //   are off. The lobby's owner-only toggle flips the flag;
  //   casino-account.js reloads the page when the live value
  //   diverges from the cached one used at boot.
  // -----------------------------------------------------------
  let botsEnabled = false;
  try { botsEnabled = localStorage.getItem('casino.config.botsEnabled') === 'true'; }
  catch (e) { botsEnabled = false; }

  if (!botsEnabled) {
    const noopUnsub = () => {};
    const callEmpty = fn => { try { fn([]); } catch (e) {} };
    const callPresence = fn => { try { fn({}); } catch (e) {} };
    const PAGE_LOWER = (location.pathname.toLowerCase().split('/').pop() || '').replace(/\.html?$/, '');
    const IS_LOBBY_STUB = PAGE_LOWER === '' || PAGE_LOWER === 'index' || PAGE_LOWER === 'launcher';
    // Note: `game` is null in disabled mode. casino-chat.js polls for
    // a truthy `CasinoBots.game` before mounting; keeping it null
    // suppresses the slide-up chat panel on roulette/rocket. The
    // pages' native Firestore-backed chats keep working — they go
    // through RocketLive / RouletteLive, not CasinoBots.
    window.CasinoBots = {
      disabled: true,
      game: null,
      isLobby: IS_LOBBY_STUB,
      bots: () => [],
      recentWins: () => [],
      recentChat: () => [],
      presence: () => ({}),
      subscribeWins: (g, fn) => { callEmpty(fn); return noopUnsub; },
      subscribeChat: (g, fn) => { callEmpty(fn); return noopUnsub; },
      subscribePresence: fn => { callPresence(fn); return noopUnsub; },
      rocketRoundState: () => null,
      sendChat: () => {},
      _debug: { roster: () => [], real: () => ({}), leader: () => false },
    };
    return;
  }

  // -----------------------------------------------------------
  // Per-game profile.
  //   bet/payout shape feeds the round simulation
  //   tempo / replyRate — chat behaviour (0 = silent)
  //   idle / perPlayer / max — population manager targets
  //   sessionMin / sessionMax — minutes a bot stays before
  //                             logging off naturally
  // -----------------------------------------------------------
  const GAME_CONFIG = {
    slots:              { name: 'Diamond Deluxe',       betPct: [0.005, 0.04], rounds: [3.5, 7],  hitRate: 0.28, payout: [1.2, 25],  bigMult: 5,  fav: 1.4, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 8,  sessionMax: 35 },
    kraken:             { name: "Kraken's Depths",      betPct: [0.005, 0.04], rounds: [3.8, 8],  hitRate: 0.26, payout: [1.5, 40],  bigMult: 5,  fav: 1.1, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 8,  sessionMax: 35 },
    dragontree:         { name: 'Dragon Tree',          betPct: [0.005, 0.04], rounds: [3.5, 7],  hitRate: 0.30, payout: [1.2, 22],  bigMult: 5,  fav: 1.0, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 8,  sessionMax: 35 },
    lucky7saloon:       { name: 'Lucky 7 Saloon',       betPct: [0.004, 0.03], rounds: [3, 6],    hitRate: 0.33, payout: [1.1, 35],  bigMult: 5,  fav: 1.0, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 8,  sessionMax: 35 },
    blackjack:          { name: 'Blackjack',            betPct: [0.01,  0.06], rounds: [5, 12],   hitRate: 0.46, payout: [1, 2.5],   bigMult: 2,  fav: 1.2, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 6, sessionMin: 10, sessionMax: 40 },
    multihandblackjack: { name: 'Multi-hand Blackjack', betPct: [0.01,  0.06], rounds: [5, 12],   hitRate: 0.46, payout: [1, 3],     bigMult: 2,  fav: 0.8, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 10, sessionMax: 40 },
    diamondpoker:       { name: 'Diamond Draw Poker',   betPct: [0.006, 0.045], rounds: [4, 9],    hitRate: 0.45, payout: [1, 50],    bigMult: 4,  fav: 1.0, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 1, max: 5, sessionMin: 8,  sessionMax: 35 },
    diamondwheel:       { name: 'Diamond Wheel',        betPct: [0.005, 0.05],  rounds: [4, 9],    hitRate: 0.44, payout: [1, 45],    bigMult: 5,  fav: 1.1, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 8,  sessionMax: 35 },
    roulette:           { name: 'Roulette',             betPct: [0.005, 0.08], rounds: [4, 9],    hitRate: 0.36, payout: [1, 35],    bigMult: 5,  fav: 1.4, tempo: 0.025, replyRate: 0.22, idle: 5, perPlayer: 4, max: 10, sessionMin: 12, sessionMax: 45 },
    rocket:             { name: 'Rocket',               betPct: [0.005, 0.05], rounds: [3, 7],    hitRate: 0.40, payout: [1.2, 18],  bigMult: 4,  fav: 1.4, tempo: 0.020, replyRate: 0.20, idle: 2, perPlayer: 3, max: 8, sessionMin: 10, sessionMax: 40 },
    plinko:             { name: 'Plinko',               betPct: [0.005, 0.04], rounds: [2, 5],    hitRate: 0.55, payout: [0.4, 24],  bigMult: 5,  fav: 0.9, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 1, max: 4, sessionMin: 6,  sessionMax: 25 },
    diamonddrop:        { name: 'Plinko 3D',            betPct: [0.005, 0.04], rounds: [2, 5],    hitRate: 0.52, payout: [0.2, 170], bigMult: 5,  fav: 1.1, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 1, max: 4, sessionMin: 6,  sessionMax: 25 },
    mines:              { name: 'Mines',                betPct: [0.005, 0.04], rounds: [3, 7],    hitRate: 0.52, payout: [1.1, 18],  bigMult: 5,  fav: 1.0, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 1, max: 4, sessionMin: 7,  sessionMax: 28 },
    easycraps:          { name: 'Easy Craps',           betPct: [0.01,  0.05], rounds: [5, 10],   hitRate: 0.48, payout: [1, 6],     bigMult: 3,  fav: 0.9, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 6, sessionMin: 10, sessionMax: 40 },
    craplesscraps:      { name: 'Crapless Craps',       betPct: [0.01,  0.05], rounds: [5, 10],   hitRate: 0.46, payout: [1, 9],     bigMult: 3,  fav: 0.7, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 10, sessionMax: 40 },
    standardcraps:      { name: 'Standard Craps',       betPct: [0.01,  0.05], rounds: [5, 10],   hitRate: 0.46, payout: [1, 9],     bigMult: 3,  fav: 0.7, tempo: 0,    replyRate: 0,    idle: 1, perPlayer: 2, max: 5, sessionMin: 10, sessionMax: 40 },
  };
  const GAME_KEYS = Object.keys(GAME_CONFIG);
  const CHAT_GAMES = new Set(['roulette', 'rocket']);

  const PAGE = (location.pathname.toLowerCase().split('/').pop() || '').replace(/\.html?$/, '');
  const IS_LOBBY = PAGE === '' || PAGE === 'index' || PAGE === 'launcher';
  const PAGE_GAME = !IS_LOBBY && GAME_CONFIG[PAGE] ? PAGE : null;

  // -----------------------------------------------------------
  // Helpers.
  // -----------------------------------------------------------
  const now      = () => Date.now();
  const rand     = (a, b) => a + Math.random() * (b - a);
  const randInt  = (a, b) => Math.floor(rand(a, b + 1));
  const choose   = arr => arr[Math.floor(Math.random() * arr.length)];
  const tabId    = Math.random().toString(36).slice(2) + '-' + now().toString(36);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function fmtMoney(v) {
    const n = Math.round(Number(v) || 0);
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e4) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + n.toLocaleString('en-US');
  }

  // -----------------------------------------------------------
  // Permanent regulars. These names should read as "people" not
  // bot themes — short, first-name-feeling, casual handles.
  // -----------------------------------------------------------
  const REGULAR_PERSONAS = [
    { name: 'Mike',     talkativeness: 5, lowercaseRate: 0.85, emojiRate: 0.08, verbosity: 0.25 },
    { name: 'sarahb',   talkativeness: 7, lowercaseRate: 0.55, emojiRate: 0.45, verbosity: 0.55 },
    { name: 'Diego.M',  talkativeness: 6, lowercaseRate: 0.25, emojiRate: 0.30, verbosity: 0.50 },
    { name: 'anna_k',   talkativeness: 4, lowercaseRate: 0.70, emojiRate: 0.20, verbosity: 0.30 },
    { name: 'Marcus',   talkativeness: 3, lowercaseRate: 0.10, emojiRate: 0.05, verbosity: 0.55 },
    { name: 'lena87',   talkativeness: 6, lowercaseRate: 0.80, emojiRate: 0.55, verbosity: 0.40 },
    { name: 'jordanp',  talkativeness: 5, lowercaseRate: 0.45, emojiRate: 0.15, verbosity: 0.45 },
    { name: 'kim.k',    talkativeness: 4, lowercaseRate: 0.65, emojiRate: 0.35, verbosity: 0.30 },
    { name: 'ravi88',   talkativeness: 2, lowercaseRate: 0.90, emojiRate: 0.00, verbosity: 0.15 },
    { name: 'samuel_p', talkativeness: 4, lowercaseRate: 0.50, emojiRate: 0.10, verbosity: 0.45 },
    { name: 'chloe.r',  talkativeness: 8, lowercaseRate: 0.40, emojiRate: 0.65, verbosity: 0.60 },
    { name: 'alex_g',   talkativeness: 4, lowercaseRate: 0.60, emojiRate: 0.15, verbosity: 0.30 },
    { name: 'pat.c',    talkativeness: 3, lowercaseRate: 0.80, emojiRate: 0.00, verbosity: 0.20 },
    { name: 'em.j',     talkativeness: 6, lowercaseRate: 0.70, emojiRate: 0.45, verbosity: 0.40 },
    { name: 'jay87',    talkativeness: 4, lowercaseRate: 0.55, emojiRate: 0.10, verbosity: 0.40 },
    { name: 'nikko',    talkativeness: 5, lowercaseRate: 0.55, emojiRate: 0.25, verbosity: 0.35 },
    { name: 'mariah',   talkativeness: 7, lowercaseRate: 0.30, emojiRate: 0.40, verbosity: 0.55 },
    { name: 'tom.h',    talkativeness: 3, lowercaseRate: 0.70, emojiRate: 0.10, verbosity: 0.30 },
    { name: 'liv7',     talkativeness: 5, lowercaseRate: 0.60, emojiRate: 0.30, verbosity: 0.40 },
    { name: 'mo.s',     talkativeness: 4, lowercaseRate: 0.50, emojiRate: 0.20, verbosity: 0.35 },
    { name: 'sully',    talkativeness: 2, lowercaseRate: 0.85, emojiRate: 0.00, verbosity: 0.15 },
    { name: 'reyes',    talkativeness: 6, lowercaseRate: 0.40, emojiRate: 0.20, verbosity: 0.50 },
  ];

  // Per-bot voice parameters. talkativeness 1-10 (drives the per-bot
  // cooldown); lowercaseRate 0-1 (probability of dropping caps);
  // emojiRate 0-1; verbosity 0-1 (filters line pool length).
  function defaultPersona() {
    return {
      talkativeness: randInt(3, 7),
      lowercaseRate: 0.4 + Math.random() * 0.4,
      emojiRate:     Math.random() * 0.35,
      verbosity:     0.2 + Math.random() * 0.5,
    };
  }

  // Guest names — themed, more obviously online handles
  const ADJ = ['Velvet','Neon','Diamond','Crimson','Midnight','Silver','Royal','Onyx',
               'Lucky','Wild','Quiet','Reckless','Vintage','Cosmic','Iron','Whiskey',
               'Phantom','Golden','Frosty','Atomic','Electric','Hollow','Stardust',
               'Bonus','Twin','Smoky','Rolling','Sunset','Marble','Plush'];
  const NOUN = ['Wolf','Spades','Phoenix','Jester','Vixen','Knight','Shark','Aces',
                'King','Joker','Hawk','Tiger','Comet','Vegas','Snake','Falcon',
                'Reaper','Bishop','Crown','Doll','Sphinx','Mirage','Whale','Stack',
                'Maverick','Saint','Magpie','Crow','Lantern','Suit'];
  const LOWER = ['highroller','aceshigh','splitsix','doubledown','hardway',
                 'pocketrocket','queenofcups','riverrat','tilt','allinaaron',
                 'smallblind','cardcounter','outsideven','straightup','runninghot',
                 'stonecold','flatbettor','snake_eyez','easygoldie','vienna',
                 'redorblack','colddeck','wired_kings','suitconnector','grinder',
                 'guest','newhere','firsttime','justbrowsing','dropby'];

  function makeGuestName() {
    const r = Math.random();
    if (r < 0.45) return choose(ADJ) + choose(NOUN) + (Math.random() < 0.55 ? String(randInt(2, 99)) : '');
    if (r < 0.80) return choose(LOWER) + (Math.random() < 0.5 ? '_' + randInt(2, 99) : '');
    return (choose(ADJ) + '_' + choose(NOUN)).toLowerCase() + (Math.random() < 0.5 ? randInt(7, 999) : '');
  }

  // Rocket cash-out personality. Each bot has a consistent style so
  // some chase the moon while others always cash out at 1.5×.
  // Weighted toward conservative/normal because that's how most real
  // players actually play crash games.
  function rollCashoutStyle() {
    const r = Math.random();
    if (r < 0.40) return 'conservative';  // 1.15–2.0×
    if (r < 0.75) return 'normal';        // 1.4–4.0×
    if (r < 0.92) return 'aggressive';    // 2.5–10×
    return 'random';                       // anything 1.05–10×
  }

  function makeBot(opts) {
    const startBal = Math.round(rand(1500, 5500));
    const persona = defaultPersona();
    return {
      id: opts.id,
      name: opts.name,
      hue: opts.hue != null ? opts.hue : randInt(0, 359),
      balance: startBal,
      seedBalance: startBal,
      game: null,
      nextActionAt: 0,
      streak: 0,
      hands: 0,
      lifetimeWin: 0,
      biggestWin: 0,
      brokeUntil: 0,
      memory: [],
      permanent: !!opts.permanent,
      online: false,
      nextLogoffAt: 0,
      loggedOutUntil: 0,
      lastChatAt: 0,
      talkativeness: opts.talkativeness != null ? opts.talkativeness : persona.talkativeness,
      lowercaseRate: opts.lowercaseRate != null ? opts.lowercaseRate : persona.lowercaseRate,
      emojiRate:     opts.emojiRate     != null ? opts.emojiRate     : persona.emojiRate,
      verbosity:     opts.verbosity     != null ? opts.verbosity     : persona.verbosity,
      cashoutStyle:  opts.cashoutStyle  || rollCashoutStyle(),
    };
  }

  // -----------------------------------------------------------
  // Persistence.
  // -----------------------------------------------------------
  const ROSTER_KEY        = 'casino.bots.v5.roster';
  const FEED_KEY          = 'casino.bots.v5.feed';
  const CHAT_KEY          = 'casino.bots.v5.chat';
  const TICK_KEY          = 'casino.bots.v5.tickAt';
  const LEADER_KEY        = 'casino.bots.v5.leader';
  const BUS_KEY           = 'casino.bots.v5.bus';
  const PRESENCE_PREFIX   = 'casino.bots.v5.presence.';
  const FEED_MAX          = 14;
  const CHAT_MAX          = 60;
  const MEMORY_MAX        = 12;
  const GUEST_HARD_CAP    = 40;   // never balloon the roster beyond this

  function loadKey(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function saveKey(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  // Seed the roster with regulars on first run. Existing rosters
  // keep growing through the population manager.
  let roster = loadKey(ROSTER_KEY, null);
  if (!Array.isArray(roster) || roster.length === 0) {
    roster = [];
    let id = 1;
    for (const p of REGULAR_PERSONAS) {
      roster.push(makeBot({ id: id++, name: p.name, permanent: true,
        talkativeness: p.talkativeness, lowercaseRate: p.lowercaseRate,
        emojiRate: p.emojiRate, verbosity: p.verbosity }));
    }
    saveKey(ROSTER_KEY, roster);
  }
  // Backfill missing fields if loaded from older versions.
  for (const b of roster) {
    if (!Array.isArray(b.memory)) b.memory = [];
    if (typeof b.permanent !== 'boolean') b.permanent = false;
    if (typeof b.online !== 'boolean') b.online = false;
    if (typeof b.nextLogoffAt !== 'number') b.nextLogoffAt = 0;
    if (typeof b.loggedOutUntil !== 'number') b.loggedOutUntil = 0;
    if (typeof b.lastChatAt !== 'number') b.lastChatAt = 0;
    if (typeof b.talkativeness !== 'number') b.talkativeness = randInt(3, 7);
    if (typeof b.lowercaseRate !== 'number') b.lowercaseRate = 0.4 + Math.random() * 0.4;
    if (typeof b.emojiRate !== 'number') b.emojiRate = Math.random() * 0.35;
    if (typeof b.verbosity !== 'number') b.verbosity = 0.2 + Math.random() * 0.5;
    if (typeof b.cashoutStyle !== 'string') b.cashoutStyle = rollCashoutStyle();
  }

  let feed = loadKey(FEED_KEY, {}) || {};
  let chat = loadKey(CHAT_KEY, {}) || {};
  for (const g of GAME_KEYS) {
    if (!Array.isArray(feed[g])) feed[g] = [];
    if (!Array.isArray(chat[g])) chat[g] = [];
  }
  const lastWinAt = {};
  for (const g of GAME_KEYS) { if (feed[g].length) lastWinAt[g] = feed[g][0].t || 0; }

  // -----------------------------------------------------------
  // Leader election.
  // -----------------------------------------------------------
  const LEADER_TTL = 4000;
  let leader = false;
  function refreshLeadership() {
    const cur = loadKey(LEADER_KEY, null);
    const t = now();
    if (!cur || !cur.id || t - (cur.at || 0) > LEADER_TTL || cur.id === tabId) {
      saveKey(LEADER_KEY, { id: tabId, at: t });
      leader = true;
    } else { leader = false; }
  }
  refreshLeadership();
  setInterval(refreshLeadership, 1500);
  window.addEventListener('pagehide', () => {
    const cur = loadKey(LEADER_KEY, null);
    if (cur && cur.id === tabId) { try { localStorage.removeItem(LEADER_KEY); } catch (e) {} }
    try { localStorage.removeItem(PRESENCE_PREFIX + tabId); } catch (e) {}
  });

  // -----------------------------------------------------------
  // Real-player presence: every tab heartbeats which game it
  // is on. Leader scans all matching keys to count real players
  // per game, ignoring entries older than 8 s.
  // -----------------------------------------------------------
  function presenceTag() { return PAGE_GAME || (IS_LOBBY ? 'lobby' : null); }
  function heartbeat() {
    try { localStorage.setItem(PRESENCE_PREFIX + tabId, JSON.stringify({ game: presenceTag(), at: now() })); } catch (e) {}
  }
  heartbeat();
  setInterval(heartbeat, 3000);

  function realPlayersByGame() {
    const out = {};
    for (const g of GAME_KEYS) out[g] = 0;
    const t = now();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(PRESENCE_PREFIX) !== 0) continue;
        let data; try { data = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
        if (!data || t - (data.at || 0) > 8000) {
          if (leader) { try { localStorage.removeItem(k); } catch (e) {} }
          continue;
        }
        if (data.game && out[data.game] != null) out[data.game] += 1;
      }
    } catch (e) {}
    return out;
  }

  // -----------------------------------------------------------
  // Event bus.
  // -----------------------------------------------------------
  const winsSubs     = new Map();
  const chatSubs     = new Map();
  const presenceSubs = new Set();

  function getSet(map, key) { let s = map.get(key); if (!s) { s = new Set(); map.set(key, s); } return s; }
  function emitWins(g)     { for (const fn of getSet(winsSubs, g)) try { fn(feed[g].slice()); } catch (e) {} }
  function emitChat(g)     { for (const fn of getSet(chatSubs, g)) try { fn(chat[g].slice()); } catch (e) {} }
  function emitPresence()  { const p = computePresence(); for (const fn of presenceSubs) try { fn(p); } catch (e) {} }

  function broadcast(kind, payload) {
    saveKey(BUS_KEY, { kind, payload, at: now(), from: tabId, n: Math.random() });
  }

  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === FEED_KEY) {
      const next = loadKey(FEED_KEY, {}) || {};
      for (const g of GAME_KEYS) feed[g] = Array.isArray(next[g]) ? next[g] : [];
    } else if (e.key === CHAT_KEY) {
      const next = loadKey(CHAT_KEY, {}) || {};
      for (const g of GAME_KEYS) chat[g] = Array.isArray(next[g]) ? next[g] : [];
    } else if (e.key === ROSTER_KEY) {
      const next = loadKey(ROSTER_KEY, null);
      if (Array.isArray(next)) roster = next;
    } else if (e.key === BUS_KEY) {
      const msg = (() => { try { return JSON.parse(e.newValue || 'null'); } catch (_) { return null; } })();
      if (!msg) return;
      if (msg.kind === 'wins' && msg.payload) emitWins(msg.payload);
      else if (msg.kind === 'chat' && msg.payload) emitChat(msg.payload);
      else if (msg.kind === 'presence') emitPresence();
      else if (msg.kind === 'player-chat' && leader && msg.payload) scheduleReplyToPlayer(msg.payload);
    }
  });

  function computePresence() {
    const out = {};
    for (const g of GAME_KEYS) out[g] = 0;
    for (const b of roster) {
      if (!b.online) continue;
      if (b.game && out[b.game] != null && (b.brokeUntil || 0) < now()) out[b.game] += 1;
    }
    return out;
  }

  // -----------------------------------------------------------
  // Chat lines.
  //
  // Curated to read like real chat from someone half-paying-attention
  // to a gambling site: short, plain, varied, sometimes off-topic.
  // No "PRINTING" / "RENT IS PAID" / "LFG" energy on autoplay.
  // -----------------------------------------------------------
  const LINES = {
    // Idle is intentionally thin and dull. Real chat rooms are mostly
    // silent and people don't explain their presence. No storytelling,
    // no "kid woke up brb", no "streamer sent me", no self-introductions,
    // no questions to no one. Just brief filler that could plausibly
    // come from someone half-watching.
    idle: [
      'mhm', 'lol', 'hmm', '...', 'meh',
      'oof', 'damn', 'tough',
      'gn', 'gm', 'gl',
      'one more', 'last one',
      'down a bit', 'up a bit', 'even',
      'cold', 'hot one', 'rough',
    ],

    // Reactions to a notable event (someone hit big).
    react_big: [
      'oh', 'oh shit', 'wow', 'whoa', 'damn',
      'nice', 'huge', 'wp', 'gg', 'lucky',
      'sheesh', 'jesus', 'holy',
      'lmao', 'lol', 'wtf', 'how',
      '!!', 'jealous',
      '🔥', '👀', '🤯',
    ],

    // Replies addressed to the player. {p} = player name.
    reply_greet: [
      'hi', 'hey', 'yo', 'sup', 'wb',
      'hey {p}', 'hi {p}', 'yo {p}', 'gl',
    ],
    reply_hype: [
      'nice', 'gg', 'wp', 'huge', 'lucky',
      'nice {p}', 'okay {p}',
      'jealous', 'how', 'sheesh',
    ],
    reply_complain: [
      'same', 'rip', 'ouch',
      'been there', 'tough one',
    ],
    reply_question: [
      'idk', 'no clue', 'maybe', 'depends',
    ],
    reply_generic: [
      'ya', 'true', 'word',
      'mhm', 'fair', 'lol', 'sure',
    ],
  };

  const TRAILING_EMOJI = ['🔥','👀','💸','😎','🍀','✨','😅','🫠','🙃','👌','😳','🤯'];

  // Apply a bot's personality to a raw line: lowercase rate, optional
  // emoji, occasional ellipsis. Returns the styled string.
  function styleLine(bot, raw) {
    if (raw == null) return null;
    let out = String(raw);
    if (Math.random() < (bot.lowercaseRate || 0)) out = out.toLowerCase();
    if (Math.random() < (bot.emojiRate || 0) &&
        !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(out)) {
      out += ' ' + choose(TRAILING_EMOJI);
    }
    return out;
  }

  // Pick a fresh line from the bank, biased by verbosity, deduped
  // against bot.memory. {p} substitution happens here.
  function pickLine(bot, kind, ctx) {
    let pool = LINES[kind] || LINES.idle;
    const v = (bot.verbosity == null) ? 0.4 : bot.verbosity;
    if (v < 0.30)      pool = pool.filter(l => l.length <= 12) ;
    else if (v > 0.70) pool = pool.filter(l => l.length >= 5)  ;
    if (!pool.length) pool = LINES[kind] || LINES.idle;
    for (let i = 0; i < 6; i++) {
      let raw = String(choose(pool));
      raw = raw.replace('{p}', ctx.playerName || 'friend');
      if (bot.memory.indexOf(raw) !== -1) continue;
      const styled = styleLine(bot, raw);
      if (!styled) continue;
      return { raw, styled };
    }
    return null;
  }
  function rememberLine(bot, raw) {
    if (!raw) return;
    bot.memory.push(raw);
    if (bot.memory.length > MEMORY_MAX) bot.memory.splice(0, bot.memory.length - MEMORY_MAX);
  }

  // Cooldowns. A real chat room doesn't blast a message every second.
  // The room enforces a global minimum between messages, and each bot
  // has a personal cooldown driven by their talkativeness.
  const ROOM_COOLDOWN_MS = 14000;
  const lastChatRoomAt = {};
  function botCooldownMs(bot) {
    const tlk = Math.max(1, Math.min(10, Number(bot.talkativeness) || 5));
    return 30000 + (10 - tlk) * 10000;  // 30s @ tlk=10  …  120s @ tlk=1
  }
  function chatCooledDown(bot, t) {
    if (t - (lastChatRoomAt[bot.game] || 0) < ROOM_COOLDOWN_MS) return false;
    if (t - (bot.lastChatAt || 0) < botCooldownMs(bot)) return false;
    return true;
  }

  // -----------------------------------------------------------
  // The world tick.
  // -----------------------------------------------------------
  function pushWin(game, entry) {
    feed[game].unshift(entry);
    if (feed[game].length > FEED_MAX) feed[game].length = FEED_MAX;
    lastWinAt[game] = entry.t || now();
    saveKey(FEED_KEY, feed);
    emitWins(game);
    broadcast('wins', game);
  }
  function pushChat(game, entry) {
    chat[game].push(entry);
    if (chat[game].length > CHAT_MAX) chat[game].splice(0, chat[game].length - CHAT_MAX);
    saveKey(CHAT_KEY, chat);
    emitChat(game);
    broadcast('chat', game);
  }

  function topUpIfBroke(bot, t) {
    const cfg = GAME_CONFIG[bot.game];
    if (!cfg) return false;
    const minBet = Math.max(1, Math.round(bot.seedBalance * cfg.betPct[0]));
    if (bot.balance >= minBet) return false;
    if (bot.brokeUntil && bot.brokeUntil > t) return true;
    if (!bot.brokeUntil) { bot.brokeUntil = t + randInt(30000, 120000); return true; }
    const fresh = Math.round(rand(1500, 4500));
    bot.balance = fresh; bot.seedBalance = fresh; bot.brokeUntil = 0;
    return false;
  }

  function maybeChat(bot, t, ctx) {
    const cfg = GAME_CONFIG[bot.game];
    if (!cfg || cfg.tempo <= 0) return;
    if (Math.random() > cfg.tempo) return;
    if (!chatCooledDown(bot, t)) return;
    const kind = ctx.kind || 'idle';
    const picked = pickLine(bot, kind, { game: bot.game });
    if (!picked) return;
    rememberLine(bot, picked.raw);
    bot.lastChatAt = t;
    lastChatRoomAt[bot.game] = t;
    pushChat(bot.game, { name: bot.name, hue: bot.hue, text: picked.styled, t, bot: true });
  }

  // Feed a bot round through the same History.record pipeline real
  // player rounds use, so "LIVE FROM THE FLOOR" stats and the global
  // jackpot pools both grow from bot activity. The 'BOT' note tells
  // casino-account.js to skip the per-user write and casino-jackpots.js
  // to skip the trigger roll — the player should never be awarded a
  // jackpot prize from a bet they didn't make. Skipped during fast-
  // forward catch-up so reopening the tab doesn't dump a burst of
  // back-dated writes onto Firestore.
  function recordBotBet(game, bet, net) {
    if (fastForwarding) return;
    if (!(bet > 0)) return;
    if (!window.History || typeof window.History.record !== 'function') return;
    try { window.History.record(game, bet, net, 'BOT'); } catch (e) {}
  }

  function botRound(bot, t) {
    const cfg = GAME_CONFIG[bot.game];
    if (!cfg) return;
    if (topUpIfBroke(bot, t)) return;

    const betFraction = rand(cfg.betPct[0], cfg.betPct[1]);
    let bet = Math.max(1, Math.round(bot.seedBalance * betFraction));
    bet = Math.min(bet, Math.max(1, Math.round(bot.balance * 0.5)));
    if (bet < 1) return;
    bot.balance -= bet;
    bot.hands += 1;

    const hit = Math.random() < cfg.hitRate;
    let net = -bet;
    if (hit) {
      const u = Math.random();
      const skew = Math.pow(u, 2.4);
      const mult = cfg.payout[0] + skew * (cfg.payout[1] - cfg.payout[0]);
      const win = Math.max(1, Math.round(bet * mult));
      bot.balance += win;
      bot.lifetimeWin += win - bet;
      bot.streak = Math.max(0, bot.streak) + 1;
      net = win - bet;

      const isBig = win >= bet * cfg.bigMult;
      if (win > bot.biggestWin) bot.biggestWin = win;

      // The wins feed only carries genuine big hits.
      if (isBig) {
        pushWin(bot.game, { name: bot.name, hue: bot.hue, bet, win, big: true, t });
        // Bots don't yell about their own wins. Instead, schedule
        // a couple of OTHER bots in the room to react — that reads
        // like a real table reacting to someone hitting big.
        scheduleReactionsToBigWin(bot.game, bot.name, false);
      }
    } else {
      bot.streak = Math.min(0, bot.streak) - 1;
      if (bot.streak <= -4 && Math.random() < 0.25) maybeChat(bot, t, { kind: 'bust' });
    }

    recordBotBet(bot.game, bet, net);
  }

  function stepBot(bot, t) {
    if (!bot.online || !bot.game) return;
    if (topUpIfBroke(bot, t)) { bot.nextActionAt = t + randInt(8000, 18000); return; }
    const cfg = GAME_CONFIG[bot.game];
    const r = Math.random();
    if (r < 0.85) {
      // Rocket bots don't run the abstract round sim — their visible
      // activity comes from the per-round cashout integrator on the
      // rocket page. Otherwise reactions could fire to wins nobody
      // actually saw (e.g. "clean" in chat after a 1.05× crash).
      if (bot.game !== 'rocket' && bot.game !== 'roulette') botRound(bot, t);
      const [lo, hi] = cfg.rounds;
      bot.nextActionAt = t + Math.round(rand(lo, hi) * 1000);
    } else if (r < 0.95) {
      maybeChat(bot, t, { kind: 'idle' });
      bot.nextActionAt = t + randInt(3000, 12000);
    } else {
      // small chance to drift games (within chat-room games for the chatty
      // ones, anywhere for slot grinders)
      const pool = (bot.game === 'roulette' || bot.game === 'rocket')
        ? ['roulette', 'rocket', bot.game]
        : GAME_KEYS;
      const g = choose(pool);
      if (g !== bot.game) bot.game = g;
      bot.nextActionAt = t + randInt(4000, 15000);
    }
  }

  // -----------------------------------------------------------
  // Population manager — runs on leader.
  // -----------------------------------------------------------
  function nextId() {
    let m = 0; for (const b of roster) if (b.id > m) m = b.id;
    return m + 1;
  }
  function offlinePool(prefPermanent) {
    const t = now();
    const offline = roster.filter(b => !b.online && (b.loggedOutUntil || 0) < t);
    if (prefPermanent) {
      const perms = offline.filter(b => b.permanent);
      if (perms.length) return perms;
    }
    return offline;
  }

  function loginOne(game, t) {
    const cfg = GAME_CONFIG[game];
    // 70% prefer a permanent regular when one is available
    let candidates = offlinePool(Math.random() < 0.70);
    let bot = candidates.length ? choose(candidates) : null;
    if (!bot) {
      // Make a new guest if we're under the hard cap
      if (roster.length >= GUEST_HARD_CAP) return null;
      bot = makeBot({ id: nextId(), name: makeGuestName(), permanent: false });
      roster.push(bot);
    }
    bot.online = true;
    bot.game = game;
    bot.nextActionAt = t + randInt(1500, 8000);
    bot.nextLogoffAt = t + randInt(cfg.sessionMin * 60000, cfg.sessionMax * 60000);
    return bot;
  }

  function logoffOne(game, t) {
    // pick a bot in that game with the soonest nextLogoffAt (least committed)
    const inGame = roster.filter(b => b.online && b.game === game);
    if (!inGame.length) return null;
    inGame.sort((a, b) => (a.nextLogoffAt || 0) - (b.nextLogoffAt || 0));
    const bot = inGame[0];
    bot.online = false;
    bot.game = null;
    // permanent regulars come back sooner than passing guests
    const cooldown = bot.permanent
      ? randInt(2 * 60000, 30 * 60000)
      : randInt(20 * 60000, 4 * 60 * 60000);
    bot.loggedOutUntil = t + cooldown;
    return bot;
  }

  let populationLastRunAt = 0;
  let populationEverRan  = false;
  function runPopulationManager(t, force) {
    if (!leader) return;
    if (!force && t - populationLastRunAt < 4000) return;
    populationLastRunAt = t;

    // Natural log-off pass — any bot past their session limit
    for (const b of roster) {
      if (b.online && b.nextLogoffAt && b.nextLogoffAt < t) {
        b.online = false; b.game = null;
        b.loggedOutUntil = t + (b.permanent ? randInt(2 * 60000, 30 * 60000)
                                            : randInt(20 * 60000, 4 * 60 * 60000));
      }
    }

    const real = realPlayersByGame();
    for (const game of GAME_KEYS) {
      const cfg = GAME_CONFIG[game];
      const realHere = real[game] || 0;
      const target = Math.min(cfg.max, cfg.idle + Math.min(realHere, 4) * cfg.perPlayer);
      const onlineHere = roster.filter(b => b.online && b.game === game).length;
      if (onlineHere < target) {
        const need = target - onlineHere;
        // First population run seeds every room to its full target
        // immediately so a fresh tab never opens to an empty casino.
        // Subsequent runs ramp gently at 1/cycle so changes feel organic.
        const max = populationEverRan ? 1 : need;
        for (let i = 0; i < Math.min(need, max); i++) loginOne(game, t);
      } else if (onlineHere > Math.ceil(target * 1.4)) {
        logoffOne(game, t);
      }
    }
    populationEverRan = true;
    // Prune very-old offline guests so the roster doesn't grow forever
    const oneDay = 24 * 60 * 60 * 1000;
    roster = roster.filter(b => b.permanent || b.online || (b.loggedOutUntil && t - b.loggedOutUntil < oneDay));
  }

  // -----------------------------------------------------------
  // Tick loop.
  // -----------------------------------------------------------
  let tickAt = loadKey(TICK_KEY, now()) || now();
  const scheduledReplies = [];
  const MAX_SCHEDULED_REPLIES = 36;

  function pushScheduledReply(reply) {
    scheduledReplies.push(reply);
    if (scheduledReplies.length > MAX_SCHEDULED_REPLIES) {
      scheduledReplies.sort((a, b) => (a.at || 0) - (b.at || 0));
      scheduledReplies.splice(0, scheduledReplies.length - MAX_SCHEDULED_REPLIES);
    }
  }

  function tickOnce(t) {
    let touched = false;
    runPopulationManager(t, false);
    for (const bot of roster) {
      if (!bot.online) continue;
      let safety = 0;
      while (bot.nextActionAt <= t && safety++ < 6) {
        stepBot(bot, bot.nextActionAt);
        touched = true;
      }
    }
    flushScheduledReplies(t);
    if (touched) {
      saveKey(ROSTER_KEY, roster);
      emitPresence();
      broadcast('presence');
    }
    tickAt = t;
    saveKey(TICK_KEY, tickAt);
  }

  // Tracks whether tickOnce is being driven by a fast-forward catch-up
  // burst vs a live tick. recordBotBet uses this to suppress Firestore
  // writes during the burst (we don't want one tab reload to dump
  // hundreds of back-dated bets onto the global stats).
  let fastForwarding = false;

  function fastForward() {
    const t = now();
    const gap = t - tickAt;
    if (gap < 2000) return;
    const slice = Math.min(gap, 5 * 60 * 1000);
    let cursor = t - slice;
    tickAt = cursor;
    runPopulationManager(cursor, true);
    fastForwarding = true;
    try {
      while (cursor < t) {
        cursor = Math.min(t, cursor + 1000);
        tickOnce(cursor);
      }
    } finally {
      fastForwarding = false;
    }
  }

  setInterval(() => { if (leader) tickOnce(now()); }, 1000);
  fastForward();
  // Ensure the casino is populated to its idle floor immediately on
  // boot — otherwise the first rocket round could plan zero cashouts.
  if (leader) runPopulationManager(now(), true);
  saveKey(ROSTER_KEY, roster);
  emitPresence();

  // -----------------------------------------------------------
  // Player chat reactivity.
  // -----------------------------------------------------------
  function classifyPlayerIntent(text) {
    const s = String(text || '').toLowerCase();
    if (/^(hi|hey|yo|sup|hello|wassup|gm|gn)\b/.test(s) || /^(hello|hey|hi)$/.test(s.trim())) return 'greet';
    if (/(lfg|let'?s go|won|winning|big win|jackpot|hit|🔥|🤑|💸|cooking|printing)/.test(s)) return 'hype';
    if (/(rigged|cold|can'?t catch|cant catch|lost|losing|tilt|broke|bad luck|hate this|f my|brutal)/.test(s)) return 'complain';
    if (/\?$/.test(s.trim()) || /^(anyone|who|what|how|why|when|where)\b/.test(s)) return 'question';
    return 'generic';
  }
  function scheduleReplyToPlayer({ game, text, playerName }) {
    if (!leader) return;
    const cfg = GAME_CONFIG[game];
    if (!cfg || cfg.replyRate <= 0) return;
    if (Math.random() > cfg.replyRate) return;
    const inRoom = roster.filter(b => b.online && b.game === game && (b.brokeUntil || 0) < now());
    if (!inRoom.length) return;
    const bot = choose(inRoom);
    const intent = classifyPlayerIntent(text);
    pushScheduledReply({ at: now() + randInt(2500, 9000), game, botId: bot.id, kind: 'reply_' + intent, playerName });
  }

  // Coordinated reactions to a big win in a room.
  //   50% — nobody bothers reacting (a real table is mostly quiet)
  //   35% — one bot reacts
  //   15% — two bots react
  // The winner never reacts to themselves. Reactions still respect
  // per-bot and per-room cooldowns at flush time.
  function scheduleReactionsToBigWin(game, winnerName, isPlayer) {
    if (!leader) return;
    const cfg = GAME_CONFIG[game];
    if (!cfg || cfg.tempo <= 0) return;
    const roll = Math.random();
    if (roll < 0.50) return;
    const count = roll < 0.85 ? 1 : 2;
    const inRoom = roster.filter(b =>
      b.online && b.game === game &&
      (b.brokeUntil || 0) < now() &&
      b.name !== winnerName
    );
    if (!inRoom.length) return;
    const picks = new Set();
    for (let i = 0; i < Math.min(count, inRoom.length); i++) {
      let bot, tries = 0;
      do { bot = choose(inRoom); tries++; } while (picks.has(bot.id) && tries < 6);
      if (picks.has(bot.id)) break;
      picks.add(bot.id);
      pushScheduledReply({
        at: now() + randInt(2500, 9000),
        game, botId: bot.id, kind: 'react_big',
        playerName: winnerName,
      });
    }
  }
  function flushScheduledReplies(t) {
    if (!scheduledReplies.length) return;
    for (let i = scheduledReplies.length - 1; i >= 0; i--) {
      const r = scheduledReplies[i];
      if (r.at > t) continue;
      scheduledReplies.splice(i, 1);
      const bot = roster.find(b => b.id === r.botId);
      if (!bot || !bot.online || bot.game !== r.game) continue;
      // Reactions and replies still honour cooldowns. If a bot just
      // chatted, they shut up for their cooldown window.
      if (!chatCooledDown(bot, t)) continue;
      const picked = pickLine(bot, r.kind, { game: r.game, playerName: r.playerName || 'friend' });
      if (!picked) continue;
      rememberLine(bot, picked.raw);
      bot.lastChatAt = t;
      lastChatRoomAt[r.game] = t;
      pushChat(r.game, { name: bot.name, hue: bot.hue, text: picked.styled, t, bot: true });
    }
  }

  // -----------------------------------------------------------
  // Player-win hook. casino-audio.js exposes History.onChange(fn)
  // which fires after every record(); we use that instead of
  // wrapping History.record directly, so we're independent of
  // wrap-order with casino-jackpots.js. We dedup by timestamp so
  // a single record() doesn't double-push.
  //
  // Bot bets go through this hook too (their History.record('BOT')
  // call also fires onChange), so we skip BOT-noted entries —
  // botRound already pushes to the feed directly with the bot's
  // own name.
  // -----------------------------------------------------------
  let historyHooked = false;
  let lastSeenHistoryTs = 0;
  function tryHookHistory() {
    if (historyHooked) return;
    if (!window.History || typeof window.History.onChange !== 'function' ||
        typeof window.History.getSession !== 'function') return;
    historyHooked = true;
    // Seed the cursor from existing session entries so we don't
    // re-process anything that happened before the page loaded.
    try {
      const seed = window.History.getSession();
      for (const e of seed) if (e && e.ts > lastSeenHistoryTs) lastSeenHistoryTs = e.ts;
    } catch (e) {}
    window.History.onChange(() => {
      try {
        const session = window.History.getSession();
        for (const e of session) {
          if (!e || !e.ts || e.ts <= lastSeenHistoryTs) continue;
          lastSeenHistoryTs = e.ts;
          if (e.localOnly) continue;
          if (e.note && /^BOT\b/i.test(String(e.note))) continue;
          const g = String(e.game || '');
          const cfg = GAME_CONFIG[g];
          const betN = Number(e.bet) || 0;
          const netN = Number(e.win) || 0;
          if (!cfg || netN <= 0 || betN <= 0) continue;
          const grossWin = betN + netN;
          const ratio = grossWin / betN;
          if (ratio < cfg.bigMult) continue;
          const name = getPlayerName();
          pushWin(g, {
            name, hue: 200, bet: betN, win: grossWin, big: true,
            t: e.ts || now(), isPlayer: true,
          });
          scheduleReactionsToBigWin(g, name, true);
        }
      } catch (err) {}
    });
  }
  tryHookHistory();
  if (!historyHooked) {
    const hookIv = setInterval(() => { tryHookHistory(); if (historyHooked) clearInterval(hookIv); }, 200);
  }

  // -----------------------------------------------------------
  // Public API.
  // -----------------------------------------------------------
  function subscribe(map, key, fn) {
    const s = getSet(map, key); s.add(fn);
    try {
      const data = map === winsSubs ? (feed[key] || []).slice() : (chat[key] || []).slice();
      fn(data);
    } catch (e) {}
    return () => s.delete(fn);
  }
  function getPlayerName() {
    try {
      if (window.CasinoAccount && typeof window.CasinoAccount.user === 'function') {
        const u = window.CasinoAccount.user();
        if (u && (u.displayName || u.email)) {
          return String(u.displayName || u.email.split('@')[0]).slice(0, 24);
        }
      }
    } catch (e) {}
    return 'You';
  }

  window.CasinoBots = {
    game: PAGE_GAME,
    isLobby: IS_LOBBY,
    bots: () => roster.slice(),
    recentWins: (g, n) => (feed[g] || []).slice(0, n || FEED_MAX),
    recentChat: (g, n) => (chat[g] || []).slice(-(n || CHAT_MAX)),
    presence: () => computePresence(),
    subscribeWins: (g, fn) => subscribe(winsSubs, g, fn),
    subscribeChat: (g, fn) => subscribe(chatSubs, g, fn),
    subscribePresence: (fn) => {
      presenceSubs.add(fn);
      try { fn(computePresence()); } catch (e) {}
      return () => presenceSubs.delete(fn);
    },
    rocketRoundState: () => null,
    sendChat: (g, text) => {
      const t = String(text || '').trim().slice(0, 160);
      if (!t || !GAME_CONFIG[g]) return;
      const playerName = getPlayerName();
      pushChat(g, { name: playerName, hue: 200, text: t, t: now(), bot: false });
      if (leader) scheduleReplyToPlayer({ game: g, text: t, playerName });
      broadcast('player-chat', { game: g, text: t, playerName });
    },
    _debug: { roster: () => roster, real: () => realPlayersByGame(), leader: () => leader },
  };

  // ============================================================
  // Page integrators.
  // ============================================================

  // ---- Lobby presence pills ----------------------------------
  if (IS_LOBBY) {
    const LOBBY_CSS = `
      .game-card { position: relative; }
      .cb-presence {
        position: absolute; top: 10px; right: 10px; z-index: 4;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 9px 3px; border-radius: 999px;
        background: rgba(10,4,24,0.78);
        box-shadow: inset 0 0 0 1px rgba(92,255,161,0.35), 0 4px 10px rgba(0,0,0,0.35);
        backdrop-filter: blur(6px);
        color: #c8ffd9;
        font-family: 'Bungee', cursive; font-size: 8px; letter-spacing: 0.16em;
        pointer-events: none; opacity: 0; transition: opacity 0.25s;
      }
      .cb-presence.live { opacity: 1; }
      .cb-presence.empty {
        color: rgba(255,255,255,0.4);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12), 0 4px 10px rgba(0,0,0,0.35);
      }
      .cb-presence::before {
        content: ''; width: 5px; height: 5px; border-radius: 50%;
        background: #5cffa1; box-shadow: 0 0 6px #5cffa1;
        animation: cb-presence-pulse 1.8s ease-in-out infinite;
      }
      .cb-presence.empty::before { background: rgba(255,255,255,0.35); box-shadow: none; animation: none; }
      @keyframes cb-presence-pulse { 0%,100% { opacity: 0.4; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
    `;
    function injectLobbyStyle() {
      if (document.getElementById('cb-lobby-css')) return;
      const s = document.createElement('style');
      s.id = 'cb-lobby-css'; s.textContent = LOBBY_CSS;
      document.head.appendChild(s);
    }
    // Real-player counts come from Firestore via CasinoStats; bot
    // counts come from our population manager. Both feed the same
    // pill: the displayed number is real + bot.
    let lastBotPresence  = {};
    let lastRealPresence = {};
    function repaintPresence() {
      document.querySelectorAll('.game-card[data-game]').forEach(card => {
        const g = card.getAttribute('data-game');
        if (!GAME_CONFIG[g]) return;
        let pill = card.querySelector('.cb-presence');
        if (!pill) { pill = document.createElement('div'); pill.className = 'cb-presence'; card.appendChild(pill); }
        const real  = Number(lastRealPresence[g]) || 0;
        const bots  = Number(lastBotPresence[g])  || 0;
        const count = real + bots;
        pill.classList.toggle('empty', count === 0);
        pill.classList.add('live');
        pill.textContent = count === 0 ? 'QUIET' : (count + ' PLAYING');
      });
    }
    function boot() {
      injectLobbyStyle();
      lastBotPresence = computePresence();
      repaintPresence();
      window.CasinoBots.subscribePresence(map => {
        lastBotPresence = map || {};
        repaintPresence();
      });

      // Hook CasinoStats (real-player presence from Firestore). It
      // loads as a separate module — and crucially, casino-account.js
      // installs a NO-OP STUB CasinoStats synchronously at script
      // execute time (configured: false), then replaces it once the
      // Firebase dynamic import resolves (configured: true). We MUST
      // wait for the real one, otherwise we lock onto the stub which
      // fires fn({}) once and is silent forever — that's why a real
      // player joining wasn't sticking in the count.
      let realTries = 0;
      const realIv = setInterval(() => {
        realTries++;
        const cs = window.CasinoStats;
        if (cs && cs.configured === true && typeof cs.subscribePresence === 'function') {
          clearInterval(realIv);
          cs.subscribePresence(map => {
            lastRealPresence = map || {};
            repaintPresence();
          });
        } else if (realTries > 150) {
          // ~30 s — Firebase may genuinely be offline / unconfigured.
          // Falling back to bot-only counts is fine.
          clearInterval(realIv);
        }
      }, 200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    return;
  }

  if (!PAGE_GAME) return;

  // Per-page chat reset on join. Each visit to a game starts with a
  // fresh chat — old buffered lines from a prior session don't leak in.
  chat[PAGE_GAME] = [];
  saveKey(CHAT_KEY, chat);
  broadcast('chat', PAGE_GAME);
  emitChat(PAGE_GAME);

  // The page's `State` object is a top-level `const`, which creates a
  // GLOBAL LEXICAL binding but NOT a property of window. We have to
  // reach it by bare reference — wrapped in a guarded helper so it's
  // safe to call before the inline script has run.
  function pageState() {
    try { return (typeof State !== 'undefined') ? State : null; } catch (e) { return null; }
  }

  // ---- Roulette: bot wins into #recent-list + player count merge ----
  if (PAGE_GAME === 'roulette') {
    const roulettePlans = new Map();       // roundId -> [{ botId, player, bets, totalBet }]
    const rouletteDecided = new Map();     // roundId -> Set(botId)
    const rouletteWinsByRound = new Map(); // roundId -> popup payloads
    const rouletteSettled = new Set();

    function currentRouletteRound() {
      const S = pageState();
      return S && S.activeRound && S.activeRound.roundId ? S.activeRound : null;
    }

    function pruneRouletteRounds() {
      while (roulettePlans.size > 8) {
        const rid = roulettePlans.keys().next().value;
        roulettePlans.delete(rid);
        rouletteDecided.delete(rid);
        rouletteWinsByRound.delete(rid);
        rouletteSettled.delete(rid);
      }
    }

    function activeRouletteBots() {
      const t = now();
      return roster
        .filter(b => b.online && b.game === 'roulette' && (b.brokeUntil || 0) < t)
        .sort((a, b) => a.id - b.id);
    }

    function rouletteChipFor(bot, betCount) {
      const count = Math.max(1, Number(betCount) || 1);
      const seed = Math.max(100, Number(bot.seedBalance) || Number(bot.balance) || 1000);
      const stack = Math.max(1, Number(bot.balance) || seed);
      const base = Math.max(1, Math.round(seed * rand(0.0025, 0.012)));
      const maxRisk = Math.max(1, Math.round(stack * 0.35));
      return Math.max(1, Math.min(base, Math.floor(maxRisk / count) || 1));
    }

    function makeRouletteBotBets(bot) {
      const Core = window.RouletteCore;
      if (!Core) return [];
      const roll = Math.random();
      try {
        if (roll < 0.46) {
          const kind = choose(['red', 'black', 'even', 'odd', 'low', 'high']);
          return [Core.createOutsideBet(kind, rouletteChipFor(bot, 1))];
        }
        if (roll < 0.76) {
          if (Math.random() < 0.5) return [Core.createDozenBet(randInt(1, 3), rouletteChipFor(bot, 1))];
          return [Core.createColumnBet(randInt(1, 3), rouletteChipFor(bot, 1))];
        }
        if (roll < 0.86) {
          const start = 1 + randInt(0, 11) * 3;
          return [Core.createStreetBet(start, rouletteChipFor(bot, 1))];
        }
        if (roll < 0.94) {
          const start = 1 + randInt(0, 10) * 3;
          return [Core.createSixLineBet(start, rouletteChipFor(bot, 1))];
        }
        if (roll < 0.985) {
          const pocket = choose(Core.AMERICAN_WHEEL);
          return [Core.createStraightBet(pocket, rouletteChipFor(bot, 1))];
        }
        const center = choose(Core.AMERICAN_WHEEL);
        return Core.createNeighborsBets(center, rouletteChipFor(bot, 5), 2);
      } catch (e) {
        return [];
      }
    }

    function planRouletteBots(round) {
      if (!round || !round.roundId || round.phase !== 'betting') return;
      const rid = round.roundId;
      let plans = roulettePlans.get(rid);
      let decided = rouletteDecided.get(rid);
      if (!plans) {
        plans = [];
        decided = new Set();
        roulettePlans.set(rid, plans);
        rouletteDecided.set(rid, decided);
        pruneRouletteRounds();
      }
      for (const bot of activeRouletteBots()) {
        if (decided.has(bot.id)) continue;
        decided.add(bot.id);
        if (Math.random() < 0.04) continue;
        const bets = makeRouletteBotBets(bot);
        const totalBet = Math.round(bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
        const stack = Math.max(0, Number(bot.balance) || 0);
        if (!bets.length || totalBet <= 0 || totalBet > stack) continue;
        bot.balance = Math.round((bot.balance - totalBet) * 100) / 100;
        bot.hands = (bot.hands || 0) + 1;
        plans.push({ botId: bot.id, player: bot.name, bets, totalBet });
      }
      if (plans.length) {
        saveKey(ROSTER_KEY, roster);
      }
    }

    function settleRouletteBots(round) {
      if (!round || !round.roundId || round.phase !== 'result') return;
      const Core = window.RouletteCore;
      if (!Core || rouletteSettled.has(round.roundId)) return;
      rouletteSettled.add(round.roundId);
      const plans = roulettePlans.get(round.roundId) || [];
      const wins = [];
      for (const plan of plans) {
        const bot = roster.find(b => b.id === plan.botId);
        const result = Core.resolveBets(plan.bets, round.outcome);
        if (bot && result.grossPaid > 0) {
          bot.balance = Math.round((bot.balance + result.grossPaid) * 100) / 100;
          bot.lifetimeWin = Math.round(((bot.lifetimeWin || 0) + result.net) * 100) / 100;
          bot.streak = Math.max(0, bot.streak || 0) + 1;
          if (result.grossPaid > (bot.biggestWin || 0)) bot.biggestWin = result.grossPaid;
        } else if (bot) {
          bot.streak = Math.min(0, bot.streak || 0) - 1;
        }
        if (!result.wins.length) continue;
        const biggest = result.wins.slice().sort((a, b) => b.payout - a.payout)[0];
        wins.push({
          roundId: round.roundId,
          number: round.outcome,
          color: round.color,
          bet: result.totalBet,
          payout: result.grossPaid,
          label: biggest.bet.label,
          biggestPayout: biggest.payout,
          player: plan.player,
          uid: 'bot-' + plan.botId + '-' + round.roundId,
          t: now(),
          _bot: true,
        });
        if (result.grossPaid >= Math.max(20, result.totalBet * GAME_CONFIG.roulette.bigMult)) {
          scheduleReactionsToBigWin('roulette', plan.player, false);
        }
      }
      rouletteWinsByRound.set(round.roundId, wins);
      if (plans.length) saveKey(ROSTER_KEY, roster);
    }

    function pumpRouletteBots() {
      const round = currentRouletteRound();
      if (!round || !round.roundId) return;
      if (round.phase === 'betting') planRouletteBots(round);
      if (round.phase === 'result') settleRouletteBots(round);
      return round;
    }

    function tryHookRouletteWins() {
      const S = pageState();
      if (typeof window.renderRecentWins !== 'function' || !S || !Array.isArray(S.liveWins)) return false;
      const orig = window.renderRecentWins;
      window.renderRecentWins = function () {
        const S2 = pageState();
        if (!S2 || !Array.isArray(S2.liveWins)) return orig.apply(this, arguments);
        try { pumpRouletteBots(); } catch (e) {}
        const round = currentRouletteRound();
        const botRoundWins = round && round.roundId
          ? (rouletteWinsByRound.get(round.roundId) || [])
          : [];
        const winTime = (w) => {
          const t = w && (w._t || w.t || w.at || w.placedAt);
          if (typeof t === 'number') return t;
          if (w && w.ts && typeof w.ts.toMillis === 'function') return w.ts.toMillis();
          if (typeof (w && w.ts) === 'number') return w.ts;
          return 0;
        };
        const real = (S2.liveWins || []).map(w => {
          return Object.assign({}, w, { _t: winTime(w) });
        });
        const bots = botRoundWins.map(w => Object.assign({}, w, { _t: winTime(w) || now() }));
        real.sort((a, b) => winTime(a) - winTime(b));
        bots.sort((a, b) => winTime(a) - winTime(b));
        const botSlots = Math.max(0, 8 - Math.min(real.length, 8));
        const merged = real.slice(-8).concat(botSlots ? bots.slice(-botSlots) : []);
        const original = S2.liveWins;
        S2.liveWins = merged.slice(-8);
        try { orig.apply(this, arguments); } finally { S2.liveWins = original; }
      };
      window.renderRecentWins();
      window.CasinoBots.subscribeWins('roulette', () => { try { window.renderRecentWins(); } catch (e) {} });
      const chatCard = document.querySelector('.rail-card.chat-card.table-chat');
      if (chatCard) chatCard.style.display = 'none';
      return true;
    }

    // Merge bot presence into the "N PLAYING" pill in the top-right.
    // We keep the last real count from CasinoStats and add the bot
    // count, repainting whenever either side changes.
    let lastRealRoulette = 0;
    function paintRoulettePlayerCount() {
      const el = document.getElementById('roulette-player-count');
      if (!el) return;
      const bots = (computePresence().roulette || 0);
      el.textContent = (lastRealRoulette + bots) + ' PLAYING';
    }
    function tryHookRoulettePlayerCount() {
      if (typeof window.renderRoulettePlayerCount !== 'function') return false;
      const orig = window.renderRoulettePlayerCount;
      window.renderRoulettePlayerCount = function (counts) {
        const raw = counts && Number(counts.roulette);
        lastRealRoulette = Math.max(0, Number.isFinite(raw) ? raw : 0);
        paintRoulettePlayerCount();
      };
      window.CasinoBots.subscribePresence(paintRoulettePlayerCount);
      paintRoulettePlayerCount();
      return true;
    }

    function boot() {
      let winsHooked = false, countHooked = false, tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (!winsHooked)  winsHooked  = tryHookRouletteWins();
        if (!countHooked) countHooked = tryHookRoulettePlayerCount();
        if ((winsHooked && countHooked) || tries > 100) clearInterval(iv);
      }, 100);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    setInterval(() => {
      try {
        const round = pumpRouletteBots();
        if (round && round.phase === 'result' && typeof window.renderRecentWins === 'function') {
          window.renderRecentWins();
        }
      } catch (e) {}
    }, 500);
    return;
  }

  // ---- Rocket: native cashout injection + player count merge ----
  if (PAGE_GAME === 'rocket') {
    // We hide the native chat panel (slide-up replaces it) and we feed
    // bot "cashouts" into rocket's real mergedCashouts + State.liveCashouts
    // pipeline. The existing curveCashouts/drawCashoutDots reads from
    // mergedCashouts, so bots also show up as dots on the trail.
    //
    // For each round we plan a SET of pending bot cashouts (target
    // multipliers + bet sizes). Each pump tick checks the live rocket
    // multiplier and fires any pending plan whose target has been
    // reached. Result: dots appear on the curve at the exact moment
    // the rocket passes each bot's cashout point, matching how real
    // players appear.
    const botPlans = new Map();   // roundId → [{ player, target, bet, botId }]
    const botFired = new Map();   // roundId → [{ roundId, player, multiplier, bet, payout, uid }]
    let lastSeenRound = null;

    function currentRound() {
      const S = pageState();
      let r = S && S.activeRound;
      if (!r || !r.roundId) {
        try {
          if (typeof window.getGlobalRound === 'function' && typeof window.casinoNow === 'function') {
            r = window.getGlobalRound(window.casinoNow());
          }
        } catch (e) {}
      }
      return r;
    }

    function tryHookRocket() {
      const S = pageState();
      if (typeof window.mergedCashouts !== 'function' ||
          typeof window.renderRecent !== 'function' ||
          !S || !Array.isArray(S.liveCashouts)) {
        return false;
      }

      // Wrap mergedCashouts so already-fired bot cashouts always layer
      // into the current round's list, surviving Firestore wipes.
      const origMerged = window.mergedCashouts;
      window.mergedCashouts = function () {
        const list = origMerged.apply(this, arguments);
        try {
          const round = currentRound();
          const rid = round && round.roundId;
          if (!rid) return list;
          const fired = botFired.get(rid);
          if (!fired || !fired.length) return list;
          return list.concat(fired).sort((a, b) => a.multiplier - b.multiplier);
        } catch (e) { return list; }
      };

      const chatCard = document.querySelector('.rail-card.chat-card.bet-chat-card');
      if (chatCard) chatCard.style.display = 'none';
      return true;
    }

    // Pick a target multiplier for one bot, biased by their cashout
    // style. Returns a number > 1, regardless of the round's crash —
    // whether it actually fires is decided downstream.
    function rollTarget(bot) {
      const style = (bot && bot.cashoutStyle) || 'normal';
      const r = Math.random();
      if (style === 'conservative') return 1.15 + r * 0.85;            // 1.15–2.00
      if (style === 'normal')       return 1.40 + r * 2.60;            // 1.40–4.00
      if (style === 'aggressive')   return 2.50 + Math.pow(r, 1.4) * 7.5; // 2.5–10
      return 1.05 + Math.pow(r, 2.2) * 9;                              // 1.05–10
    }

    function botBet(bot) {
      return Math.max(1, Math.round((bot && bot.seedBalance || 1000) * (0.005 + Math.random() * 0.03)));
    }

    // Plan a round's bot cashouts. Idempotent on round id and on bot
    // id within a round — each bot is decided EXACTLY ONCE per round.
    // Busted decisions stick. Late-arriving bots get a fresh decision
    // when they show up, but a bot who's already busted this round
    // does not get a do-over. Otherwise we'd silently roll the dice
    // until they got a target below the live multiplier and the whole
    // lobby would cluster their cashouts just before the crash.
    function planRound(round) {
      if (!round || !round.roundId) return;
      const rid = round.roundId;
      let plans = botPlans.get(rid);
      let fired = botFired.get(rid);
      if (!plans) {
        plans = []; fired = [];
        botPlans.set(rid, plans);
        botFired.set(rid, fired);
        if (botPlans.size > 6) {
          const oldest = botPlans.keys().next().value;
          botPlans.delete(oldest);
          botFired.delete(oldest);
        }
      }

      // Every bot that's already been decided this round (planned,
      // fired, OR busted). botId of -Infinity-target plans counts too.
      const decided = new Set();
      for (const p of plans) decided.add(p.botId);
      for (const f of fired) {
        const parts = String(f.uid || '').split('-');
        if (parts.length >= 2) {
          const id = parseInt(parts[1], 10);
          if (Number.isFinite(id)) decided.add(id);
        }
      }

      let crash;
      try {
        if (typeof window.seededCrashPoint === 'function' && Number.isFinite(round.index)) {
          crash = window.seededCrashPoint(round.index);
        }
      } catch (e) {}
      if (!Number.isFinite(crash) || crash < 1) {
        crash = Number(round.crashAt);
        if (!Number.isFinite(crash) || crash < 1) crash = 1.05 + Math.pow(Math.random(), 2.4) * 20;
      }

      // Current live multiplier — late-joiners must target above this
      // so their dot doesn't appear retroactively behind the rocket.
      const Sx = pageState();
      const liveMult = Number(Sx && Sx.multiplier) || 1;

      const inRoom = roster.filter(b =>
        b.online && b.game === 'rocket' && (b.brokeUntil || 0) < now() && !decided.has(b.id));

      for (const bot of inRoom) {
        const bet = botBet(bot);
        let target = rollTarget(bot);
        // BUSTED: target above crash. They held too long. Show nothing.
        if (target > crash) {
          // The bet still happened — feed it into global stats + pool.
          recordBotBet('rocket', bet, -bet);
          plans.push({ player: bot.name, target: Infinity, bet, botId: bot.id, active: true, status: 'bust' });
          continue;
        }
        // Late-joiner whose chosen target is already behind the live
        // multiplier — they didn't get to cash there. Same as bust.
        if (target < liveMult + 0.05) {
          recordBotBet('rocket', bet, -bet);
          plans.push({ player: bot.name, target: Infinity, bet, botId: bot.id, active: true, status: 'bust' });
          continue;
        }
        // Will cash out. Record the bet + eventual gross-net up front.
        recordBotBet('rocket', bet, Math.round(bet * (target - 1)));
        plans.push({ player: bot.name, target, bet, botId: bot.id, active: true, status: 'cashout' });
      }
    }

    function rocketRoundState(roundId) {
      const round = currentRound();
      const rid = String(roundId || (round && round.roundId) || '');
      if (!rid) return { roundId: '', total: 0, left: 0, fired: 0, pending: 0 };
      if (round && round.roundId === rid) planRound(round);
      const plans = botPlans.get(rid) || [];
      const fired = botFired.get(rid) || [];
      const pending = plans.filter(p => p && p.active).length;
      const total = pending + fired.length;
      const phase = round && round.roundId === rid ? round.phase : '';
      const left = phase === 'running' ? pending : phase === 'betting' ? total : 0;
      return { roundId: rid, total, left, fired: fired.length, pending };
    }
    window.CasinoBots.rocketRoundState = rocketRoundState;

    // Fire any plan whose target has been reached by the current
    // multiplier. Pushes the cashout into the fired bucket so the
    // mergedCashouts wrapper picks it up on the next render.
    function pumpCashouts() {
      const round = currentRound();
      if (!round || !round.roundId) return;
      const rid = round.roundId;

      // Always (re-)plan: handles fresh rounds AND bots that came
      // online after the round started. Idempotent.
      const wasNew = rid !== lastSeenRound;
      if (wasNew) lastSeenRound = rid;
      planRound(round);
      if (wasNew) {
        try { window.renderRecent(); } catch (e) {}
        try { window.renderActiveCount(round); } catch (e) {}
      }

      if (round.phase !== 'running') return;
      const Sp = pageState();
      const liveMult = Number(Sp && Sp.multiplier) || round.multiplier || 1;
      const plans = botPlans.get(rid);
      const fired = botFired.get(rid);
      if (!plans || !fired) return;

      let didFire = false;
      for (let i = plans.length - 1; i >= 0; i--) {
        const p = plans[i];
        if (p.target > liveMult) continue;
        plans.splice(i, 1);
        fired.push({
          roundId: rid,
          player: p.player,
          multiplier: p.target,
          bet: p.bet,
          payout: p.bet * p.target,
          uid: 'bot-' + p.botId + '-' + rid,
        });
        didFire = true;
        if (p.target >= 8) scheduleReactionsToBigWin('rocket', p.player, false);
      }
      if (didFire) {
        try { window.renderRecent(); } catch (e) {}
        try { window.renderActiveCount(round); } catch (e) {}
      }
    }

    // Player count merge.
    let lastRealRocket = 0;
    function paintRocketPlayerCount() {
      const el = document.getElementById('rocket-player-count');
      if (!el) return;
      const bots = (computePresence().rocket || 0);
      el.textContent = '👤 ' + (lastRealRocket + bots) + ' PLAYING';
    }
    function tryHookRocketPlayerCount() {
      if (typeof window.renderRocketPlayerCount !== 'function') return false;
      const orig = window.renderRocketPlayerCount;
      window.renderRocketPlayerCount = function (counts) {
        const raw = counts && Number(counts.rocket);
        lastRealRocket = Math.max(0, Number.isFinite(raw) ? raw : 0);
        paintRocketPlayerCount();
      };
      window.CasinoBots.subscribePresence(paintRocketPlayerCount);
      paintRocketPlayerCount();
      return true;
    }

    function boot() {
      let rocketHooked = false, countHooked = false, tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (!rocketHooked) rocketHooked = tryHookRocket();
        if (!countHooked)  countHooked  = tryHookRocketPlayerCount();
        if ((rocketHooked && countHooked) || tries > 100) clearInterval(iv);
      }, 100);
      // Cashout pump runs forever once we're booted — 120ms is fast
      // enough that dots appear right as the rocket passes each target
      setInterval(pumpCashouts, 120);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    return;  // do NOT fall through to the generic wins banner
  }

  // ---- Small wins banner (every other game) ----
  // Default placement is position:fixed near the top of the viewport.
  // A per-page page can opt into a docked placement by setting
  //   window.CB_BANNER_PLACEMENT = { anchor: '<selector>', position: 'before'|'after', gap: '<css length>' }
  // before this script runs (or any time before boot). In docked mode the
  // banner is moved into normal flow next to the anchor — letting each
  // game lock it above/below a specific UI element.
  const BANNER_CSS = `
    .cb-banner {
      position: fixed;
      top: 58px; left: 50%; transform: translateX(-50%);
      z-index: 14;
      max-width: min(360px, calc(100vw - 24px));
      height: 26px;
      padding: 0 9px;
      display: flex; align-items: center; gap: 8px;
      border-radius: 999px;
      background: rgba(10,4,24,0.82);
      box-shadow: inset 0 0 0 1px rgba(255,210,74,0.22), 0 6px 14px rgba(0,0,0,0.4);
      backdrop-filter: blur(8px);
      color: rgba(255,255,255,0.88);
      font-family: 'Outfit', system-ui, sans-serif;
      font-size: 10.5px;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .cb-banner.cb-docked {
      position: relative;
      top: auto; left: auto; transform: none;
      margin: var(--cb-gap-top, 8px) auto var(--cb-gap-bottom, 8px);
    }
    .cb-banner.hidden { opacity: 0; visibility: hidden; }
    .cb-banner .cb-tag {
      flex-shrink: 0;
      font-family: 'Bungee', cursive;
      font-size: 7.5px; letter-spacing: 0.18em;
      color: #fff0a8;
      padding-right: 7px;
      border-right: 1px solid rgba(255,210,74,0.22);
      display: inline-flex; align-items: center; gap: 5px;
    }
    .cb-banner .cb-tag::before {
      content: ''; width: 5px; height: 5px; border-radius: 50%;
      background: #5cffa1; box-shadow: 0 0 5px #5cffa1;
    }
    .cb-banner .cb-track {
      flex: 1 1 auto;
      display: flex; align-items: center; gap: 8px;
      overflow: hidden;
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
              mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
    }
    .cb-banner .cb-pill {
      flex-shrink: 0;
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 10.5px; line-height: 1; white-space: nowrap;
      animation: cb-pill-in 0.3s cubic-bezier(.18,.89,.32,1.18);
    }
    @keyframes cb-pill-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
    .cb-banner .cb-dot {
      width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 4px currentColor;
    }
    .cb-banner .cb-name { color: rgba(255,255,255,0.92); font-weight: 600; }
    .cb-banner .cb-amt {
      font-family: 'Geist Mono', monospace; font-weight: 800;
      color: #5cffa1; text-shadow: 0 0 5px rgba(92,255,161,0.3);
    }
    .cb-banner .cb-pill.big .cb-amt { color: #ffd24a; text-shadow: 0 0 6px rgba(255,210,74,0.4); }
    @media (max-width: 720px) {
      .cb-banner { top: 50px; height: 22px; font-size: 9.5px; padding: 0 7px; gap: 6px; }
      .cb-banner .cb-tag { font-size: 7px; letter-spacing: 0.14em; padding-right: 5px; }
      .cb-banner .cb-pill, .cb-banner .cb-amt { font-size: 9.5px; }
    }
  `;

  let bannerEl = null, trackEl = null;
  function injectBanner() {
    if (bannerEl) return;
    if (!document.getElementById('cb-banner-css')) {
      const s = document.createElement('style');
      s.id = 'cb-banner-css'; s.textContent = BANNER_CSS;
      document.head.appendChild(s);
    }
    bannerEl = document.createElement('div');
    bannerEl.className = 'cb-banner hidden';
    bannerEl.innerHTML = '<span class="cb-tag">RECENT</span><div class="cb-track" data-track></div>';
    document.body.appendChild(bannerEl);
    trackEl = bannerEl.querySelector('[data-track]');
    applyBannerPlacement();
  }

  function applyBannerPlacement() {
    const cfg = window.CB_BANNER_PLACEMENT;
    if (!cfg || !cfg.anchor || !bannerEl) return;
    const anchor = document.querySelector(cfg.anchor);
    if (!anchor || !anchor.parentNode) return;
    const where = cfg.position === 'after' ? 'afterend' : 'beforebegin';
    anchor.insertAdjacentElement(where, bannerEl);
    bannerEl.classList.add('cb-docked');
    if (cfg.gapTop)    bannerEl.style.setProperty('--cb-gap-top', cfg.gapTop);
    if (cfg.gapBottom) bannerEl.style.setProperty('--cb-gap-bottom', cfg.gapBottom);
  }

  function renderBanner(list) {
    if (!trackEl) return;
    const items = (list || []).slice(0, 4);
    if (!items.length) {
      bannerEl.classList.add('hidden');
      trackEl.innerHTML = '';
      return;
    }
    bannerEl.classList.remove('hidden');
    trackEl.innerHTML = items.map(it => {
      const tone = `hsl(${it.hue},78%,68%)`;
      const big = it.big ? ' big' : '';
      const shortName = escapeHtml(String(it.name).slice(0, 14));
      return '<span class="cb-pill' + big + '">' +
               `<span class="cb-dot" style="background:${tone};color:${tone}"></span>` +
               `<span class="cb-name">${shortName}</span>` +
               `<span class="cb-amt">${fmtMoney(it.win)}</span>` +
             '</span>';
    }).join('');
  }

  function boot() {
    injectBanner();
    window.CasinoBots.subscribeWins(PAGE_GAME, renderBanner);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
