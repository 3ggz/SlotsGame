"""
Regenerate ONLY the chip sounds. Strategy this time:
- Avoid "chip" and "casino" entirely (they invoke clanky/rolling samples)
- Describe pure physical foley: dense wood-on-felt impact
- Use minimum duration (0.5s) to prevent rolling tails
- Avoid negative prompts ("no X") — they often backfire in gen models
"""
import os
import sys
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
BACKUP = OUT / "v2_backup"
BACKUP.mkdir(exist_ok=True)
client = ElevenLabs()

# (filename, duration, prompt_influence, prompt)
SFX = [
    ("chip_place_a.mp3", 0.5, 0.95,
     "One single soft muffled thock. A small heavy wooden disc tapped firmly on a thick wool blanket. One brief dry low-frequency impact and immediate silence. Close microphone foley recording."),
    ("chip_place_b.mp3", 0.5, 0.95,
     "One short dry low tap. A small dense wooden puck gently set down on a folded leather pad. Single muffled contact, brief, mono, anechoic close recording."),
    ("chip_place_c.mp3", 0.5, 0.95,
     "One soft 'tup'. A small wooden checker tile pressed down once onto a piece of soft felt cloth. Single very brief muffled tap. Dry close studio foley."),

    ("chip_stack_a.mp3", 0.6, 0.92,
     "Two small dense wooden discs tapping together once. Single brief muffled wood-on-wood contact. Very short, dry, mono. Studio foley."),
    ("chip_stack_b.mp3", 0.6, 0.92,
     "A small wooden tile dropped on top of another small wooden tile resting on a folded blanket. Single muffled wooden tap. Brief and dry."),

    ("chip_select.mp3", 0.5, 0.9,
     "Single soft fingertip tap on a leather wallet. Very brief muted tactile click. Extremely short, mono, dry, anechoic."),

    ("chip_payout.mp3", 1.0, 0.85,
     "A handful of small dense wooden discs being gently nudged and bumped together for a moment on a soft felt cloth, brief muffled wooden chatter, then silence. Dry close foley, mono, no music."),
    ("chip_clear.mp3", 0.7, 0.85,
     "A hand briefly sweeping a small pile of dense wooden discs together on a thick blanket, quick muffled wooden shuffle, dry close foley."),
]


def regenerate(filename, prompt, duration, influence):
    out_path = OUT / filename
    backup_path = BACKUP / filename
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
    print(f"Regenerating {len(SFX)} chip sounds; v2 backed up to {BACKUP}")
    for i, (fn, dur, infl, prompt) in enumerate(SFX, 1):
        print(f"\n[{i}/{len(SFX)}] {fn}")
        try:
            regenerate(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
    print("\nDone.")


if __name__ == "__main__":
    main()
