#!/usr/bin/env python3
"""カードTD — 素材パックをゲーム用に変換する。

使い方:
    python3 build_assets.py <素材を展開したフォルダ> [出力先 = ../assets]

<素材フォルダ> の中身(各 zip をこの名前のフォルダに展開しておく):
    knight_b/      Knight-Characters-Free-Sprite.zip      (2D Fantasy Knight)
    woman/         Free-Woman-Warrior.zip                 (2D Fantasy Woman Warrior)
    fairy/         FREE_FAIRY.zip                         (2D Fantasy Fairy)
    orcs/          2D-Fantasy-Orcs-Free-Sprite-Sheets.zip (Free 2D Orcs)
    troll/         Free-2D-Game-Troll.zip                 (2D Fantasy Trolls)
    heavyknight/   Free-2D-Knight-Sprite-Sheets.zip       (Free 2D Knight Sprite Sheets)
    tower/         stone-tower-game-assets.zip            (Free Stone Tower Game Assets)
    bg_meadow/     Free-Horizontal-Game-Backgrounds.zip
    bg_forest/     free-cartoon-forest-game-backgrounds.zip
    bg_elven/      Elven_Land_Game_Battle_Backgrounds.zip
    cards/         Mechanized Magic: 2D Vector Cards Pack (1_Free Pack.zip)
    ui/            Mechanized Magic: Ultimate UI Pack (1_Free Pack.zip)
    fx/            FX.zip                                 (2D Spell Effects)
    sfx/           RPGsounds_Kenney.zip                   (Kenney 50 RPG Sound Effects)
    music/         music-loop-bundle-*.zip                (FREE Music Loop Bundle)
    k_rpg/         UIpack_RPG.zip                         (Kenney UI Pack: RPG Expansion, CC0)

出力は縮小・切り出し済みの画像と音声だけ(元の素材ファイルそのものは出力しない)。
必要なもの: Pillow、ffmpeg(音声の変換)
"""
import glob
import json
import os
import subprocess
import sys

from PIL import Image, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else 'raw'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'assets')

KB = 'knight_b/Knight-Characters-Free-Sprite/Knight-Characters-Free-Sprite/PNG/'
WO = 'woman/Free-Woman-Warrior/_PNG/'
FA = 'fairy/FREE_FAIRY/_PNG/'
OR = 'orcs/2D-Fantasy-Orcs-Free-Sprite-Sheets/_PNG/'
TR = 'troll/Free-2D-Game-Troll/PNG/Animation/'
HK = 'heavyknight/Free-2D-Knight-Sprite-Sheets/_PNG/'

