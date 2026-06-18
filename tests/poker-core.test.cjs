const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'poker.html'), 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'poker.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, Number, Array, Uint8Array, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);
const C = sandbox.globalThis.PokerCore;
assert(C, 'PokerCore must be exported');

let pass = 0, fail = 0;
function run(name, fn) {
  try {
    fn();
    pass++;
    console.log('PASS ' + name);
  } catch (e) {
    fail++;
    console.error('FAIL ' + name);
    console.error('   ' + (e.stack || e.message));
  }
}

// ---------------- Card helpers ----------------
run('card encoding round-trip', () => {
  for (let c = 0; c < 52; c++) {
    const s = C.cardToStr(c);
    assert.strictEqual(C.strToCard(s), c, 'roundtrip ' + s);
  }
});

run('rank/suit decoders', () => {
  assert.strictEqual(C.RANK(C.strToCard('2c')), 0);
  assert.strictEqual(C.RANK(C.strToCard('Ah')), 12);
  assert.strictEqual(C.SUIT(C.strToCard('Ks')), 3);
  assert.strictEqual(C.SUIT(C.strToCard('Kc')), 0);
});

// ---------------- Deck + shuffle ----------------
run('deck is 52 unique cards', () => {
  const d = C.makeDeck();
  assert.strictEqual(d.length, 52);
  assert.strictEqual(new Set(d).size, 52);
});

run('shuffle preserves set, depends on RNG', () => {
  const rng1 = C.mulberry32(1);
  const rng2 = C.mulberry32(1);
  const d1 = C.shuffle(C.makeDeck(), rng1);
  const d2 = C.shuffle(C.makeDeck(), rng2);
  assert.deepStrictEqual(d1, d2);
  assert.strictEqual(new Set(d1).size, 52);
  const rng3 = C.mulberry32(2);
  const d3 = C.shuffle(C.makeDeck(), rng3);
  assert.notDeepStrictEqual(d1, d3);
});

// ---------------- Hand evaluator ----------------
function H(strs) { return strs.map(s => C.strToCard(s)); }

run('evaluate: royal flush > straight flush > quads', () => {
  const royal = C.evaluate7(H(['As','Ks','Qs','Js','Ts','2c','3d']));
  const sf    = C.evaluate7(H(['9s','Ts','Js','Qs','Ks','2c','3d']));
  const quads = C.evaluate7(H(['Ah','Ad','As','Ac','Kh','Qs','Js']));
  assert(royal > sf);
  assert(sf > quads);
  assert.strictEqual(C.valueCategory(royal), C.CAT.STRAIGHT_FLUSH);
  assert.strictEqual(C.valueCategory(quads), C.CAT.QUADS);
});

run('evaluate: wheel A2345 is a straight (5-high)', () => {
  const wheel = C.evaluate7(H(['As','2d','3h','4c','5s','Kc','Qd']));
  assert.strictEqual(C.valueCategory(wheel), C.CAT.STRAIGHT);
  // top of wheel straight should be rank 3 (the 5)
  const sixHigh = C.evaluate7(H(['2c','3d','4h','5s','6c','9d','Kh']));
  assert(sixHigh > wheel, '6-high straight beats wheel');
});

run('evaluate: flush beats straight, full house beats flush', () => {
  const straight  = C.evaluate7(H(['9c','8d','7h','6s','5c','2c','3d']));
  const flush     = C.evaluate7(H(['As','Ks','9s','7s','2s','3d','4c']));
  const fullhouse = C.evaluate7(H(['Ks','Kh','Kd','5s','5h','2c','3d']));
  assert(flush > straight);
  assert(fullhouse > flush);
});

run('evaluate: two-pair tie broken by kicker', () => {
  const a = C.evaluate7(H(['Ks','Kh','7d','7c','As','2c','3d']));
  const b = C.evaluate7(H(['Ks','Kh','7d','7c','Qs','2c','3d']));
  assert(a > b, 'A-kicker beats Q-kicker');
});

run('evaluate: pair tie broken by ranked kickers', () => {
  const a = C.evaluate7(H(['Js','Jh','As','Ks','2d','3c','4c']));
  const b = C.evaluate7(H(['Js','Jh','As','Qs','2d','3c','4c']));
  assert(a > b);
});

