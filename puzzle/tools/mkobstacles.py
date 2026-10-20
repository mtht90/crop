# Builds puzzle/public/assets/obstacles/*.webp from KayKit renders (render/out/obs, see render/obs.mjs).
# Each sprite: cropped to the model, dark outline like the pieces, centered in a square cell.
import os, sys
from PIL import Image, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else 'out/obs'
DST = '/home/user/crop/puzzle/public/assets/obstacles'
MAP = {
    'rock': 'mg_rocksB_forest', 'hardrock': 'dr_rubble_half', 'grave': 'hw_gravestone',
    'bone_a': 'hw_bone_A', 'bone_b': 'hw_bone_B', 'ribcage': 'hw_ribcage', 'bomb': 'mg_bomb_teamRed',
    'skull': 'hw_skull_candle', 'shackle': 'mb_chain_shackle', 'anchor': 'mb_chain_anchor',
    'crystal': 'mg_diamond_teamBlue', 'qbox': 'mg_powerupBlock_teamBlue',
    # icons for the obstructions that don't throw anything (boss card / obstruction list)
    'lantern': 'hw_lantern_standing', 'camera': 'mb_instantcamera', 'ink': 'dr_bottle_A_labeled_brown',
    'smokebomb': 'adv_smokebomb', 'chest': 'dr_chest', 'idol': 'mb_idol_A', 'water': 'mb_waterbottle_A',
    'rubble': 'dr_rubble_large', 'umbrella': 'mb_umbrella_blue', 'ball': 'mg_ball', 'table': 'dr_table_medium_broken',
    'potion_blue': 'kd_potionLarge_blue', 'cube': 'mb_puzzlecube_incomplete', 'sack': 'kd_lootSackA',
    'lightning': 'mg_lightning', 'potion_green': 'kd_potionSmall_green', 'candle': 'dr_candle_melted',
    'shield': 'sk_Skeleton_Shield_Large_A', 'book': 'adv_spellbook_closed', 'broken': 'dr_sword_shield_broken',
}
# models that render without their material colors get tinted
TINT = {'potion_blue': (120, 190, 255), 'potion_green': (120, 230, 120)}
CELL = 200
def outline(im, px):
    a = im.split()[3]
    big = a.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    base = Image.new('RGBA', im.size, (42, 22, 48, 0)); base.putalpha(big); base.alpha_composite(im); return base
done = 0
for k, f in MAP.items():
    if not os.path.exists(f'{SRC}/{f}.png'):
        continue  # keep the sprite already in DST
    done += 1
    im = Image.open(f'{SRC}/{f}.png').convert('RGBA')
    if k in TINT:
        r, g, b, a = im.split()
        tr, tg, tb = TINT[k]
        im = Image.merge('RGBA', (r.point(lambda v: v * tr // 255), g.point(lambda v: v * tg // 255), b.point(lambda v: v * tb // 255), a))
    im = im.crop(im.getbbox())
    pad = 16
    canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    canvas = outline(canvas, 7)
    side = max(canvas.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(canvas, ((side - canvas.width) // 2, (side - canvas.height) // 2))
    sq.resize((CELL, CELL), Image.LANCZOS).save(f'{DST}/{k}.webp', quality=88, method=6)
print(done, 'of', len(MAP), 'sprites rebuilt')