# カード id → (フォルダ, {アニメ: ファイル名のパターン}, 画面上の身長 px)
UNITS = {
    'sword_knight': (KB + 'silver_knight', {'idle': 'idle_*', 'walk': 'walk_*', 'attack': 'attack_*', 'die': 'dead_*'}, 78),
    'lance_knight': (KB + 'black_knight', {'idle': 'idle_*', 'walk': 'walk_*', 'attack': 'attack_*', 'die': 'dead_*'}, 78),
    'axe_knight': (KB + 'bronze_knight', {'idle': 'idle_*', 'walk': 'walk_*', 'attack': 'attack_*', 'die': 'dead_*'}, 78),
    'shield_woman': (WO + '1', {'idle': '1_IDLE_*', 'walk': '2_WALK_*', 'attack': '5_ATTACK_*', 'die': '7_DIE_*'}, 84),
    'dual_dagger': (WO + '2', {'idle': '1_IDLE_*', 'walk': '3_RUN_*', 'attack': '5_ATTACK_*', 'die': '7_DIE_*'}, 84),
    'bow_woman': (WO + '3', {'idle': '1_IDLE_*', 'walk': '2_WALK_*', 'attack': '5_ATTACK_*', 'die': '7_DIE_*'}, 84),
    'fire_fairy': (FA + '1', {'idle': '3_FLY_*', 'walk': '3_FLY_*', 'attack': '4_FLY ATTACK_*', 'die': '8_DIE_*'}, 64),
    'ice_fairy': (FA + '2', {'idle': '3_FLY_*', 'walk': '3_FLY_*', 'attack': '4_FLY ATTACK_*', 'die': '8_DIE_*'}, 64),
    'leaf_fairy': (FA + '3', {'idle': '3_FLY_*', 'walk': '3_FLY_*', 'attack': '4_FLY ATTACK_*', 'die': '8_DIE_*'}, 64),
    'orc_warrior': (OR + '1_ORK', {'idle': 'IDLE/*', 'walk': 'WALK/*', 'attack': 'ATTAK/*', 'die': 'DIE/*'}, 80),
    'orc_thrower': (OR + '2_ORK', {'idle': 'IDLE/*', 'walk': 'WALK/*', 'attack': 'ATTAK/*', 'die': 'DIE/*'}, 84),
    'orc_captain': (OR + '3_ORK', {'idle': 'IDLE/*', 'walk': 'WALK/*', 'attack': 'ATTAK/*', 'die': 'DIE/*'}, 92),
    'troll': (TR + 'Troll1', {'idle': 'Idle_*', 'walk': 'Walk_*', 'attack': 'Attack_*', 'die': 'Dead_*'}, 118),
    'club_troll': (TR + 'Troll2', {'idle': 'Idle_*', 'walk': 'Walk_*', 'attack': 'Attack_*', 'die': 'Dead_*'}, 124),
    'troll_chief': (TR + 'Troll3', {'idle': 'Idle_*', 'walk': 'Walk_*', 'attack': 'Attack_*', 'die': 'Dead_*'}, 134),
    'lance_hk': (HK + '1_KNIGHT', {'idle': '_IDLE/*', 'walk': '_WALK/*', 'attack': '_ATTACK/*', 'die': '_DIE/*'}, 98),
    'axe_hk': (HK + '2_KNIGHT', {'idle': '_IDLE/*', 'walk': '_WALK/*', 'attack': '_ATTACK/*', 'die': '_DIE/*'}, 104),
    'gold_hk': (HK + '3_KNIGHT', {'idle': '_IDLE/*', 'walk': '_WALK/*', 'attack': '_ATTACK/*', 'die': '_DIE/*'}, 106),
}
MAX_FRAMES = 8
RES = 2  # 画面の2倍の解像度で保存(高精細ディスプレイ用)


def frames_for(folder, pattern):
    files = sorted(glob.glob(os.path.join(SRC, folder, pattern + '.png')))
    files = [f for f in files if '__MACOSX' not in f]
    if not files:
        raise SystemExit(f'見つからない: {folder}/{pattern}')
    if len(files) > MAX_FRAMES:
        step = len(files) / MAX_FRAMES
        files = [files[int(i * step)] for i in range(MAX_FRAMES)]
    return [Image.open(f).convert('RGBA') for f in files]


