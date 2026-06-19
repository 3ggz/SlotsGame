const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'bingo.html'), 'utf8');
const match = html.match(/\/\* CORE TESTABLE API START \*\/([\s\S]*?)\/\* CORE TESTABLE API END \*\//);
assert(match, 'bingo.html must contain a CORE TESTABLE API block');

const sandbox = { console, Math, Number, Array, Set, Map, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);
const C = sandbox.globalThis.BingoCore;
assert(C, 'BingoCore must be exported');

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.error('FAIL ' + name); console.error('   ' + (e.stack || e.message)); }
}
function calledSet(nums) { return new Set(nums); }

// ---------------- ball helpers ----------------
run('ball letter mapping B/I/N/G/O by range', () => {
  assert.strictEqual(C.ballLetter(1), 'B');
  assert.strictEqual(C.ballLetter(15), 'B');
  assert.strictEqual(C.ballLetter(16), 'I');
  assert.strictEqual(C.ballLetter(30), 'I');
  assert.strictEqual(C.ballLetter(31), 'N');
  assert.strictEqual(C.ballLetter(45), 'N');
  assert.strictEqual(C.ballLetter(46), 'G');
  assert.strictEqual(C.ballLetter(60), 'G');
  assert.strictEqual(C.ballLetter(61), 'O');
  assert.strictEqual(C.ballLetter(75), 'O');
  assert.strictEqual(C.ballLabel(42), 'N42');
});

// ---------------- card generation ----------------
run('card: 25 cells, free center, columns in range + distinct', () => {
  const rng = C.mulberry32(123);
  for (let trial = 0; trial < 200; trial++) {
    const card = C.makeCard(rng);
    assert.strictEqual(card.length, 25);
    assert.strictEqual(card[12], 0, 'free center is 0');
    for (let c = 0; c < 5; c++) {
      const colVals = [];
      for (let r = 0; r < 5; r++) {
        const idx = r * 5 + c;
        if (idx === 12) continue;
        const v = card[idx];
        assert(v >= c * 15 + 1 && v <= c * 15 + 15, `col ${c} value ${v} out of range`);
        colVals.push(v);
      }
      assert.strictEqual(new Set(colVals).size, colVals.length, 'column has distinct numbers');
    }
    // exactly 24 numbered cells
    const nums = card.filter((v, i) => i !== 12);
    assert.strictEqual(nums.length, 24);
    assert.strictEqual(new Set(nums).size, 24, 'all 24 numbers distinct across card');
  }
});
run('card: columns sorted ascending', () => {
  const rng = C.mulberry32(7);
  const card = C.makeCard(rng);
  for (let c = 0; c < 5; c++) {
    let prev = -1;
    for (let r = 0; r < 5; r++) {
      const idx = r * 5 + c; if (idx === 12) continue;
      assert(card[idx] > prev, 'ascending in column');
      prev = card[idx];
    }
  }
});
run('makeCards: distinct cards, deterministic by seed', () => {
  const a = C.makeCards(10, C.mulberry32(42));
  const b = C.makeCards(10, C.mulberry32(42));
  assert.deepStrictEqual(a, b);
  const c2 = C.makeCards(10, C.mulberry32(43));
  assert.notDeepStrictEqual(a, c2);
});

// ---------------- draw order ----------------
run('draw order is a permutation of 1..75; deterministic', () => {
  const order = C.makeDrawOrder(C.mulberry32(99));
  assert.strictEqual(order.length, 75);
  assert.strictEqual(new Set(order).size, 75);
  for (const n of order) assert(n >= 1 && n <= 75);
  const order2 = C.makeDrawOrder(C.mulberry32(99));
  assert.deepStrictEqual(order, order2);
});

// ---------------- patterns / wins ----------------
function cardFrom(map) {
  // map: object of cellIdx -> number. Fill the rest with safe out-of-the-way
  // numbers that won't be in our called set.
  const card = new Array(25).fill(0);
  let filler = 1;
  for (let i = 0; i < 25; i++) {
    if (i === 12) { card[i] = 0; continue; }
    if (map[i] != null) card[i] = map[i];
    else card[i] = 200 + (filler++); // unreachable numbers
  }
  return card;
}

