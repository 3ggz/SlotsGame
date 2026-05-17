"""
Analyze tree.png alpha channel + foliage color to find good lantern
hang-points. Outputs candidate (x%, y%) positions sorted by canopy density.

The goal: a lantern dropped at (x, y) should land on a leafy branch
(opaque + warm-colored pixels above it), not in empty air.

Run:  python _analyze.py
"""
from PIL import Image
from pathlib import Path

HERE = Path(__file__).parent
src = HERE / "tree.png"
im = Image.open(src).convert("RGBA")
w, h = im.size
px = im.load()
print(f"tree: {w}x{h}, aspect {w/h:.3f}")

# Find opaque bounding box
xmin, ymin, xmax, ymax = w, h, 0, 0
for y in range(h):
    for x in range(w):
        if px[x, y][3] > 64:
            if x < xmin: xmin = x
            if y < ymin: ymin = y
            if x > xmax: xmax = x
            if y > ymax: ymax = y
print(f"bbox: x={xmin}-{xmax}  y={ymin}-{ymax}")
print(f"bbox %: x={xmin/w*100:.1f}-{xmax/w*100:.1f}  y={ymin/h*100:.1f}-{ymax/h*100:.1f}")

# Heuristic: classify each pixel
#   foliage = opaque + warm (R high, G mid, B low)
#   trunk   = opaque + brown (R mid, G mid, B low) and not warm
def is_foliage(r, g, b, a):
    if a < 64: return False
    if r < 120: return False
    if r > g and g > b: return True   # warm tone
    return False

# Sample on a coarse grid; for each cell compute foliage density
cols, rows = 40, 60        # grid resolution
cw, ch = w // cols, h // rows
density = [[0]*cols for _ in range(rows)]
for ry in range(rows):
    for cx in range(cols):
        cnt = 0
        for dy in range(ch):
            for dx in range(cw):
                x = cx*cw + dx; y = ry*ch + dy
                if x < w and y < h:
                    r, g, b, a = px[x, y]
                    if is_foliage(r, g, b, a):
                        cnt += 1
        density[ry][cx] = cnt

# Print a density map as ASCII so you can eyeball the tree
print("\nFOLIAGE DENSITY MAP (rows=y%, cols=x%)")
maxd = max(max(row) for row in density)
chars = " .:-=+*#%@"
for ry in range(rows):
    line = ""
    for cx in range(cols):
        v = density[ry][cx]
        i = int(v / maxd * (len(chars)-1)) if maxd else 0
        line += chars[i]
    yp = (ry + 0.5) * ch / h * 100
    print(f"y={yp:5.1f}  {line}")

# Suggest 9 lantern positions:
# - apex (top-most foliage cluster)
# - upper-L, upper-R bursts
# - mid-L, mid-R (far branch tips)
# - inner-L, inner-R (under canopy)
# - lower-L, lower-R
# Strategy: scan rows, find leftmost / rightmost / centermost dense cells in defined y bands.

def best_in_band(y0, y1, x_pref):
    """Find x% with highest density in y range [y0,y1]; tiebreak toward x_pref."""
    best = None
    best_score = -1
    for ry in range(rows):
        yp = (ry + 0.5) * ch / h * 100
        if yp < y0 or yp > y1: continue
        for cx in range(cols):
            d = density[ry][cx]
            xp = (cx + 0.5) * cw / w * 100
            # Score = density - small penalty for being far from x_pref
            score = d - abs(xp - x_pref) * (maxd / 200)
            if score > best_score:
                best_score = score; best = (xp, yp, d)
    return best

print("\nSUGGESTED LANTERN POSITIONS")
suggestions = [
    ("MYTHIC 100x",     2, 10,  50),   # apex
    ("LEGEND  50x",     8, 18,  28),
    ("EPIC    20x",     8, 18,  72),
    ("RARE    10x",    20, 32,  12),   # far left
    ("RARE     8x",    20, 32,  88),   # far right
    ("UNCOM    5x",    18, 28,  35),
    ("UNCOM    2x",    18, 28,  65),
    ("COMMON   1x",    36, 50,  25),
    ("COMMON 0.5x",    36, 50,  75),
]
for label, y0, y1, xp in suggestions:
    res = best_in_band(y0, y1, xp)
    if res:
        x, y, d = res
        print(f"  {label}:  x={x:.1f}%  y={y:.1f}%   (density {d})")
