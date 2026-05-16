"""
Post-process nano-banana gem images:
  - Derive an alpha channel from luminosity (dark = transparent, bright = opaque)
  - Trim transparent margins so the visible gem fills the frame
  - Optionally resize to a target size

Usage: python process_gem.py <input.png> <output.png> [size]
"""
import sys
from pathlib import Path
from PIL import Image


def to_rgba(img: Image.Image, threshold: int = 22, soft: int = 35) -> Image.Image:
    """RGB → RGBA where alpha is driven by max(R,G,B). Background black/near-black
    becomes transparent; bright gem pixels stay opaque."""
    img = img.convert('RGB')
    px = img.load()
    w, h = img.size
    rgba = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    rpx = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            m = max(r, g, b)
            if m <= threshold:
                a = 0
            elif m <= threshold + soft:
                a = int(255 * (m - threshold) / soft)
            else:
                a = 255
            rpx[x, y] = (r, g, b, a)
    return rgba


def trim_alpha(img: Image.Image, pad: int = 8) -> Image.Image:
    """Crop transparent margins, leaving a small padding."""
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    w, h = img.size
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(w, r + pad)
    b = min(h, b + pad)
    return img.crop((l, t, r, b))


def main():
    if len(sys.argv) < 3:
        print("usage: process_gem.py <input.png> <output.png> [size]")
        sys.exit(1)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    target = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    img = Image.open(src)
    img = to_rgba(img)
    img = trim_alpha(img, pad=16)
    # Pad to square then resize
    w, h = img.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    canvas = canvas.resize((target, target), Image.LANCZOS)
    canvas.save(dst, optimize=True)
    print(f"{src.name} -> {dst} ({target}x{target}, {dst.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
