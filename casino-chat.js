/* ============================================================
   casino-chat.js — slide-up chat panel for roulette + rocket
   ============================================================
   - Mounts ONLY on roulette.html and rocket.html. Other games
     don't get a chat surface (per the casino's design).
   - Chip floats bottom-right; panel is COLLAPSED BY DEFAULT and
     never auto-opens. Player has to click to engage.
   - Subscribes to CasinoBots for the per-game stream. Player
     input routes through CasinoBots.sendChat.
   ============================================================ */

(() => {
  'use strict';

  if (window.CasinoChat) return;

  const PAGE = (location.pathname.toLowerCase().split('/').pop() || '').replace(/\.html?$/, '');
  if (PAGE !== 'roulette' && PAGE !== 'rocket') return;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function fmtTime(t) {
    const d = new Date(t || Date.now());
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  function whenReady(fn) {
    if (window.CasinoBots && window.CasinoBots.game) { fn(); return; }
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window.CasinoBots && window.CasinoBots.game) { clearInterval(iv); fn(); }
      else if (tries > 80) clearInterval(iv);
    }, 150);
  }

  const CSS = `
    .cc-toggle {
      position: fixed; right: 14px; bottom: 14px; z-index: 18;
      height: 36px; padding: 0 12px 0 10px;
      border: 0; cursor: pointer; outline: 0;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(20,8,42,0.95), rgba(10,4,24,0.95));
      color: #fff0a8;
      font-family: 'Bungee', cursive; font-size: 9px; letter-spacing: 0.16em;
      box-shadow: inset 0 0 0 1px rgba(255,210,74,0.32), 0 6px 14px rgba(0,0,0,0.5);
      display: inline-flex; align-items: center; gap: 8px;
      transition: transform 0.1s, filter 0.15s, box-shadow 0.15s;
    }
    .cc-toggle::before {
      content: '';
      width: 12px; height: 12px;
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0, transparent 35%),
        rgba(255,210,74,0.85);
      border-radius: 50% 50% 50% 3px;
      transform: scaleX(-1);
      box-shadow: 0 0 0 1px rgba(26,6,64,0.5) inset;
    }
    .cc-toggle:hover { filter: brightness(1.1); }
    .cc-toggle:active { transform: translateY(1px); }
    .cc-toggle .cc-badge {
      min-width: 16px; height: 16px; padding: 0 4px;
      border-radius: 999px;
      background: #ff2e93; color: #fff;
      font-family: 'Geist Mono', monospace; font-weight: 800;
      font-size: 9px; letter-spacing: 0;
      display: none; align-items: center; justify-content: center;
      box-shadow: 0 0 8px rgba(255,46,147,0.6);
    }
    .cc-toggle.has-unread .cc-badge { display: inline-flex; }
    .cc-toggle.open { display: none; }

    .cc-panel {
      position: fixed; right: 14px; bottom: 14px; z-index: 19;
      width: min(340px, calc(100vw - 28px));
      height: min(420px, calc(100vh - 110px));
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(20,8,42,0.96), rgba(8,3,20,0.98));
      box-shadow: inset 0 0 0 1.5px rgba(255,210,74,0.30), 0 18px 40px rgba(0,0,0,0.55);
      backdrop-filter: blur(10px);
      display: none; grid-template-rows: auto 1fr auto;
      color: #fff;
      font-family: 'Outfit', system-ui, sans-serif;
      overflow: hidden;
      transform-origin: bottom right;
    }
    .cc-panel.open {
      display: grid;
      animation: cc-pop 0.22s cubic-bezier(.18,.89,.32,1.28);
    }
    @keyframes cc-pop {
      from { transform: translateY(8px) scale(0.96); opacity: 0; }
      to   { transform: translateY(0)   scale(1);    opacity: 1; }
    }
    .cc-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,210,74,0.18);
      background: linear-gradient(180deg, rgba(255,210,74,0.08), transparent);
    }
    .cc-title {
      display: inline-flex; align-items: center; gap: 7px;
      font-family: 'Bungee', cursive; font-size: 10px; letter-spacing: 0.20em;
      color: #fff0a8;
    }
    .cc-title::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #5cffa1; box-shadow: 0 0 6px #5cffa1;
      animation: cc-blink 1.6s ease-in-out infinite;
    }
    @keyframes cc-blink { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
    .cc-count { font-family: 'Geist Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 600; }
    .cc-close {
      background: none; border: 0; cursor: pointer;
      color: rgba(255,255,255,0.6); font-size: 18px; line-height: 1; padding: 2px 6px;
    }
    .cc-close:hover { color: #fff; }
    .cc-list {
      overflow-y: auto; overflow-x: hidden;
      padding: 10px 12px;
      display: flex; flex-direction: column; gap: 8px;
      scrollbar-width: thin; scrollbar-color: rgba(255,210,74,0.35) transparent;
    }
    .cc-list::-webkit-scrollbar { width: 6px; }
    .cc-list::-webkit-scrollbar-thumb { background: rgba(255,210,74,0.35); border-radius: 3px; }
    .cc-msg { display: grid; gap: 2px; animation: cc-msgin 0.25s cubic-bezier(.18,.89,.32,1.18); }
    @keyframes cc-msgin { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .cc-meta { display: flex; align-items: baseline; gap: 6px; font-size: 10px; }
    .cc-name { font-family: 'Bungee', cursive; font-size: 9px; letter-spacing: 0.10em; }
    .cc-time { color: rgba(255,255,255,0.32); font-family: 'Geist Mono', monospace; font-size: 9px; }
    .cc-body { font-size: 12.5px; line-height: 1.35; color: rgba(255,255,255,0.88); word-wrap: break-word; }
    .cc-msg.you .cc-name { color: #22d3ee !important; }
    .cc-msg.you .cc-body { color: #c8fcff; }
    .cc-empty {
      margin: auto; padding: 20px;
      text-align: center; color: rgba(255,255,255,0.42);
      font-family: 'Bungee', cursive; font-size: 9px; letter-spacing: 0.18em;
    }
    .cc-form { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid rgba(255,210,74,0.18); }
    .cc-input {
      min-width: 0; height: 36px;
      border: 0; outline: 0; border-radius: 10px;
      padding: 0 11px;
      color: #fff; background: rgba(3,1,14,0.8);
      box-shadow: inset 0 0 0 1.5px rgba(34,211,238,0.28);
      font-family: 'Outfit', system-ui, sans-serif;
      font-size: 12.5px; font-weight: 600;
    }
    .cc-input::placeholder { color: rgba(255,255,255,0.32); }
    .cc-input:focus { box-shadow: inset 0 0 0 1.5px rgba(34,211,238,0.6); }
    .cc-send {
      border: 0; cursor: pointer;
      min-width: 60px; height: 36px;
      border-radius: 10px;
      font-family: 'Bungee', cursive; font-size: 9px; letter-spacing: 0.16em;
      color: #061c22;
      background: linear-gradient(180deg, #dffbff, #22d3ee 58%, #087f96);
      box-shadow: 0 3px 0 #04323b, inset 0 1px 0 rgba(255,255,255,0.55);
      transition: transform 0.08s;
    }
    .cc-send:hover { filter: brightness(1.08); }
    .cc-send:active { transform: translateY(2px); box-shadow: 0 1px 0 #04323b, inset 0 1px 0 rgba(255,255,255,0.55); }
    .cc-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    @media (max-width: 720px) {
      .cc-toggle { right: 10px; bottom: 10px; height: 32px; padding: 0 10px 0 9px; font-size: 8px; }
      .cc-panel { right: 10px; bottom: 10px; width: calc(100vw - 20px); height: min(380px, calc(100vh - 90px)); }
    }
  `;

  let toggleEl, panelEl, listEl, inputEl, sendBtn, countEl, badgeEl;
  let isOpen = false;
  let unread = 0;
  let lastSeenLen = 0;
  let everOpened = false;

  function inject() {
    if (toggleEl) return;
    if (!document.getElementById('cc-css')) {
      const s = document.createElement('style');
      s.id = 'cc-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }

    toggleEl = document.createElement('button');
    toggleEl.className = 'cc-toggle';
    toggleEl.type = 'button';
    toggleEl.innerHTML = 'TABLE CHAT <span class="cc-badge">0</span>';
    document.body.appendChild(toggleEl);
    badgeEl = toggleEl.querySelector('.cc-badge');

    panelEl = document.createElement('div');
    panelEl.className = 'cc-panel';
    panelEl.innerHTML =
      '<div class="cc-head">' +
        '<div class="cc-title">TABLE CHAT</div>' +
        '<div class="cc-count" data-count></div>' +
        '<button class="cc-close" type="button" aria-label="Close chat">×</button>' +
      '</div>' +
      '<div class="cc-list" data-list></div>' +
      '<form class="cc-form" data-form>' +
        '<input class="cc-input" type="text" maxlength="160" placeholder="Say something…" autocomplete="off" />' +
        '<button class="cc-send" type="submit">SEND</button>' +
      '</form>';
    document.body.appendChild(panelEl);

    listEl  = panelEl.querySelector('[data-list]');
    countEl = panelEl.querySelector('[data-count]');
    inputEl = panelEl.querySelector('.cc-input');
    sendBtn = panelEl.querySelector('.cc-send');

    toggleEl.addEventListener('click', () => setOpen(true));
    panelEl.querySelector('.cc-close').addEventListener('click', () => setOpen(false));
    panelEl.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const txt = inputEl.value.trim();
      if (!txt) return;
      window.CasinoBots.sendChat(window.CasinoBots.game, txt);
      inputEl.value = '';
      sendBtn.disabled = true;
    });
    inputEl.addEventListener('input', () => { sendBtn.disabled = !inputEl.value.trim(); });
    sendBtn.disabled = true;
  }

  function setOpen(v) {
    isOpen = !!v;
    toggleEl.classList.toggle('open', isOpen);
    panelEl.classList.toggle('open', isOpen);
    if (isOpen) {
      everOpened = true;
      unread = 0;
      toggleEl.classList.remove('has-unread');
      badgeEl.textContent = '0';
      lastSeenLen = listEl.querySelectorAll('.cc-msg').length;
      requestAnimationFrame(() => { inputEl.focus(); listEl.scrollTop = listEl.scrollHeight; });
    }
  }

  function render(list) {
    if (!listEl) return;
    const items = (list || []).filter(m => m && m.text);
    countEl.textContent = items.length ? items.length + ' msg' : '';
    if (!items.length) {
      listEl.innerHTML = '<div class="cc-empty">be the first to break the silence</div>';
      return;
    }
    listEl.innerHTML = items.map(m => {
      const hue  = Number.isFinite(m.hue) ? m.hue : 50;
      const tone = `hsl(${hue},78%,72%)`;
      const cls  = m.bot ? '' : ' you';
      const tag  = m.bot ? escapeHtml(m.name) : 'YOU';
      return `<div class="cc-msg${cls}">` +
               '<div class="cc-meta">' +
                 `<span class="cc-name" style="color:${m.bot ? tone : ''}">${escapeHtml(tag)}</span>` +
                 `<span class="cc-time">${fmtTime(m.t)}</span>` +
               '</div>' +
               `<div class="cc-body">${escapeHtml(m.text)}</div>` +
             '</div>';
    }).join('');
    if (isOpen) {
      requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight; });
      lastSeenLen = items.length;
    } else if (everOpened) {
      const delta = Math.max(0, items.length - lastSeenLen);
      if (delta > 0) {
        unread = Math.min(99, unread + delta);
        badgeEl.textContent = unread > 99 ? '99+' : String(unread);
        toggleEl.classList.add('has-unread');
      }
      lastSeenLen = items.length;
    } else {
      // first paint, never opened — set baseline silently so we don't
      // immediately show "47 unread" to a user who hasn't engaged yet
      lastSeenLen = items.length;
    }
  }

  function boot() {
    whenReady(() => {
      inject();
      const game = window.CasinoBots.game;
      lastSeenLen = (window.CasinoBots.recentChat(game) || []).length;
      window.CasinoBots.subscribeChat(game, render);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.CasinoChat = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => isOpen,
  };
})();
