"""
Generate the Diamond Spin slots SFX library via ElevenLabs.

Design notes:
  - Mechanical foley (reels, clicks): high prompt_influence (0.9-0.95),
    minimum duration, explicit "no decay tail" so the model doesn't add roll.
  - Musical chimes/bells/fanfares: moderate prompt_influence (0.65-0.75)
    to let the model phrase the melody naturally; longer durations so
    the gesture can develop.
  - Avoid generic "slot machine" / "casino" references when describing
    foley — they invoke cliche-glassy samples. Anchor in physical objects
    (mallet on glockenspiel, wooden gear engagement, etc.).
  - Always specify dryness and the absence of audience/voice/ambient sounds.

Run: python generate_slots.py
"""
import os
import sys
import time
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
client = ElevenLabs()

# (filename, duration_s, prompt_influence, prompt)
SFX = [
    # ---------- REELS ----------
    ("reel_start.mp3", 0.7, 0.9,
     "A small metal lever clicks into place followed immediately by an accelerating mechanical whir as a heavy wheel begins spinning fast. Brief sharp 'kick' transient then a smooth upward rolling sound that quickly fades. Anechoic, dry close foley recording. No music, no voices, no ambience."),

    ("reel_loop.mp3", 2.0, 0.85,
     "A seamlessly loopable mechanical whirring sound of a heavy wooden reel spinning fast on metal bearings. Smooth even low-mid texture with a faint rhythmic rolling underneath. Constant intensity, no variation, perfectly steady, dry close microphone. No clicks, no metal scrape, no music, no voices."),

    ("reel_stop_1.mp3", 0.5, 0.95,
     "One single firm mechanical 'thunk' as a heavy wooden reel locks into place. Tight low-mid wooden impact combined with a brief high-frequency latch click at the very front. Anechoic dry close recording. Sound ends immediately, no roll, no decay tail. No music."),

    ("reel_stop_2.mp3", 0.5, 0.95,
     "One single deep mechanical 'clunk' as a heavy reel detent engages. Dense low woody impact with a tiny metallic 'kik' transient at the front. Tight, dry, anechoic studio foley. No reverb, no decay tail, no music."),

    ("reel_stop_3.mp3", 0.5, 0.95,
     "One single sharp mechanical reel-stop 'klonk' with conviction. Heavy low-frequency impact and a small bright locking-pin click. Brief, percussive, dry, anechoic. No roll, no decay tail."),

    ("reel_stop_final.mp3", 0.6, 0.95,
     "One emphatic mechanical 'CHUNK': heavy wooden reel slamming firmly into its final position with conviction. Deep low body, a snap of metal locking, and immediate silence. Tight dry anechoic close foley. No reverb tail."),

    # ---------- ANTICIPATION ----------
    ("anticipation_build.mp3", 1.8, 0.78,
     "A slowly rising cinematic suspense build. Deep low synth drone climbing gradually in pitch over 1.8 seconds, with a subtle pulsing rhythm like a quickening heartbeat underneath, and a faint high shimmering layer that grows brighter as it rises. Ends at peak tension with no resolution and no impact. No drums, no melody, no voices."),

    ("anticipation_high.mp3", 1.5, 0.78,
     "An urgent fast-rising cinematic suspense build. A bright pulsing synth climbs rapidly in pitch over 1.5 seconds, accompanied by a quickening tick-tock rhythm and an upward whoosh of air. Ends at peak intensity with no resolution. No vocals, no melody."),

    # ---------- WINS ----------
    ("win_small.mp3", 1.2, 0.7,
     "A short bright cheerful glockenspiel arpeggio: three or four crystalline mallet notes climbing in pitch quickly, ending on a higher note with a small gentle hall reverb tail. Clean, sparkly, joyful. No drums, no vocals, no synth."),

    ("win_medium.mp3", 1.8, 0.7,
     "A medium-length happy win sting. A bright glockenspiel arpeggio climbs five or six notes, joined by a warm sustained major chord on soft strings. Joyful and clean, gentle hall space. No vocals, no percussion."),

    ("win_big.mp3", 2.6, 0.7,
     "A big triumphant casino win sting. A rising fanfare of bright glockenspiel and tubular bells, joined by a warm orchestral brass swell, with a low timpani impact at the start and a glittering high cascade at the end. Celebratory, sparkly, ends on a sustained shining major chord. No vocals."),

    ("jackpot_grand.mp3", 4.5, 0.65,
     "An epic Vegas grand jackpot fanfare. Begins with a massive timpani roll into an enormous orchestral brass blast on a major chord. A long cascading glockenspiel and bell run climbs two octaves while a choir-like 'aah' pad sustains beneath. Builds to a huge triumphant resolution with a final sparkling shimmer. Cinematic, dramatic, joyful, glittery. No solo vocals, no spoken words."),

    # ---------- BONUS / DIAMOND ----------
    ("bonus_trigger.mp3", 2.0, 0.7,
     "A magical bonus reveal sting. Starts with a quick upward whoosh, then a bright shimmering chord of bells and crystals, followed by a soft sustained warm pad with a final twinkle. Like a treasure chest opening. Magical, hopeful, no vocals, no drums."),

    ("diamond_land.mp3", 1.4, 0.78,
     "A beautiful single crystalline chime: striking a fine crystal glass with a soft mallet produces a pure high shimmering bell tone with cascading sympathetic overtones, ringing out with sparkle and ethereal magic. Clean studio recording, gentle hall reverb. No vocals, no percussion."),

    ("gem_upgrade.mp3", 0.9, 0.8,
     "A quick rising magical sparkle. A fast ascending glockenspiel run of five notes climbing rapidly in pitch, with a bright upward shimmery swoop layered on top. Very brief, magical, bright, like a gem leveling up. No vocals."),

    ("respin_reset.mp3", 0.9, 0.75,
     "A short warm magical chord with a quick upward shimmer rising over it, like a chance being refreshed. Optimistic, brief, gentle bells, no vocals."),

    # ---------- BONUS MINI-GAME ----------
    ("cell_spin_start.mp3", 0.7, 0.85,
     "A soft mechanical whir as a small disc begins to spin. A low rolling whirring sound rising slightly in pitch over 0.7 seconds, ending with a small fade. Dry close foley recording. No music, no clicks, no voices."),

    ("cell_tick.mp3", 0.5, 0.95,
     "One single very brief mechanical 'tick' click, like a roulette ball ticking past a divider, sharp transient with no decay, dry anechoic close recording. No music, no roll."),

    # ---------- REVEAL ----------
    ("reveal_shine.mp3", 1.4, 0.75,
     "A magical reveal sparkle: an upward rising shimmer combined with a cascade of bright bells and crystals, like a curtain pulling back on a treasure. Bright, celebratory, brief warm gentle hall tail. No vocals, no drums."),

    # ---------- COIN ----------
    ("coin_drop.mp3", 0.5, 0.9,
     "A single small metal coin clinking onto a metal tray with one bright ringing 'plink', brief and clean, sound ends immediately, no other coins, no continuing roll. Dry close foley recording."),

    # ---------- UI ----------
    ("button_press.mp3", 0.5, 0.9,
     "A single soft satisfying mid-frequency button click, like pressing a premium mechanical keyboard switch, slight low warmth, very brief, dry studio recording, no resonance, no decay tail. No music."),

    ("bet_up.mp3", 0.5, 0.88,
     "A single brief upward 'blip' chime, a quick electronic ping sliding up in pitch over a few hundred milliseconds, like incrementing a counter on a control panel. Clean, bright, brief, no decay tail."),

    ("bet_down.mp3", 0.5, 0.88,
     "A single brief downward 'blop' chime, a quick electronic ping sliding down in pitch over a few hundred milliseconds, like decrementing a counter. Clean, mellow, brief, no decay tail."),

    # ---------- BALANCE ----------
    ("add_cash.mp3", 1.0, 0.75,
     "A pleasant ascending bell chime sequence, like adding credit to an account screen, four bright notes climbing happily, ending with a small twinkle. Warm and clean, brief hall tail. No vocals, no percussion."),
]


def generate(filename, prompt, duration, influence):
    out_path = OUT / filename
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"  skip (exists): {filename}")
        return
    print(f"  generating: {filename} ({duration}s, infl={influence})")
    audio = client.text_to_sound_effects.convert(
        text=prompt,
        duration_seconds=duration,
        prompt_influence=influence,
        output_format="mp3_44100_192",  # higher bitrate for crisper quality
    )
    with open(out_path, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    size = out_path.stat().st_size
    print(f"    -> {size} bytes")


def main():
    if not os.environ.get("ELEVENLABS_API_KEY"):
        print("ERROR: ELEVENLABS_API_KEY not set in environment.")
        sys.exit(1)
    print(f"Output dir: {OUT}")
    print(f"Generating {len(SFX)} SFX files at 192kbps MP3...")
    for i, (fn, dur, infl, prompt) in enumerate(SFX, 1):
        print(f"\n[{i}/{len(SFX)}] {fn}")
        try:
            generate(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
        time.sleep(0.15)
    print("\nDone.")


if __name__ == "__main__":
    main()