run('evaluate: two boats - higher trips wins', () => {
  const high = C.evaluate7(H(['Ks','Kh','Kd','3s','3h','2c','4c']));
  const low  = C.evaluate7(H(['Qs','Qh','Qd','As','Ah','2c','4c']));
  assert(high > low, 'KKK33 > QQQAA');
});

run('evaluate: split pots (identical hand value)', () => {
  // Board AKQJT, both have a deuce — both play the board straight broadway.
  const v1 = C.evaluate7(H(['As','Ks','Qd','Jh','Tc','2c','2d']));
  const v2 = C.evaluate7(H(['As','Ks','Qd','Jh','Tc','3c','3d']));
  assert.strictEqual(v1, v2);
});

run('evaluate: trips beats two pair', () => {
  const trips = C.evaluate7(H(['Qs','Qh','Qd','As','5h','2c','3d']));
  const tp    = C.evaluate7(H(['As','Ah','Ks','Kh','7s','2c','3d']));
  assert(trips > tp);
});

run('evaluate: high card top-5 packing', () => {
  const v = C.evaluate7(H(['As','Kc','Qd','Jh','9c','3c','2d']));
  assert.strictEqual(C.valueCategory(v), C.CAT.HIGH);
});

run('describeHand: pretty-prints categories', () => {
  assert.strictEqual(C.describeHand(C.evaluate7(H(['As','Ks','Qs','Js','Ts','2c','3d']))), 'Royal Flush');
  assert.match(C.describeHand(C.evaluate7(H(['Ks','Kh','Kd','5s','5h','2c','3d']))), /Kings full of Fives/);
  assert.match(C.describeHand(C.evaluate7(H(['Js','Jh','As','Ks','2d','3c','4c']))), /Pair of Jacks/);
});

// ---------------- Side pots ----------------
run('side pots: triple all-in produces 3 layers', () => {
  // A=50, B=150, C=400, D calls 400. A,B,C,D all in.
  const players = [
    { id:'A', totalCommitted: 50,  hasFolded:false },
    { id:'B', totalCommitted: 150, hasFolded:false },
    { id:'C', totalCommitted: 400, hasFolded:false },
    { id:'D', totalCommitted: 400, hasFolded:false },
  ];
  const pots = C.buildPots(players);
  // expected: 50*4=200 main {A,B,C,D}, 100*3=300 side1 {B,C,D}, 250*2=500 side2 {C,D}
  assert.strictEqual(pots.length, 3, JSON.stringify(pots));
  assert.strictEqual(pots[0].amount, 200);
  assert.deepStrictEqual([...pots[0].eligible].sort(), ['A','B','C','D']);
  assert.strictEqual(pots[1].amount, 300);
  assert.deepStrictEqual([...pots[1].eligible].sort(), ['B','C','D']);
  assert.strictEqual(pots[2].amount, 500);
  assert.deepStrictEqual([...pots[2].eligible].sort(), ['C','D']);
});

run('side pots: folded contributors stay in pot, not eligible', () => {
  // A=70 folded, B=150 active, C=150 active
  const players = [
    { id:'A', totalCommitted: 70,  hasFolded:true },
    { id:'B', totalCommitted: 150, hasFolded:false },
    { id:'C', totalCommitted: 150, hasFolded:false },
  ];
  const pots = C.buildPots(players);
  // total = 70 + 150 + 150 = 370
  let sum = 0;
  for (const p of pots) sum += p.amount;
  assert.strictEqual(sum, 370);
  // folded A must not appear in any eligible set
  for (const p of pots) assert(!p.eligible.has('A'));
});

run('side pots: merge adjacent pots with same eligible set', () => {
  const players = [
    { id:'A', totalCommitted: 100, hasFolded:false },
    { id:'B', totalCommitted: 100, hasFolded:false },
  ];
  const pots = C.buildPots(players);
  assert.strictEqual(pots.length, 1);
  assert.strictEqual(pots[0].amount, 200);
});

// ---------------- State + betting ----------------
function makePlayers(seats) {
  // seats: array of { stack } or null
  return seats.map((s, i) => s ? ({
    id: 'p'+i, seat: i, name: 'P'+i, isHero: i===0,
    stack: s.stack, holeCards: [], inHand: true, hasFolded: false, isAllIn: false,
    betThisStreet: 0, totalCommitted: 0, needsToAct: true, actedThisHand: false,
    personality: 'BAL',
  }) : null);
}