def body_mask(im):
    """細い武器を消して胴体だけ残したマスク。"""
    a = im.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    small = a.resize((max(1, a.width // 4), max(1, a.height // 4)))
    small = small.filter(ImageFilter.MinFilter(5))
    return small, 4


def body_center(im):
    m, k = body_mask(im)
    px = m.load()
    xs = ys = n = 0
    for y in range(m.height):
        for x in range(m.width):
            if px[x, y]:
                xs += x; ys += y; n += 1
    if not n:
        b = im.getbbox()
        return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    return xs / n * k, ys / n * k


def head_center(im):
    """胴体マスクの上の方(頭)の中心。"""
    m, k = body_mask(im)
    bb = m.getbbox()
    if not bb:
        return body_center(im)
    px = m.load()
    # 胴体の中心の列の近くだけを見る(上に突き出た武器を拾わない)
    bcx = body_center(im)[0] / k
    half = max(2, int((bb[2] - bb[0]) * 0.18))
    cols = range(max(0, int(bcx - half)), min(m.width, int(bcx + half)))
    top = next((y for y in range(m.height) if any(px[x, y] for x in cols)), bb[1])
    band = top + max(2, int((bb[3] - bb[1]) * 0.25))
    xs = n = 0
    lo, hi = max(0, int(bcx - half * 2)), min(m.width, int(bcx + half * 2))
    for y in range(top, band):
        for x in range(lo, hi):
            if px[x, y]:
                xs += x; n += 1
    return (xs / n * k if n else bcx * k), top * k


def build_unit(uid, folder, anims, height):
    seq = {k: frames_for(folder, p) for k, p in anims.items()}
    idle0 = seq['idle'][0]
    ib = idle0.getbbox()
    icx, _ = body_center(idle0)
    # アニメごとに、最初のフレームの足元と胴体の中心を待機フレームにそろえる
    placed = {}
    for k, fr in seq.items():
        b = fr[0].getbbox()
        cx, _ = body_center(fr[0])
        dx = icx - cx
        dy = ib[3] - b[3]
        placed[k] = [(im, dx, dy) for im in fr]
    # 共通キャンバス上での外接矩形
    box = None
    for lst in placed.values():
        for im, dx, dy in lst:
            b = im.getbbox()
            if not b:
                continue
            b = (b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy)
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    body_h = ib[3] - ib[1]
    scale = height * RES / body_h
    cw = max(1, round((box[2] - box[0]) * scale))
    ch = max(1, round((box[3] - box[1]) * scale))
    rows = list(placed.keys())
    cols = max(len(placed[k]) for k in rows)
    atlas = Image.new('RGBA', (cw * cols, ch * len(rows)), (0, 0, 0, 0))
    meta = {'cell': [cw, ch], 'res': RES, 'anims': {}}
    for r, k in enumerate(rows):
        for c, (im, dx, dy) in enumerate(placed[k]):
            W = round((box[2] - box[0]))
            H = round((box[3] - box[1]))
            cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            cv.alpha_composite(im, (round(dx - box[0]), round(dy - box[1])))
            atlas.alpha_composite(cv.resize((cw, ch), Image.LANCZOS), (c * cw, r * ch))
        meta['anims'][k] = {'row': r, 'n': len(placed[k])}
    meta['anchor'] = [round((icx - box[0]) * scale, 1), round((ib[3] - box[1]) * scale, 1)]
    meta['height'] = height
    atlas.save(os.path.join(OUT, 'units', uid + '.webp'), 'WEBP', quality=86, method=6)
    portrait(uid, idle0, ib)
    return meta


def portrait(uid, im, b):
    hx, top = head_center(im)
    w, h = b[2] - b[0], b[3] - b[1]
    side = int(h * 0.62)
    x0 = int(hx - side / 2)
    y0 = int(top - side * 0.08)
    crop = im.crop((x0, y0, x0 + side, y0 + side)).resize((240, 240), Image.LANCZOS)
    crop.save(os.path.join(OUT, 'portraits', uid + '.webp'), 'WEBP', quality=88, method=6)


def build_backgrounds():
    def load(pat):
        f = [p for p in glob.glob(os.path.join(SRC, pat), recursive=True) if '__MACOSX' not in p][0]
        return Image.open(f).convert('RGBA').resize((1920, 1080), Image.LANCZOS)

    def save(im, k):
        im.convert('RGB').save(os.path.join(OUT, 'bg', k + '.webp'), 'WEBP', quality=80, method=6)

    H, W = 1080, 1920
    # エルフの国: 浮島の塔の戦場(地面は画面の 35%〜85%)
    save(load('bg_elven/**/game_background_2/game_background_2.png'), 'elven')
    # 草原: Horizontal の空と山 + Elven Land の草地
    sky = load('bg_meadow/Free-Horizontal-Game-Backgrounds/PNG/game_background_1/game_background_1.png')
    field = load('bg_elven/**/game_background_4/game_background_4.png')
    cut = int(H * 0.43)
    ground = field.crop((0, cut, W, H))
    top = int(H * 0.50)
    feather = 36
    mask = Image.new('L', ground.size, 255)
    mp = mask.load()
    for y in range(feather):
        v = int(255 * y / feather)
        for x in range(W):
            mp[x, y] = v
    sky.paste(ground, (0, top), mask)
    save(sky, 'meadow')
    # 森: 地面(元画像の 85%)が画面の 75% に来るよう拡大して切り出す
    forest = load('bg_forest/**/Cartoon_Forest_BG_01/Cartoon_Forest_BG_01.png')
    g = 0.85
    want = 0.75
    hc = (1 - g) / (1 - want) * H
    hc = min(hc, H)
    y0 = g * H - want * hc
    wc = hc * 16 / 9
    x0 = (W - wc) / 2
    save(forest.crop((int(x0), int(y0), int(x0 + wc), int(y0 + hc))).resize((W, H), Image.LANCZOS), 'forest')
    # タイトル画面
    save(load('bg_meadow/Free-Horizontal-Game-Backgrounds/PNG/game_background_2/game_background_2.png'), 'menu')


def build_castles():
    P = os.path.join(SRC, 'tower/stone-tower-game-assets/PNG/')

    def stack(parts, name):
        # parts: 下から順に (番号, 前の段との重なり px)
        imgs = [Image.open(P + f'{n}.png').convert('RGBA') for n, _ in parts]
        W = max(i.width for i in imgs) + 20
        H = 600
        cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        y = H
        for im, (_, ov) in zip(imgs, parts):
            y2 = y - im.height + ov
            cv.alpha_composite(im, ((W - im.width) // 2, y2))
            y = y2 + im.height // 2
        cv = cv.crop(cv.getbbox())
        cv = cv.resize((round(cv.width * 1.7), round(cv.height * 1.7)), Image.LANCZOS)
        cv.save(os.path.join(OUT, 'castle', name + '.webp'), 'WEBP', quality=90, method=6)

    stack([(9, 0), (26, 10), (6, 30)], 'player')
    stack([(11, 0), (13, 26)], 'enemy')
    # 崩れる演出に使う石と爆発
    for n in [29, 30, 31, 32, 54, 55, 56, 57, 58]:
        im = Image.open(P + f'{n}.png').convert('RGBA')
        im.save(os.path.join(OUT, 'castle', f'p{n}.webp'), 'WEBP', quality=88)


def build_fx():
    import re
    folders = {
        'fireball': 'fx3_fireBall',
        'firesign': 'fx4_sign_of_fire',
        'energy': 'fx7_energyBall',
        'lightning': 'fx8_lighteningBall',
        'blackboom': 'fx10_blackExplosion',
        'bluetop': 'fx1_blue_topEffect',
        'rain': 'fx9_rainOnGround',
        'flames': 'fx5_fire_scissors',
        'swordfire': 'fx2_swordFire',
    }
    num = lambda f: int(re.findall(r'(\d+)\.png$', f)[0])
    meta = {}
    for k, d in folders.items():
        files = sorted(glob.glob(os.path.join(SRC, 'fx/FX', d, '*.png')), key=num)
        if len(files) > 16:
            files = [files[int(i * len(files) / 16)] for i in range(16)]
        frames = [Image.open(f).convert('RGBA') for f in files]
        w = max(f.width for f in frames)
        h = max(f.height for f in frames)
        sheet = Image.new('RGBA', (w * len(frames), h))
        for i, fr in enumerate(frames):
            sheet.alpha_composite(fr, (i * w + (w - fr.width) // 2, (h - fr.height) // 2))
        sheet.save(os.path.join(OUT, 'fx', k + '.webp'), 'WEBP', quality=88)
        meta[k] = {'w': w, 'h': h, 'n': len(frames)}
    return meta


def build_cards():
    C = os.path.join(SRC, 'cards/1_Free Pack/Card Sprites/')
    sel = {
        'frame_common': 'Minion/Alternate (2).png',
        'frame_rare': 'Minion/minion (1).png',
        'frame_epic': 'Minion/Alternate (3).png',
        'ring': 'Minion/minion (4).png',
        'ribbon': 'Minion/minion (6).png',
        'gem_common': '_Rarity/rarity (1).png',
        'gem_rare': '_Rarity/rarity (6).png',
        'gem_epic': '_Rarity/rarity (5).png',
        'cost': '_Rarity/rarity (5).png',
        'back': 'Card Back/_cover.png',
        'booster': 'Booster/booster body smooth.png',
    }
    for k, f in sel.items():
        im = Image.open(C + f).convert('RGBA')
        im = im.crop(im.getbbox())
        mx = 360 if k.startswith('frame') or k in ('back', 'booster') else 200
        im.thumbnail((mx, int(mx * 1.5)), Image.LANCZOS)
        im.save(os.path.join(OUT, 'cards', k + '.webp'), 'WEBP', quality=90)
    ex = os.path.join(SRC, 'cards/1_Free Pack/Examples/booster (1).png')
    im = Image.open(ex).convert('RGBA')
    im = im.crop(im.getbbox())
    im.thumbnail((360, 520), Image.LANCZOS)
    im.save(os.path.join(OUT, 'cards', 'booster_art.webp'), 'WEBP', quality=90)


def build_ui():
    U = os.path.join(SRC, 'ui/1_Free Pack/')
    pick = {
        'panel': 'HUD/Free/PNG Big (256 px)/HUD_default_gold (25).png',
        'panel_dark': 'HUD/Free/PNG Big (256 px)/HUD_default_dark (25).png',
        'circle': 'HUD/Free/PNG Big (256 px)/HUD_default_gold (29).png',
        'shield': 'HUD/Free/PNG Big (256 px)/HUD_default_gold (49).png',
        'i_settings': 'Icons/Free/PNG Big (256 px)/icons_bright (61).png',
        'i_pause': 'Icons/Free/PNG Big (256 px)/icons_bright (54).png',
        'i_play': 'Icons/Free/PNG Big (256 px)/icons_bright (59).png',
        'i_close': 'Icons/Free/PNG Big (256 px)/icons_bright (55).png',
        'i_check': 'Icons/Free/PNG Big (256 px)/icons_bright (38).png',
        'i_crown': 'Icons/Free/PNG Big (256 px)/icons_bright (18).png',
        'i_heart': 'Icons/Free/PNG Big (256 px)/icons_bright (9).png',
        'i_star': 'Icons/Free/PNG Big (256 px)/icons_bright (10).png',
        'i_back': 'Icons/Free/PNG Big (256 px)/icons_bright (58).png',
        'i_ff': 'Icons/Free/PNG Big (256 px)/icons_bright (60).png',
        'i_trophy': 'Icons/Free/PNG Big (256 px)/icons_bright (50).png',
        'i_home': 'Icons/Free/PNG Big (256 px)/icons_bright (19).png',
    }
    for k, f in pick.items():
        p = U + f
        if not os.path.exists(p):
            print('UI なし:', f)
            continue
        im = Image.open(p).convert('RGBA')
        im = im.crop(im.getbbox())
        im.thumbnail((256, 256), Image.LANCZOS)
        im.save(os.path.join(OUT, 'ui', k + '.webp'), 'WEBP', quality=90)


def build_audio():
    sfx = {
        'deploy': 'clothBelt', 'hit': 'knifeSlice', 'hit2': 'knifeSlice2', 'smash': 'chop',
        'metal': 'metalPot1', 'metal2': 'metalPot2', 'arrow': 'drawKnife2', 'arrowhit': 'drawKnife3',
        'castle': 'doorClose_4', 'death': 'dropLeather', 'click': 'metalClick', 'denied': 'metalLatch',
        'flip': 'bookFlip2', 'open': 'bookOpen', 'coins': 'handleCoins', 'page': 'bookFlip1', 'step': 'footstep03',
    }
    for k, f in sfx.items():
        src = glob.glob(os.path.join(SRC, 'sfx/**', f + '.ogg'), recursive=True)[0]
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-b:a', '64k', os.path.join(OUT, 'audio', 'sfx_' + k + '.mp3')], check=True)
    music = {
        'menu': 'music-loop-bundle-troubadeck/Troubadeck 24 Royal Blue.ogg',
        'battle': 'music-loop-bundle-2026-q1/Week 6 - Never Miss TAKE AIM.ogg',
        'fever': 'music-loop-bundle-2026-q1/Week 6 - Never Miss FIRE.ogg',
        'boss': 'music-loop-bundle-2026-q1/Week 4 - Cloak of Darkness STAGE 3.ogg',
    }
    for k, f in music.items():
        src = os.path.join(SRC, 'music', f)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '2', '-b:a', '96k', os.path.join(OUT, 'audio', 'bgm_' + k + '.mp3')], check=True)


def build_skin():
    """ボタン・枠・ゲージなどの UI 部品(Mechanized Magic UI + Kenney RPG UI)。"""
    B = os.path.join(SRC, 'ui/1_Free Pack/HUD/Free/PNG Big (256 px)/')
    K = os.path.join(SRC, 'k_rpg/PNG/')
    out = os.path.join(OUT, 'skin')
    os.makedirs(out, exist_ok=True)

    def hud(name, key, width):
        im = Image.open(B + name + '.png').convert('RGBA')
        im = im.crop(im.getbbox())
        h = round(im.height * width / im.width)
        im.resize((width, h), Image.LANCZOS).save(os.path.join(out, key + '.webp'), 'WEBP', quality=92)

    hud('HUD_default_gold (25)', 'btn_gold', 340)
    hud('HUD_default_bright (25)', 'btn_silver', 340)
    hud('HUD_default_dark (26)', 'btn_dark', 340)
    hud('HUD_default_gold (21)', 'frame_gold', 340)
    hud('HUD_default_bright (22)', 'frame_silver', 340)
    hud('HUD_default_gold (30)', 'oct_gold', 160)
    hud('HUD_default_dark (31)', 'oct_dark', 160)
    hud('HUD_default_gold (29)', 'disc_gold', 200)
    hud('HUD_default_dark (30)', 'disc_dark', 200)
    hud('HUD_default_gold (17)', 'plate_gold', 340)
    hud('HUD_default_dark (18)', 'plate_dark', 340)

    def bar(color, key):
        # 左・中・右の3枚をつなげて2倍に拡大(CSS の border-image で伸ばす)
        if color == 'Back':
            parts = ['barBack_horizontalLeft', 'barBack_horizontalMid', 'barBack_horizontalRight']
        else:
            mid = 'bar%s_horizontalBlue' % color if color == 'Blue' else 'bar%s_horizontalMid' % color
            parts = ['bar%s_horizontalLeft' % color, mid, 'bar%s_horizontalRight' % color]
        ims = [Image.open(K + n + '.png').convert('RGBA') for n in parts]
        w = sum(i.width for i in ims)
        cv = Image.new('RGBA', (w, ims[0].height))
        x = 0
        for i in ims:
            cv.alpha_composite(i, (x, 0)); x += i.width
        cv.resize((w * 3, cv.height * 3), Image.LANCZOS).save(os.path.join(out, key + '.webp'), 'WEBP', quality=95)

    for c, k in [('Back', 'bar_back'), ('Red', 'bar_red'), ('Blue', 'bar_blue'), ('Green', 'bar_green'), ('Yellow', 'bar_yellow')]:
        bar(c, k)
    for n, k in [('panel_beigeLight', 'parchment'), ('panel_brown', 'wood'), ('panelInset_beige', 'parchment_inset')]:
        im = Image.open(K + n + '.png').convert('RGBA')
        im.resize((im.width * 3, im.height * 3), Image.LANCZOS).save(os.path.join(out, k + '.webp'), 'WEBP', quality=95)
    for n, k in [('cursorGauntlet_bronze', 'cursor'), ('cursorHand_beige', 'cursor_hand')]:
        im = Image.open(K + n + '.png').convert('RGBA')
        im.save(os.path.join(out, k + '.png'))
    for n in ['arrowBeige_left', 'arrowBeige_right', 'iconCheck_bronze', 'iconCross_brown']:
        im = Image.open(K + n + '.png').convert('RGBA')
        im.resize((im.width * 3, im.height * 3), Image.LANCZOS).save(os.path.join(out, n + '.webp'), 'WEBP', quality=95)


def main():
    for d in ['units', 'portraits', 'bg', 'castle', 'fx', 'cards', 'ui', 'audio']:
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    only = set(os.environ.get('ONLY', 'units,bg,castle,fx,cards,ui,audio,skin').split(','))
    meta = {'units': {}, 'fx': {}}
    old = os.path.join(OUT, 'assets.js')
    if os.path.exists(old):
        txt = open(old, encoding='utf-8').read()
        meta = json.loads(txt[txt.index('ASSET_META = ') + 13:].rstrip().rstrip(';'))
    if 'units' in only:
        for uid, (folder, anims, h) in UNITS.items():
            print('unit', uid)
            meta['units'][uid] = build_unit(uid, folder, anims, h)
    if 'bg' in only: print('backgrounds'); build_backgrounds()
    if 'castle' in only: print('castles'); build_castles()
    if 'fx' in only: print('fx'); meta['fx'] = build_fx()
    if 'cards' in only: print('cards'); build_cards()
    if 'ui' in only: print('ui'); build_ui()
    if 'audio' in only: print('audio'); build_audio()
    if 'skin' in only: print('skin'); build_skin()
    with open(os.path.join(OUT, 'assets.js'), 'w', encoding='utf-8') as f:
        f.write('/* build_assets.py が生成 */\nwindow.CTD = window.CTD || {};\nCTD.ASSET_META = ')
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('done ->', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
