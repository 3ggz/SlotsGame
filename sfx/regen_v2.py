"""
Regenerate the chip and card SFX with improved prompts.
Generates 3 candidates per sound into sfx/candidates/<name>/<i>.mp3
so we can pick the best take.

Run: python regen_v2.py
"""
import os
import sys
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
BACKUP = OUT / "v1_backup"
BACKUP.mkdir(exist_ok=True)
client = ElevenLabs()

# Each entry: (filename, prompt, duration_seconds, prompt_influence)
# Strategy:
#   - Avoid "clay" (model trends glassy); use "ceramic composite" + "thick" + "dense"
#   - Anchor with explicit material refs and dryness
#   - Longer durations give the model room to commit to a single hit
#   - High prompt_influence (0.9+) for tight literal sounds
SFX = [
    # ---------- CHIPS ----------
    ("chip_place_a.mp3", 1.0, 0.95,
     "ASMR foley recording of one heavy ceramic composite casino poker chip dropped flat onto a green felt blackjack table from one inch height. Produces a single deep low-mid 'tock' thud with dense weight and a tiny percussive paper-felt slap. Completely dry, anechoic studio recording, very close contact microphone, no reverb, no music, no other chips, no clinking, no glass, no metallic ring, just one solid heavy chip-on-felt impact."),
    ("chip_place_b.mp3", 1.0, 0.95,
     "Foley sound effect of one solid ceramic casino chip set down firmly onto another chip on a felt surface. Single sharp dense 'clack' with weighty low-frequency body, very short transient, anechoic, dry studio recording, close microphone. No glass, no plastic, no metal, no reverb, no music, no continuing chatter, just one chip-on-chip impact."),
    ("chip_place_c.mp3", 1.0, 0.95,
     "Foley recording of one dense composite poker chip dropping onto a felt-covered wooden poker table. Deep 'thock' with a hint of paper-felt rustle, woody undertone, no high-frequency ringing, completely dry close microphone recording, anechoic chamber. No glass, no clinking, no reverb, no music, just one chip."),

    ("chip_stack_a.mp3", 1.2, 0.9,
     "Foley sound of three or four ceramic composite casino chips colliding briefly as they stack, dense low woody clatter and short paper-felt friction, anechoic dry close recording, no high pitch, no glass, no metal ring, no music, no reverb."),
    ("chip_stack_b.mp3", 1.2, 0.9,
     "Sound of a hand pushing several heavy ceramic casino chips together so they bump and settle into a small stack, dense muffled chatter with weighty thuds, dry anechoic close recording, no glass, no plastic clatter, no metallic ring, no reverb, no music."),

    ("chip_select.mp3", 0.6, 0.85,
     "Single short tactile tap as a finger lightly flicks the top of a ceramic casino chip, a quick muted low click with a slight paper-felt brush, very dry close microphone, no reverb, no music, very brief and tight."),

    ("chip_payout.mp3", 1.4, 0.85,
     "Casino dealer pushing a small stack of heavy ceramic chips across green felt toward the player, multiple chips bumping and rolling against each other with dense low-mid clatter and felt friction, rich layered foley, dry close microphone, anechoic, no music, no reverb, no glass, no metal ring."),
    ("chip_clear.mp3", 0.9, 0.85,
     "Casino dealer sweeping a small group of ceramic chips off the felt with one hand, short cascading chip clatter with felt friction, dense low-mid texture, dry close microphone, anechoic, no music, no reverb."),

    # ---------- CARDS ----------
    ("card_deal_a.mp3", 0.7, 0.95,
     "ASMR foley recording of a single thick lacquered casino playing card being dealt from the top of a fresh deck, sliding fast across green felt for half a second and stopping with a soft tap. Sharp crisp paper friction with a smooth airy 'shf' transient and gentle landing. Extremely dry close microphone, no music, no reverb, no other cards, no echo."),
    ("card_deal_b.mp3", 0.7, 0.95,
     "Foley of one new lacquered playing card flicked across a felt blackjack table, crisp 'shwip' paper-on-felt slide ending in a small tap. Very tight, dry, intimate close microphone, anechoic, no reverb, no music, just one card."),
    ("card_deal_c.mp3", 0.7, 0.95,
     "Foley recording of one casino playing card sliding fast across a green felt table from a dealer's hand, crisp dry paper friction with a sharp transient at start and small soft landing tap, no other cards, no reverb, no music, anechoic studio, close microphone."),

    ("card_hit.mp3", 0.7, 0.95,
     "Single playing card snapped down on top of two other cards on a felt blackjack table, crisp sharp paper-on-paper 'thwap' with a clean transient and short tail, dry anechoic close microphone, no reverb, no music, no other cards, just one impact."),

    ("card_flip.mp3", 0.8, 0.9,
     "One casino playing card being flipped face-up on a felt table, quick paper whoosh followed by a crisp lacquered-paper snap as it lands face-up, intimate close microphone, dry anechoic recording, no reverb, no music, no other cards."),

    ("card_peek.mp3", 1.2, 0.9,
     "ASMR sound of a casino dealer subtly lifting the corner of a single playing card on a green felt table to peek at it, very soft slow paper bend and small rustle, intimate ultra-close microphone, completely dry anechoic, no reverb, no music, no breathing, no other cards."),

    ("shuffle.mp3", 1.6, 0.85,
     "Casino dealer doing a quick riffle shuffle with a fresh deck of lacquered playing cards over a green felt table, fast crisp paper cascade and brief tabletop slap, dry anechoic close microphone recording, no music, no reverb, no audience."),
]

def regenerate(filename, prompt, duration, influence):
    out_path = OUT / filename
    backup_path = BACKUP / filename
    # Back up original v1 file (only the first time)
    if out_path.exists() and not backup_path.exists():
        backup_path.write_bytes(out_path.read_bytes())
    print(f"  ({duration}s, infl={influence}) -> {filename}")
    audio = client.text_to_sound_effects.convert(
        text=prompt,
        duration_seconds=duration,
        prompt_influence=influence,
        output_format="mp3_44100_128",
    )
    with open(out_path, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    print(f"    -> {out_path.stat().st_size} bytes")


def main():
    if not os.environ.get("ELEVENLABS_API_KEY"):
        print("ERROR: ELEVENLABS_API_KEY not set in environment.")
        sys.exit(1)
    print(f"Regenerating {len(SFX)} sounds; v1 backed up to {BACKUP}")
    for i, (fn, dur, infl, prompt) in enumerate(SFX, 1):
        print(f"\n[{i}/{len(SFX)}] {fn}")
        try:
            regenerate(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
    print("\nDone.")


if __name__ == "__main__":
    main()
