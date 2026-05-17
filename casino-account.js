/* ============================================================
   casino-account.js — accounts + global live stats
   ============================================================
   Adds two globals to every page that includes this script:
     window.CasinoAccount  — sign-in / sign-out / current user
     window.CasinoStats    — global counters + recent-jackpot feed

   Until a Firebase config is pasted below (see SETUP), both
   surfaces are present but no-op. The lobby still renders the
   LIVE FROM THE FLOOR panel — it just sits at zero.

   ------------------------------------------------------------
   SETUP (about 5 minutes):

   1. https://console.firebase.google.com/ → Add project
      ("Diamond Casino"). Disable Analytics if you don't want it.

   2. In the project, click "</>" to add a Web app. Copy the
      firebaseConfig object it shows you and paste it into
      FIREBASE_CONFIG below.

   3. Build → Authentication → Get started.
        Sign-in method tab → enable:
          Anonymous          (required — every visitor needs this)
          Email/Password
          Google
        Settings tab → Authorized domains → add the prod domain
          if you have one (localhost is already there).

   4. Build → Firestore Database → Create database
        Production mode, any region near you.
        Then the Rules tab → paste the contents of
        docs/firestore.rules and Publish.

   5. Reload the lobby. LIVE FROM THE FLOOR should start ticking
      as soon as anyone spins anything anywhere.

   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPgB-qcgcapsW3zBZ2p-6h49q_ARyu47k",
  authDomain: "spin-diamonds.firebaseapp.com",
  projectId: "spin-diamonds",
  storageBucket: "spin-diamonds.firebasestorage.app",
  messagingSenderId: "982284265566",
  appId: "1:982284265566:web:0aabaaea5a54c17c07accf",
  measurementId: "G-3JRRYRJSDR"
};

const CONFIGURED = Boolean(FIREBASE_CONFIG.projectId);

/* Random guest-tag generator. Used the first time a new anonymous
   account is created so the player has a stable display name and
   avatar attached to their session for the jackpot ticker, profile
   chip, etc. */
const GUEST_ADJ = [
  'Lucky', 'Golden', 'Silver', 'Cosmic', 'Mighty', 'Diamond', 'Wild',
  'Quick', 'Royal', 'Foxy', 'Bold', 'Sneaky', 'Brave', 'Sly', 'Crafty',
  'Jolly', 'Cool', 'Slick', 'Flashy', 'Smooth', 'Hot', 'Bright',
];
const GUEST_NOUN = [
  'Fox', 'Wolf', 'Eagle', 'Dragon', 'Tiger', 'Cobra', 'Falcon', 'Bear',
  'Lion', 'Shark', 'Hawk', 'Bull', 'Stag', 'Jaguar', 'Phoenix',
  'Panther', 'Raven', 'Viper', 'Lynx', 'Bison', 'Wolverine', 'Kraken',
];
function randomGuestTag() {
  const adj  = GUEST_ADJ[Math.floor(Math.random() * GUEST_ADJ.length)];
  const noun = GUEST_NOUN[Math.floor(Math.random() * GUEST_NOUN.length)];
  const num  = Math.floor(Math.random() * 9000 + 1000);
  return `${adj}${noun}${num}`;
}

