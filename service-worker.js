/* ============================================================
   service-worker.js — Diamond Casino PWA
   ============================================================
   Strategy:
     - Precache the app shell on install (HTML + casino-audio.js
       + manifest + icons + lobby symbol images). Small and fast.
     - Runtime caches, segregated by content type:
         html      → network-first  (always try for updates)
         audio     → cache-first    (immutable, large, expensive)
         image/font→ stale-while-revalidate
         other     → network-first with cache fallback
     - Range requests (audio scrubbing) bypass the SW completely
       so the browser's native media handling is undisturbed.
     - Bump CACHE_VERSION to roll out a new shell.
   ============================================================ */

const CACHE_VERSION = 'v18';
const PRECACHE      = `diamond-casino-shell-${CACHE_VERSION}`;
const RUNTIME_HTML  = `diamond-casino-html-${CACHE_VERSION}`;
const RUNTIME_AUDIO = `diamond-casino-audio-${CACHE_VERSION}`;
const RUNTIME_ASSET = `diamond-casino-asset-${CACHE_VERSION}`;
const RUNTIME_OTHER = `diamond-casino-other-${CACHE_VERSION}`;

const ALL_CACHES = [PRECACHE, RUNTIME_HTML, RUNTIME_AUDIO, RUNTIME_ASSET, RUNTIME_OTHER];

// Files cached on install. Keep this list small so install is fast.
const PRECACHE_URLS = [
  './',
  './index.html',
  './slots.html',
  './kraken.html',
  './lucky7saloon.html',
  './blackjack.html',
  './craplesscraps.html',
  './plinko.html',
  './rocket.html',
  './launcher.html',
  './casino-audio.js',
  './casino-account.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './images/diamond.png',
  './images/bell.png',
  './images/bar.png',
  './images/clover.png',
  './images/crown.png',
  './images/heart.png',
  './images/seven.png',
  './images/star.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // addAll is atomic — any 404 aborts the install. We use individual
      // add() calls and swallow failures so a missing optional asset
      // doesn't break installation.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('diamond-casino-') && !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Message channel so pages can trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- fetch routing ---------- */

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET — never cache POST/PUT and never break it.
  if (req.method !== 'GET') return;

  // Bypass SW for range requests (media scrubbing). Letting the browser
  // talk directly to the network preserves seeking behaviour.
  if (req.headers.has('range')) return;

  const url = new URL(req.url);

  // Don't touch chrome-extension, blob:, data:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Don't intercept the QR code API — it's cheap, mutable, and
  // off-origin. Let the browser do its thing.
  if (url.hostname === 'api.qrserver.com') return;

  const dest    = req.destination;
  const path    = url.pathname.toLowerCase();
  const isAudio = dest === 'audio' || /\.(mp3|m4a|aac|ogg|wav|opus)$/.test(path);
  const isHTML  = dest === 'document' || req.mode === 'navigate' || path.endsWith('.html') || path.endsWith('/');
  const isAsset = ['image', 'font', 'style', 'script'].includes(dest)
                || /\.(png|jpe?g|svg|webp|gif|ico|css|js|woff2?|ttf|otf)$/.test(path);
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isAudio)              event.respondWith(cacheFirst(req, RUNTIME_AUDIO));
  else if (isHTML)          event.respondWith(networkFirst(req, RUNTIME_HTML));
  else if (isAsset || isGoogleFont)
                            event.respondWith(staleWhileRevalidate(req, RUNTIME_ASSET));
  else                      event.respondWith(networkFirst(req, RUNTIME_OTHER));
});

/* ---------- strategies ---------- */

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Navigation request with nothing cached — fall back to the lobby
    // so the app still launches offline.
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || fetch(req);
}
