/* ============================================================
   casino-jackpots.js — global community jackpots (Mini/Minor/Major/Grand)
   ============================================================
   Loads on every page. Bolts onto the existing instrumentation:

     1. Wraps window.History.record(game, bet, win, note) so that
        every round automatically siphons a % of the bet into four
        global jackpot pools stored at /globals/jackpots.

     2. Trigger model = RANDOM PER-SPIN:
        - Each tier has a fixed per-spin probability, independent
          of bet size. So whales spinning $1M don't trigger more
          often than $5 bettors — they just feed the pools faster
          and win bigger when it does land. Frequency stays sane
          even at extreme bet levels.
        - Multiple tiers could roll true on the same spin (very
          unlikely). We walk highest-to-lowest and only fire the
          biggest, in the player's favor.
        - Pool size is purely cosmetic prize growth. It never
          gates the trigger, so the win feels truly random.

     3. On a win:
        - Renders a shared celebration overlay.
        - Dispatches a `jackpot-win` CustomEvent on `document` with
          { kind, amount, game } so the active game can credit its
          own balance — every game has its own setBalance flow.
        - Calls window.History.record(game, 0, amount, KIND+' JACKPOT')
          which feeds the existing recentJackpots ticker + the
          /globals/stats jackpotsHit counter.

     4. Exposes window.CasinoJackpots:
          .configured            — bool
          .subscribe(fn)         — live pool snapshot
          .currentPools()        — last seen snapshot (or seeds)
          .tiers                 — config array (read-only)

   No-op when Firebase isn't configured.

   ============================================================ */

