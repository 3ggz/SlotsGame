// Rummy 500 engine core — extracted from rummy.html for Node testing.
// This is a standalone copy of the CORE TESTABLE API used during development;
// the canonical source lives between the markers in rummy.html. Kept in sync.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'rummy.html'), 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'rummy.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, Number, Array, Set, Map, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);
const C = sandbox.globalThis.RummyCore;
assert(C, 'RummyCore must be exported');

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.error('FAIL ' + name); console.error('   ' + (e.stack || e.message)); }
}
function H(strs) { return strs.map(s => C.strToCard(s)); }

// ---------------- encoding ----------------
run('card encoding round-trips for all 52', () => {
  for (let c = 0; c < 52; c++) assert.strictEqual(C.strToCard(C.cardToStr(c)), c, 'rt ' + c);
});
run('rank/suit/value basics', () => {
  assert.strictEqual(C.RANK(C.strToCard('Ac')), 0);
  assert.strictEqual(C.RANK(C.strToCard('Kd')), 12);
  assert.strictEqual(C.cardValue(C.strToCard('As')), 15);   // ace = 15
  assert.strictEqual(C.cardValue(C.strToCard('Ks')), 10);
  assert.strictEqual(C.cardValue(C.strToCard('Ts')), 10);   // ten
  assert.strictEqual(C.cardValue(C.strToCard('7d')), 7);
  assert.strictEqual(C.cardValue(C.strToCard('2c')), 2);
});

// ---------------- meld validation ----------------
run('valid set of 3 and 4 (same rank, distinct here)', () => {
  assert.strictEqual(C.meldType(H(['7c','7d','7h'])), 'set');
  assert.strictEqual(C.meldType(H(['7c','7d','7h','7s'])), 'set');
});
run('set rejects fewer than 3 and wrong ranks', () => {
  assert.strictEqual(C.meldType(H(['7c','7d'])), null);
  assert.strictEqual(C.meldType(H(['7c','7d','8h'])), null);
});
run('valid run same suit consecutive', () => {
  assert.strictEqual(C.meldType(H(['4h','5h','6h'])), 'run');
  assert.strictEqual(C.meldType(H(['9s','Ts','Js','Qs'])), 'run');
});
run('run rejects mixed suit', () => {
  assert.strictEqual(C.meldType(H(['4h','5h','6s'])), null);
});
run('ace-low run A-2-3 valid', () => {
  assert.strictEqual(C.meldType(H(['Ah','2h','3h'])), 'run');
});
run('ace-high run Q-K-A valid', () => {
  assert.strictEqual(C.meldType(H(['Qs','Ks','As'])), 'run');
});
run('ace does NOT wrap K-A-2', () => {
  assert.strictEqual(C.meldType(H(['Ks','As','2s'])), null);
});
run('run rejects non-consecutive', () => {
  assert.strictEqual(C.meldType(H(['4h','5h','7h'])), null);
});
run('run accepts unsorted input', () => {
  assert.strictEqual(C.meldType(H(['6h','4h','5h'])), 'run');
});

// ---------------- lay off ----------------
run('lay off 4th card to a set', () => {
  const set = H(['7c','7d','7h']);
  assert.strictEqual(C.canLayOff(C.strToCard('7s'), set), true);
  assert.strictEqual(C.canLayOff(C.strToCard('8s'), set), false);
});
run('lay off extends run at low end', () => {
  const runM = H(['5h','6h','7h']);
  assert.strictEqual(C.canLayOff(C.strToCard('4h'), runM), true);
  assert.strictEqual(C.canLayOff(C.strToCard('8h'), runM), true);  // high end
  assert.strictEqual(C.canLayOff(C.strToCard('4s'), runM), false); // wrong suit
});
run('lay off ace onto K-high run (ace high)', () => {
  const runM = H(['Js','Qs','Ks']);
  assert.strictEqual(C.canLayOff(C.strToCard('As'), runM), true);
  assert.strictEqual(C.canLayOff(C.strToCard('Ts'), runM), true);
});
run('lay off ace onto 2-3-4 run (ace low)', () => {
  const runM = H(['2h','3h','4h']);
  assert.strictEqual(C.canLayOff(C.strToCard('Ah'), runM), true);
  assert.strictEqual(C.canLayOff(C.strToCard('5h'), runM), true);
});
run('no lay off that would wrap', () => {
  // run A-2-3 (ace low): can't add K to the low side (no wrap)
  const runM = H(['Ah','2h','3h']);
  assert.strictEqual(C.canLayOff(C.strToCard('Kh'), runM), false);
});

