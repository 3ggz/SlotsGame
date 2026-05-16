"""
Regenerate diamond_land with a more impactful prompt. The previous
take was correct in vibe (crystalline chime) but the model generated
a quiet, polite hit. Want a powerful, full-volume strike that rings
out clearly without being delicate.
"""
import os, sys
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
BACKUP = OUT / "v1_backup"
BACKUP.mkdir(exist_ok=True)
client = ElevenLabs()

SFX = [
    ("diamond_land.mp3", 1.3, 0.82,
     "A loud powerful crystalline bell strike at full volume from the first instant. A metal mallet hits a large crystal goblet firmly, producing a bright pure shimmering bell tone with immediate full-amplitude sparkle and rich sympathetic overtones ringing out clearly. Confident, impactful, magical. Clean studio recording, gentle hall tail. Sharp immediate attack, NOT soft."),
]


def regen(filename, prompt, duration, influence):
    out_path = OUT / filename
    backup_path = BACKUP / f"v2_{filename}"
    if out_path.exists() and not backup_path.exists():
        backup_path.write_bytes(out_path.read_bytes())
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
            regen(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
    print("Done.")


if __name__ == "__main__":
    main()
