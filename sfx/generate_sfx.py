"""
Generate the blackjack SFX library via ElevenLabs.
Requires ELEVENLABS_API_KEY in env. Skips files that already exist.
Run: python generate_sfx.py
"""
import os
import sys
import time
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
client = ElevenLabs()

# (filename, prompt, duration, prompt_influence)
SFX = [
    # CARDS — sharp, crisp, dry, close-mic, no music, no reverb
    ("card_deal_a.mp3",
     "Single playing card dealt across green felt table, crisp paper slide, short and dry, close microphone, no music, no reverb",
     0.5, 0.75),
    ("card_deal_b.mp3",
     "Playing card sliding fast onto felt blackjack table, dry paper friction, light tap when it lands, close microphone, no music",
     0.5, 0.75),
    ("card_deal_c.mp3",
     "Quick playing card deal, short paper whoosh and gentle felt landing tap, dry studio recording, no reverb",
     0.5, 0.75),
    ("card_hit.mp3",
     "Playing card flicked onto stack of other cards on felt table, sharp paper-on-paper tap, dry and tight, no reverb",
     0.5, 0.75),
    ("card_flip.mp3",
     "Single playing card being flipped face-up, quick paper whoosh and crisp snap, dry close recording, no music",
     0.6, 0.8),
    ("card_peek.mp3",
     "Casino dealer subtly peeking at the corner of a hole card, very soft paper rustle and small bend, intimate close microphone, dry, no music",
     0.8, 0.85),
    ("shuffle.mp3",
     "Casino playing card riffle shuffle, fast paper cascade, dry and detailed, close microphone, no music",
     1.3, 0.7),

    # CHIPS — crispy clay clack, woody, weighty
    ("chip_place_a.mp3",
     "Single heavy clay casino chip placed firmly on green felt table, one tight woody clack and silence, dry and short, close microphone, no music, no reverb",
     0.5, 0.9),
    ("chip_place_b.mp3",
     "One clay casino poker chip dropped onto felt, single sharp dense clack with slight paper-felt texture then silence, dry close recording",
     0.5, 0.9),
    ("chip_place_c.mp3",
     "One casino chip set down on top of another chip, single clear woody clink, dry studio recording, no reverb, very brief",
     0.5, 0.9),
    ("chip_stack_a.mp3",
     "Few clay casino chips clinking together as they stack, dry crisp clatter, close microphone, no music, no reverb",
     0.5, 0.85),
    ("chip_stack_b.mp3",
     "Small stack of casino chips settling and clinking, tight woody chatter, dry and clean, no music",
     0.5, 0.85),
    ("chip_select.mp3",
     "Short tactile click selecting a casino chip, like a small plastic chip tap, dry and crisp UI sound, very brief, no music",
     0.5, 0.85),
    ("chip_payout.mp3",
     "Cascade of casino clay chips being pushed across felt toward player, satisfying rolling clatter, dry close microphone, no music",
     0.9, 0.75),
    ("chip_clear.mp3",
     "Casino dealer sweeping a small pile of chips off the felt, brief chip cascade, dry close recording, no music",
     0.6, 0.75),

    # OUTCOMES — short musical stings, no instrumentation tails
    ("win_chime.mp3",
     "Short bright cheerful chime, ascending two-note bell, casino win, clean digital UI sound, no reverb tail",
     0.7, 0.6),
    ("blackjack_fanfare.mp3",
     "Triumphant short casino jackpot sting, bright bells and a quick glitter sparkle, celebratory but compact, no long reverb",
     1.2, 0.55),
    ("push_neutral.mp3",
     "Soft neutral two-note ding, gentle bell, casino push or tie sound, clean, no reverb",
     0.5, 0.7),
    ("bust_thud.mp3",
     "Short descending disappointment sound, low soft thud with a quick downward bend, dry, no reverb",
     0.5, 0.7),
    ("lose_low.mp3",
     "Short subtle losing sound, low gentle buzz with a quick fade, dry and brief, no music",
     0.5, 0.7),

    # UI
    ("button_soft.mp3",
     "Short soft UI button press, low click with a tiny bloom, clean and dry, brief, no reverb",
     0.5, 0.8),

    # CRAPS — bubble dome, dice, puck, outcomes
    ("bubble_shake.mp3",
     "Two casino dice clattering rapidly inside a clear acrylic dome, sharp plastic-on-plastic rattle, dry close microphone, no music, no reverb",
     1.4, 0.8),
    ("bubble_settle.mp3",
     "Two casino dice finishing tumbling inside a clear acrylic dome and coming to rest, final plastic-on-plastic clack with one tiny skitter, completely dry, close microphone, no reverb, no music",
     0.5, 0.9),
    ("puck_on.mp3",
     "Heavy plastic casino dealer puck slapped firmly down on green felt, single dense low thud with a slight wooden character and the muted scuff of felt fibers, completely dry, close microphone, no reverb, no music",
     0.5, 0.9),
    ("puck_off.mp3",
     "Heavy plastic casino puck flipped over on a felt table, soft hollow tumble and quick muted settle, dry close microphone, no reverb, no music",
     0.5, 0.9),
    ("seven_out.mp3",
     "Brief somber descending three-note sting, warm soft synth pad with subtle low piano, gentle disappointed casino vibe, completely dry, no percussion, no reverb tail, no continuation",
     0.9, 0.65),
    ("point_made.mp3",
     "Bright ascending two-note bell chime resolving up a major fifth, triumphant arrival, clean glassy bell timbre, very compact, no reverb tail, no continuation",
     0.7, 0.7),
    ("field_win.mp3",
     "Very short sparkly upward arpeggio on a tiny music box or glockenspiel, brief tinkling cascade, dry casino flourish, no reverb, no continuation",
     0.5, 0.75),
    ("hardway_win.mp3",
     "Single crisp triumphant bell ping with a brief glitter sparkle, bright casino hardway win, very compact, no reverb tail, no continuation",
     0.5, 0.8),
    ("props_win.mp3",
     "Short bright xylophone chime ascending two notes, casino prop bet win, dry and brief, no reverb, no continuation",
     0.6, 0.75),
    ("fire_light.mp3",
     "Single soft UI ping, brief warm bell tone with a tiny glassy attack like a status indicator turning on, very brief, completely dry, no reverb, no continuation",
     0.5, 0.85),
    ("fire_big.mp3",
     "Triumphant compact casino jackpot fanfare with bright bells and a glittery sparkle rise, no brass, no drums, celebratory but contained, no long reverb tail, no continuation",
     1.2, 0.6),
]


def generate(filename, prompt, duration, influence):
    out_path = OUT / filename
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"  skip (exists): {filename}")
        return
    print(f"  generating: {filename}  ({duration}s)")
    audio = client.text_to_sound_effects.convert(
        text=prompt,
        duration_seconds=duration,
        prompt_influence=influence,
        output_format="mp3_44100_128",
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
    print(f"Generating {len(SFX)} SFX files...")
    for i, (fn, prompt, dur, infl) in enumerate(SFX, 1):
        print(f"[{i}/{len(SFX)}] {fn}")
        try:
            generate(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
        # tiny pause to be polite to the API
        time.sleep(0.2)
    print("\nDone.")


if __name__ == "__main__":
    main()