/* ---------- Shared CSS + HTML for AccountUI (injected at runtime) ---------- */
const ACCOUNT_UI_CSS = `
  /* ---- shell theming: dark root + themed scrollbars ----
     The page backgrounds are gradients with no solid color, so iOS
     rubber-band overscroll and the area exposed when the address bar
     minimizes paint browser-default white. Forcing a solid dark on
     <html> fixes both. color-scheme:dark also hints the UA so native
     widgets pick dark variants automatically. */
  :root { color-scheme: dark; }
  html { background-color: #0a0418; }
  body { background-color: #0a0418; }

  /* Themed scrollbars — gold/violet thumb on a deep purple track,
     matching the casino's palette. Works in Firefox via scrollbar-*
     and in Chrome/Edge/Safari via ::-webkit-scrollbar pseudo-elements. */
  * { scrollbar-width: thin; scrollbar-color: rgba(255,210,74,0.45) rgba(10,4,24,0.35); }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track {
    background: rgba(10,4,24,0.35);
    border-radius: 999px;
  }
  ::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(255,210,74,0.55), rgba(168,85,247,0.55));
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(255,210,74,0.85), rgba(168,85,247,0.85));
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-corner { background: transparent; }

  /* Hide the legacy standalone history buttons — history is now an
     entry inside the profile modal. */
  .btn-history, .history-btn { display: none !important; }
  /* Hide the floating settings gear — volume controls moved into the
     profile modal so we have one canonical top-right entry point. */
  .casino-settings-btn { display: none !important; }

  /* Chip is now a 40x40 circle showing just the selected avatar,
     sitting at top:14 right:14 (the slot the settings gear used to
     occupy). The username label is rendered but hidden — keeps the
     existing renderChip() code path unchanged. */
  .cu-chip {
    position: fixed; top: 14px; right: 14px; z-index: 80;
    border: 0; cursor: pointer;
    width: 40px; height: 40px;
    border-radius: 50%; padding: 0;
    background: rgba(2,8,18,0.7);
    box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.45), 0 4px 16px rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
    display: grid; place-items: center;
    overflow: hidden;
    transition: filter 0.15s, transform 0.1s;
  }
  .cu-chip:hover { filter: brightness(1.15); }
  .cu-chip:active { transform: translateY(2px); }
  .cu-chip .cu-chip-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    display: grid; place-items: center; font-size: 18px; line-height: 1;
    background: linear-gradient(135deg,#a855f7,#ff2e93);
  }
  .cu-chip:not(.signed-in) .cu-chip-avatar {
    background: transparent; color: #ffd24a;
  }
  .cu-chip .cu-chip-label { display: none; }
  @media (max-width: 720px) {
    .cu-chip { top: 8px; right: 8px; width: 34px; height: 34px; }
    .cu-chip .cu-chip-avatar { width: 28px; height: 28px; font-size: 16px; }
  }

  .cu-veil {
    position: fixed; inset: 0; z-index: 120;
    background: rgba(5,1,15,0.78);
    backdrop-filter: blur(8px);
    display: grid; place-items: center;
    opacity: 0; pointer-events: none; transition: opacity 0.25s;
  }
  .cu-veil.show { opacity: 1; pointer-events: all; }
  .cu-card {
    width: min(460px, 94vw); max-height: 90vh; overflow-y: auto;
    padding: 26px; border-radius: 22px;
    background:
      radial-gradient(ellipse at top, rgba(255,46,147,0.20), transparent 60%),
      linear-gradient(180deg, #1c0a3a, #0a0319);
    box-shadow:
      0 30px 60px -10px rgba(0,0,0,0.7),
      0 18px 36px -18px rgba(0,0,0,0.5),
      inset 0 0 0 1.5px rgba(255,210,74,0.28);
    transform: translateY(20px) scale(0.95);
    transition: transform 0.3s cubic-bezier(.2,.9,.2,1.3);
    color: #fff; font-family: 'Outfit', sans-serif;
  }
  .cu-veil.show .cu-card { transform: translateY(0) scale(1); }
  .cu-title {
    font-family: 'Bungee', cursive;
    font-size: 22px; letter-spacing: 0.1em;
    color: #fff0a8; text-shadow: 0 0 12px rgba(255,210,74,0.5);
    text-align: center; margin-bottom: 4px;
  }
  .cu-sub {
    font-size: 12px; text-align: center;
    color: rgba(255,255,255,0.55); letter-spacing: 0.18em;
    margin-bottom: 18px;
  }
  .cu-google {
    width: 100%; padding: 12px; margin-bottom: 14px;
    border: 0; border-radius: 12px; cursor: pointer;
    font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 14px;
    color: #1f1f1f; background: #fff;
    box-shadow: 0 4px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6);
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    transition: transform 0.1s, filter 0.15s;
  }
  .cu-google:hover { filter: brightness(0.97); }
  .cu-google:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6); }
  .cu-g-mark {
    width: 18px; height: 18px; border-radius: 50%;
    background: conic-gradient(from 90deg, #4285F4 0 25%, #34A853 25% 50%, #FBBC05 50% 75%, #EA4335 75%);
  }
  .cu-or {
    font-family: 'Bungee', cursive;
    font-size: 10px; letter-spacing: 0.32em;
    color: rgba(255,255,255,0.35);
    text-align: center; margin: 6px 0 12px; position: relative;
  }
  .cu-or::before, .cu-or::after {
    content: ''; position: absolute; top: 50%;
    width: 38%; height: 1px; background: rgba(255,255,255,0.1);
  }
  .cu-or::before { left: 0; } .cu-or::after { right: 0; }
  .cu-field {
    width: 100%; padding: 12px 14px; margin-bottom: 10px;
    font-family: 'Outfit', sans-serif; font-size: 14px;
    color: #fff; border: 0; border-radius: 10px;
    background: rgba(0,0,0,0.5);
    box-shadow: inset 0 0 0 1.5px rgba(34,211,238,0.3);
    outline: none; transition: box-shadow 0.2s;
  }
  .cu-field::placeholder { color: rgba(255,255,255,0.35); }
  .cu-field:focus { box-shadow: inset 0 0 0 1.5px #22d3ee, 0 0 14px rgba(34,211,238,0.3); }
  .cu-error {
    min-height: 18px; margin: 4px 0 10px;
    font-size: 12px; color: #ff2e93; text-align: center;
  }
  .cu-actions {
    display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px;
  }
  .cu-btn {
    border: 0; padding: 14px; border-radius: 14px;
    font-family: 'Bungee', cursive; letter-spacing: 0.12em; font-size: 14px;
    cursor: pointer; transition: transform 0.1s, filter 0.15s;
  }
  .cu-btn:active { transform: translateY(2px); }
  .cu-btn-cancel {
    background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
  }
  .cu-btn-cancel:hover { color: #fff; }
  .cu-btn-confirm {
    background: linear-gradient(180deg, #5cffa1, #14b85a);
    color: #0a0418;
    box-shadow: 0 5px 0 #0a4a23, inset 0 1px 0 rgba(255,255,255,0.3);
  }
  .cu-btn-confirm:hover { filter: brightness(1.08); }
  .cu-toggle {
    margin-top: 14px; text-align: center; font-size: 12px;
    color: rgba(255,255,255,0.6);
  }
  .cu-toggle button {
    background: none; border: 0; cursor: pointer;
    color: #22d3ee; font-family: 'Bungee', cursive;
    font-size: 11px; letter-spacing: 0.16em;
    padding: 4px 6px; text-decoration: underline;
  }

  /* Profile hero */
  .cu-hero {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    margin-bottom: 18px;
  }
  .cu-hero-avatar {
    width: 84px; height: 84px; border-radius: 50%;
    display: grid; place-items: center; font-size: 44px; line-height: 1;
    background: linear-gradient(135deg,#a855f7,#ff2e93);
    box-shadow: 0 0 24px rgba(255,210,74,0.3), inset 0 0 0 3px rgba(255,255,255,0.08);
  }
  .cu-hero-name {
    font-family: 'Bungee', cursive; font-size: 18px; letter-spacing: 0.12em;
    color: #fff0a8; text-shadow: 0 0 10px rgba(255,210,74,0.5);
  }
  .cu-hero-email { font-size: 12px; color: rgba(255,255,255,0.55); }
  .cu-section-lbl {
    font-family: 'Bungee', cursive; font-size: 10px; letter-spacing: 0.28em;
    color: rgba(255,255,255,0.55); margin: 4px 0 8px;
  }
  .cu-avatar-grid {
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;
    margin-bottom: 16px;
  }
  .cu-avatar-opt {
    aspect-ratio: 1; border: 0; border-radius: 50%;
    display: grid; place-items: center; font-size: 22px; line-height: 1;
    cursor: pointer; padding: 0;
    box-shadow: inset 0 0 0 2px transparent, 0 2px 6px rgba(0,0,0,0.4);
    transition: transform 0.1s, box-shadow 0.15s;
  }
  .cu-avatar-opt:hover { transform: scale(1.08); }
  .cu-avatar-opt.selected {
    box-shadow: inset 0 0 0 3px #fff0a8, 0 0 12px rgba(255,210,74,0.55);
  }
  .cu-pstats {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
    margin-bottom: 18px;
  }
  .cu-pstat {
    padding: 10px 8px 12px; border-radius: 10px;
    background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.4));
    box-shadow: inset 0 0 0 1px rgba(255,210,74,0.18);
    text-align: center;
  }
  .cu-pstat .lbl {
    font-family: 'Bungee', cursive; font-size: 8px; letter-spacing: 0.22em;
    color: rgba(255,255,255,0.5); margin-bottom: 4px;
  }
  .cu-pstat .val {
    font-family: 'Geist Mono', monospace; font-weight: 800; font-size: 16px; color: #fff;
  }
  .cu-profile-req-note {
    padding: 10px 12px; margin-bottom: 12px;
    border-radius: 10px; font-size: 12px;
    color: #ffe27a; background: rgba(255,210,74,0.08);
    box-shadow: inset 0 0 0 1px rgba(255,210,74,0.28);
    text-align: center; line-height: 1.5;
  }
  .cu-foot-actions {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    margin-top: 12px;
  }
  .cu-foot-btn {
    padding: 12px; border: 0; border-radius: 12px; cursor: pointer;
    font-family: 'Bungee', cursive; letter-spacing: 0.16em; font-size: 12px;
    transition: filter 0.15s, transform 0.1s;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  }
  .cu-foot-btn:hover { filter: brightness(1.15); }
  .cu-foot-btn:active { transform: translateY(2px); }
  .cu-foot-history {
    color: #22d3ee;
    background: rgba(34,211,238,0.10);
    box-shadow: inset 0 0 0 1.5px rgba(34,211,238,0.45);
  }
  .cu-signout {
    color: #fff;
    background: rgba(255,46,88,0.16);
    box-shadow: inset 0 0 0 1.5px rgba(255,46,88,0.45);
  }

  /* Volume section — lives at the bottom of every modal view except
     signup. Wires straight into window.Settings so changes propagate
     to every game's audio engine through the existing onChange path. */
  .cu-vol-section {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px dashed rgba(255,210,74,0.18);
  }
  .cu-vol-block { margin-bottom: 12px; }
  .cu-vol-block:last-child { margin-bottom: 0; }
  .cu-vol-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px;
  }
  .cu-vol-name, .cu-vol-mute {
    font-family: 'Bungee', cursive; font-size: 11px; letter-spacing: 0.22em;
    color: #22d3ee; text-shadow: 0 0 6px rgba(34,211,238,0.4);
    background: none; border: 0; padding: 0; cursor: pointer;
    transition: color 0.15s;
  }
  .cu-vol-mute.muted {
    color: #ff5a7d;
    text-shadow: 0 0 6px rgba(255,90,125,0.5);
  }
  .cu-vol-mute::before { content: '🔊'; margin-right: 6px; font-size: 13px; }
  .cu-vol-mute.muted::before { content: '🔇'; }
  .cu-vol-val {
    font-family: 'Geist Mono', monospace; font-weight: 800; font-size: 13px;
    color: #fff; min-width: 30px; text-align: right;
  }
  .cu-vol-slider {
    width: 100%; height: 6px; border-radius: 999px; margin: 0; padding: 0;
    appearance: none; -webkit-appearance: none;
    background: linear-gradient(90deg, #ffd24a 0 var(--v, 50%), rgba(255,255,255,0.1) var(--v, 50%) 100%);
    cursor: pointer; outline: none;
  }
  .cu-vol-slider::-webkit-slider-thumb {
    appearance: none; -webkit-appearance: none;
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff7d1;
    border: 2px solid #ffd24a;
    box-shadow: 0 2px 4px rgba(0,0,0,0.45);
    cursor: pointer;
  }
  .cu-vol-slider::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff7d1;
    border: 2px solid #ffd24a;
    box-shadow: 0 2px 4px rgba(0,0,0,0.45);
    cursor: pointer;
  }
`;

