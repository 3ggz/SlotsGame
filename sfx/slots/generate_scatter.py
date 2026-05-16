"""
Generate the scatter / diamond landing thud — a chunky, satisfying
impact with bell sparkle on top. Plays each time a diamond lands
during a spin (while the bonus is still possible). Intensity is
escalated in code by varying gain + pitch with the diamond count.
"""
import os, sys
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
client = ElevenLabs()

SFX = [
    ("scatter_thud.mp3", 0.9, 0.85,
     "A satisfying chunky impact: a deep low-frequency bass THUD combined with a bright shimmering crystalline bell chime ringing on top. Punchy, weighty, magical. Sounds like a heavy diamond crystal striking a metal surface and ringing out briefly with sparkle. Immediate full-amplitude attack from the very first instant, short clean tail. Studio quality. No vocals, no long decay."),
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
