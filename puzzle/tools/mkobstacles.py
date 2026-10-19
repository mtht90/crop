# Builds puzzle/public/assets/obstacles/*.webp from KayKit renders (render/out/obs, see render/obs.mjs).
# Each sprite: cropped to the model, dark outline like the pieces, centered in a square cell.
import sys
from PIL import Image, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else 'out/obs'
DST = '/home/user/crop/puzzle/public/assets/obstacles'
MAP = {
    'rock': 'mg_rocksB_forest', 'hardrock': 'dr_rubble_half', 'grave': 'hw_gravestone',
    'bone_a': 'hw_bone_A', 'bone_b': 'hw_bone_B', 'ribcage': 'hw_ribcage', 'bomb': 'mg_bomb_teamRed',
    'skull': 'hw_skull_candle', 'shackle': 'mb_chain_shackle', 'anchor': 'mb_chain_anchor',
    'crystal': 'mg_diamond_teamBlue', 'qbox': 'mg_powerupBlock_teamBlue',
}
CELL = 200
def outline(im, px):
    a = im.split()[3]
    big = a.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    base = Image.new('RGBA', im.size, (42, 22, 48, 0)); base.putalpha(big); base.alpha_composite(im); return base
for k, f in MAP.items():
    im = Image.open(f'{SRC}/{f}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    pad = 16
    canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    canvas = outline(canvas, 7)
    side = max(canvas.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(canvas, ((side - canvas.width) // 2, (side - canvas.height) // 2))
    sq.resize((CELL, CELL), Image.LANCZOS).save(f'{DST}/{k}.webp', quality=88, method=6)
print(len(MAP), 'sprites')