const MODAL_HTML = `
  <div class="cu-card">
    <!-- SIGN IN -->
    <div data-view="signin">
      <div class="cu-title">SIGN IN</div>
      <div class="cu-sub">SAVE YOUR STATS · COMPETE FOR JACKPOTS</div>
      <button type="button" class="cu-google" id="cu-google"><span class="cu-g-mark"></span>CONTINUE WITH GOOGLE</button>
      <div class="cu-or">OR</div>
      <input class="cu-field" id="cu-email" type="email" placeholder="Email" autocomplete="email" />
      <input class="cu-field" id="cu-pw" type="password" placeholder="Password" autocomplete="current-password" />
      <div class="cu-error" id="cu-err-in"></div>
      <div class="cu-actions">
        <button class="cu-btn cu-btn-cancel" id="cu-cancel-in" type="button">CANCEL</button>
        <button class="cu-btn cu-btn-confirm" id="cu-do-signin" type="button">SIGN IN</button>
      </div>
      <div class="cu-toggle">New here? <button id="cu-go-signup" type="button">CREATE ACCOUNT</button></div>
    </div>

    <!-- SIGN UP -->
    <div data-view="signup" style="display:none">
      <div class="cu-title">CREATE ACCOUNT</div>
      <div class="cu-sub">JOIN THE FLOOR · CLAIM A NAME</div>
      <button type="button" class="cu-google" id="cu-google-up"><span class="cu-g-mark"></span>CONTINUE WITH GOOGLE</button>
      <div class="cu-or">OR</div>
      <input class="cu-field" id="cu-name-up" type="text" placeholder="Username" autocomplete="username" maxlength="24" />
      <input class="cu-field" id="cu-email-up" type="email" placeholder="Email" autocomplete="email" />
      <input class="cu-field" id="cu-pw-up" type="password" placeholder="Password (min 6 chars)" autocomplete="new-password" />
      <div class="cu-error" id="cu-err-up"></div>
      <div class="cu-actions">
        <button class="cu-btn cu-btn-cancel" id="cu-cancel-up" type="button">CANCEL</button>
        <button class="cu-btn cu-btn-confirm" id="cu-do-signup" type="button">SIGN UP</button>
      </div>
      <div class="cu-toggle">Already have an account? <button id="cu-go-signin" type="button">SIGN IN</button></div>
    </div>

    <!-- PROFILE (and PROFILE-REQUIRED) -->
    <div data-view="profile" style="display:none">
      <div class="cu-hero">
        <div class="cu-hero-avatar">🎰</div>
        <div class="cu-hero-name">PLAYER</div>
        <div class="cu-hero-email"></div>
      </div>
      <div class="cu-profile-req-note">Pick a username and avatar to finish setting up your account.</div>
      <div class="cu-section-lbl">YOUR STATS</div>
      <div class="cu-pstats">
        <div class="cu-pstat"><div class="lbl">YOUR BETS</div><div class="val" id="cu-ps-bets">0</div></div>
        <div class="cu-pstat"><div class="lbl">YOUR WAGERED</div><div class="val" id="cu-ps-wagered">$0</div></div>
        <div class="cu-pstat"><div class="lbl">YOU WON</div><div class="val" id="cu-ps-won">$0</div></div>
        <div class="cu-pstat"><div class="lbl">JACKPOTS</div><div class="val" id="cu-ps-jp">0</div></div>
      </div>
      <div class="cu-section-lbl">USERNAME</div>
      <input class="cu-field" id="cu-username" type="text" placeholder="Pick a name (max 24)" maxlength="24" />
      <div class="cu-section-lbl">AVATAR</div>
      <div class="cu-avatar-grid" id="cu-avatar-grid"></div>
      <div class="cu-error" id="cu-err-pr"></div>
      <div class="cu-actions">
        <button class="cu-btn cu-btn-cancel" id="cu-profile-cancel" type="button">CANCEL</button>
        <button class="cu-btn cu-btn-confirm" id="cu-profile-save" type="button">SAVE</button>
      </div>
      <div class="cu-foot-actions">
        <button class="cu-foot-btn cu-foot-history" id="cu-open-history" type="button">⌛ VIEW HISTORY</button>
        <button class="cu-foot-btn cu-signout" id="cu-signout" type="button">SIGN OUT</button>
      </div>
    </div>

    <!-- Volume controls live at the bottom of the modal regardless of
         view (except signup, hidden by renderModal). Bound to the
         shared window.Settings API from casino-audio.js. -->
    <div class="cu-vol-section">
      <div class="cu-section-lbl">VOLUME</div>
      <div class="cu-vol-block">
        <div class="cu-vol-head">
          <span class="cu-vol-name">MASTER</span>
          <span class="cu-vol-val" data-val="master">70</span>
        </div>
        <input class="cu-vol-slider" type="range" min="0" max="100" data-key="master" />
      </div>
      <div class="cu-vol-block">
        <div class="cu-vol-head">
          <button class="cu-vol-mute" data-mute="muteMusic" type="button">MUSIC</button>
          <span class="cu-vol-val" data-val="music">55</span>
        </div>
        <input class="cu-vol-slider" type="range" min="0" max="100" data-key="music" />
      </div>
      <div class="cu-vol-block">
        <div class="cu-vol-head">
          <button class="cu-vol-mute" data-mute="muteSfx" type="button">SFX</button>
          <span class="cu-vol-val" data-val="sfx">85</span>
        </div>
        <input class="cu-vol-slider" type="range" min="0" max="100" data-key="sfx" />
      </div>
    </div>
  </div>
`;

