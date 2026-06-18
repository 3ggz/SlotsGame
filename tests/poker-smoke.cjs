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

  // Take a screenshot at table-sit
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(ROOT, 'tests/poker-1-sit.png'), fullPage: false });

  // Wait for the first hand to begin and dealt — check community starts empty, seats populated
  await page.waitForFunction(() => document.querySelectorAll('.seat .seat-hole .card').length >= 10, null, { timeout: 5000 });
  await page.waitForTimeout(800);

  // Hero might need to act preflop — wait for action bar to be enabled, then click CALL or CHECK
  // Loop up to 3 hands of auto-play
  let hands = 0;
  const maxHands = 3;
  const start = Date.now();
  while (hands < maxHands && Date.now() - start < 60000) {
    // wait for action bar enabled (hero turn) or proceed
    const enabled = await page.evaluate(() => !document.querySelector('#action-bar').classList.contains('disabled'));
    if (enabled) {
      // Choose CHECK/CALL by default; sometimes fold
      const btnCheck = await page.locator('#btn-check');
      const isCallable = !(await btnCheck.isDisabled());
      if (isCallable) await btnCheck.click();
      else await page.click('#btn-fold');
      await page.waitForTimeout(400);
    } else {
      // detect new hand started by checking handNo? simpler: poll
      const status = await page.evaluate(() => {
        const bn = document.querySelector('#message-banner');
        return bn ? bn.textContent : '';
      });
      // Did a new hand start?
      const newHand = await page.evaluate(() => document.querySelector('#community').children.length === 0);
      // crude heuristic: when there's a fresh hand we'll see 0 community cards.
      if (newHand && (await page.evaluate(() => {
        const banner = document.querySelector('#message-banner');
        return banner && /New hand/.test(banner.textContent);
      }))) hands++;
      await page.waitForTimeout(450);
    }
    if (errors.length) break;
  }
  await page.screenshot({ path: path.join(ROOT, 'tests/poker-2-playing.png'), fullPage: false });

  console.log('handsObserved=' + hands);
  console.log('errors=' + errors.length);
  if (errors.length) {
    for (const e of errors) console.log('  - ' + e);
  }
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})();
