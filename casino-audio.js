/* ============================================================
   casino-audio.js — shared Settings + Music + Settings UI
   ============================================================
   Loaded by all four pages. Persists user audio preferences
   across games via localStorage key 'casino.settings'.

   Public surface:
     Settings.get() / set(patch) / onChange(fn)
     Settings.musicVolume()  → 0..1
     Settings.sfxVolume()    → 0..1   (each game's Audio engine
                                       multiplies its master gain
                                       by this)
     Music.init(src)         → load a track for this page
     Music.start()           → attempt to play (no-op if not init
                               or if browser hasn't unlocked yet)
     SettingsUI.mount({ openBtn })
                             → injects the modal once and wires
                               the gear button to open it
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- SETTINGS ---------- */
  const SETTINGS_KEY = 'casino.settings';
  const defaults = {
    master: 0.7,
    music: 0.55,
    sfx: 0.85,
    muteMusic: false,
    muteSfx: false,
  };
  let state = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    state = { ...defaults, ...saved };
  } catch (e) {}

  const listeners = [];
  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function notify() {
    listeners.forEach(fn => { try { fn(state); } catch (e) {} });
  }
  const Settings = {
    get() { return { ...state }; },
    set(patch) {
      state = { ...state, ...patch };
      save();
      notify();
    },
    onChange(fn) { listeners.push(fn); },
    musicVolume() { return state.muteMusic ? 0 : state.master * state.music; },
    sfxVolume()   { return state.muteSfx   ? 0 : state.master * state.sfx; },
  };

  /* ---------- MUSIC PLAYER ---------- */
  let audioEl = null;
  let started = false;
  let pendingSrc = null;

  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = document.createElement('audio');
    audioEl.loop = true;
    audioEl.preload = 'auto';
    audioEl.volume = Settings.musicVolume();
    audioEl.style.display = 'none';
    if (document.body) document.body.appendChild(audioEl);
    return audioEl;
  }

  function tryStart() {
    if (!audioEl || !pendingSrc || started) return;
    if (Settings.get().muteMusic) return;   // don't fight a user who has it muted
    const p = audioEl.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { started = true; }).catch(() => { /* will retry on next gesture */ });
    } else {
      started = true;
    }
  }

  const Music = {
    init(src) {
      pendingSrc = src;
      ensureAudioEl();
      audioEl.src = src;
      audioEl.volume = Settings.musicVolume();
    },
    start() { tryStart(); },
    isStarted() { return started; },
    pause() {
      if (audioEl) audioEl.pause();
      started = false;
    },
  };

  // Auto-start on any user gesture (browsers require this)
  function gestureUnlock() {
    tryStart();
  }
  document.addEventListener('click', gestureUnlock, { capture: true });
  document.addEventListener('keydown', gestureUnlock, { capture: true });
  document.addEventListener('touchstart', gestureUnlock, { capture: true, passive: true });

  // Settings changes update the music volume in real time and
  // pause/resume the track when mute state flips.
  Settings.onChange((s) => {
    if (!audioEl) return;
    audioEl.volume = Settings.musicVolume();
    if (s.muteMusic) {
      if (started) { audioEl.pause(); started = false; }
    } else {
      if (!started) tryStart();
    }
  });

  /* ---------- SETTINGS UI (modal) ---------- */
  let mounted = false;
  function mount(opts = {}) {
    if (mounted) return;
    mounted = true;

    // Inject CSS once
    const css = document.createElement('style');
    css.textContent = `
      .casino-settings-veil {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(2,4,12,0.78);
        backdrop-filter: blur(8px);
        display: grid; place-items: center;
        opacity: 0; pointer-events: none;
        transition: opacity 0.25s;
      }
      .casino-settings-veil.show { opacity: 1; pointer-events: all; }
      .casino-settings-card {
        width: min(440px, 92vw);
        padding: 26px;
        border-radius: 22px;
        background:
          radial-gradient(ellipse at top, rgba(34,211,238,0.18), transparent 60%),
          linear-gradient(180deg, #1a0838, #0a0319);
        box-shadow:
          0 30px 60px -10px rgba(0,0,0,0.7),
          0 18px 36px -18px rgba(0,0,0,0.5),
          inset 0 0 0 1.5px rgba(255,210,74,0.32);
        transform: translateY(20px) scale(0.95);
        transition: transform 0.3s cubic-bezier(.2,.9,.2,1.3);
        color: #fff;
        font-family: 'Outfit', sans-serif;
      }
      .casino-settings-veil.show .casino-settings-card { transform: translateY(0) scale(1); }
      .cs-title {
        font-family: 'Bungee', cursive;
        font-size: 22px;
        letter-spacing: 0.18em;
        color: #fff0a8;
        text-shadow: 0 0 12px rgba(255,210,74,0.5);
        margin-bottom: 4px;
        text-align: center;
      }
      .cs-sub {
        font-size: 11px;
        text-align: center;
        color: rgba(255,255,255,0.55);
        letter-spacing: 0.32em;
        margin-bottom: 20px;
      }
      .cs-mutes {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 22px;
      }
      .cs-mute-btn {
        padding: 14px 10px;
        border: 0;
        border-radius: 12px;
        cursor: pointer;
        font-family: 'Bungee', cursive;
        font-size: 12px;
        letter-spacing: 0.18em;
        color: rgba(255,255,255,0.85);
        background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.4));
        box-shadow: inset 0 0 0 1px rgba(34,211,238,0.35), 0 3px 0 rgba(0,0,0,0.5);
        transition: filter 0.15s, transform 0.1s, box-shadow 0.15s, color 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .cs-mute-btn:hover { filter: brightness(1.15); }
      .cs-mute-btn:active { transform: translateY(2px); }
      .cs-mute-btn .cs-icon { font-size: 16px; line-height: 1; }
      .cs-mute-btn.muted {
        color: #ff5a7d;
        background: linear-gradient(180deg, rgba(255,60,95,0.18), rgba(0,0,0,0.5));
        box-shadow: inset 0 0 0 1px rgba(255,60,95,0.6), 0 0 14px rgba(255,60,95,0.3), 0 3px 0 rgba(0,0,0,0.5);
      }
      .cs-slider {
        margin-bottom: 16px;
      }
      .cs-slider:last-of-type { margin-bottom: 22px; }
      .cs-slider-label {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-family: 'Bungee', cursive;
        font-size: 11px;
        letter-spacing: 0.28em;
        color: #22d3ee;
        text-shadow: 0 0 8px rgba(34,211,238,0.5);
        margin-bottom: 8px;
      }
      .cs-slider-label .cs-val {
        font-family: 'Geist Mono', monospace;
        font-weight: 800;
        font-size: 14px;
        letter-spacing: 0.02em;
        color: #fff;
        text-shadow: 0 0 8px rgba(255,255,255,0.4);
      }
      .cs-range {
        width: 100%;
        height: 28px;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        cursor: pointer;
        outline: none;
      }
      .cs-range::-webkit-slider-runnable-track {
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg, #22d3ee, #ffd24a);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.4);
      }
      .cs-range::-moz-range-track {
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg, #22d3ee, #ffd24a);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.4);
        border: 0;
      }
      .cs-range::-webkit-slider-thumb {
        appearance: none;
        -webkit-appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #fff7d1, #ffd24a 55%, #7a5500 100%);
        margin-top: -7px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.7), inset 0 -1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(255,210,74,0.4);
        cursor: pointer;
      }
      .cs-range::-moz-range-thumb {
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #fff7d1, #ffd24a 55%, #7a5500 100%);
        box-shadow: 0 2px 6px rgba(0,0,0,0.7), inset 0 -1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(255,210,74,0.4);
        cursor: pointer;
      }
      .cs-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,210,74,0.4), transparent);
        margin: 4px 0 18px;
      }
      .cs-close {
        width: 100%;
        padding: 14px;
        border: 0;
        border-radius: 14px;
        font-family: 'Bungee', cursive;
        letter-spacing: 0.18em;
        font-size: 14px;
        cursor: pointer;
        color: #0a0418;
        background: linear-gradient(180deg, #fff0a8, #ffd24a 50%, #b8860b);
        box-shadow: 0 5px 0 #3a2200, inset 0 1px 0 rgba(255,255,255,0.4);
        transition: transform 0.1s, filter 0.15s;
      }
      .cs-close:hover { filter: brightness(1.08); }
      .cs-close:active { transform: translateY(2px); box-shadow: 0 2px 0 #3a2200, inset 0 1px 0 rgba(255,255,255,0.4); }

      .casino-settings-btn {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 80;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 0;
        cursor: pointer;
        background: rgba(2,8,18,0.7);
        color: #ffd24a;
        font-size: 20px;
        line-height: 1;
        box-shadow: inset 0 0 0 1px rgba(255,210,74,0.4), 0 4px 16px rgba(0,0,0,0.5);
        backdrop-filter: blur(6px);
        transition: filter 0.2s, transform 0.4s, box-shadow 0.2s;
        display: grid;
        place-items: center;
      }
      .casino-settings-btn:hover { filter: brightness(1.2); transform: rotate(60deg); }
      .casino-settings-btn:active { transform: rotate(60deg) translateY(2px); }
      @media (max-width: 720px) {
        .casino-settings-btn { top: 8px; right: 8px; width: 34px; height: 34px; font-size: 17px; }
      }
    `;
    document.head.appendChild(css);

    // Inject modal
    const veil = document.createElement('div');
    veil.className = 'casino-settings-veil';
    veil.id = 'casino-settings-veil';
    veil.innerHTML = `
      <div class="casino-settings-card">
        <div class="cs-title">SETTINGS</div>
        <div class="cs-sub">AUDIO</div>
        <div class="cs-mutes">
          <button class="cs-mute-btn" id="cs-mute-music"><span class="cs-icon">🎵</span><span>MUSIC</span></button>
          <button class="cs-mute-btn" id="cs-mute-sfx"><span class="cs-icon">🔊</span><span>SFX</span></button>
        </div>
        <div class="cs-divider"></div>
        <div class="cs-slider">
          <div class="cs-slider-label"><span>MASTER</span><span class="cs-val" id="cs-master-val">70</span></div>
          <input class="cs-range" type="range" min="0" max="100" id="cs-master">
        </div>
        <div class="cs-slider">
          <div class="cs-slider-label"><span>MUSIC</span><span class="cs-val" id="cs-music-val">55</span></div>
          <input class="cs-range" type="range" min="0" max="100" id="cs-music">
        </div>
        <div class="cs-slider">
          <div class="cs-slider-label"><span>SFX</span><span class="cs-val" id="cs-sfx-val">85</span></div>
          <input class="cs-range" type="range" min="0" max="100" id="cs-sfx">
        </div>
        <button class="cs-close" id="cs-close">DONE</button>
      </div>
    `;
    document.body.appendChild(veil);

    function syncUI() {
      const s = Settings.get();
      const fmt = v => String(Math.round(v * 100));
      document.getElementById('cs-master').value = Math.round(s.master * 100);
      document.getElementById('cs-music').value  = Math.round(s.music * 100);
      document.getElementById('cs-sfx').value    = Math.round(s.sfx * 100);
      document.getElementById('cs-master-val').textContent = fmt(s.master);
      document.getElementById('cs-music-val').textContent  = fmt(s.music);
      document.getElementById('cs-sfx-val').textContent    = fmt(s.sfx);
      document.getElementById('cs-mute-music').classList.toggle('muted', s.muteMusic);
      document.getElementById('cs-mute-sfx').classList.toggle('muted', s.muteSfx);
      document.getElementById('cs-mute-music').querySelector('.cs-icon').textContent = s.muteMusic ? '🔇' : '🎵';
      document.getElementById('cs-mute-sfx').querySelector('.cs-icon').textContent   = s.muteSfx   ? '🔇' : '🔊';
    }

    function wireSlider(id, valId, key) {
      const slider = document.getElementById(id);
      const val = document.getElementById(valId);
      slider.addEventListener('input', e => {
        const v = e.target.value / 100;
        Settings.set({ [key]: v });
        val.textContent = e.target.value;
      });
    }
    wireSlider('cs-master', 'cs-master-val', 'master');
    wireSlider('cs-music',  'cs-music-val',  'music');
    wireSlider('cs-sfx',    'cs-sfx-val',    'sfx');

    document.getElementById('cs-mute-music').addEventListener('click', () => {
      Settings.set({ muteMusic: !Settings.get().muteMusic });
      syncUI();
    });
    document.getElementById('cs-mute-sfx').addEventListener('click', () => {
      Settings.set({ muteSfx: !Settings.get().muteSfx });
      syncUI();
    });
    document.getElementById('cs-close').addEventListener('click', closeModal);
    veil.addEventListener('click', e => {
      if (e.target === veil) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && veil.classList.contains('show')) closeModal();
    });

    function openModal() {
      syncUI();
      veil.classList.add('show');
    }
    function closeModal() {
      veil.classList.remove('show');
    }

    // Settings button (gear)
    if (opts.injectButton !== false) {
      const btn = document.createElement('button');
      btn.className = 'casino-settings-btn';
      btn.id = 'casino-settings-btn';
      btn.title = 'Settings';
      btn.setAttribute('aria-label', 'Settings');
      btn.textContent = '⚙';
      btn.addEventListener('click', openModal);
      document.body.appendChild(btn);
    } else if (opts.openBtn) {
      opts.openBtn.addEventListener('click', openModal);
    }

    // Expose open/close
    SettingsUI._open = openModal;
    SettingsUI._close = closeModal;
    SettingsUI._sync = syncUI;
  }

  const SettingsUI = {
    mount,
    open() { if (SettingsUI._open) SettingsUI._open(); },
    close() { if (SettingsUI._close) SettingsUI._close(); },
  };

  /* ---------- LOADER ----------
     Classy full-screen loading overlay shown until window.load + music
     can-play + a minimum visible duration. Auto-mounts the moment this
     script executes. Each game should include this script near the TOP
     of <body> so the overlay covers content as it parses.
  */
  const Loader = (function () {
    const START_TIME = Date.now();
    const MIN_VISIBLE_MS = 1200;
    const MAX_WAIT_MS = 8000;
    let el = null;
    let cssEl = null;
    let started = false;
    let hiding = false;

    const css = `
      .casino-loader {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background:
          radial-gradient(ellipse at 20% 0%, rgba(168,85,247,0.28) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 100%, rgba(255,46,147,0.22) 0%, transparent 55%),
          radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.08) 0%, transparent 70%),
          linear-gradient(180deg, #0a0418, #150828 60%, #0a0418);
        display: grid;
        place-items: center;
        opacity: 1;
        transition: opacity 0.55s cubic-bezier(.4,0,.2,1);
        font-family: 'Outfit', 'Helvetica Neue', sans-serif;
        color: #fff;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
      }
      .casino-loader::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.05;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/></svg>");
      }
      .casino-loader.cl-leave { opacity: 0; pointer-events: none; }

      .cl-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 22px;
        position: relative;
      }

      .cl-diamond-wrap {
        position: relative;
        width: 92px;
        height: 92px;
        display: grid;
        place-items: center;
        animation: clBreath 2.4s ease-in-out infinite;
      }
      @keyframes clBreath {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.08); }
      }
      .cl-diamond {
        position: relative;
        width: 100%;
        height: 100%;
        animation: clSpin 5s linear infinite;
        filter:
          drop-shadow(0 0 22px rgba(34,211,238,0.55))
          drop-shadow(0 0 44px rgba(255,210,74,0.32))
          drop-shadow(0 8px 14px rgba(0,0,0,0.55));
      }
      .cl-diamond::before {
        content: '';
        position: absolute;
        inset: 0;
        background: conic-gradient(from 0deg,
          #00e5ff, #b388ff, #ff80ab, #ffd54f,
          #69f0ae, #40c4ff, #00e5ff);
        clip-path: polygon(50% 0%, 100% 38%, 50% 100%, 0% 38%);
      }
      .cl-diamond::after {
        content: '';
        position: absolute;
        inset: 0;
        clip-path: polygon(50% 0%, 100% 38%, 50% 100%, 0% 38%);
        background:
          linear-gradient(135deg, transparent 46%, rgba(255,255,255,0.55) 50%, transparent 54%),
          linear-gradient(45deg, transparent 46%, rgba(255,255,255,0.35) 50%, transparent 54%);
        pointer-events: none;
        mix-blend-mode: screen;
      }
      @keyframes clSpin {
        0%   { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* The faint ring of light around the diamond */
      .cl-diamond-wrap::before {
        content: '';
        position: absolute;
        inset: -14px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,210,74,0.18), transparent 60%);
        animation: clGlow 2.4s ease-in-out infinite;
        z-index: -1;
      }
      @keyframes clGlow {
        0%, 100% { opacity: 0.65; transform: scale(0.95); }
        50%      { opacity: 1;    transform: scale(1.08); }
      }

      .cl-title {
        font-family: 'Bungee Shade', 'Bungee', 'Impact', sans-serif;
        font-size: clamp(28px, 5vw, 44px);
        line-height: 1;
        background: linear-gradient(180deg, #fff7d1 0%, #ffd24a 45%, #b8860b 100%);
        -webkit-background-clip: text;
                background-clip: text;
        color: transparent;
        filter:
          drop-shadow(0 3px 0 rgba(0,0,0,0.55))
          drop-shadow(0 0 16px rgba(255,210,74,0.45));
        letter-spacing: 0.04em;
        text-align: center;
      }
      .cl-sub {
        font-family: 'Bungee', 'Impact', sans-serif;
        font-size: 10px;
        letter-spacing: 0.65em;
        margin-left: 0.65em; /* compensate for letter-spacing on last char */
        color: #22d3ee;
        text-shadow: 0 0 12px rgba(34,211,238,0.7);
        animation: clBlink 1.6s ease-in-out infinite;
      }
      @keyframes clBlink {
        0%, 100% { opacity: 0.35; }
        50%      { opacity: 1; }
      }

      .cl-bar {
        width: clamp(180px, 30vw, 240px);
        height: 3px;
        background: rgba(255,255,255,0.08);
        border-radius: 999px;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(255,210,74,0.25);
      }
      .cl-bar-fill {
        width: 35%;
        height: 100%;
        background: linear-gradient(90deg, transparent 0%, #ffd24a 50%, transparent 100%);
        animation: clProgress 1.3s cubic-bezier(.65,0,.35,1) infinite;
        border-radius: 999px;
      }
      @keyframes clProgress {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(385%); }
      }

      @media (max-width: 720px) {
        .cl-diamond-wrap { width: 72px; height: 72px; }
        .cl-stack { gap: 18px; }
      }
    `;

    function injectStyle() {
      if (cssEl) return;
      cssEl = document.createElement('style');
      cssEl.setAttribute('data-casino-loader', '');
      cssEl.textContent = css;
      (document.head || document.documentElement).appendChild(cssEl);
    }

    function injectMarkup() {
      if (el) return;
      el = document.createElement('div');
      el.className = 'casino-loader';
      el.setAttribute('aria-hidden', 'false');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-label', 'Loading');
      el.innerHTML = `
        <div class="cl-stack">
          <div class="cl-diamond-wrap">
            <div class="cl-diamond"></div>
          </div>
          <div class="cl-title">DIAMOND CASINO</div>
          <div class="cl-sub">LOADING</div>
          <div class="cl-bar"><div class="cl-bar-fill"></div></div>
        </div>
      `;
      document.body.appendChild(el);
    }

    function show() {
      if (started) return;
      started = true;
      injectStyle();
      if (document.body) {
        injectMarkup();
      } else {
        document.addEventListener('DOMContentLoaded', injectMarkup, { once: true });
      }
    }

    function hide() {
      if (hiding || !el) return;
      hiding = true;
      el.classList.add('cl-leave');
      setTimeout(() => {
        if (el && el.parentNode) el.remove();
        if (cssEl && cssEl.parentNode) cssEl.remove();
        el = null;
        cssEl = null;
      }, 600);
    }

    function isMusicReady() {
      // audioEl is defined in the outer IIFE scope
      if (!audioEl) return true;            // music not initialized → don't block
      if (audioEl.error) return true;       // music failed to load → don't block
      // HAVE_CURRENT_DATA (2) is enough — we don't need the full file buffered
      return audioEl.readyState >= 2;
    }

    function ready() {
      const elapsed = Date.now() - START_TIME;
      if (elapsed >= MAX_WAIT_MS) return true;
      if (elapsed < MIN_VISIBLE_MS) return false;
      if (document.readyState !== 'complete') return false;
      return isMusicReady();
    }

    function poll() {
      if (ready()) hide();
      else setTimeout(poll, 90);
    }

    // Auto-start as soon as casino-audio.js executes
    show();
    poll();

    return { show, hide };
  })();

  /* ============================================================
     HISTORY — every bet/outcome across all games
     ============================================================
     Each record:
       { game: 'blackjack'|'slots'|'kraken',
         bet: number (>=0, total wagered for this round),
         win: number (NET — positive = profit, negative = loss, 0 = push),
         ts: epoch ms,
         note: optional string ('BLACKJACK', 'BUST', 'GRAND', etc.) }

     "Session" = entries recorded since this page loaded (in-memory only).
     "All"     = full persisted log (localStorage), capped to MAX_ENTRIES.
     ============================================================ */
  const History = (function () {
    const HISTORY_KEY = 'casino.history';
    const MAX_ENTRIES = 1000;
    const sessionStart = Date.now();
    const sessionEntries = [];
    let allEntries = [];
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(raw)) allEntries = raw;
    } catch (e) {}

    const listeners = [];
    function notify() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }
    function persist() {
      try {
        if (allEntries.length > MAX_ENTRIES) {
          allEntries = allEntries.slice(-MAX_ENTRIES);
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(allEntries));
      } catch (e) {}
    }

    function record(game, bet, win, note) {
      const entry = {
        game: String(game || 'unknown'),
        bet: Number(bet) || 0,
        win: Number(win) || 0,
        ts: Date.now(),
        note: note ? String(note) : null,
      };
      sessionEntries.push(entry);
      allEntries.push(entry);
      persist();
      notify();
      return entry;
    }

    function getAll(game) {
      const list = allEntries.slice();
      return game ? list.filter(e => e.game === game) : list;
    }
    function getSession(game) {
      const list = sessionEntries.slice();
      return game ? list.filter(e => e.game === game) : list;
    }

    function computeStats(entries) {
      let bets = 0, wins = 0, losses = 0, pushes = 0;
      let totalWagered = 0, net = 0;
      let biggestWin = 0, biggestLoss = 0;
      for (const e of entries) {
        bets++;
        totalWagered += e.bet;
        net += e.win;
        if (e.win > 0) { wins++; if (e.win > biggestWin) biggestWin = e.win; }
        else if (e.win < 0) { losses++; if (e.win < biggestLoss) biggestLoss = e.win; }
        else { pushes++; }
      }
      return { bets, wins, losses, pushes, totalWagered, net, biggestWin, biggestLoss };
    }

    function clear() {
      allEntries = [];
      sessionEntries.length = 0;
      persist();
      notify();
    }

    return { record, getAll, getSession, computeStats, onChange(fn){listeners.push(fn);}, clear, sessionStart };
  })();

  /* ---------- HISTORY UI (modal) ----------
     Shared modal that any page can mount + open.
       HistoryUI.mount()           — inject once (idempotent)
       HistoryUI.open({ scope: 'session' | 'all', game: 'blackjack' | 'slots' | 'kraken' | null })
       HistoryUI.close()
     The button itself is left to each page so the visual treatment can match.
  */
  const HistoryUI = (function () {
    let mounted = false;
    let veil, listEl, statsEl, titleEl, subEl, toggleEls;
    let currentScope = 'session';
    let currentGame = null;

    const GAME_LABEL = {
      blackjack:     'BLACKJACK',
      slots:         'DIAMOND SPIN',
      kraken:        'KRAKEN',
      lucky7:        'LUCKY 7 SALOON',
      craplesscraps: 'CRAPLESS CRAPS',
      plinko:        'PLINKO',
    };
    const GAME_ICON = {
      blackjack:     '♠',
      slots:         '◆',
      kraken:        '🐙',
      lucky7:        '7',
      craplesscraps: '🎲',
      plinko:        '▼',
    };

    function fmtMoney(n) {
      const sign = n < 0 ? '-' : (n > 0 ? '+' : '');
      const cents = Math.round(Math.abs(n) * 100) / 100;
      const s = Number.isInteger(cents) ? cents.toLocaleString('en-US') : cents.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return sign + '$' + s;
    }
    function fmtPlain(n) {
      const cents = Math.round(n * 100) / 100;
      return Number.isInteger(cents) ? cents.toLocaleString('en-US') : cents.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtTime(ts) {
      const d = new Date(ts);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      const ss = d.getSeconds().toString().padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
    function fmtDate(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function mount() {
      if (mounted) return;
      mounted = true;
      const css = document.createElement('style');
      css.textContent = `
        .casino-history-veil {
          position: fixed; inset: 0; z-index: 220;
          background: rgba(2,4,12,0.82);
          backdrop-filter: blur(10px);
          display: grid; place-items: center;
          opacity: 0; pointer-events: none;
          transition: opacity 0.25s;
        }
        .casino-history-veil.show { opacity: 1; pointer-events: all; }
        .casino-history-card {
          width: min(640px, 94vw);
          max-height: min(86vh, 760px);
          padding: 22px 22px 18px;
          border-radius: 26px;
          display: flex; flex-direction: column;
          background:
            radial-gradient(ellipse at top, rgba(34,211,238,0.16), transparent 60%),
            linear-gradient(180deg, #1a0838, #0a0319);
          box-shadow:
            0 30px 60px -10px rgba(0,0,0,0.75),
            0 18px 36px -18px rgba(0,0,0,0.6),
            inset 0 0 0 1.5px rgba(255,210,74,0.32);
          transform: translateY(20px) scale(0.95);
          transition: transform 0.3s cubic-bezier(.2,.9,.2,1.3);
          color: #fff;
          font-family: 'Outfit', sans-serif;
        }
        .casino-history-veil.show .casino-history-card { transform: translateY(0) scale(1); }
        .ch-title {
          font-family: 'Bungee', cursive;
          font-size: 22px;
          letter-spacing: 0.18em;
          color: #fff0a8;
          text-shadow: 0 0 12px rgba(255,210,74,0.5);
          text-align: center;
        }
        .ch-sub {
          font-size: 10px;
          text-align: center;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.34em;
          margin-bottom: 16px;
        }
        .ch-toggle {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; margin-bottom: 16px;
        }
        .ch-toggle-btn {
          padding: 10px 6px;
          border: 0; cursor: pointer;
          border-radius: 12px;
          font-family: 'Bungee', cursive;
          font-size: 11px; letter-spacing: 0.18em;
          color: rgba(255,255,255,0.6);
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.35));
          box-shadow: inset 0 0 0 1px rgba(34,211,238,0.28);
          transition: filter 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .ch-toggle-btn.active {
          color: #fff0a8;
          background: linear-gradient(180deg, rgba(255,210,74,0.18), rgba(0,0,0,0.4));
          box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.65), 0 0 14px rgba(255,210,74,0.2);
        }
        .ch-toggle-btn:hover { filter: brightness(1.12); }
        .ch-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .ch-stat {
          padding: 10px 6px;
          border-radius: 12px;
          background: rgba(0,0,0,0.42);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
          display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .ch-stat-label {
          font-family: 'Bungee', cursive;
          font-size: 8px; letter-spacing: 0.22em;
          color: #22d3ee;
          text-shadow: 0 0 6px rgba(34,211,238,0.4);
        }
        .ch-stat-value {
          font-family: 'Geist Mono', monospace;
          font-weight: 800;
          font-size: 15px;
          color: #fff;
        }
        .ch-stat-value.win  { color: #5cffa1; text-shadow: 0 0 8px rgba(92,255,161,0.45); }
        .ch-stat-value.lose { color: #ff5a7d; text-shadow: 0 0 8px rgba(255,46,147,0.4); }
        .ch-game-stats {
          display: grid; gap: 6px; margin-bottom: 12px;
        }
        .ch-game-row {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 12px;
          background: rgba(0,0,0,0.34);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
          align-items: center;
        }
        .ch-game-row .icon { font-size: 16px; line-height: 1; }
        .ch-game-row .label {
          font-family: 'Bungee', cursive;
          font-size: 10px; letter-spacing: 0.18em;
          color: rgba(255,255,255,0.85);
        }
        .ch-game-row .count {
          font-family: 'Geist Mono', monospace;
          font-size: 11px;
          color: rgba(255,255,255,0.55);
        }
        .ch-game-row .net {
          font-family: 'Geist Mono', monospace;
          font-weight: 800;
          font-size: 13px;
          min-width: 70px;
          text-align: right;
        }
        .ch-game-row .net.win  { color: #5cffa1; }
        .ch-game-row .net.lose { color: #ff5a7d; }
        .ch-game-row .net.flat { color: rgba(255,255,255,0.55); }
        .ch-list-wrap {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          margin-bottom: 14px;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,210,74,0.4) rgba(0,0,0,0.3);
        }
        .ch-list-wrap::-webkit-scrollbar { width: 6px; }
        .ch-list-wrap::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 999px; }
        .ch-list-wrap::-webkit-scrollbar-thumb { background: rgba(255,210,74,0.4); border-radius: 999px; }
        .ch-list { display: grid; gap: 4px; }
        .ch-row {
          display: grid;
          grid-template-columns: auto auto 1fr auto auto;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
          align-items: center;
          font-size: 12px;
        }
        .ch-row .ts {
          font-family: 'Geist Mono', monospace;
          font-size: 10px;
          color: rgba(255,255,255,0.4);
          min-width: 56px;
        }
        .ch-row .game {
          font-size: 14px;
          line-height: 1;
          min-width: 18px;
        }
        .ch-row .note {
          font-family: 'Bungee', cursive;
          font-size: 9px;
          letter-spacing: 0.14em;
          color: rgba(255,255,255,0.55);
        }
        .ch-row .bet {
          font-family: 'Geist Mono', monospace;
          font-size: 11px;
          color: rgba(255,255,255,0.7);
          min-width: 60px;
          text-align: right;
        }
        .ch-row .result {
          font-family: 'Geist Mono', monospace;
          font-weight: 800;
          font-size: 12px;
          min-width: 76px;
          text-align: right;
        }
        .ch-row .result.win  { color: #5cffa1; text-shadow: 0 0 6px rgba(92,255,161,0.4); }
        .ch-row .result.lose { color: #ff5a7d; }
        .ch-row .result.push { color: rgba(255,255,255,0.5); }
        .ch-empty {
          padding: 32px 12px;
          text-align: center;
          font-family: 'Bungee', cursive;
          font-size: 12px;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.35);
        }
        .ch-actions {
          display: grid; grid-template-columns: 1fr 1.6fr; gap: 10px;
        }
        .ch-clear, .ch-close {
          padding: 14px;
          border: 0;
          border-radius: 14px;
          font-family: 'Bungee', cursive;
          letter-spacing: 0.16em;
          font-size: 13px;
          cursor: pointer;
          transition: filter 0.15s, transform 0.1s;
        }
        .ch-clear {
          color: rgba(255,255,255,0.7);
          background: rgba(255,255,255,0.05);
          box-shadow: inset 0 0 0 1px rgba(255,90,125,0.3);
        }
        .ch-clear:hover { filter: brightness(1.15); color: #ff5a7d; }
        .ch-close {
          color: #0a0418;
          background: linear-gradient(180deg, #fff0a8, #ffd24a 50%, #b8860b);
          box-shadow: 0 5px 0 #3a2200, inset 0 1px 0 rgba(255,255,255,0.4);
        }
        .ch-close:hover { filter: brightness(1.08); }
        .ch-close:active { transform: translateY(2px); box-shadow: 0 2px 0 #3a2200; }

        @media (max-width: 540px) {
          .casino-history-card {
            width: 96vw;
            max-height: 92vh;
            padding: 16px 14px 12px;
            border-radius: 22px;
          }
          .ch-title { font-size: 18px; letter-spacing: 0.14em; }
          .ch-sub { font-size: 9px; letter-spacing: 0.28em; margin-bottom: 12px; }
          .ch-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .ch-stat-value { font-size: 14px; }
          .ch-row {
            grid-template-columns: auto 1fr auto;
            gap: 6px;
            padding: 6px 8px;
          }
          .ch-row .ts { min-width: 0; font-size: 9px; }
          .ch-row .note { display: none; }
          .ch-row .bet { display: none; }
          .ch-row .result { font-size: 11px; min-width: 64px; }
          .ch-game-row { padding: 6px 10px; }
          .ch-game-row .label { font-size: 9px; letter-spacing: 0.14em; }
          .ch-game-row .count { font-size: 10px; }
          .ch-game-row .net { font-size: 11px; min-width: 60px; }
          .ch-actions { grid-template-columns: 1fr 1.4fr; }
          .ch-clear, .ch-close { padding: 12px; font-size: 12px; letter-spacing: 0.12em; }
        }
      `;
      document.head.appendChild(css);

      veil = document.createElement('div');
      veil.className = 'casino-history-veil';
      veil.innerHTML = `
        <div class="casino-history-card">
          <div class="ch-title">HISTORY</div>
          <div class="ch-sub" id="ch-sub">SESSION</div>
          <div class="ch-toggle">
            <button class="ch-toggle-btn active" data-scope="session">THIS SESSION</button>
            <button class="ch-toggle-btn" data-scope="all">ALL-TIME</button>
          </div>
          <div class="ch-stats" id="ch-stats"></div>
          <div class="ch-game-stats" id="ch-game-stats"></div>
          <div class="ch-list-wrap">
            <div class="ch-list" id="ch-list"></div>
          </div>
          <div class="ch-actions">
            <button class="ch-clear" id="ch-clear">CLEAR HISTORY</button>
            <button class="ch-close" id="ch-close">DONE</button>
          </div>
        </div>
      `;
      document.body.appendChild(veil);
      statsEl = veil.querySelector('#ch-stats');
      listEl = veil.querySelector('#ch-list');
      subEl = veil.querySelector('#ch-sub');
      toggleEls = veil.querySelectorAll('.ch-toggle-btn');

      toggleEls.forEach(btn => {
        btn.addEventListener('click', () => {
          currentScope = btn.dataset.scope;
          render();
        });
      });
      veil.querySelector('#ch-close').addEventListener('click', close);
      veil.querySelector('#ch-clear').addEventListener('click', () => {
        if (confirm('Clear all history? This cannot be undone.')) {
          History.clear();
          render();
        }
      });
      veil.addEventListener('click', e => { if (e.target === veil) close(); });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && veil.classList.contains('show')) close();
      });

      History.onChange(() => { if (veil.classList.contains('show')) render(); });
    }

    function statTile(label, value, cls) {
      const v = cls ? `<span class="ch-stat-value ${cls}">${value}</span>` : `<span class="ch-stat-value">${value}</span>`;
      return `<div class="ch-stat"><span class="ch-stat-label">${label}</span>${v}</div>`;
    }

    function render() {
      // Update toggle UI
      toggleEls.forEach(b => b.classList.toggle('active', b.dataset.scope === currentScope));
      const entries = (currentScope === 'session' ? History.getSession(currentGame) : History.getAll(currentGame));

      subEl.textContent = (currentScope === 'session' ? 'THIS SESSION' : 'ALL-TIME')
        + (currentGame ? ' · ' + (GAME_LABEL[currentGame] || currentGame.toUpperCase()) : '');

      const s = History.computeStats(entries);
      const netCls = s.net > 0 ? 'win' : (s.net < 0 ? 'lose' : '');
      statsEl.innerHTML =
        statTile('BETS', s.bets)
        + statTile('WAGERED', '$' + fmtPlain(s.totalWagered))
        + statTile('NET', s.net === 0 ? '$0' : fmtMoney(s.net), netCls)
        + statTile('BIGGEST', s.biggestWin ? fmtMoney(s.biggestWin) : '—', s.biggestWin ? 'win' : '');

      // Per-game breakdown (only when not filtered to a specific game)
      const gameStatsEl = veil.querySelector('#ch-game-stats');
      if (!currentGame) {
        const byGame = {};
        entries.forEach(e => {
          if (!byGame[e.game]) byGame[e.game] = [];
          byGame[e.game].push(e);
        });
        const games = Object.keys(byGame).sort();
        gameStatsEl.innerHTML = games.map(g => {
          const gs = History.computeStats(byGame[g]);
          const cls = gs.net > 0 ? 'win' : (gs.net < 0 ? 'lose' : 'flat');
          return `<div class="ch-game-row">
            <span class="icon">${GAME_ICON[g] || '🎰'}</span>
            <span class="label">${GAME_LABEL[g] || g.toUpperCase()}</span>
            <span class="count">${gs.bets} bet${gs.bets === 1 ? '' : 's'}</span>
            <span class="net ${cls}">${gs.net === 0 ? '$0' : fmtMoney(gs.net)}</span>
          </div>`;
        }).join('');
        gameStatsEl.style.display = games.length > 1 ? '' : 'none';
      } else {
        gameStatsEl.style.display = 'none';
      }

      // List (newest first)
      if (entries.length === 0) {
        listEl.innerHTML = `<div class="ch-empty">NO BETS YET</div>`;
        return;
      }
      const reversed = entries.slice().reverse();
      const showDate = currentScope === 'all';
      listEl.innerHTML = reversed.map(e => {
        const cls = e.win > 0 ? 'win' : (e.win < 0 ? 'lose' : 'push');
        const resultText = e.win === 0 ? 'PUSH' : fmtMoney(e.win);
        const tsText = showDate ? `${fmtDate(e.ts)} ${fmtTime(e.ts).slice(0,5)}` : fmtTime(e.ts);
        const noteText = e.note ? `<span class="note">${e.note}</span>` : `<span class="note"></span>`;
        return `<div class="ch-row">
          <span class="ts">${tsText}</span>
          <span class="game">${GAME_ICON[e.game] || '·'}</span>
          ${noteText}
          <span class="bet">$${fmtPlain(e.bet)}</span>
          <span class="result ${cls}">${resultText}</span>
        </div>`;
      }).join('');
    }

    function open(opts) {
      mount();
      opts = opts || {};
      currentScope = opts.scope || 'session';
      currentGame = opts.game || null;
      render();
      veil.classList.add('show');
    }
    function close() { if (veil) veil.classList.remove('show'); }

    return { mount, open, close };
  })();

  /* ---------- EXPORT ---------- */
  global.Settings = Settings;
  global.Music = Music;
  global.SettingsUI = SettingsUI;
  global.Loader = Loader;
  global.History = History;
  global.HistoryUI = HistoryUI;
})(window);

/* ---------- SERVICE WORKER REGISTRATION ----------
   Registers ./service-worker.js so the casino installs as a PWA
   and keeps working offline once cached. No-op on file:// or in
   browsers without SW support. Registration runs after window
   load so it never competes with the page's own resource fetch.  */
(function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  const register = () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(() => { /* silently ignore — site still works without SW */ });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
})();