run('startHand: blinds posted, hole cards dealt, toAct correct (6-max)', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200},{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 42 });
  const ok = C.startHand(st);
  assert(ok);
  // SB = seat 1, BB = seat 2, first to act = seat 3 (UTG)
  assert.strictEqual(st.sbIdx, 1);
  assert.strictEqual(st.bbIdx, 2);
  assert.strictEqual(st.toActIdx, 3);
  assert.strictEqual(st.players[1].totalCommitted, 1);
  assert.strictEqual(st.players[2].totalCommitted, 2);
  assert.strictEqual(st.players[1].stack, 199);
  assert.strictEqual(st.players[2].stack, 198);
  // Hole cards: everyone has 2
  for (const p of st.players) assert.strictEqual(p.holeCards.length, 2);
  assert.strictEqual(st.currentBet, 2);
});

run('startHand: heads-up button is SB and acts first preflop', () => {
  const players = makePlayers([{stack:200},{stack:200},null,null,null,null]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 1 });
  C.startHand(st);
  assert.strictEqual(st.sbIdx, 0);
  assert.strictEqual(st.bbIdx, 1);
  assert.strictEqual(st.toActIdx, 0);
});

run('legalActions: facing big blind preflop', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 1 });
  C.startHand(st);
  // UTG = seat 0 in 3-handed (button), SB=1, BB=2... actually 3-handed sb=1 bb=2 first to act=0
  const p = st.players[st.toActIdx];
  const la = C.legalActions(st, p);
  assert.strictEqual(la.toCall, 2);
  assert.strictEqual(la.canCheck, false);
  assert.strictEqual(la.canCall, true);
  assert.strictEqual(la.canRaise, true);
  assert(la.minRaiseTo >= 4); // 2 + 2
});

run('walk: everyone folds to BB → BB wins', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200},{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 5 });
  C.startHand(st);
  // SB=1, BB=2. UTG (3), 4, 5, 0, 1 must all fold.
  const foldOrder = [3, 4, 5, 0, 1];
  for (const idx of foldOrder) {
    assert.strictEqual(st.toActIdx, idx, 'expected ' + idx + ' to act');
    C.applyAction(st, { type: 'fold' });
  }
  assert.strictEqual(C.activeCount(st), 1);
  const summary = C.resolveFoldOut(st);
  assert.strictEqual(summary[0].winnerId, 'p2');
  // BB collected SB (1) + 0 from others (since fold-pre-blind) → BB started with 200, paid 2, gets 1 (SB chips) back
  // Uncalled-bet refund: BB had 2 in but only 1 was called (SB's blind).
  // BB gets 1 refunded immediately, then wins the 2-chip pot (1 from SB, 1 from own remaining commit).
  // Final: started 200, paid 2, refunded 1, won 2 → 201.
  assert.strictEqual(st.players[2].stack, 201);
});

// Re-examine the walk case carefully:
// After blinds: SB committed 1, BB committed 2. Pot = 3.
// Everyone folds. Only BB active. Before pot building, refundUncalled is called.
// refundUncalled: sorted by totalCommitted desc: BB=2, SB=1. top.totalCommitted (2) > second.totalCommitted (1). refund = 1. BB gets 1 back. BB.totalCommitted becomes 1.
// Now buildPots: SB=1, BB=1 → main pot of 2 (both eligible since SB hasn't folded? Wait — SB DID fold).
// Hmm SB folded after blinds. So SB.hasFolded=true. In buildPots, SB contributes but is not eligible.
// Pots: 1 from each = 2 total. Eligible = {BB}.
// BB wins 2. Started with 200, paid 2, refunded 1 (now 199 stack with 1 committed), then wins 2 → 199 + 2 = 201.
// Total chips end: SB has 199 (paid 1 to pot). BB has 201. Total = 400. Started with 400. ✓

run('walk net chip math', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200},{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 5 });
  C.startHand(st);
  const foldOrder = [3, 4, 5, 0, 1];
  for (const idx of foldOrder) {
    assert.strictEqual(st.toActIdx, idx);
    C.applyAction(st, { type: 'fold' });
  }
  C.resolveFoldOut(st);
  const total = st.players.reduce((s, p) => s + p.stack, 0);
  assert.strictEqual(total, 1200, 'total chips preserved');
  assert.strictEqual(st.players[2].stack, 201); // BB wins SB's blind
  assert.strictEqual(st.players[1].stack, 199); // SB lost 1
});