// ---------------- find melds ----------------
run('findMelds discovers a set and a run', () => {
  const hand = H(['7c','7d','7h','4s','5s','6s','Kd']);
  const melds = C.findMelds(hand);
  const types = melds.map(m => C.meldType(m)).sort();
  assert(melds.some(m => C.meldType(m) === 'set'), 'has set');
  assert(melds.some(m => C.meldType(m) === 'run'), 'has run');
});

// ---------------- scoring ----------------
run('cardValue scoring: ace 15, faces 10', () => {
  let total = 0;
  for (const c of H(['As','Ks','Qd','Jc','Th'])) total += C.cardValue(c);
  assert.strictEqual(total, 15 + 10 + 10 + 10 + 10);
});

// ---------------- deck ----------------
run('deck is 52 unique; shuffle deterministic by seed', () => {
  const d = C.makeDeck();
  assert.strictEqual(d.length, 52);
  assert.strictEqual(new Set(d).size, 52);
  const a = C.shuffle(C.makeDeck(), C.mulberry32(7));
  const b = C.shuffle(C.makeDeck(), C.mulberry32(7));
  assert.deepStrictEqual(a, b);
  const c2 = C.shuffle(C.makeDeck(), C.mulberry32(8));
  assert.notDeepStrictEqual(a, c2);
});

// ---------------- deal ----------------
run('deal: 7 cards each, discard seeded, deterministic', () => {
  const a = C.deal(4, 12345);
  assert.strictEqual(a.hands.length, 4);
  for (const h of a.hands) assert.strictEqual(h.length, 7);
  assert.strictEqual(a.discard.length, 1);
  // 4*7 + 1 discard + stock = 52
  assert.strictEqual(a.stock.length, 52 - 28 - 1);
  const b = C.deal(4, 12345);
  assert.deepStrictEqual(a.hands, b.hands);
  assert.deepStrictEqual(a.stock, b.stock);
  const c2 = C.deal(4, 99);
  assert.notDeepStrictEqual(a.hands, c2.hands);
});

// ---------------- discard grab ----------------
run('grab: top card take requires no immediate use', () => {
  const pile = H(['5c', '9d', '7h']);  // top = 7h
  const g = C.legalDiscardGrab(pile, 2, H(['2s']), []);
  assert.strictEqual(g.legal, true);
  assert.strictEqual(g.requiresUse, false);
});
run('grab: deep grab legal when chosen completes a new meld', () => {
  // pile bottom..top: [5c, 9d, 7h]; grab index 0 (5c) scoops 5c,9d,7h.
  // hand has 6c,7c -> chosen 5c... not same suit run. Use a set instead.
  // chosen 7h, with hand 7c,7d -> set of three 7s. Put 7h deeper.
  const pile = H(['7h', '9d', '3s']);   // top = 3s, chosen 7h at index 0
  const hand = H(['7c', '7d', 'Kc']);
  const g = C.legalDiscardGrab(pile, 0, hand, []);
  assert.strictEqual(g.legal, true);
  assert.strictEqual(g.requiresUse, true);
  assert.strictEqual(g.satisfier.kind, 'meld');
  assert(g.satisfier.cards.indexOf(C.strToCard('7h')) >= 0);
});
run('grab: deep grab legal via layoff onto a table meld', () => {
  const pile = H(['7h', '9d', '3s']);
  const tableMelds = [{ id: 1, owner: 1, type: 'set', cards: H(['7c', '7d', '7s']) }];
  const g = C.legalDiscardGrab(pile, 0, H(['Kc']), tableMelds);
  assert.strictEqual(g.legal, true);
  assert.strictEqual(g.satisfier.kind, 'layoff');
  assert.strictEqual(g.satisfier.meldId, 1);
});
run('grab: illegal deep grab when chosen cannot be used', () => {
  const pile = H(['7h', '9d', '3s']);
  const g = C.legalDiscardGrab(pile, 0, H(['Kc', '2d']), []);
  assert.strictEqual(g.legal, false);
});

