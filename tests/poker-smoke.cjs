/* Headless smoke test: launch poker.html, sit down at a table, watch
   the table render correctly, automate hero through a couple of hands. */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8765;
const ROOT = path.join(__dirname, '..');

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let u = req.url.split('?')[0];
      if (u === '/') u = '/index.html';
      const p = path.join(ROOT, u);
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404); res.end('no'); return;
      }
      const ext = path.extname(p).toLowerCase();
      const mime = { '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css',
                     '.png':'image/png', '.jpg':'image/jpeg', '.json':'application/json', '.webmanifest':'application/manifest+json',
                     '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ico':'image/x-icon' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime });
      res.end(fs.readFileSync(p));
    });
    server.listen(PORT, () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1240, height: 820 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // External network / Firestore / cert errors are environment noise, not code errors.
    if (/ERR_CERT|ERR_FAILED|ERR_NAME_NOT_RESOLVED|Failed to load resource|firestore|firebase|fonts\.googleapis|fonts\.gstatic|api\.qrserver/i.test(t)) return;
    errors.push('[console] ' + t);
  });

  await page.goto('http://localhost:' + PORT + '/poker.html', { waitUntil: 'networkidle' });

  await page.waitForSelector('.table-card', { timeout: 5000 });

  // Make sure we have enough balance for the Beginner table.
  await page.evaluate(() => { try { localStorage.setItem('casino.balance', '5000'); } catch(e){} });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.table-card', { timeout: 5000 });

  // Click the first table (Beginner)
  await page.click('.table-card:not([disabled])');
  await page.waitForSelector('#buyin-modal.show', { timeout: 3000 });
  await page.click('#buyin-confirm');

  // Game screen should show
  await page.waitForSelector('#game-screen.show', { timeout: 3000 });

  // First hand dealt — seats populated.
  await page.waitForFunction(() => document.querySelectorAll('.seat .seat-hole .card').length >= 10, null, { timeout: 5000 });
  await page.waitForTimeout(600);

  // Drive the table: arm CHECK/FOLD pre-actions when offered (so we exercise
  // the auto-action path) and fold on any manual prompt to keep moving. The
  // table must keep dealing hand after hand — never bail back to the lobby
  // after a single hand (regression guard for the activeCount bug).
  let bailedToLobby = false;
  let preactionSeen = false;
  const start = Date.now();
  while (Date.now() - start < 55000) {
    const s = await page.evaluate(() => ({
      inGame: window.PokerDebug ? PokerDebug.inGame() : true,
      handNo: window.PokerDebug ? PokerDebug.handNo() : 0,
      pre: document.querySelector('#preaction-bar').classList.contains('show'),
      armed: window.PokerDebug ? PokerDebug.armedType() : null,
      ae: !document.querySelector('#action-bar').classList.contains('disabled'),
    }));
    if (!s.inGame) { bailedToLobby = true; break; }
    if (s.pre) preactionSeen = true;
    if (s.pre && !s.armed) {
      await page.evaluate(() => {
        const cf = document.querySelector('.preact[data-pa="checkfold"]');
        if (cf && !cf.hidden) { cf.click(); return; }
        const f = document.querySelector('.preact[data-pa="fold"]');
        if (f && !f.hidden) f.click();
      });
    }
    if (s.ae) {
      // Manual prompt (no valid pre-action) — fold to advance.
      const checkDisabled = await page.evaluate(() => document.querySelector('#btn-check').disabled);
      if (!checkDisabled) await page.click('#btn-check'); else await page.click('#btn-fold');
    }
    // Stop once we've confirmed several hands have been dealt continuously.
    if (s.handNo >= 4) break;
    await page.waitForTimeout(180);
  }

  const handNo = await page.evaluate(() => window.PokerDebug ? PokerDebug.handNo() : 0);
  const autoFires = await page.evaluate(() => window.PokerDebug ? PokerDebug.autoFireCount() : 0);

  console.log('handsDealt=' + handNo);
  console.log('bailedToLobby=' + bailedToLobby);
  console.log('preactionSeen=' + preactionSeen);
  console.log('autoFireCount=' + autoFires);
  console.log('errors=' + errors.length);
  if (errors.length) for (const e of errors) console.log('  - ' + e);

  let failed = errors.length > 0;
  if (bailedToLobby) { console.log('FAIL: table bailed to lobby (continuous-play regression)'); failed = true; }
  if (handNo < 3) { console.log('FAIL: expected continuous play (>=3 hands), got ' + handNo); failed = true; }
  if (!preactionSeen) { console.log('FAIL: pre-action bar never appeared'); failed = true; }

  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})();