(() => {
  'use strict';

  // -----------------------------------------------------------
  // Tier configuration. Random-trigger model: each spin has a
  // FIXED probability per tier (independent of bet size), so
  // frequency doesn't run away when whales bet millions. Bet
  // size only affects the PRIZE — pool contributions still
  // scale linearly with bet, so high-roller play grows pools
  // fast and produces enormous wins.
  //
  //   contrib       — % of every bet that feeds the pool.
  //                   Flipped from realistic mystery-jackpot
  //                   distribution: bigger tier gets bigger
  //                   share so Grand ticker grows fastest.
  //   triggerPerSpin — fixed per-spin probability of firing,
  //                    regardless of bet size. Roughly:
  //                      Mini:  ~1 in 300 spins  (~25 min)
  //                      Minor: ~1 in 2.5k spins (~3.5 hr)
  //                      Major: ~1 in 20k spins  (~28 hr)
  //                      Grand: ~1 in 200k spins (~11 days)
  //   seed          — base pool size after a reset / fresh start.
  // -----------------------------------------------------------
  const TIERS = [
    { id: 'grand', label: 'GRAND', seed: 50000, contrib: 0.0050, triggerPerSpin: 5e-6  },
    { id: 'major', label: 'MAJOR', seed: 5000,  contrib: 0.0030, triggerPerSpin: 5e-5  },
    { id: 'minor', label: 'MINOR', seed: 500,   contrib: 0.0015, triggerPerSpin: 4e-4  },
    { id: 'mini',  label: 'MINI',  seed: 50,    contrib: 0.0005, triggerPerSpin: 3.3e-3 },
  ];
  // Highest-to-lowest is the natural walk order — in the rare
  // event multiple tiers fire on one spin, the biggest wins.

  const TIER_BY_ID = Object.fromEntries(TIERS.map(t => [t.id, t]));

  // Seed snapshot used until the live Firestore value arrives.
  function seedSnapshot() {
    const out = {};
    for (const t of TIERS) out[t.id] = { pool: t.seed, seed: t.seed };
    return out;
  }

  // -----------------------------------------------------------
  // Subscriber registry (lobby ticker subscribes; live updates).
  // -----------------------------------------------------------
  let lastSnapshot = seedSnapshot();
  const subscribers = new Set();
  function fanout() {
    for (const fn of subscribers) { try { fn(lastSnapshot); } catch (e) {} }
  }

  // -----------------------------------------------------------
  // Shared celebration overlay — injected once per page.
  // -----------------------------------------------------------
  const OVERLAY_CSS = `
    .cj-veil {
      position: fixed; inset: 0; z-index: 200;
      background: radial-gradient(ellipse at center, rgba(20,5,40,0.85), rgba(0,0,0,0.95));
      backdrop-filter: blur(6px);
      display: grid; place-items: center;
      opacity: 0; pointer-events: none; transition: opacity 0.35s;
    }
    .cj-veil.show { opacity: 1; pointer-events: all; }
    .cj-card {
      position: relative;
      width: min(520px, 92vw);
      padding: 32px 28px 28px;
      border-radius: 24px;
      background: radial-gradient(ellipse at top, rgba(255,210,74,0.35), transparent 60%),
                  linear-gradient(180deg, #2a0d52, #0a0319);
      box-shadow: 0 30px 80px -10px rgba(0,0,0,0.8),
                  inset 0 0 0 2px rgba(255,210,74,0.5),
                  0 0 60px rgba(255,46,147,0.25);
      transform: translateY(30px) scale(0.85);
      transition: transform 0.45s cubic-bezier(.18,.89,.32,1.28);
      color: #fff; font-family: 'Outfit', sans-serif;
      text-align: center;
      overflow: hidden;
    }
    .cj-veil.show .cj-card { transform: translateY(0) scale(1); }
    .cj-card::before {
      content: '';
      position: absolute; inset: -40%;
      background: conic-gradient(from 0deg, rgba(255,210,74,0.55), transparent 25%, rgba(34,211,238,0.4) 50%, transparent 75%, rgba(255,46,147,0.55));
      animation: cjSpin 4s linear infinite;
      pointer-events: none;
      z-index: 0;
      opacity: 0.55;
    }
    .cj-card::after {
      content: '';
      position: absolute; inset: 4px;
      border-radius: 22px;
      background: linear-gradient(180deg, #1a0640, #0a0319);
      z-index: 1;
    }
    @keyframes cjSpin { to { transform: rotate(360deg); } }
    .cj-inner { position: relative; z-index: 2; }
    .cj-tier {
      font-family: 'Bungee', cursive;
      font-size: 14px; letter-spacing: 0.42em;
      color: rgba(255,255,255,0.55);
      margin-bottom: 4px;
    }
    .cj-headline {
      font-family: 'Bungee', cursive;
      font-size: clamp(38px, 7vw, 64px);
      letter-spacing: 0.08em;
      background: linear-gradient(180deg, #fff7c4 0%, #ffd24a 45%, #ff9c2b 100%);
      -webkit-background-clip: text; background-clip: text;
      color: transparent;
      text-shadow: 0 0 24px rgba(255,210,74,0.4);
      margin-bottom: 6px;
      line-height: 1;
    }
    .cj-sub {
      font-family: 'Bungee', cursive;
      font-size: 12px; letter-spacing: 0.32em;
      color: #fff0a8; opacity: 0.85;
      margin-bottom: 22px;
    }
    .cj-amount {
      font-family: 'Geist Mono', monospace;
      font-weight: 800;
      font-size: clamp(34px, 6.5vw, 58px);
      letter-spacing: 0.02em;
      color: #c8ffd9;
      text-shadow: 0 0 26px rgba(92,255,161,0.6), 0 0 8px rgba(255,255,255,0.4);
      margin-bottom: 26px;
      line-height: 1;
    }
    .cj-claim {
      display: inline-block;
      border: 0; cursor: pointer;
      padding: 14px 42px;
      border-radius: 14px;
      font-family: 'Bungee', cursive; letter-spacing: 0.22em; font-size: 15px;
      color: #1a0640;
      background: linear-gradient(180deg, #ffe27a, #ffd24a 50%, #ffb73e);
      box-shadow: 0 6px 0 #6e4900, 0 12px 30px rgba(255,210,74,0.35), inset 0 1px 0 rgba(255,255,255,0.6);
      transition: transform 0.08s, filter 0.15s;
    }
    .cj-claim:hover { filter: brightness(1.08); }
    .cj-claim:active { transform: translateY(3px); box-shadow: 0 3px 0 #6e4900, 0 6px 16px rgba(255,210,74,0.35), inset 0 1px 0 rgba(255,255,255,0.6); }
    .cj-spark {
      position: absolute;
      width: 8px; height: 8px;
      background: #ffd24a;
      box-shadow: 0 0 12px #ffd24a, 0 0 24px rgba(255,210,74,0.6);
      border-radius: 50%;
      pointer-events: none;
      animation: cjSpark 1.6s ease-out forwards;
      z-index: 3;
    }
    @keyframes cjSpark {
      0%   { opacity: 1; transform: translate(0, 0) scale(1); }
      100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.2); }
    }
  `;

  function injectOverlayOnce() {
    if (document.getElementById('cj-veil')) return;
    if (!document.getElementById('cj-overlay-css')) {
      const style = document.createElement('style');
      style.id = 'cj-overlay-css';
      style.textContent = OVERLAY_CSS;
      document.head.appendChild(style);
    }
    const veil = document.createElement('div');
    veil.id = 'cj-veil';
    veil.className = 'cj-veil';
    veil.innerHTML = `
      <div class="cj-card">
        <div class="cj-inner">
          <div class="cj-tier" id="cj-tier">JACKPOT</div>
          <div class="cj-headline" id="cj-headline">GRAND</div>
          <div class="cj-sub">COMMUNITY JACKPOT</div>
          <div class="cj-amount">$<span id="cj-amt">0</span></div>
          <button class="cj-claim" id="cj-claim" type="button">CLAIM</button>
        </div>
      </div>
    `;
    document.body.appendChild(veil);
    veil.querySelector('#cj-claim').addEventListener('click', closeOverlay);
    veil.addEventListener('click', e => { if (e.target === veil) closeOverlay(); });
  }

  function fmtMoney(v) {
    const cents = Math.round(v * 100) / 100;
    if (Number.isInteger(cents)) return cents.toLocaleString('en-US');
    return cents.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showOverlay(kind, amount) {
    injectOverlayOnce();
    const veil = document.getElementById('cj-veil');
    if (!veil) return;
    veil.querySelector('#cj-tier').textContent = (kind || 'JACKPOT').toUpperCase() + ' JACKPOT';
    veil.querySelector('#cj-headline').textContent = (kind || 'JACKPOT').toUpperCase();
    const amtEl = veil.querySelector('#cj-amt');
    amtEl.textContent = '0';
    veil.classList.add('show');

    // Try to use whatever celebratory audio the page has on hand.
    try {
      const A = window.Audio || (window.parent && window.parent.Audio);
      // The casino-audio module attaches an `Audio` global with methods
      // like bigWinFanfare, jackpot, etc. We probe for the most fitting.
      const cands = ['jackpotFanfare', 'jackpot', 'bigWinFanfare', 'bigWin', 'megaWin', 'gameWin', 'win'];
      for (const k of cands) {
        if (window.Audio && typeof window.Audio[k] === 'function') {
          try { window.Audio[k](); break; } catch (e) {}
        }
      }
    } catch (e) {}

    // Count-up animation.
    const t0 = performance.now();
    const dur = 2200;
    function frame(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      amtEl.textContent = fmtMoney(amount * eased);
      if (k < 1) requestAnimationFrame(frame);
      else amtEl.textContent = fmtMoney(amount);
    }
    requestAnimationFrame(frame);

    // Confetti-ish sparks.
    const card = veil.querySelector('.cj-card');
    if (card) {
      for (let i = 0; i < 24; i++) {
        const s = document.createElement('div');
        s.className = 'cj-spark';
        const ang = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 200;
        s.style.left = '50%'; s.style.top = '50%';
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        s.style.background = ['#ffd24a','#ff2e93','#22d3ee','#5cffa1'][i & 3];
        card.appendChild(s);
        setTimeout(() => s.remove(), 1700);
      }
    }
  }

  function closeOverlay() {
    const veil = document.getElementById('cj-veil');
    if (veil) veil.classList.remove('show');
  }

  // -----------------------------------------------------------
  // Public surface — no-op stub by default. Real version is
  // installed below once Firestore is up.
  // -----------------------------------------------------------
  window.CasinoJackpots = {
    configured: false,
    subscribe(fn) {
      subscribers.add(fn);
      try { fn(lastSnapshot); } catch (e) {}
      return () => subscribers.delete(fn);
    },
    currentPools() { return lastSnapshot; },
    tiers: TIERS.map(t => ({ ...t })),
  };

  // -----------------------------------------------------------
  // Bootstrap. The hook can be installed immediately (just needs
  // window.History from casino-audio.js). Firestore wiring waits
  // until casino-account.js has finished bringing up CasinoStats.
  // We poll because event-only delivery has a race: if Firebase
  // init throws inside casino-account.js, the event still fires
  // but CasinoStats.configured stays false, then later (e.g.
  // after sign-in retry) it might flip true.
  // -----------------------------------------------------------
  let firestoreInitStarted = false;
  function tryStartFirestore() {
    if (firestoreInitStarted) return;
    if (!window.CasinoStats || !window.CasinoStats.configured) return;
    firestoreInitStarted = true;
    console.log('[casino-jackpots] starting Firestore wiring');
    initFirestore().catch(e => console.warn('[casino-jackpots] init failed:', e));
  }

  function init() {
    hookHistoryRecord();
    tryStartFirestore();
  }

  // History.record is provided by casino-audio.js as `global.History`.
  // We wrap it once so every game's existing end-of-round call routes
  // through us without per-game code changes.
  let hooked = false;
  function hookHistoryRecord() {
    if (hooked) return;
    if (!window.History || typeof window.History.record !== 'function') {
      // Retry shortly — casino-audio may load after us in some pages.
      setTimeout(hookHistoryRecord, 80);
      return;
    }
    hooked = true;
    console.log('[casino-jackpots] hooked History.record');
    const orig = window.History.record.bind(window.History);
    window.History.record = function (game, bet, win, note) {
      const entry = orig(game, bet, win, note);
      // Skip recursive entries (jackpot wins we re-record).
      const isJackpotEntry = note && /JACKPOT/i.test(String(note));
      if (!isJackpotEntry) {
        const betNum = Number(bet) || 0;
        if (betNum > 0) {
          processBet(String(game || 'unknown'), betNum);
        }
      }
      return entry;
    };
  }

  // -----------------------------------------------------------
  // Firestore wiring.
  // -----------------------------------------------------------
  let db = null;
  let auth = null;
  let docRef = null;
  let fs = null; // firestore module (for runTransaction, etc.)

  async function initFirestore() {
    // Reuse the same Firebase SDK URL casino-account.js does.
    const FB = 'https://www.gstatic.com/firebasejs/10.13.2';
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-auth.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
    const { getApp } = appMod;
    const { getAuth } = authMod;
    const { getFirestore, doc, onSnapshot, runTransaction, serverTimestamp, addDoc, collection } = fsMod;

    fs = { doc, onSnapshot, runTransaction, serverTimestamp, addDoc, collection };

    try {
      const app = getApp();        // casino-account.js initialized it first
      db = getFirestore(app);
      auth = getAuth(app);
    } catch (e) {
      // No Firebase app — bail.
      return;
    }
    docRef = doc(db, 'globals', 'jackpots');

    // Live subscription for the lobby ticker.
    onSnapshot(docRef, snap => {
      const data = snap.data();
      if (!data) {
        // Seed on first ever read. Anyone authed can do this safely
        // because the transaction below also seeds defensively.
        seedDoc().catch(() => {});
        return;
      }
      lastSnapshot = normalizeSnapshot(data);
      fanout();
    }, () => {});

    window.CasinoJackpots = {
      configured: true,
      subscribe(fn) {
        subscribers.add(fn);
        try { fn(lastSnapshot); } catch (e) {}
        return () => subscribers.delete(fn);
      },
      currentPools() { return lastSnapshot; },
      tiers: TIERS.map(t => ({ ...t })),
    };
    console.log('[casino-jackpots] Firestore wired; /globals/jackpots subscribed');
  }

  function normalizeSnapshot(data) {
    const out = {};
    for (const t of TIERS) {
      const cur = (data && data[t.id]) || {};
      // Floor pool at the configured seed so a config bump that
      // raises seeds immediately reflects on the ticker — players
      // never see a pool smaller than its seed.
      const stored = Number(cur.pool);
      out[t.id] = {
        pool:      (Number.isFinite(stored) && stored > t.seed) ? stored : t.seed,
        seed:      t.seed,
        lastWinner: cur.lastWinner || null,
        lastAmount: Number(cur.lastAmount) || 0,
        lastAt:    cur.lastAt || null,
      };
    }
    return out;
  }

  async function seedDoc() {
    if (!docRef || !fs) return;
    await fs.runTransaction(db, async tx => {
      const snap = await tx.get(docRef);
      if (snap.exists() && snap.data() && snap.data().initialized) return;
      const patch = { initialized: true, updatedAt: fs.serverTimestamp() };
      for (const t of TIERS) {
        patch[t.id] = {
          pool:      t.seed,
          seed:      t.seed,
          lastWinner: null,
          lastAmount: 0,
          lastAt: null,
        };
      }
      tx.set(docRef, patch, { merge: true });
    });
  }

  // -----------------------------------------------------------
  // The core: process a bet contribution.
  // Returns a Promise that resolves to { kind, amount } when the
  // bet triggers a jackpot, or null otherwise.
  // -----------------------------------------------------------
  async function processBet(game, bet) {
    if (!docRef || !fs) {
      console.debug('[casino-jackpots] skipped contribute (firestore not ready)', { game, bet });
      return null;
    }
    if (!Number.isFinite(bet) || bet <= 0) return null;

    // Roll the dice for each tier BEFORE running the transaction.
    // Fixed per-spin probabilities — bet size doesn't change odds,
    // only the prize size (via contributions). Walk highest-to-lowest
    // so the biggest tier wins in the rare event multiple roll true.
    let rolledTier = null;
    for (const t of TIERS) {
      if (Math.random() < t.triggerPerSpin) { rolledTier = t; break; }
    }

    let trigger = null;
    try {
      await fs.runTransaction(db, async tx => {
        const snap = await tx.get(docRef);
        const data = (snap.exists() && snap.data()) || {};
        const patch = { updatedAt: fs.serverTimestamp() };

        // Seed first if missing.
        if (!data.initialized) patch.initialized = true;

        let won = null;
        for (const t of TIERS) {
          const cur = data[t.id] || {};
          // Floor pool at seed so a config bump immediately lifts
          // a previously-small pool to the new baseline.
          const stored = Number(cur.pool);
          const pool = (Number.isFinite(stored) && stored > t.seed) ? stored : t.seed;
          const contrib = bet * t.contrib;
          const newPool = pool + contrib;

          if (rolledTier && rolledTier.id === t.id) {
            // TRIGGER. Winning amount includes this spin's contribution,
            // so the pool you see on the ticker is exactly what's paid.
            won = { id: t.id, label: t.label, amount: newPool };
            patch[t.id] = {
              pool:      t.seed,
              seed:      t.seed,
              lastWinner: (window.CasinoAccount && window.CasinoAccount.user && window.CasinoAccount.user()?.displayName) ||
                          (auth && auth.currentUser && auth.currentUser.displayName) ||
                          'Player',
              lastAmount: newPool,
              lastAt:    fs.serverTimestamp(),
            };
          } else {
            patch[t.id] = {
              pool:      newPool,
              seed:      t.seed,
              lastWinner: cur.lastWinner || null,
              lastAmount: Number(cur.lastAmount) || 0,
              lastAt:    cur.lastAt || null,
            };
          }
        }
        tx.set(docRef, patch, { merge: true });
        trigger = won;
      });
    } catch (e) {
      // Transaction failure (contention or rules). Surface to console
      // so misconfigurations (e.g. missing /globals/jackpots rule)
      // don't fail silently.
      console.warn('[casino-jackpots] contribute tx failed — likely Firestore rule denial. Have you republished firestore.rules with the /globals/jackpots rule?', e);
      return null;
    }

    console.debug('[casino-jackpots] contributed', { game, bet, trigger });
    if (trigger) onJackpotWin(game, trigger);
    return trigger;
  }

  // Every game shares the same localStorage key, so credit directly
  // here and let the game refresh its in-memory display on the event.
  const BALANCE_KEY = 'casino.balance';
  function creditBalanceLocal(amount) {
    try {
      const cur = parseFloat(localStorage.getItem(BALANCE_KEY));
      const base = (isNaN(cur) || cur < 0) ? 1000 : cur;
      const next = Math.round((base + amount) * 100) / 100;
      localStorage.setItem(BALANCE_KEY, String(next));
    } catch (e) {}
  }

  function onJackpotWin(game, won) {
    // 1) Credit the player's balance in shared localStorage. Every
    //    game keys off 'casino.balance' so this is universal.
    creditBalanceLocal(won.amount);

    // 2) Render celebration.
    showOverlay(won.label, won.amount);

    // 3) Notify the active game so it can refresh its in-memory
    //    balance display from the just-updated localStorage.
    const detail = { kind: won.label, amount: won.amount, game };
    try {
      document.dispatchEvent(new CustomEvent('jackpot-win', { detail }));
    } catch (e) {}

    // 4) Feed the lobby ticker + the global jackpotsHit counter via
    //    the existing History.record → CasinoStats.recordRound chain.
    //    The note carries the kind so detectJackpot picks it up.
    try {
      if (window.History && typeof window.History.record === 'function') {
        window.History.record(game, 0, won.amount, won.label + ' JACKPOT');
      }
    } catch (e) {}
  }

  // -----------------------------------------------------------
  // Bootstrap. Wait for casino-account-ready before deciding
  // whether we have a real Firestore client.
  // -----------------------------------------------------------
  // Always hook History.record ASAP so even pre-Firebase spins are
  // ready to siphon as soon as Firestore comes up.
  hookHistoryRecord();

  // Try Firestore immediately (in case casino-account.js already ran).
  tryStartFirestore();

  // Re-try whenever casino-account fires its ready event.
  document.addEventListener('casino-account-ready', tryStartFirestore);

  // Safety-net poll for the race where casino-account-ready fires
  // before CasinoStats has flipped to configured: true.
  let polls = 0;
  const pollTimer = setInterval(() => {
    tryStartFirestore();
    if (firestoreInitStarted || ++polls > 30) clearInterval(pollTimer);
  }, 500);

  // Expose for ad-hoc debugging from the devtools console.
  window.__jackpotsDebug = () => ({
    hooked,
    firestoreInitStarted,
    docRefReady: !!docRef,
    fsReady: !!fs,
    casinoStatsConfigured: !!(window.CasinoStats && window.CasinoStats.configured),
    casinoJackpotsConfigured: !!(window.CasinoJackpots && window.CasinoJackpots.configured),
    lastSnapshot,
  });
})();
