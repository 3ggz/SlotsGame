"""
Chroma-key the white background out of tree.png, lantern.png, leaf.png
and write them back as fully transparent PNGs. One-shot preprocessing
script so the game doesn't have to do this at runtime.

Usage:  python _keyout.py
"""
from PIL import Image
from pathlib import Path

HERE = Path(__file__).parent

# (source filename, cutoff, feather)
# cutoff: minC >= this -> fully transparent
# feather: pixels in [cutoff-feather, cutoff) get partial alpha
JOBS = [
    ("tree.png",    242, 20),
    ("lantern.png", 240, 22),
    ("leaf.png",    240, 22),
]

def keyout(src: Path, cutoff: int, feather: int):
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    soft = cutoff - feather
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            min_c = min(r, g, b)
            if min_c >= cutoff:
                px[x, y] = (r, g, b, 0)
            elif min_c > soft:
                # linear ramp: minC=soft -> alpha=255 ; minC=cutoff -> alpha=0
                alpha = int(255 * (cutoff - min_c) / (cutoff - soft))
                px[x, y] = (r, g, b, alpha)
    out = src.with_name(src.stem + ".png")  # overwrite in place
    im.save(out, "PNG", optimize=True)
    print(f"  -> {out.name} ({w}x{h})")

def main():
    for name, cutoff, feather in JOBS:
        src = HERE / name
        if not src.exists():
            print(f"!! missing: {src}")
            continue
        print(f"keying {name}  (cutoff={cutoff}, feather={feather})")
        keyout(src, cutoff, feather)
    print("done.")

if __name__ == "__main__":
    main()
