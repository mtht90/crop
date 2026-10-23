# Builds piece strips + portraits for the Chibi Characters (Styloo, CC0) heads.
# Input: renders from the render server (out/skin/<id>_<color>.png with skin tint, out/chibi/<id>_orig.png).
# Output: public/assets/pieces/<id>.webp (5 colors x 320px) and <id>_portrait.webp.
# Run tools/unify_piece_colors.py on the strips afterwards.
import sys
from PIL import Image, ImageFilter
SRC = sys.argv[1]
IDS = sys.argv[2].split(',')
import os
P = os.environ.get('OUT', '/home/user/crop/puzzle/public/assets/pieces')
COLS = ['red', 'blue', 'green', 'yellow', 'purple']
CELL = 320
TARGET = 230
def outline(im, px):
    a = im.split()[3]
    big = a.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.5))
    base = Image.new('RGBA', im.size, (42, 22, 48, 0)); base.putalpha(big); base.alpha_composite(im); return base
# CORE=1: size by the solid body of the head (thin horns, wings, ears and spikes are opened away),
# so those can stick out past the usual size and simply overlap the neighbors (no collision).
CORE = os.environ.get('CORE') == '1'
def core_box(im):
    a = im.split()[3]
    bb = a.getbbox()
    k = 256 / max(a.size)
    sm = a.resize((round(a.width * k), round(a.height * k))).point(lambda v: 255 if v > 128 else 0)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    r = max(1, round((w * h) ** 0.5 * k * 0.11))
    op = sm.filter(ImageFilter.MinFilter(2 * r + 1)).filter(ImageFilter.MaxFilter(2 * r + 1))
    cb = op.getbbox() or sm.getbbox()
    return tuple(round(v / k) for v in cb)
for cid in IDS:
    ims = [outline(Image.open(f'{SRC}/out/skin/{cid}_{k}.png').convert('RGBA'), 28) for k in COLS]
    bb = ims[0].getbbox()
    for im in ims[1:]:
        b2 = im.getbbox(); bb = (min(bb[0], b2[0]), min(bb[1], b2[1]), max(bb[2], b2[2]), max(bb[3], b2[3]))
    strip = Image.new('RGBA', (CELL * 5, CELL), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        # same visual size as the KayKit heads: sqrt(w*h) about 230px in a 320px cell
        t = im.crop(bb)
        k = TARGET / (t.width * t.height) ** 0.5
        if CORE:
            cb = core_box(ims[0])
            k = TARGET * 1.04 / ((cb[2] - cb[0]) * (cb[3] - cb[1])) ** 0.5
            k = min(k, (CELL - 4) / max(t.width, t.height))
        t = t.resize((round(t.width * k), round(t.height * k)), Image.LANCZOS)
        strip.alpha_composite(t, (i * CELL + (CELL - t.width) // 2, (CELL - t.height) // 2))
    strip.save(f'{P}/{cid}.webp', quality=90, method=6)
    por = outline(Image.open(f'{SRC}/out/chibi/{cid}_orig.png').convert('RGBA'), 20)
    por = por.crop(por.getbbox()); por.thumbnail((288, 288), Image.LANCZOS)
    por.save(f'{P}/{cid}_portrait.webp', quality=90, method=6)
    print('ok', cid)
