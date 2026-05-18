"""Generate a soft, dry thump for the blackjack STAND action.

Pipeline:
  1. Ask ElevenLabs for a transient, dry knock.
  2. Use ffmpeg to trim the rolling tail and apply a real fade-out
     so the clip doesn't click on whatever cuts it (HTMLAudio pause,
     short JS hard-cut, or its own natural ending).
"""
import os, shutil, subprocess, tempfile
from elevenlabs import ElevenLabs

client = ElevenLabs()

PROMPT = (
    "A single dry thump. Like a knuckle rapping once on a thick wooden "
    "card table — sharp transient attack, almost no sustain, no boom, "
    "no resonance, no ring, no reverb tail. Tight, percussive, woody. "
    "Mono, close-mic'd, completely dry studio recording."
)

# Short total duration so the model doesn't pad sustain.
audio = client.text_to_sound_effects.convert(
    text=PROMPT,
    duration_seconds=0.5,
    prompt_influence=0.95,
)

with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
    raw_path = tmp.name
    for chunk in audio:
        tmp.write(chunk)

# Keep the first ~280ms (the thump itself) and fade the tail to silence
# over the last 120ms. afade ramps amplitude smoothly so the clip ends
# at digital zero instead of mid-sample — no end-of-buffer click.
OUT = "stand_thump.mp3"
cmd = [
    "ffmpeg", "-y", "-loglevel", "error",
    "-i", raw_path,
    "-af", "atrim=0:0.28,asetpts=N/SR/TB,afade=t=out:st=0.16:d=0.12",
    "-c:a", "libmp3lame", "-b:a", "128k",
    OUT,
]
subprocess.run(cmd, check=True)
os.unlink(raw_path)
print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