/* ---------- no-op stubs (used until Firebase is wired) ---------- */
const ZERO_STATS = {
  totalSpins: 0, totalWagered: 0, totalWon: 0,
  jackpotsHit: 0, totalJackpotPaid: 0,
};

window.CasinoStats = {
  configured: false,
  recordRound() {},
  subscribe(fn) { try { fn(ZERO_STATS); } catch (e) {} return () => {}; },
  subscribeJackpots(fn) { try { fn([]); } catch (e) {} return () => {}; },
};

window.RocketLive = {
  configured: false,
  playerLabel: () => 'Player',
  syncClock() { return Promise.resolve(0); },
  subscribeCashouts(roundId, fn) { try { fn([]); } catch (e) {} return () => {}; },
  recordCashout() { return Promise.resolve(); },
};

window.CasinoAccount = {
  configured: false,
  onAuthChange(fn) { try { fn(null); } catch (e) {} },
  user: () => null,
  signInGoogle: () => Promise.reject(new Error('Firebase not configured')),
  signInEmail:  () => Promise.reject(new Error('Firebase not configured')),
  signUpEmail:  () => Promise.reject(new Error('Firebase not configured')),
  signOut:      () => Promise.resolve(),
};

if (!CONFIGURED) {
  queueMicrotask(() => {
    document.dispatchEvent(new CustomEvent('casino-account-ready'));
  });
} else {
  /* ---------- real implementation ---------- */
  (async () => {
    const FB = 'https://www.gstatic.com/firebasejs/10.13.2';
    let initFailed = null;
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${FB}/firebase-app.js`),
        import(`${FB}/firebase-auth.js`),
        import(`${FB}/firebase-firestore.js`),
      ]);
      const { initializeApp } = appMod;
      const {
        getAuth, onAuthStateChanged, signInAnonymously,
        GoogleAuthProvider, signInWithPopup,
        createUserWithEmailAndPassword, signInWithEmailAndPassword,
        signOut, updateProfile,
        setPersistence, browserLocalPersistence, indexedDBLocalPersistence,
      } = authMod;
      const {
        getFirestore, doc, getDoc, setDoc, onSnapshot, increment, serverTimestamp,
        collection, query, orderBy, limit, addDoc,
      } = fsMod;

      const app  = initializeApp(FIREBASE_CONFIG);
      const auth = getAuth(app);
      const db   = getFirestore(app);

      // Explicit local persistence (insurance). Default is already
      // browser-local on the web SDK, but some browsers/contexts fall
      // back to in-memory which would log the user out on every nav.
      // Prefer IndexedDB; localStorage as fallback if IDB is unavailable.
      try {
        await setPersistence(auth, indexedDBLocalPersistence);
      } catch (e) {
        try { await setPersistence(auth, browserLocalPersistence); } catch (e2) {}
      }

      let currentUser = null;
      let didAnonFallback = false;
      const authListeners = [];
      onAuthStateChanged(auth, u => {
        // First emission represents the persisted auth state (Firebase
        // delays it until IndexedDB has been read). If there's no user,
        // start an anonymous session so writes work without a sign-in.
        // Crucially, we DO NOT call signInAnonymously() unconditionally —
        // doing so would replace a real (Google/Email) session with a
        // fresh anon user on every page navigation.
        if (!u && !didAnonFallback) {
          didAnonFallback = true;
          signInAnonymously(auth).catch(() => {});
          return; // wait for the next emission carrying the new anon user
        }
        currentUser = u;
        if (u && !u.isAnonymous) {
          // Read first so we can backfill a default username for accounts
          // that don't have one yet (e.g. fresh Google sign-ins, legacy
          // email accounts). Auto-filling prevents the profile modal from
          // auto-popping on every page nav — players can still edit via
          // the chip whenever they want.
          const uref = doc(db, 'users', u.uid);
          const fallback = (u.displayName || (u.email ? u.email.split('@')[0] : 'Player')).trim().slice(0, 24);
          const baseFields = {
            displayName: u.displayName || fallback || 'Player',
            photoURL: u.photoURL || null,
            lastSeen: serverTimestamp(),
          };
          getDoc(uref).then(snap => {
            const existing = snap.exists() ? snap.data() : {};
            const patch = { ...baseFields };
            if (!existing.username && fallback) patch.username = fallback;
            setDoc(uref, patch, { merge: true }).catch(() => {});
          }).catch(() => {
            setDoc(uref, baseFields, { merge: true }).catch(() => {});
          });
        } else if (u && u.isAnonymous) {
          // First time as this anonymous UID? Assign a stable guest tag
          // + random avatar so jackpot ticker, chip, and history show a
          // consistent identity for the rest of their session. Firebase
          // keeps the anon UID in IndexedDB so a returning visitor on
          // the same browser reuses the same tag — they only get a new
          // one if they explicitly sign out or clear storage.
          const uref = doc(db, 'users', u.uid);
          getDoc(uref).then(snap => {
            const existing = snap.exists() ? snap.data() : {};
            if (!existing.username) {
              const tag = randomGuestTag();
              const avatar = randomAvatarId();
              setDoc(uref, {
                username: tag,
                avatar,
                displayName: tag,
                anonymous: true,
                lastSeen: serverTimestamp(),
              }, { merge: true }).catch(() => {});
              // Mirror the tag onto the Firebase user so playerLabel()
              // (used by the jackpot ticker) picks it up immediately.
              updateProfile(u, { displayName: tag }).catch(() => {});
            } else {
              setDoc(uref, { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
              if (!u.displayName && existing.username) {
                updateProfile(u, { displayName: existing.username }).catch(() => {});
              }
            }
          }).catch(() => {});
        }
        authListeners.forEach(fn => { try { fn(u); } catch (e) {} });
      });

      const globalsRef = doc(db, 'globals', 'stats');

      function detectJackpot(note, gross) {
        if (!note || !gross) return null;
        const N = String(note).toUpperCase();
        if (N.includes('GRAND'))   return { kind: 'GRAND',   amount: gross };
        if (N.includes('MAJOR'))   return { kind: 'MAJOR',   amount: gross };
        if (N.includes('MINOR'))   return { kind: 'MINOR',   amount: gross };
        if (N.includes('MINI'))    return { kind: 'MINI',    amount: gross };
        if (N.includes('JACKPOT')) return { kind: 'JACKPOT', amount: gross };
        return null;
      }

      function playerLabel(u) {
        if (!u) return 'Anonymous';
        if (u.displayName) return u.displayName;
        if (u.email) return u.email.split('@')[0];
        return u.isAnonymous ? 'Anonymous' : 'Player';
      }

      function recordRound({ game, bet, win, note }) {
        bet = Number(bet) || 0;
        win = Number(win) || 0;
        if (bet <= 0 && win === 0) return;
        const gross   = Math.max(0, bet + win);
        const jackpot = detectJackpot(note, gross);

        const patch = {
          totalSpins:   increment(1),
          totalWagered: increment(bet),
          totalWon:     increment(gross),
          updatedAt:    serverTimestamp(),
        };
        if (jackpot) {
          patch.jackpotsHit      = increment(1);
          patch.totalJackpotPaid = increment(jackpot.amount);
        }
        setDoc(globalsRef, patch, { merge: true }).catch(() => {});

        if (currentUser) {
          const upatch = {
            totalSpins:   increment(1),
            totalWagered: increment(bet),
            totalWon:     increment(gross),
            netResult:    increment(win),
            lastSeen:     serverTimestamp(),
          };
          if (jackpot) upatch.jackpotsHit = increment(1);
          setDoc(doc(db, 'users', currentUser.uid), upatch, { merge: true }).catch(() => {});
        }

        if (jackpot) {
          addDoc(collection(db, 'recentJackpots'), {
            game:      String(game || 'unknown'),
            kind:      jackpot.kind,
            amount:    jackpot.amount,
            player:    playerLabel(currentUser),
            uid:       currentUser?.uid || null,
            anonymous: !!currentUser?.isAnonymous,
            ts:        serverTimestamp(),
          }).catch(() => {});
        }
      }

      function subscribe(fn) {
        return onSnapshot(globalsRef, snap => {
          const d = snap.data() || {};
          fn({
            totalSpins:       d.totalSpins       || 0,
            totalWagered:     d.totalWagered     || 0,
            totalWon:         d.totalWon         || 0,
            jackpotsHit:      d.jackpotsHit      || 0,
            totalJackpotPaid: d.totalJackpotPaid || 0,
          });
        }, () => {});
      }

      function subscribeJackpots(fn, n = 8) {
        const q = query(collection(db, 'recentJackpots'), orderBy('ts', 'desc'), limit(n));
        return onSnapshot(q, snap => {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          fn(list);
        }, () => {});
      }

      function subscribeRocketCashouts(roundId, fn, n = 80) {
        const rid = String(roundId || '');
        if (!rid) { try { fn([]); } catch (e) {} return () => {}; }
        const q = query(collection(db, 'rocketRoundCashouts', rid, 'cashouts'), orderBy('ts', 'desc'), limit(n));
        return onSnapshot(q, snap => {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          fn(list);
        }, () => {});
      }

      function waitForCurrentUser(timeout = 5000) {
        if (currentUser) return Promise.resolve(currentUser);
        return new Promise(resolve => {
          let done = false;
          const off = onAuthStateChanged(auth, u => {
            if (done || !u) return;
            done = true;
            try { off(); } catch (e) {}
            resolve(u);
          });
          setTimeout(() => {
            if (done) return;
            done = true;
            try { off(); } catch (e) {}
            resolve(null);
          }, timeout);
        });
      }

      async function syncRocketClock() {
        const u = await waitForCurrentUser();
        if (!u) return 0;
        const ref = doc(db, 'rocketClock', u.uid);
        const sentAt = Date.now();
        await setDoc(ref, { ts: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
        return new Promise(resolve => {
          let done = false;
          let off = () => {};
          const finish = (offset) => {
            if (done) return;
            done = true;
            try { off(); } catch (e) {}
            resolve(Number.isFinite(offset) ? offset : 0);
          };
          off = onSnapshot(ref, snap => {
            const d = snap.data() || {};
            if (!d.ts || typeof d.ts.toMillis !== 'function') return;
            const receivedAt = Date.now();
            const midpoint = sentAt + (receivedAt - sentAt) / 2;
            finish(d.ts.toMillis() - midpoint);
          }, () => finish(0));
          setTimeout(() => finish(0), 5000);
        });
      }

      function recordRocketCashout(data) {
        data = data || {};
        const roundId = String(data.roundId || '');
        if (!roundId) return Promise.resolve();
        const bet = Number(data.bet) || 0;
        const payout = Number(data.payout) || 0;
        const multiplier = Number(data.multiplier) || 0;
        if (bet <= 0 || payout <= 0 || multiplier <= 0) return Promise.resolve();
        if (!currentUser) {
          return waitForCurrentUser().then(u => u ? recordRocketCashout(data) : undefined);
        }
        return addDoc(collection(db, 'rocketRoundCashouts', roundId, 'cashouts'), {
          roundId,
          bet,
          payout,
          multiplier,
          player: playerLabel(currentUser),
          uid: currentUser?.uid || null,
          anonymous: !!currentUser?.isAnonymous,
          ts: serverTimestamp(),
        }).catch(() => {});
      }

      window.CasinoStats = {
        configured: true,
        recordRound,
        subscribe,
        subscribeJackpots,
      };

      window.RocketLive = {
        configured: true,
        playerLabel: () => playerLabel(currentUser),
        syncClock: syncRocketClock,
        subscribeCashouts: subscribeRocketCashouts,
        recordCashout: recordRocketCashout,
      };

      function subscribeUserDoc(uid, fn) {
        if (!uid) { try { fn({}); } catch (e) {} return () => {}; }
        return onSnapshot(doc(db, 'users', uid), snap => {
          fn(snap.data() || {});
        }, () => {});
      }
      async function saveProfile({ username, avatar }) {
        if (!currentUser) throw new Error('Not signed in');
        if (currentUser.isAnonymous) throw new Error('Sign in to save a profile');
        const patch = { lastSeen: serverTimestamp() };
        if (typeof username === 'string') {
          const u = username.trim().slice(0, 24);
          if (!u) throw new Error('Username is required');
          patch.username = u;
          try { await updateProfile(currentUser, { displayName: u }); } catch (e) {}
        }
        if (typeof avatar === 'string') patch.avatar = avatar.slice(0, 8);
        await setDoc(doc(db, 'users', currentUser.uid), patch, { merge: true });
      }

      window.CasinoAccount = {
        configured: true,
        onAuthChange(fn) {
          authListeners.push(fn);
          try { fn(currentUser); } catch (e) {}
        },
        user: () => currentUser,
        subscribeUserDoc,
        saveProfile,
        signInGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
        signInEmail:  (email, pw) => signInWithEmailAndPassword(auth, email, pw),
        signUpEmail:  async (email, pw, displayName) => {
          const cred = await createUserWithEmailAndPassword(auth, email, pw);
          if (displayName) {
            try { await updateProfile(cred.user, { displayName }); } catch (e) {}
            try {
              await setDoc(doc(db, 'users', cred.user.uid), {
                username: displayName.trim().slice(0, 24),
                displayName,
                lastSeen: serverTimestamp(),
              }, { merge: true });
            } catch (e) {}
          }
          return cred;
        },
        signOut: async () => {
          // Blank slate on sign-out: reset chip balance + clear the
          // local history log, then sign Firebase out and full-reload.
          // The reload guarantees every game widget, balance pill,
          // history modal, and account chip paints from $1000 with a
          // fresh guest tag.
          try { localStorage.setItem('casino.balance', '1000'); } catch (e) {}
          try { localStorage.removeItem('casino.history'); } catch (e) {}
          try { await signOut(auth); } catch (e) {}
          location.reload();
        },
      };

      /* ============================================================
         AccountUI — chip + profile modal injected on every page.
         Auto-mounts on DOMContentLoaded. Stays out of the way of
         existing top chrome by positioning fixed at top-right,
         offset left of the settings gear.
         ============================================================ */
      const AVATARS = [
        { id: '🎰', grad: 'linear-gradient(135deg,#ff2e93,#a855f7)' },
        { id: '💎', grad: 'linear-gradient(135deg,#22d3ee,#a855f7)' },
        { id: '👑', grad: 'linear-gradient(135deg,#ffd24a,#b8860b)' },
        { id: '🔥', grad: 'linear-gradient(135deg,#ffb04a,#c41a4d)' },
        { id: '⭐', grad: 'linear-gradient(135deg,#fff7d1,#ffd24a)' },
        { id: '🐙', grad: 'linear-gradient(135deg,#ff2e58,#6a3aaf)' },
        { id: '🎲', grad: 'linear-gradient(135deg,#fff7d1,#999)' },
        { id: '🍀', grad: 'linear-gradient(135deg,#7cffa1,#1b6e3a)' },
        { id: '♠',  grad: 'linear-gradient(135deg,#2a2a2a,#0a0a0a)' },
        { id: '♥',  grad: 'linear-gradient(135deg,#ff7799,#a30033)' },
        { id: '♦',  grad: 'linear-gradient(135deg,#ff9966,#a3441a)' },
        { id: '♣',  grad: 'linear-gradient(135deg,#5cffa1,#0a6e3a)' },
        { id: '🃏', grad: 'linear-gradient(135deg,#fff,#888)' },
        { id: '🚀', grad: 'linear-gradient(135deg,#ff2e58,#ffd24a)' },
      ];
      function avatarLookup(id) {
        return AVATARS.find(a => a.id === id) || AVATARS[0];
      }
      function randomAvatarId() {
        return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
      }

      let uiState = {
        view: 'signin',   // signin | signup | profile | profile-required
        userDoc: {},      // last Firestore users/{uid} snapshot
        userDocUnsub: null,
        chosenAvatar: '🎰',
      };

      function mountAccountUI() {
        const cssId = 'casino-account-ui-css';
        if (!document.getElementById(cssId)) {
          const style = document.createElement('style');
          style.id = cssId;
          style.textContent = ACCOUNT_UI_CSS;
          document.head.appendChild(style);
        }

        // Inject chip
        if (!document.getElementById('cu-chip')) {
          const chip = document.createElement('button');
          chip.id = 'cu-chip';
          chip.className = 'cu-chip';
          chip.title = 'Account';
          chip.type = 'button';
          chip.innerHTML = `<span class="cu-chip-avatar" id="cu-chip-av">◆</span><span class="cu-chip-label" id="cu-chip-lbl">SIGN IN</span>`;
          chip.addEventListener('click', () => openModal());
          document.body.appendChild(chip);
        }

        // Inject modal
        if (!document.getElementById('cu-veil')) {
          const veil = document.createElement('div');
          veil.id = 'cu-veil';
          veil.className = 'cu-veil';
          veil.innerHTML = MODAL_HTML;
          document.body.appendChild(veil);
          wireModal(veil);
        }

        renderChip();
        renderModal();

        // Subscribe to per-user firestore doc, refresh UI on changes.
        authListeners.push(u => {
          if (uiState.userDocUnsub) { try { uiState.userDocUnsub(); } catch (e) {} uiState.userDocUnsub = null; }
          uiState.userDoc = {};
          if (u && !u.isAnonymous) {
            uiState.userDocUnsub = subscribeUserDoc(u.uid, data => {
              uiState.userDoc = data || {};
              renderChip();
              renderModal();
            });
          } else {
            renderChip();
            renderModal();
          }
        });
      }

      function openModal(view) {
        // Defensive: if called as an event handler, view will be the
        // MouseEvent. Ignore anything that isn't one of our view keys.
        const valid = view === 'signin' || view === 'signup' || view === 'profile';
        if (valid) {
          uiState.view = view;
        } else if (currentUser && !currentUser.isAnonymous) {
          uiState.view = 'profile';
        } else {
          uiState.view = 'signin';
        }
        renderModal();
        document.getElementById('cu-veil').classList.add('show');
      }
      function closeModal() {
        document.getElementById('cu-veil').classList.remove('show');
      }

      function renderChip() {
        const av  = document.getElementById('cu-chip-av');
        const lbl = document.getElementById('cu-chip-lbl');
        const chip = document.getElementById('cu-chip');
        if (!chip) return;
        // No user at all (Firebase init failed / pre-auth) — show the
        // generic SIGN IN affordance.
        if (!currentUser) {
          chip.classList.remove('signed-in');
          av.textContent = '◆';
          av.style.background = '';
          lbl.textContent = 'SIGN IN';
          return;
        }
        // Both anonymous guests (with assigned tag/avatar) and real
        // users render the same way — the avatar circle IS the chip,
        // and the underlying tag is consistent across the session.
        chip.classList.add('signed-in');
        const username = uiState.userDoc.username || currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Player');
        const avatar = avatarLookup(uiState.userDoc.avatar);
        av.textContent = avatar.id;
        av.style.background = avatar.grad;
        lbl.textContent = username.toUpperCase();
      }

      function renderModal() {
        const veil = document.getElementById('cu-veil');
        if (!veil) return;
        veil.dataset.view = uiState.view;
        // profile-required reuses the profile DOM; renderProfileView flips chrome.
        const viewKey = uiState.view === 'profile-required' ? 'profile' : uiState.view;
        veil.querySelectorAll('[data-view]').forEach(el => { el.style.display = 'none'; });
        const active = veil.querySelector(`[data-view="${viewKey}"]`);
        if (active) active.style.display = '';
        if (viewKey === 'profile') renderProfileView(veil);
        // Volume section shows for signin and profile, hides during signup
        // to keep the create-account flow focused.
        const volSection = veil.querySelector('.cu-vol-section');
        if (volSection) volSection.style.display = viewKey === 'signup' ? 'none' : 'block';
        syncVolumeUI(veil);
      }

      function syncVolumeUI(veil) {
        if (!window.Settings || typeof window.Settings.get !== 'function') return;
        const s = window.Settings.get();
        ['master', 'music', 'sfx'].forEach(k => {
          const pct = Math.round((Number(s[k]) || 0) * 100);
          const slider = veil.querySelector(`[data-key="${k}"]`);
          if (slider && document.activeElement !== slider) {
            slider.value = pct;
            slider.style.setProperty('--v', pct + '%');
          } else if (slider) {
            slider.style.setProperty('--v', slider.value + '%');
          }
          const display = veil.querySelector(`[data-val="${k}"]`);
          if (display) display.textContent = pct;
        });
        const mMusic = veil.querySelector('[data-mute="muteMusic"]');
        if (mMusic) mMusic.classList.toggle('muted', !!s.muteMusic);
        const mSfx = veil.querySelector('[data-mute="muteSfx"]');
        if (mSfx) mSfx.classList.toggle('muted', !!s.muteSfx);
      }

      function renderProfileView(veil) {
        // Header
        const username = uiState.userDoc.username || currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'Player');
        const avatarId = uiState.userDoc.avatar || uiState.chosenAvatar || '🎰';
        uiState.chosenAvatar = avatarId;
        const av = avatarLookup(avatarId);

        const heroAv = veil.querySelector('.cu-hero-avatar');
        if (heroAv) {
          heroAv.textContent = av.id;
          heroAv.style.background = av.grad;
        }
        const heroName = veil.querySelector('.cu-hero-name');
        if (heroName) heroName.textContent = (uiState.userDoc.username || username).toUpperCase();
        const heroEmail = veil.querySelector('.cu-hero-email');
        if (heroEmail) heroEmail.textContent = currentUser?.email || '';

        // Username input
        const nameIn = veil.querySelector('#cu-username');
        if (nameIn && document.activeElement !== nameIn) {
          nameIn.value = uiState.userDoc.username || (currentUser?.displayName || '');
        }

        // Avatar grid
        const grid = veil.querySelector('#cu-avatar-grid');
        if (grid) {
          grid.innerHTML = AVATARS.map(a =>
            `<button type="button" class="cu-avatar-opt ${a.id === uiState.chosenAvatar ? 'selected' : ''}" data-avatar="${a.id}" style="background:${a.grad}">${a.id}</button>`
          ).join('');
          grid.querySelectorAll('.cu-avatar-opt').forEach(btn => {
            btn.addEventListener('click', () => {
              uiState.chosenAvatar = btn.dataset.avatar;
              grid.querySelectorAll('.cu-avatar-opt').forEach(b => b.classList.toggle('selected', b === btn));
              if (heroAv) {
                const a = avatarLookup(uiState.chosenAvatar);
                heroAv.textContent = a.id;
                heroAv.style.background = a.grad;
              }
            });
          });
        }

        // Personal stats
        const d = uiState.userDoc;
        veil.querySelector('#cu-ps-bets')   .textContent = fmtCount(d.totalSpins   || 0);
        veil.querySelector('#cu-ps-wagered').textContent = fmtMoney(d.totalWagered || 0);
        veil.querySelector('#cu-ps-won')    .textContent = fmtMoney(d.totalWon     || 0);
        veil.querySelector('#cu-ps-jp')     .textContent = fmtCount(d.jackpotsHit  || 0);

        // Profile is always dismissable now; the required-prompt note
        // stays hidden because we auto-fill a default username on sign-in.
        const reqNote = veil.querySelector('.cu-profile-req-note');
        if (reqNote) reqNote.style.display = 'none';
      }

      function fmtCount(n) { return Math.floor(n).toLocaleString('en-US'); }
      function fmtMoney(n) {
        const v = Math.floor(n);
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
        return '$' + v.toLocaleString('en-US');
      }

      function wireModal(veil) {
        const $ = sel => veil.querySelector(sel);
        const setErr = (id, msg) => { const el = $(id); if (el) el.textContent = msg || ''; };
        const readableErr = e => {
          const c = e?.code || '';
          if (c.includes('invalid-email'))         return 'That email looks invalid.';
          if (c.includes('email-already-in-use'))  return 'Email already in use.';
          if (c.includes('weak-password'))         return 'Password too weak (min 6 chars).';
          if (c.includes('user-not-found'))        return 'No account with that email.';
          if (c.includes('wrong-password'))        return 'Wrong password.';
          if (c.includes('invalid-credential'))    return 'Wrong email or password.';
          if (c.includes('popup-blocked'))         return 'Popup was blocked.';
          if (c.includes('popup-closed-by-user'))  return '';
          if (c.includes('network-request-failed')) return 'Network error.';
          return e?.message || 'Something went wrong.';
        };

        veil.addEventListener('click', e => { if (e.target === veil) closeModal(); });

        // Sign-in view
        $('#cu-google').addEventListener('click', async () => {
          setErr('#cu-err-in', '');
          try { await window.CasinoAccount.signInGoogle(); } catch (e) { setErr('#cu-err-in', readableErr(e)); }
        });
        $('#cu-do-signin').addEventListener('click', async () => {
          setErr('#cu-err-in', '');
          const email = $('#cu-email').value.trim();
          const pw = $('#cu-pw').value;
          if (!email || !pw) return setErr('#cu-err-in', 'Email and password required.');
          try { await window.CasinoAccount.signInEmail(email, pw); } catch (e) { setErr('#cu-err-in', readableErr(e)); }
        });
        $('#cu-go-signup').addEventListener('click', () => { uiState.view = 'signup'; renderModal(); });
        $('#cu-cancel-in').addEventListener('click', closeModal);
        [$('#cu-email'), $('#cu-pw')].forEach(inp => inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') $('#cu-do-signin').click();
          if (e.key === 'Escape') closeModal();
        }));

        // Sign-up view
        $('#cu-google-up').addEventListener('click', async () => {
          setErr('#cu-err-up', '');
          try { await window.CasinoAccount.signInGoogle(); } catch (e) { setErr('#cu-err-up', readableErr(e)); }
        });
        $('#cu-do-signup').addEventListener('click', async () => {
          setErr('#cu-err-up', '');
          const email = $('#cu-email-up').value.trim();
          const pw = $('#cu-pw-up').value;
          const name = $('#cu-name-up').value.trim();
          if (!name) return setErr('#cu-err-up', 'Pick a username (you can change it later).');
          if (!email || !pw) return setErr('#cu-err-up', 'Email and password required.');
          try { await window.CasinoAccount.signUpEmail(email, pw, name); } catch (e) { setErr('#cu-err-up', readableErr(e)); }
        });
        $('#cu-go-signin').addEventListener('click', () => { uiState.view = 'signin'; renderModal(); });
        $('#cu-cancel-up').addEventListener('click', closeModal);
        [$('#cu-name-up'), $('#cu-email-up'), $('#cu-pw-up')].forEach(inp => inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') $('#cu-do-signup').click();
          if (e.key === 'Escape') closeModal();
        }));

        // Profile view
        $('#cu-profile-save').addEventListener('click', async () => {
          setErr('#cu-err-pr', '');
          const username = $('#cu-username').value.trim();
          if (!username) return setErr('#cu-err-pr', 'Username is required.');
          try {
            await window.CasinoAccount.saveProfile({ username, avatar: uiState.chosenAvatar });
            if (uiState.view === 'profile-required') uiState.view = 'profile';
            closeModal();
          } catch (e) { setErr('#cu-err-pr', readableErr(e)); }
        });
        $('#cu-profile-cancel').addEventListener('click', closeModal);
        $('#cu-open-history').addEventListener('click', () => {
          closeModal();
          // Defer so closeModal's transition can start before HistoryUI's veil layers.
          setTimeout(() => {
            if (window.HistoryUI && typeof window.HistoryUI.open === 'function') {
              window.HistoryUI.open({ scope: 'all', game: null });
            }
          }, 100);
        });
        $('#cu-signout').addEventListener('click', async () => {
          try { await window.CasinoAccount.signOut(); } catch (e) {}
          uiState.view = 'signin';
          closeModal();
        });
        $('#cu-username').addEventListener('keydown', e => {
          if (e.key === 'Enter') $('#cu-profile-save').click();
          if (e.key === 'Escape' && uiState.view !== 'profile-required') closeModal();
        });

        // Volume sliders + mute toggles, wired to the shared window.Settings.
        veil.querySelectorAll('.cu-vol-slider').forEach(slider => {
          slider.addEventListener('input', () => {
            if (!window.Settings || typeof window.Settings.set !== 'function') return;
            const key = slider.dataset.key;
            const pct = parseInt(slider.value, 10) || 0;
            slider.style.setProperty('--v', pct + '%');
            window.Settings.set({ [key]: pct / 100 });
            const display = veil.querySelector(`[data-val="${key}"]`);
            if (display) display.textContent = pct;
          });
        });
        veil.querySelectorAll('.cu-vol-mute').forEach(btn => {
          btn.addEventListener('click', () => {
            if (!window.Settings || typeof window.Settings.set !== 'function') return;
            const muteKey = btn.dataset.mute;
            const cur = window.Settings.get()[muteKey];
            window.Settings.set({ [muteKey]: !cur });
            btn.classList.toggle('muted', !cur);
          });
        });
      }

      // Auto-mount when DOM is ready.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountAccountUI, { once: true });
      } else {
        mountAccountUI();
      }
      window.AccountUI = { open: openModal, close: closeModal };
    } catch (e) {
      initFailed = e;
      console.warn('[casino-account] init failed; staying in offline/no-op mode:', e);
    } finally {
      document.dispatchEvent(new CustomEvent('casino-account-ready', { detail: { ok: !initFailed } }));
    }
  })();
}
