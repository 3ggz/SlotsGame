"""
Regenerate the harsh reel/click sounds with a softer, more digital
aesthetic — closer to the bonus-game vibe the user already likes
(cell_spin_start, cell_tick) rather than the mechanical-lever / wooden-
chunk casino cliche.

Strategy:
  - "Soft digital" instead of "mechanical lever / wooden reel"
  - Synth pad / interface UI references instead of physical machine refs
  - Shorter, quieter
  - Reel stops become near-subliminal "tics" rather than thuds, so the
    user only hears something interesting when something interesting
    actually happens (a win)
"""
import os, sys, time
from pathlib import Path
from elevenlabs import ElevenLabs

OUT = Path(__file__).parent
BACKUP = OUT / "v1_backup"
BACKUP.mkdir(exist_ok=True)
client = ElevenLabs()

# (filename, duration_s, prompt_influence, prompt)
SFX = [
    ("reel_start.mp3", 0.6, 0.85,
     "A soft elegant digital interface sound: a smooth low-to-high airy whoosh sweep with a gentle synth pad swell, like a futuristic control panel activating. Brief, gentle, polished, NOT mechanical. Dry clean studio recording. No clicks, no impacts, no voices, no music."),

    ("reel_loop.mp3", 2.0, 0.85,
     "A seamlessly loopable very soft ambient low-mid digital hum, like a quiet fan spinning gently inside a sleek device. Smooth even texture, perfectly steady, no clicks or rhythm, very subtle and unobtrusive. Dry clean recording. No music, no voices."),

    ("reel_stop_1.mp3", 0.5, 0.92,
     "One single very soft brief 'tick'. A gentle muted digital tap, like a finger touching a glass touchscreen once. Almost subliminal, brief, polished. Dry clean recording. No reverb, no decay, no impact, no thud."),

    ("reel_stop_2.mp3", 0.5, 0.92,
     "One single soft brief 'tap'. A quiet smooth muted touch, like a fingertip on a soft silicone button. Very brief, gentle, NOT percussive. Dry clean recording. No thud, no reverb."),

    ("reel_stop_3.mp3", 0.5, 0.92,
     "One single subtle 'tup'. A soft muted contact sound, almost like pressing a soft rubber pad. Brief, quiet, smooth. Dry clean recording. No impact, no thud, no reverb."),

    ("reel_stop_final.mp3", 0.6, 0.9,
     "One single soft confident digital confirmation tone. A gentle low-mid 'doop' chime, like a UI confirming an action has completed. Slightly more present than a tap but still polished and subtle, with a tiny warm bell tail. Brief, dry studio recording. No mechanical noise, no thud."),

    ("button_press.mp3", 0.5, 0.9,
     "A single soft pleasant rounded button press: a smooth low-mid 'pop' with a tiny warm tail, like pressing a premium silicone button on a luxury device. Gentle, satisfying, polished, NOT clicky or harsh. Brief, dry clean recording. No impact, no thud."),
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
        output_format="mp3_44100_192",
    )
    with open(out_path, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    print(f"    -> {out_path.stat().st_size} bytes")


def main():
    if not os.environ.get("ELEVENLABS_API_KEY"):
        print("ERROR: ELEVENLABS_API_KEY not set."); sys.exit(1)
    print(f"Regenerating {len(SFX)} sounds (v1 backed up to {BACKUP})")
    for i, (fn, dur, infl, prompt) in enumerate(SFX, 1):
        print(f"\n[{i}/{len(SFX)}] {fn}")
        try:
            regenerate(fn, prompt, dur, infl)
        except Exception as e:
            print(f"  ERROR: {e}")
        time.sleep(0.15)
    print("\nDone.")


if __name__ == "__main__":
    main()
