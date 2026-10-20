# Builds piece strips + portraits for the Chibi Characters (Styloo, CC0) heads.
# Input: renders from the render server (out/skin/<id>_<color>.png with skin tint, out/chibi/<id>_orig.png).
# Output: public/assets/pieces/<id>.webp (5 colors x 320px) and <id>_portrait.webp.
# Run tools/unify_piece_colors.py on the strips afterwards.
import sys
from PIL import Image, ImageFilter
SRC = sys.argv[1]
IDS = sys.argv[2].split(',')
P = '/home/user/crop/puzzle/public/assets/pieces'
COLS = ['red', 'blue', 'green', 'yellow', 'purple']
CELL = 320
def outline(im, px):
    a = im.split()[3]
    big = a.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.5))
    base = Image.new('RGBA', im.size, (42, 22, 48, 0)); base.putalpha(big); base.alpha_composite(im); return base
for cid in IDS:
    ims = [outline(Image.open(f'{SRC}/out/skin/{cid}_{k}.png').convert('RGBA'), 28) for k in COLS]
    bb = ims[0].getbbox()
    for im in ims[1:]:
        b2 = im.getbbox(); bb = (min(bb[0], b2[0]), min(bb[1], b2[1]), max(bb[2], b2[2]), max(bb[3], b2[3]))
    strip = Image.new('RGBA', (CELL * 5, CELL), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        t = im.crop(bb); t.thumbnail((CELL - 8, CELL - 8), Image.LANCZOS)
        strip.alpha_composite(t, (i * CELL + (CELL - t.width) // 2, (CELL - t.height) // 2))
    strip.save(f'{P}/{cid}.webp', quality=90, method=6)
    por = outline(Image.open(f'{SRC}/out/chibi/{cid}_orig.png').convert('RGBA'), 20)
    por = por.crop(por.getbbox()); por.thumbnail((288, 288), Image.LANCZOS)
    por.save(f'{P}/{cid}_portrait.webp', quality=90, method=6)
    print('ok', cid)