run('min-raise sequencing', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 10 });
  C.startHand(st);
  // UTG (seat 0) raises to 6 (4-bb increment)
  C.applyAction(st, { type: 'raise', amount: 6 });
  assert.strictEqual(st.currentBet, 6);
  assert.strictEqual(st.lastRaiseSize, 4);
  // SB re-raises — min legal is 10
  const la = C.legalActions(st, st.players[st.toActIdx]);
  assert.strictEqual(la.minRaiseTo, 10);
});

run('check on flop in position', () => {
  const players = makePlayers([{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 11 });
  C.startHand(st);
  // HU preflop: button (0) is SB, acts first. Both call/check.
  C.applyAction(st, { type: 'call' });   // SB completes
  C.applyAction(st, { type: 'check' });  // BB checks option
  C.advanceStreet(st);
  assert.strictEqual(st.street, 'flop');
  assert.strictEqual(st.board.length, 3);
  // BB (seat 1) acts first postflop
  assert.strictEqual(st.toActIdx, 1);
  const la = C.legalActions(st, st.players[1]);
  assert(la.canCheck);
  assert(la.canBet);
});

run('all-in mid-street: produces side pot correctly', () => {
  // 3-handed: P0=50 (button), P1=200 (SB), P2=200 (BB)
  const players = makePlayers([{stack:50},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 7 });
  C.startHand(st);
  // toAct = button (P0) UTG
  // P0 shoves all-in 50
  C.applyAction(st, { type: 'allin' });
  assert(st.players[0].isAllIn);
  // P1 (SB) calls 50
  C.applyAction(st, { type: 'call' });
  // P2 (BB) raises to 100 (full raise: increment 50)
  C.applyAction(st, { type: 'raise', amount: 100 });
  // P1 must act again
  assert.strictEqual(st.toActIdx, 1);
  // P1 calls
  C.applyAction(st, { type: 'call' });
  assert(C.roundComplete(st));
  // build pots
  const pots = C.buildPots(st.players);
  // P0=50, P1=100, P2=100 → main 50*3=150 main {P0,P1,P2}, side 50*2=100 {P1,P2}
  assert.strictEqual(pots.length, 2);
  assert.strictEqual(pots[0].amount, 150);
  assert.strictEqual(pots[1].amount, 100);
});

run('advanceStreet across all streets to showdown', () => {
  const players = makePlayers([{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 123 });
  C.startHand(st);
  // HU: button is SB (0). SB calls.
  C.applyAction(st, { type: 'call' });
  // BB option — check
  C.applyAction(st, { type: 'check' });
  assert(C.roundComplete(st));
  C.advanceStreet(st);
  assert.strictEqual(st.street, 'flop');
  assert.strictEqual(st.board.length, 3);
  // Both check flop
  C.applyAction(st, { type: 'check' });
  C.applyAction(st, { type: 'check' });
  C.advanceStreet(st);
  assert.strictEqual(st.street, 'turn');
  assert.strictEqual(st.board.length, 4);
  C.applyAction(st, { type: 'check' });
  C.applyAction(st, { type: 'check' });
  C.advanceStreet(st);
  assert.strictEqual(st.street, 'river');
  assert.strictEqual(st.board.length, 5);
  C.applyAction(st, { type: 'check' });
  C.applyAction(st, { type: 'check' });
  C.advanceStreet(st);
  assert.strictEqual(st.street, 'showdown');
});

run('resolveShowdown: total pot preserved', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 88 });
  C.startHand(st);
  // everyone calls preflop, checks down to river
  while (st.street !== 'showdown') {
    if (C.roundComplete(st)) { C.advanceStreet(st); continue; }
    const p = st.players[st.toActIdx];
    const la = C.legalActions(st, p);
    if (la.canCheck) C.applyAction(st, { type: 'check' });
    else C.applyAction(st, { type: 'call' });
  }
  const totalBefore = st.players.reduce((s, p) => s + p.stack, 0) + st.players.reduce((s, p) => s + p.totalCommitted, 0);
  C.resolveShowdown(st);
  const totalAfter = st.players.reduce((s, p) => s + p.stack, 0);
  assert.strictEqual(totalBefore, totalAfter, 'chips conserved');
});

// ---------------- Bot AI smoke ----------------
run('bot decision returns a legal action shape', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 99 });
  C.startHand(st);
  const a = C.decideBot(st, st.toActIdx);
  assert(['fold','check','call','bet','raise','allin'].includes(a.type), 'action type: ' + a.type);
});

