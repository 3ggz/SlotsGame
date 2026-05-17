const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dragontree.html'), 'utf8');
const soundDir = path.join(root, 'sfx', 'dragontreesounds');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const customSounds = [
  'button click',
  'tree hit 1',
  'tree hit 2',
  'tree hit 3',
  'tree hit 4',
  'fell 1',
  'fell 2',
  'final win sound',
];

run('custom Dragon Tree WAVs have web-ready MP3 exports', () => {
  for (const name of customSounds) {
    assert(fs.existsSync(path.join(soundDir, `${name}.wav`)), `${name}.wav should remain as the source master`);
    const mp3Path = path.join(soundDir, `${name}.mp3`);
    assert(fs.existsSync(mp3Path), `${name}.mp3 should be generated for browser playback`);
    assert(fs.statSync(mp3Path).size > 5000, `${name}.mp3 should not be clipped down to a tiny fragment`);
  }
});

run('Dragon Tree routes strike and win moments through custom sounds', () => {
  assert(html.includes("buttonClick: 'sfx/dragontreesounds/button click.mp3'"), 'strike button should use the custom button click');
  assert(html.includes("treeHit1: 'sfx/dragontreesounds/tree hit 1.mp3'"), 'tree hit 1 should be wired');
  assert(html.includes("treeHit4: 'sfx/dragontreesounds/tree hit 4.mp3'"), 'tree hit 4 should be wired');
  assert(html.includes("fell1: 'sfx/dragontreesounds/fell 1.mp3'"), 'fell 1 should be wired');
  assert(html.includes("fell2: 'sfx/dragontreesounds/fell 2.mp3'"), 'fell 2 should be wired');
  assert(html.includes("finalWin: 'sfx/dragontreesounds/final win sound.mp3'"), 'final win sound should be wired');
  assert(html.includes("AudioFX.play('buttonClick'"), 'strike click should play the custom button click');
  assert(html.includes("AudioFX.playRandom('treeHit'"), 'tree strike should randomize tree hit sounds');
  assert(html.includes("AudioFX.playAll('treeFell'"), 'winning bonus should layer both fell sounds');
  assert(html.includes("AudioFX.play('finalWin'"), 'final sting should play after the count-up');
});

run('final payout number has a shimmy animation hook', () => {
  assert(html.includes('.payout-banner .grand.shimmy'), 'grand payout number needs a shimmy class');
  assert(html.includes("grand.classList.add('shimmy')"), 'final count-up should trigger the shimmy');
});

run('fruitless hits do not play an extra consolation sound', () => {
  assert(!html.includes("AudioFX.play('lose'"), 'fruitless hit should show only the toast, without the swoopy lose sound');
  assert(!html.includes("lose: 'sfx/lose_low.mp3'"), 'Dragon Tree should not preload the old lose sound');
});

run('coin counter sound is synchronized with the grand payout count-up', () => {
  const tallySection = html.indexOf('// 7. Tally');
  const payoutSection = html.indexOf('// 8. Grand payout banner + count-up');
  const countStart = html.indexOf('await animateCount(0, payout');
  const tallyPlay = html.indexOf("AudioFX.play('tally'");
  assert(tallySection > -1 && payoutSection > -1 && countStart > -1 && tallyPlay > -1, 'bonus end sequence should be findable');
  assert(!html.slice(tallySection, payoutSection).includes("AudioFX.play('tally'"), 'coin counter should not play during multiplier reveal');
  assert(tallyPlay > payoutSection && tallyPlay < countStart, 'coin counter should start immediately before the payout number animates');
  assert(countStart - tallyPlay < 160, 'coin counter and payout number animation should start in the same beat');
});

console.log('Dragon Tree audio tests complete');