run('line win: top row', () => {
  const card = cardFrom({ 0: 1, 1: 16, 2: 31, 3: 46, 4: 61 });
  const win = C.cardWins(card, calledSet([1, 16, 31, 46, 61]), 'line');
  assert(win, 'top row should win');
  // Array.from normalizes the sandbox-realm array to this realm for deepStrictEqual.
  assert.deepStrictEqual(Array.from(win).sort((a,b)=>a-b), [0,1,2,3,4]);
});
run('line win: a column', () => {
  const card = cardFrom({ 0: 1, 5: 2, 10: 3, 15: 4, 20: 5 });
  const win = C.cardWins(card, calledSet([1, 2, 3, 4, 5]), 'line');
  assert(win);
});
run('line win: diagonal uses free center', () => {
  // diagonal 0,6,12(free),18,24 — only need the 4 numbered cells called
  const card = cardFrom({ 0: 1, 6: 17, 18: 47, 24: 70 });
  const win = C.cardWins(card, calledSet([1, 17, 47, 70]), 'line');
  assert(win, 'diagonal with free center should win on 4 numbers');
});
run('no win when a line is one short', () => {
  const card = cardFrom({ 0: 1, 1: 16, 2: 31, 3: 46, 4: 61 });
  const win = C.cardWins(card, calledSet([1, 16, 31, 46]), 'line'); // missing 61
  assert.strictEqual(win, null);
});
run('four corners pattern', () => {
  const card = cardFrom({ 0: 1, 4: 61, 20: 5, 24: 70 });
  assert(C.cardWins(card, calledSet([1, 61, 5, 70]), 'four_corners'));
  assert.strictEqual(C.cardWins(card, calledSet([1, 61, 5]), 'four_corners'), null);
  // a full row should NOT win the four-corners room
  const card2 = cardFrom({ 0: 1, 1: 16, 2: 31, 3: 46, 4: 61 });
  assert.strictEqual(C.cardWins(card2, calledSet([1, 16, 31, 46, 61]), 'four_corners'), null);
});
run('X pattern needs both diagonals', () => {
  const card = cardFrom({ 0: 1, 6: 17, 18: 47, 24: 70, 4: 61, 8: 33, 16: 41, 20: 5 });
  const all = [1, 17, 47, 70, 61, 33, 41, 5];
  assert(C.cardWins(card, calledSet(all), 'x'));
  assert.strictEqual(C.cardWins(card, calledSet(all.slice(0, 7)), 'x'), null);
});
run('blackout needs all 24 numbers', () => {
  const rng = C.mulberry32(5);
  const card = C.makeCard(rng);
  const nums = card.filter((v, i) => i !== 12);
  assert(C.cardWins(card, calledSet(nums), 'blackout'));
  assert.strictEqual(C.cardWins(card, calledSet(nums.slice(0, 23)), 'blackout'), null);
});

// ---------------- progress / needed ----------------
run('cardProgress: away count + needed numbers', () => {
  const card = cardFrom({ 0: 1, 1: 16, 2: 31, 3: 46, 4: 61 });
  const p = C.cardProgress(card, calledSet([1, 16, 31, 46]), 'line');
  assert.strictEqual(p.away, 1, 'one cell away on the top row');
  const need = C.neededNumbers(card, calledSet([1, 16, 31, 46]), 'line');
  assert.deepStrictEqual(Array.from(need), [61]);
});

// ---------------- race ----------------
run('winningBallIndex: completes at the right ball', () => {
  const card = cardFrom({ 0: 1, 1: 16, 2: 31, 3: 46, 4: 61 });
  // draw order where the 5 needed numbers come at positions 2,4,6,8,10
  const order = [99, 1, 98, 16, 97, 31, 96, 46, 95, 61, 94].map(x => x > 75 ? ((x % 75) + 1) : x);
  // build a clean order: put 1,16,31,46,61 at indices 2,4,6,8,10
  const clean = [];
  for (let i = 0; i < 75; i++) clean.push(0);
  // fill with all numbers, then we just check via a constructed order
  const constructed = [];
  const needed = [1, 16, 31, 46, 61];
  let ni = 0;
  for (let n = 2; n <= 75; n++) { if (needed.indexOf(n) >= 0) continue; constructed.push(n); }
  // interleave so the last needed lands at a known index
  const result = [];
  result.push(constructed[0]);        // idx 0
  result.push(needed[0]);             // idx 1
  result.push(constructed[1]);        // idx 2
  result.push(needed[1]);             // idx 3
  result.push(constructed[2]);
  result.push(needed[2]);
  result.push(constructed[3]);
  result.push(needed[3]);
  result.push(constructed[4]);
  result.push(needed[4]);             // idx 9 -> completes here
  for (let k = 5; k < constructed.length; k++) result.push(constructed[k]);
  const bi = C.winningBallIndex(card, result, 'line');
  assert.strictEqual(bi, 9);
});
run('simulateRace: earliest card wins, ties to lower index', () => {
  const cardEarly = cardFrom({ 0: 1, 1: 16, 2: 31, 3: 46, 4: 61 });   // top row
  const cardLate  = cardFrom({ 20: 5, 21: 17, 22: 33, 23: 47, 24: 70 }); // bottom row
  // order completes top row by ball idx 4, bottom row by idx 9
  const order = [1, 16, 31, 46, 61, 5, 17, 33, 47, 70];
  for (let n = 2; n <= 75; n++) if (order.indexOf(n) < 0) order.push(n);
  const race = C.simulateRace([cardEarly, cardLate], order, 'line');
  assert.strictEqual(race.winnerIdx, 0);
  assert.strictEqual(race.ballIndex, 4);
  // tie: two identical-completion cards -> lower index wins
  const race2 = C.simulateRace([cardEarly, cardEarly], order, 'line');
  assert.strictEqual(race2.winnerIdx, 0);
});
run('full random race always produces a winner within 75 balls (line)', () => {
  for (let t = 0; t < 40; t++) {
    const rng = C.mulberry32(1000 + t);
    const cards = C.makeCards(12, rng);
    const order = C.makeDrawOrder(rng);
    const race = C.simulateRace(cards, order, 'line');
    assert(race.winnerIdx >= 0, 'someone wins');
    assert(race.ballIndex < 75, 'line completes before all balls');
  }
});
run('blackout race resolves within 75 balls', () => {
  const rng = C.mulberry32(2024);
  const cards = C.makeCards(20, rng);
  const order = C.makeDrawOrder(rng);
  const race = C.simulateRace(cards, order, 'blackout');
  assert(race.winnerIdx >= 0);
  assert(race.ballIndex <= 74);
});

// ---------------- rooms ----------------
run('rooms: prize pool math', () => {
  for (const room of C.ROOMS) {
    const p = C.prizeFor(room);
    assert.strictEqual(p.pool, room.buyIn * room.players);
    assert(p.prize + p.consolation <= p.pool + 1);
    assert(C.PATTERNS[room.pattern], 'room pattern exists');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
