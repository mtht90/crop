# Builds puzzle/public/assets/pieces/<id>.webp strips (5 colors, 256px cells) from out/skin renders.
from PIL import Image, ImageFilter
import json
P = '/home/user/crop/puzzle/public/assets/pieces'
chars = [c for c in json.load(open('chars.json')) if c['id'] != 'l_rogue']
cols = ['red', 'blue', 'green', 'yellow', 'purple']
def outline(im, px=24):
    a = im.split()[3]; big = a.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.5))
    base = Image.new('RGBA', im.size, (42, 22, 48, 0)); base.putalpha(big); base.alpha_composite(im); return base
CELL = 256
for c in chars:
    ims = [outline(Image.open(f"out/skin/{c['id']}_{k}.png").convert('RGBA')) for k in cols]
    bb = ims[0].getbbox()
    for im in ims[1:]:
        b2 = im.getbbox(); bb = (min(bb[0], b2[0]), min(bb[1], b2[1]), max(bb[2], b2[2]), max(bb[3], b2[3]))
    strip = Image.new('RGBA', (CELL * 5, CELL), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        t = im.crop(bb); t.thumbnail((CELL - 6, CELL - 6), Image.LANCZOS)
        strip.alpha_composite(t, (i * CELL + (CELL - t.width) // 2, (CELL - t.height) // 2))
    strip.save(f"{P}/{c['id']}.webp", quality=90, method=6)
print(len(chars))