run('preflop strength: AA > 72o', () => {
  // Heads-up scale (oppN=1), no table-size penalty
  const aaHU = C.preflopStrength([C.strToCard('As'), C.strToCard('Ad')], 1);
  const trashHU = C.preflopStrength([C.strToCard('7c'), C.strToCard('2d')], 1);
  assert(aaHU > trashHU);
  assert(aaHU > 0.9, 'aa HU ' + aaHU);
  assert(trashHU < 0.5, 'trash HU ' + trashHU);
  // 6-max should keep ordering but values shrink
  const aa6 = C.preflopStrength([C.strToCard('As'), C.strToCard('Ad')], 5);
  const trash6 = C.preflopStrength([C.strToCard('7c'), C.strToCard('2d')], 5);
  assert(aa6 > trash6);
});

run('monte carlo equity: AA vs 1 opp >= 0.78', () => {
  const rng = C.mulberry32(7);
  const eq = C.monteCarloEquity([C.strToCard('As'), C.strToCard('Ad')], [], 1, 200, rng);
  assert(eq > 0.78, 'eq=' + eq);
});

run('monte carlo equity: 72o vs 1 opp < 0.40', () => {
  const rng = C.mulberry32(7);
  const eq = C.monteCarloEquity([C.strToCard('7c'), C.strToCard('2d')], [], 1, 200, rng);
  assert(eq < 0.40, 'eq=' + eq);
});

// ---------------- Run a complete hand with bots from a fixed seed ----------------
run('simulate a full hand: no engine crash and chips conserved', () => {
  for (let trial = 0; trial < 5; trial++) {
    const players = makePlayers([{stack:200},{stack:200},{stack:200},{stack:200},{stack:200},{stack:200}]);
    const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 1000 + trial });
    const startChips = st.players.reduce((s, p) => s + p.stack, 0);
    C.startHand(st);
    let safety = 200;
    while (!C.handIsOver(st) && safety-- > 0) {
      if (C.roundComplete(st)) { C.advanceStreet(st); continue; }
      const idx = st.toActIdx;
      const a = C.decideBot(st, idx);
      C.applyAction(st, a);
    }
    if (safety <= 0) throw new Error('infinite loop in trial ' + trial);
    if (st.street === 'showdown') C.resolveShowdown(st);
    else C.resolveFoldOut(st);
    const endChips = st.players.reduce((s, p) => s + p.stack, 0);
    assert.strictEqual(endChips, startChips, 'chips conserved in trial ' + trial + ' (start '+startChips+', end '+endChips+')');
  }
});

run('simulate 50 hands: no crash, chips conserved', () => {
  const players = makePlayers([{stack:200},{stack:200},{stack:200},{stack:200},{stack:200},{stack:200}]);
  const st = C.createState({ players, button: 0, sbAmt: 1, bbAmt: 2, seed: 2024 });
  const startChips = st.players.reduce((s, p) => s + p.stack, 0);
  let handsPlayed = 0;
  for (let h = 0; h < 50; h++) {
    // skip if not enough players left
    const seated = st.players.filter(p => p && p.stack > 0);
    if (seated.length < 2) break;
    const ok = C.startHand(st);
    if (!ok) break;
    handsPlayed++;
    let safety = 300;
    while (!C.handIsOver(st) && safety-- > 0) {
      if (C.roundComplete(st)) { C.advanceStreet(st); continue; }
      const a = C.decideBot(st, st.toActIdx);
      C.applyAction(st, a);
    }
    if (safety <= 0) throw new Error('infinite loop hand ' + h);
    if (st.street === 'showdown') C.resolveShowdown(st);
    else C.resolveFoldOut(st);
    // reset for next hand: clear board, hole cards, commits; but stacks persist
    for (const p of st.players) {
      if (!p) continue;
      p.holeCards = [];
      p.betThisStreet = 0;
      p.totalCommitted = 0;
      p.hasFolded = false;
      p.isAllIn = false;
      p.needsToAct = false;
      p.actedThisHand = false;
    }
    st.board = [];
    st.pots = [];
  }
  const endChips = st.players.filter(p => p).reduce((s, p) => s + p.stack, 0);
  assert.strictEqual(endChips, startChips, '50-hand chip conservation: start '+startChips+', end '+endChips);
  assert(handsPlayed >= 5, 'should play many hands without crashing');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
