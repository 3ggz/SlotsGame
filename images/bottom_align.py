"""Bottom-align each symbol PNG's tight bbox to the canvas bottom.

Previously each icon was bbox-centered in a 512x512 canvas. Because the
diamond's glow halo extends to fill the canvas, the diamond rendered at
~full cell height while shorter icons (crown, bar, heart) appeared to
float in the cell middle — visually "raised" relative to the diamond.

Now each icon's tight bbox is placed against the canvas bottom (with an
8px floor pad). When background-size:contain scales the 512x512 canvas
into the 110x110 ::before, every icon's visible bottom lands ~2 CSS px
above the ::before bottom, so all icons share a common baseline.

Usage: python images/bottom_align.py
"""
from pathlib import Path
from PIL import Image

CANVAS = 512
FLOOR_PAD = 8

NAMES = ['diamond', 'heart', 'clover', 'star', 'bell', 'crown', 'bar', 'seven']


def main():
    images_dir = Path(__file__).parent
    for name in NAMES:
        path = images_dir / f'{name}.png'
        img = Image.open(path).convert('RGBA')
        bbox = img.getbbox()
        if not bbox:
            print(f'{name}: empty, skipped')
            continue
        icon = img.crop(bbox)
        iw, ih = icon.size

        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        x = (CANVAS - iw) // 2
        y = CANVAS - ih - FLOOR_PAD
        canvas.paste(icon, (x, y))
        canvas.save(path, optimize=True)
        print(f'{name:8s} bbox={iw}x{ih}  placed at ({x}, {y})  bottom={y+ih}')


if __name__ == '__main__':
    main()