// ---------------- turn ops + going out + scoring ----------------
run('meld removes cards from hand and credits melded points', () => {
  const st = C.deal(2, 1);
  st.hands[0] = H(['7c', '7d', '7h', 'Ah', 'Kd', '2s', '3s']);
  const meld = C.applyMeld(st, 0, H(['7c', '7d', '7h']));
  assert(meld);
  assert.strictEqual(st.hands[0].length, 4);
  assert.strictEqual(st.melded[0], 21);   // three 7s = 21
});
run('layoff credits the layer, not the meld owner', () => {
  const st = C.deal(2, 1);
  st.tableMelds = [{ id: 1, owner: 0, type: 'set', cards: H(['7c', '7d', '7h']) }];
  st.melded = [21, 0];
  st.hands[1] = H(['7s', 'Kd']);
  const ok = C.applyLayoff(st, 1, C.strToCard('7s'), 1);
  assert.strictEqual(ok, true);
  assert.strictEqual(st.melded[1], 7);    // layer (player 1) gets the 7
  assert.strictEqual(st.melded[0], 21);   // owner unchanged
});
run('going out by discarding the last card ends the deal', () => {
  const st = C.deal(2, 1);
  st.hands[0] = H(['Kd']);
  st.turn = 0;
  C.applyDiscard(st, 0, C.strToCard('Kd'));
  assert.strictEqual(st.dealOver, true);
  assert.strictEqual(st.goneOut, 0);
});
run('going out by melding the last cards (no discard)', () => {
  const st = C.deal(2, 1);
  st.hands[0] = H(['7c', '7d', '7h']);
  C.applyMeld(st, 0, H(['7c', '7d', '7h']));
  const out = C.checkGoingOut(st, 0);
  assert.strictEqual(out, true);
  assert.strictEqual(st.dealOver, true);
});
run('scoreDeal: melded minus hand, ace=15', () => {
  const st = C.deal(2, 1);
  st.melded = [20, 0];
  st.hands[0] = H(['Kh']);             // 10 in hand
  st.hands[1] = H(['As', '2c']);       // 15 + 2 = 17 in hand, melded 0
  const sc = C.scoreDeal(st);
  assert.strictEqual(sc[0], 20 - 10);  // 10
  assert.strictEqual(sc[1], 0 - 17);   // -17 (negative allowed)
});

// ---------------- bot ----------------
run('bot chooseMelds picks disjoint melds', () => {
  const hand = H(['7c', '7d', '7h', '4s', '5s', '6s', 'Kd']);
  const melds = C.chooseMelds(hand);
  // should find the 7-set and the 4-5-6 run, disjoint
  const flat = [].concat(...melds);
  assert.strictEqual(new Set(flat).size, flat.length, 'no card reused');
  assert(melds.length >= 2);
});
run('bot chooseDiscard dumps a high isolated card', () => {
  // K of clubs is isolated (no neighbors), high value -> should be discarded
  const hand = H(['4s', '5s', '6s', '7d', '8d', '2h', 'Kc']);
  const d = C.chooseDiscard(hand, []);
  assert.strictEqual(d, C.strToCard('Kc'));
});

// ---------------- tournament ----------------
run('tournament: cumulative scoring, target, prize split', () => {
  const tier = C.TABLES[0];
  const players = [
    { id: 'hero', name: 'You', isHero: true },
    { id: 'b1', name: 'Bot 1' },
    { id: 'b2', name: 'Bot 2' },
    { id: 'b3', name: 'Bot 3' },
  ];
  const t = C.createTournament(tier, players);
  assert.strictEqual(t.pool, tier.buyIn * 4);
  // hero keeps winning deals (score high), others low
  C.applyDealScores(t, [120, -10, -20, -5]);
  C.applyDealScores(t, [120, -10, -20, -5]);
  assert.strictEqual(t.over, true);            // hero crossed 200
  assert.strictEqual(t.winner.id, 'hero');
  assert(t.payouts.hero === t.prize);
  // runner-up gets consolation
  assert(t.runnerUp);
  assert(t.payouts[t.runnerUp.id] === t.consolation);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
