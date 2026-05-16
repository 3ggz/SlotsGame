"""
Generate a tally / count-up sound for the bonus-complete screen.
Length matches the countUp animation duration (~1.8s).
"""
import os, sys
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
client = ElevenLabs()

SFX = [
    ("bonus_tally.mp3", 1.8, 0.7,
     "A satisfying rising tally count-up sequence: a fast climbing series of bright coin and bell chimes ascending in pitch over almost two seconds, with subtle sparkly accents layered on top, building excitement and culminating in a small confirming chime at the very end. Like money being totaled up on a score screen at a game show. Bright, clean, joyful, gentle hall reverb. No vocals, no drums."),
]


def gen(filename, prompt, duration, influence):
    out_path = OUT / filename
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"  skip (exists): {filename}")
        return
    print(f"  ({duration}s, infl={influence}) -> {filename}")
    audio = client.text_to_sound_effects.convert(
        text=prompt, duration_seconds=duration, prompt_influence=influence,
        output_format="mp3_44100_192",
    )
    with open(out_path, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    print(f"    -> {out_path.stat().st_size} bytes")


def main():
    if not os.environ.get("ELEVENLABS_API_KEY"):
        print("ERROR: ELEVENLABS_API_KEY not set."); sys.exit(1)
    for i, (fn, dur, infl, prompt) in enumerate(SFX, 1):
        print(f"[{i}/{len(SFX)}] {fn}")
        try:
            gen(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
    print("Done.")


if __name__ == "__main__":
    main()
