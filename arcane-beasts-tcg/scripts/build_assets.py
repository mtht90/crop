#!/usr/bin/env python3
"""
Build the game's asset bundle from external open-source sources.

Sources
  * Battle for Wesnoth (https://github.com/wesnoth/wesnoth) — portraits,
    landscapes, effect sprites, sound effects and music (GPL v2+ / CC BY-SA 4.0)
  * game-icons.net via @iconify-json/game-icons (CC BY 3.0) — UI / item icons

Usage
  python3 scripts/build_assets.py [path-to-wesnoth-checkout]

A sparse checkout is enough:
  git clone --depth 1 --filter=blob:none --sparse https://github.com/wesnoth/wesnoth
  git -C wesnoth sparse-checkout set data/core/images/portraits data/core/images/story \
      data/core/images/halo data/core/images/projectiles data/core/music data/core/sounds sounds
"""
import csv
import glob
import json
import os
import re
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WES = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('WESNOTH_DIR', os.path.join(ROOT, '..', 'wesnoth'))
IMG = os.path.join(WES, 'data/core/images')
OUT = os.path.join(ROOT, 'public/assets')

try:
    import imageio_ffmpeg

    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:  # pragma: no cover
    FFMPEG = 'ffmpeg'


def ensure(p):
    os.makedirs(p, exist_ok=True)


# Art from Wesnoth's mainline campaigns: extra monster portraits ('camp/…')
# and painted story illustrations used behind illustration-model cards ('story/p-…')
CAMPAIGN = {
    'camp/snowball': 'Sceptre_of_Fire/images/portraits/monsters/snowball.webp',
    'camp/snowgolem': 'Sceptre_of_Fire/images/portraits/monsters/snowgolem.webp',
    'camp/wyrm': 'Winds_of_Fate/images/portraits/wyrm.webp',
    'camp/wyrm-elder': 'Sceptre_of_Fire/images/portraits/monsters/wyrm-elder.webp',
    'camp/crab': 'The_Deceivers_Gambit/images/portraits/crab.webp',
    'camp/eyestalk': 'The_South_Guard/images/portraits/eyestalk.webp',
    'camp/familiar': 'The_Rise_Of_Wesnoth/images/portraits/familiar.webp',
    'camp/flesh-golem': 'Under_the_Burning_Suns/images/portraits/monsters/flesh_golem.webp',
    'camp/typhon': 'The_Rise_Of_Wesnoth/images/portraits/typhon.webp',
    'camp/naga-hunter': 'Under_the_Burning_Suns/images/portraits/nagas/naga-hunter.webp',
    'camp/cave-imp': 'Sceptre_of_Fire/images/portraits/monsters/cave-imp.webp',
    'camp/pyre-wight': 'Eastern_Invasion/images/portraits/pyre-wight.webp',
    'camp/vampire-lady': 'The_Rise_Of_Wesnoth/images/portraits/vampire_lady.webp',
    'camp/tauroch-rider': 'Under_the_Burning_Suns/images/portraits/quenoth/tauroch_rider.webp',
    # 第3弾 art: the Quenoth (desert folk) and a few campaign portraits
    'camp/q-scout': 'Under_the_Burning_Suns/images/portraits/quenoth/scout.webp',
    'camp/q-pathfinder': 'Under_the_Burning_Suns/images/portraits/quenoth/pathfinder.webp',
    'camp/q-champion': 'Under_the_Burning_Suns/images/portraits/quenoth/champion.webp',
    'camp/q-tauroch-vanguard': 'Under_the_Burning_Suns/images/portraits/quenoth/tauroch_vanguard.webp',
    'camp/q-tauroch-flagbearer': 'Under_the_Burning_Suns/images/portraits/quenoth/tauroch_flagbearer.webp',
    'camp/q-tauroch-protector': 'Under_the_Burning_Suns/images/portraits/quenoth/tauroch_protector.webp',
    'camp/q-sun-singer': 'Under_the_Burning_Suns/images/portraits/quenoth/sun_singer.webp',
    'camp/q-sun-sylph': 'Under_the_Burning_Suns/images/portraits/quenoth/sun_sylph.webp',
    'camp/q-archer': 'Under_the_Burning_Suns/images/portraits/quenoth/archer.webp',
    'camp/q-marksman': 'Under_the_Burning_Suns/images/portraits/quenoth/marksman.webp',
    'camp/q-ranger': 'Under_the_Burning_Suns/images/portraits/quenoth/ranger.webp',
    'camp/q-flanker': 'Under_the_Burning_Suns/images/portraits/quenoth/flanker.webp',
    'camp/q-outrider': 'Under_the_Burning_Suns/images/portraits/quenoth/outrider.webp',
    'camp/q-fighter': 'Under_the_Burning_Suns/images/portraits/quenoth/fighter.webp',
    'camp/q-warrior': 'Under_the_Burning_Suns/images/portraits/quenoth/warrior.webp',
    'camp/q-shyde': 'Under_the_Burning_Suns/images/portraits/quenoth/shyde.webp',
    'camp/q-mystic': 'Under_the_Burning_Suns/images/portraits/quenoth/mystic.webp',
    'camp/q-shaman': 'Under_the_Burning_Suns/images/portraits/quenoth/shaman.webp',
    'camp/q-druid': 'Under_the_Burning_Suns/images/portraits/quenoth/druid.webp',
    'camp/grenadier': 'The_Hammer_of_Thursagan/images/portraits/grenadier.webp',
    'camp/orcish-shaman': 'Secrets_of_the_Ancients/images/portraits/orcish-shaman.webp',
    'camp/shynal-adept': 'Secrets_of_the_Ancients/images/portraits/shynal-adept.webp',
    # story cast (expression variants for the visual novel)
    'camp/delfador': 'Heir_To_The_Throne_Classic/images/portraits/delfador.webp',
    'camp/delfador-mad': 'Heir_To_The_Throne_Classic/images/portraits/delfador-mad.webp',
    'camp/delfador-mentoring': 'Heir_To_The_Throne_Classic/images/portraits/delfador-mentoring.webp',
    'camp/lisar': 'Heir_To_The_Throne_Classic/images/portraits/lisar.webp',
    'camp/lisar-glad': 'Heir_To_The_Throne_Classic/images/portraits/lisar-glad.webp',
    'camp/lisar-mad': 'Heir_To_The_Throne_Classic/images/portraits/lisar-mad.webp',
    'camp/lisar-defeat': 'Heir_To_The_Throne_Classic/images/portraits/lisar-defeat.webp',
    'camp/konrad': 'Heir_To_The_Throne_Classic/images/portraits/konrad-human.webp',
    'camp/konrad-glad': 'Heir_To_The_Throne_Classic/images/portraits/konrad-human-glad.webp',
    'camp/konrad-mad': 'Heir_To_The_Throne_Classic/images/portraits/konrad-human-mad.webp',
    'camp/konrad-concerned': 'Heir_To_The_Throne_Classic/images/portraits/konrad-human-concerned.webp',
    'camp/asheviere': 'Heir_To_The_Throne_Classic/images/portraits/asheviere.webp',
    'camp/asheviere-mad': 'Heir_To_The_Throne_Classic/images/portraits/asheviere-mad.webp',
    'camp/asheviere-defeated': 'Heir_To_The_Throne_Classic/images/portraits/asheviere-defeated.webp',
    'story/p-summoning': 'The_Rise_Of_Wesnoth/images/story/trow_intro_03.webp',
    'story/p-drake-fleet': 'Winds_of_Fate/images/story/drakes-engage-fleet.webp',
    'story/p-storm-sea': 'The_Rise_Of_Wesnoth/images/story/trow_intro_05.webp',
    'story/p-wild-sea': 'The_Rise_Of_Wesnoth/images/story/trow_intro_06.webp',
    'story/p-the-fall': 'The_Rise_Of_Wesnoth/images/story/trow_story_02-The_Fall.jpg',
    'story/p-swamp': 'The_Rise_Of_Wesnoth/images/story/trow_story_04a-The_Swamp_of_Esten.jpg',
    'story/p-burning': 'The_Deceivers_Gambit/images/story/burning-wp.png',
    'story/p-black-forest': 'The_South_Guard/images/story/black-forest.webp',
    'story/p-study': 'The_Rise_Of_Wesnoth/images/story/trow_intro_07.webp',
    'story/p-shadows': 'Two_Brothers/images/story/Two_Brothers_M1P1.webp',
    'story/p-winter': 'The_South_Guard/images/story/winter1.webp',
    'story/p-summer': 'The_South_Guard/images/story/summer.webp',
    'story/p-great-tree': 'The_Rise_Of_Wesnoth/images/story/trow_intro_01.webp',
    'story/p-island': 'Liberty/images/story/island.webp',
    'story/p-mountains': 'The_Deceivers_Gambit/images/story/mountains-wp.png',
    'story/p-snowfield': 'The_South_Guard/images/story/awinter1.webp',
    'story/p-fog': 'The_Deceivers_Gambit/images/story/fog-wp.png',
    'story/p-temple': 'The_Rise_Of_Wesnoth/images/story/trow_story_06-Temple_in_the_Deep.webp',
    'story/p-graves': 'The_Deceivers_Gambit/images/story/graves-wp.png',
    # chapter key art (the chapter select shows one painting per chapter)
    'story/p-kneel': 'The_Rise_Of_Wesnoth/images/story/trow_intro_04.webp',
    'story/p-mourning': 'The_Rise_Of_Wesnoth/images/story/trow_intro_08.webp',
    'story/p-hall': 'The_Rise_Of_Wesnoth/images/story/trow_intro_09.webp',
    'story/p-statue': 'The_Rise_Of_Wesnoth/images/story/trow_intro_10.jpg',
    'story/p-fire-sky': 'The_Rise_Of_Wesnoth/images/story/trow_intro_02.webp',
    'story/p-storms': 'The_Rise_Of_Wesnoth/images/story/trow_story_01-A_Summer_of_Storms.webp',
    'story/p-escape': 'The_Rise_Of_Wesnoth/images/story/trow_story_03-A_Harrowing_Escape.webp',
    'story/p-ambush': 'The_Rise_Of_Wesnoth/images/story/trow_story_04-Fall_of_Eldaric.jpg',
    'story/p-midlands': 'The_Rise_Of_Wesnoth/images/story/trow_story_04b-The_Midlands.webp',
    'story/p-voyage': 'The_Rise_Of_Wesnoth/images/story/trow_story_13-Peoples_in_Decline.webp',
    'story/p-new-land': 'The_Rise_Of_Wesnoth/images/story/trow_story_15-A_New_Land.webp',
    'story/p-rider': 'Two_Brothers/images/story/Two_Brothers_M1P2.webp',
    'story/p-ridge': 'Two_Brothers/images/story/Two_Brothers_M2P1.webp',
    'story/p-aftermath': 'Two_Brothers/images/story/Two_Brothers_M4P1_the_end.webp',
    'story/p-castle-fall': 'The_South_Guard/images/story/fall.webp',
    'story/p-castle-winter': 'The_South_Guard/images/story/winter.webp',
    'story/p-snow-hut': 'The_South_Guard/images/story/winter4.webp',
    'story/p-dark-pines': 'The_South_Guard/images/story/black-forest2.webp',
    'story/p-lone-tower': 'Descent_Into_Darkness/images/story/parthyn.webp',
    'story/p-pilgrims': 'Descent_Into_Darkness/images/story/travel.webp',
    'story/p-shrine': 'Descent_Into_Darkness/images/story/book.webp',
    'story/p-hooded': 'Descent_Into_Darkness/images/story/end.webp',
    'story/p-sunset-town': 'Liberty/images/story/Halstead.webp',
    'story/p-frontier': 'Liberty/images/story/frontier.webp',
    'story/p-homeward': 'Liberty/images/story/return_to_Dallben_and_Delwyn.webp',
    'story/p-bride': 'The_Deceivers_Gambit/images/story/bride-wp.png',
    'story/p-river-mist': 'The_Deceivers_Gambit/images/story/river-wp.png',
    'story/p-fort': 'The_Deceivers_Gambit/images/story/fort-wp.png',
    'story/p-lake-castle': 'The_Deceivers_Gambit/images/story/alduin-wp.png',
    'story/p-farmer': 'The_Deceivers_Gambit/images/story/farmer-wp.png',
    'story/p-blade': 'The_Deceivers_Gambit/images/story/knight-wp.png',
    'story/p-horseman': '../core/images/story/horse.webp',
    'story/p-remains': '../core/images/story/skeleton.webp',
    'story/p-elf-wood': '../core/images/story/wesmere.webp',
    'story/p-notes': '../core/images/story/drake.webp',
}


def find_src(key):
    if key in CAMPAIGN:
        p = os.path.join(WES, 'data/campaigns', CAMPAIGN[key])
        return p if os.path.exists(p) else None
    base = key if key.startswith('story/') else 'portraits/' + key
    for ext in ('.webp', '.png', '.jpg'):
        p = os.path.join(IMG, base + ext)
        if os.path.exists(p):
            return p
    return None


# ---------------------------------------------------------------------------
# 1. Collect art keys referenced from the source code
# ---------------------------------------------------------------------------
KEY_RE = re.compile(r"'((?:monsters|drakes|trolls|woses|undead|saurians|merfolk|nagas|wolves|humans|goblins|elves|dwarves|orcs|dunefolk|transport|camp|story)/[\w+\-]*[\w+])'")
keys = set()
for f in glob.glob(os.path.join(ROOT, 'src/**/*.ts'), recursive=True) + glob.glob(os.path.join(ROOT, 'src/**/*.tsx'), recursive=True):
    keys.update(KEY_RE.findall(open(f, encoding='utf-8').read()))

# Scenes used for card art backgrounds and screens
SCENES = [
    'landscape-lava', 'landscape-mountains-01', 'grim-altar', 'landscape-mountains-04', 'swamp-02',
    'landscape-mountains-03', 'swamp-01', 'landscape-plain', 'landscape-bridge_sun', 'landscape-castle',
    'landscape-hills-02', 'landscape-beach',
]
keys.update('story/' + s for s in SCENES)

credits_rows = {}
csv_path = os.path.join(WES, 'copyrights.csv')
if os.path.exists(csv_path):
    for r in csv.DictReader(open(csv_path, encoding='utf-8')):
        credits_rows[r['File']] = (r['License'], r['Author - Real Name(other name);Real Name(other name);etc'])

used = []


def credit(src_rel, kind):
    lic, author = credits_rows.get(src_rel, ('GNU GPL v2+', 'Battle for Wesnoth Project'))
    used.append((kind, src_rel, lic, author))


# ---------------------------------------------------------------------------
# 2. Images
# ---------------------------------------------------------------------------
def build_images():
    missing = []
    for key in sorted(keys):
        src = find_src(key)
        if not src:
            missing.append(key)
            continue
        dst = os.path.join(OUT, key + '.webp') if key.startswith('story/') else os.path.join(OUT, 'art', key + '.webp')
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            credit(os.path.relpath(src, WES), 'image')
            continue  # already encoded
        im = Image.open(src)
        if key.startswith('story/'):
            im = im.convert('RGB')
            im.thumbnail((1280, 960), Image.LANCZOS)
            ensure(os.path.dirname(dst))
            im.save(dst, 'WEBP', quality=78, method=6)
        else:
            dst = os.path.join(OUT, 'art', key + '.webp')
            im = im.convert('RGBA')
            im.thumbnail((512, 512), Image.LANCZOS)
            ensure(os.path.dirname(dst))
            im.save(dst, 'WEBP', quality=84, method=6)
        credit(os.path.relpath(src, WES), 'image')
    if missing:
        print('MISSING ART:', missing)
        sys.exit(1)
    print(f'images: {len(keys)}')


# ---------------------------------------------------------------------------
# 3. Effect sprite sheets
# ---------------------------------------------------------------------------
FX = {
    'fire': ['projectiles/fireball-impact-{}.png', range(1, 17)],
    'flame': ['halo/flame-burst-{}.png', range(1, 9)],
    'water': ['halo/merfolk/water-halo-{}.png', range(1, 8)],
    'ice': ['halo/elven/ice-halo{}.png', range(1, 10)],
    'grass': ['halo/elven/nature-halo{}.png', range(1, 9)],
    'lightning': ['halo/lightning-bolt-1-{}.png', range(1, 5)],
    'lightning2': ['halo/lightning-bolt-2-{}.png', range(1, 5)],
    'psychic': ['halo/elven/faerie-fire-halo{}.png', range(1, 8)],
    'dark': ['halo/undead/dark-magic-{}.png', range(1, 7)],
    'darkburst': ['halo/undead/black-magic-{}.png', range(1, 6)],
    'impact': ['projectiles/whitemissile-impact-{}.png', range(1, 11)],
    'heal': ['halo/elven/druid-healing{}.png', range(1, 9)],
    'holy': ['halo/holy/light-beam-{}.png', range(1, 8)],
    'flare': ['halo/misc/leadership-flare-{}.png', range(1, 14)],
    'smoke': ['halo/thunderer/smoke-se-ranged-kill{}.png', range(1, 12)],
    'staff': ['halo/merfolk/staff-flare-{}.png', range(1, 8)],
}


def build_fx():
    meta = {}
    ensure(os.path.join(OUT, 'fx'))
    for name, (pat, rng) in FX.items():
        frames = []
        for i in rng:
            p = os.path.join(IMG, pat.format(i))
            if os.path.exists(p):
                frames.append(Image.open(p).convert('RGBA'))
                credit(os.path.relpath(p, WES), 'effect')
        if not frames:
            print('fx missing', name)
            continue
        w = max(f.width for f in frames)
        h = max(f.height for f in frames)
        sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            sheet.paste(f, (i * w + (w - f.width) // 2, (h - f.height) // 2), f)
        sheet.save(os.path.join(OUT, 'fx', name + '.png'), optimize=True)
        meta[name] = {'w': w, 'h': h, 'frames': len(frames)}
    with open(os.path.join(ROOT, 'src/assets/fx.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    print(f'fx: {len(meta)}')


# ---------------------------------------------------------------------------
# 4. Audio
# ---------------------------------------------------------------------------
SFX = [
    # ui
    'sounds/button.wav', 'sounds/select.wav', 'sounds/checkbox.wav', 'sounds/expand.wav', 'sounds/contract.wav',
    'sounds/gamestart.ogg', 'sounds/bell.wav', 'sounds/receive.wav', 'sounds/timer.wav', 'sounds/arrive.wav',
    # game
    'data/core/sounds/gold.ogg', 'data/core/sounds/heal.wav', 'data/core/sounds/poison.ogg', 'data/core/sounds/open-chest.wav',
    'data/core/sounds/fanfare-short.wav', 'data/core/sounds/magic-holy-1.ogg', 'data/core/sounds/magic-holy-2.ogg',
    'data/core/sounds/magicmissile.wav', 'data/core/sounds/explosion.ogg', 'data/core/sounds/rumble.ogg',
    'data/core/sounds/horn-signals/horn-1.ogg', 'data/core/sounds/horn-signals/horn-3.ogg', 'data/core/sounds/slowed.wav',
    'data/core/sounds/petrified.ogg', 'data/core/sounds/miss-1.ogg', 'data/core/sounds/miss-2.ogg', 'data/core/sounds/entangle.wav',
    'data/core/sounds/net.wav', 'data/core/sounds/potion.ogg', 'data/core/sounds/throw-1.wav', 'data/core/sounds/squishy-hit.wav',
    # attacks
    'data/core/sounds/flame-big.ogg', 'data/core/sounds/fire.wav', 'data/core/sounds/melee-fire.ogg', 'data/core/sounds/torch.ogg',
    'data/core/sounds/water-blast.wav', 'data/core/sounds/ink.ogg', 'data/core/sounds/magic-thorns-1.ogg',
    'data/core/sounds/magic-thorns-2.ogg', 'data/core/sounds/wose-attack.ogg', 'data/core/sounds/lightning.ogg',
    'data/core/sounds/magic-faeriefire.ogg', 'data/core/sounds/wail.wav', 'data/core/sounds/magic-missile-2.ogg',
    'data/core/sounds/fist.ogg', 'data/core/sounds/club.ogg', 'data/core/sounds/mace.ogg', 'data/core/sounds/mud-fist.ogg',
    'data/core/sounds/magic-dark.ogg', 'data/core/sounds/magic-dark-big.ogg', 'data/core/sounds/claws.ogg',
    'data/core/sounds/bite.ogg', 'data/core/sounds/tusker-charge.ogg', 'data/core/sounds/sword-1.ogg', 'data/core/sounds/tail.ogg',
    'data/core/sounds/pincers.ogg',
    # cries / deaths
    'data/core/sounds/wolf-growl-1.ogg', 'data/core/sounds/wolf-growl-3.ogg', 'data/core/sounds/gryphon-shriek-1.ogg',
    'data/core/sounds/drake-hit-1.ogg', 'data/core/sounds/drake-die.ogg', 'data/core/sounds/troll-hit-2.ogg', 'data/core/sounds/troll-die-1.ogg',
    'data/core/sounds/ugg.wav', 'data/core/sounds/ogre-hit-1.ogg', 'data/core/sounds/wail-sml.wav', 'data/core/sounds/skeleton-hit-1.ogg',
    'data/core/sounds/skeleton-big-die.ogg', 'data/core/sounds/bat-hit-1.ogg', 'data/core/sounds/hiss.wav', 'data/core/sounds/hiss-die.wav',
    'data/core/sounds/wose-hit.ogg', 'data/core/sounds/wose-die.ogg', 'data/core/sounds/yeti-hit.ogg', 'data/core/sounds/horse-hit-1.ogg',
    'data/core/sounds/horse-die.ogg', 'data/core/sounds/tusker-hit.ogg', 'data/core/sounds/mud-glob.ogg', 'data/core/sounds/mermaid-hit.ogg',
    'data/core/sounds/mermen-die.ogg', 'data/core/sounds/lich-die.ogg', 'data/core/sounds/gryphon-die-1.ogg', 'data/core/sounds/wolf-die-1.ogg',
    'data/core/sounds/zombie-hit-1.ogg', 'data/core/sounds/ghoul-hit.wav', 'data/core/sounds/human-hit-1.ogg',
]

MUSIC = {
    'title': 'main_menu.ogg',
    'menu': 'wanderer.ogg',
    'shop': 'traveling_minstrels.ogg',
    'battle1': 'battle.ogg',
    'battle2': 'frantic.ogg',
    'battle3': 'the_dangerous_symphony.ogg',
    'boss': 'battle-epic.ogg',
    'victory': 'victory.ogg',
    'defeat': 'defeat.ogg',
    # story scenes
    'sad': 'sad.ogg',
    'revelation': 'revelation.ogg',
    'suspense': 'suspense.ogg',
    'shadows': 'into_the_shadows.ogg',
    'journey': 'journeys_end.ogg',
    'love': 'love_theme.ogg',
    'transience': 'transience.ogg',
    'elegy': 'the_king_is_dead.ogg',
    'silence': 'silence.ogg',
    'legends': 'legends_of_the_north.ogg',
    'knolls': 'knolls.ogg',
    'revenge': 'weight_of_revenge.ogg',
}


def ff(src, dst, bitrate):
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-ac', '2', '-b:a', bitrate, dst], check=True)


def build_audio():
    ensure(os.path.join(OUT, 'sfx'))
    ensure(os.path.join(OUT, 'music'))
    names = []
    for rel in SFX:
        src = os.path.join(WES, rel)
        if not os.path.exists(src):
            print('sfx missing', rel)
            continue
        name = os.path.splitext(os.path.basename(rel))[0]
        dst = os.path.join(OUT, 'sfx', name + '.mp3')
        if not os.path.exists(dst):
            ff(src, dst, '96k')
        names.append(name)
        credit(rel, 'sound')
    for key, fn in MUSIC.items():
        rel = 'data/core/music/' + fn
        dst = os.path.join(OUT, 'music', key + '.mp3')
        if not os.path.exists(dst):
            ff(os.path.join(WES, rel), dst, '112k')
        credit(rel, 'music')
    with open(os.path.join(ROOT, 'src/assets/sfx.json'), 'w') as fh:
        json.dump(sorted(set(names)), fh)
    print(f'sfx: {len(names)} music: {len(MUSIC)}')


# ---------------------------------------------------------------------------
# 5. Icons (game-icons.net, CC BY 3.0)
# ---------------------------------------------------------------------------
ICONS = {
    # energy types
    'fire': 'flame', 'water': 'water-drop', 'grass': 'three-leaves', 'lightning': 'focused-lightning',
    'psychic': 'third-eye', 'fighting': 'fist', 'dark': 'crescent-blade', 'colorless': 'star-formation',
    # item / tool art
    'scroll-unfurled': 'scroll-unfurled', 'hunting-horn': 'hunting-horn', 'health-potion': 'health-potion',
    'potion-ball': 'potion-ball', 'feather': 'feather', 'magic-potion': 'magic-potion', 'crystal-growth': 'crystal-growth',
    'amphora': 'amphora', 'night-sky': 'night-sky', 'coins': 'coins', 'crossed-chains': 'crossed-chains', 'compass': 'compass',
    'feathered-wing': 'feathered-wing', 'bracer': 'bracer', 'pendant-key': 'pendant-key', 'spiked-armor': 'spiked-armor',
    'crystal-ball': 'crystal-ball', 'energy-arrow': 'energy-arrow', 'hammer-drop': 'hammer-drop', 'dragon-shield': 'dragon-shield',
    # 第3弾 item / tool art
    'barrel': 'barrel', 'spider-web': 'spider-web', 'fishing-net': 'fishing-net', 'scroll-quill': 'scroll-quill',
    'honeycomb': 'honeycomb', 'rope-coil': 'rope-coil', 'ladder': 'ladder', 'anvil': 'anvil', 'trowel': 'trowel',
    'nectar': 'nectar', 'drum': 'drum', 'chain-mail': 'chain-mail', 'round-shield': 'round-shield', 'fangs': 'fangs',
    'heart-bottle': 'heart-bottle', 'bandage-roll': 'bandage-roll', 'tied-scroll': 'tied-scroll', 'tower-flag': 'tower-flag',
    'shard': 'crystal-cluster', 'exchange': 'card-exchange', 'stars': 'star-swirl',
    # ui
    'cards': 'card-random', 'deck': 'stack', 'swords': 'crossed-swords', 'shop': 'shop', 'book': 'book-cover',
    'gear': 'cog', 'trophy': 'trophy-cup', 'chest': 'open-treasure-chest', 'skull': 'skull-crossed-bones',
    'shield': 'shield', 'heart': 'heart-plus', 'hourglass': 'hourglass', 'retreat': 'run', 'sparkles': 'sparkles',
    'poison': 'poison-bottle', 'burn': 'fire-silhouette', 'sleep': 'night-sleep', 'paralyze': 'electric', 'confuse': 'spiral-bloom',
    'back': 'return-arrow', 'close': 'cancel', 'check': 'check-mark', 'coin': 'two-coins', 'crown': 'crown',
    'music': 'musical-notes', 'speaker': 'speaker', 'mute': 'speaker-off', 'lock': 'padlock', 'dragon': 'dragon-head',
    'omega': 'triorb', 'ability': 'spark-spirit', 'info': 'info', 'plus': 'heart-plus', 'minus': 'heart-minus',
    'trash': 'trash-can', 'filter': 'magnifying-glass', 'save': 'save', 'person': 'person', 'robot': 'robot-golem',
    'pointing': 'pointing', 'swipe': 'swipe-card', 'scissors': 'scissors',
}


def build_icons():
    data = json.load(open(os.path.join(ROOT, 'node_modules/@iconify-json/game-icons/icons.json')))
    icons = data['icons']
    out = {}
    for key, name in ICONS.items():
        if name not in icons:
            # try alias
            alias = data.get('aliases', {}).get(name)
            if alias:
                name = alias['parent']
        if name not in icons:
            print('icon missing', key, name)
            continue
        out[key] = icons[name]['body']
    with open(os.path.join(ROOT, 'src/assets/icons.json'), 'w') as fh:
        json.dump(out, fh)
    print(f'icons: {len(out)}')


def write_credits():
    lines = [
        '# Credits',
        '',
        'ARCANE BEASTS is built almost entirely from external open-source assets.',
        '',
        '## Battle for Wesnoth',
        '',
        'Portraits, landscapes, effect sprites, sound effects and music are taken from',
        '[Battle for Wesnoth](https://www.wesnoth.org/) ([source](https://github.com/wesnoth/wesnoth)).',
        'Unless noted otherwise they are licensed under the GNU GPL v2 or later.',
        'Assets were resized / re-encoded (WebP, MP3) and effect frames were packed into sprite sheets.',
        '',
        '| Type | Source file | License | Author |',
        '| --- | --- | --- | --- |',
    ]
    seen = set()
    for kind, rel, lic, author in sorted(used, key=lambda r: (r[0], r[1])):
        if rel in seen:
            continue
        seen.add(rel)
        lines.append(f'| {kind} | `{rel}` | {lic} | {author} |')
    lines += [
        '',
        '## game-icons.net',
        '',
        'Icons by Lorc, Delapouite and contributors from [game-icons.net](https://game-icons.net/),',
        'licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), via `@iconify-json/game-icons`.',
        '',
        '## Fonts',
        '',
        '- Dela Gothic One — SIL Open Font License 1.1 (via @fontsource)',
        '- M PLUS Rounded 1c / M PLUS 1p — SIL Open Font License 1.1 (via @fontsource)',
        '- Cinzel — SIL Open Font License 1.1 (via @fontsource)',
        '',
    ]
    open(os.path.join(ROOT, 'CREDITS.md'), 'w', encoding='utf-8').write('\n'.join(lines))


# ---------------------------------------------------------------------------
# 5. UI chrome (Wesnoth's own buttons, check boxes and frames)
# ---------------------------------------------------------------------------
UI = {
    'btn': 'images/buttons/button_normal/button_H22@2x.png',
    'btn-active': 'images/buttons/button_normal/button_H22-active@2x.png',
    'btn-pressed': 'images/buttons/button_normal/button_H22-pressed@2x.png',
    'sq': 'images/buttons/button_square/button_square_60.png',
    'sq-active': 'images/buttons/button_square/button_square_60-active.png',
    'sq-pressed': 'images/buttons/button_square/button_square_60-pressed.png',
    'large': 'images/buttons/large-button.png',
    'large-active': 'images/buttons/large-button-active.png',
    'large-pressed': 'images/buttons/large-button-pressed.png',
    'menu': 'images/buttons/button_menu/menu_button_copper_H20@2x.png',
    'menu-active': 'images/buttons/button_menu/menu_button_copper_H20-active@2x.png',
    'menu-pressed': 'images/buttons/button_menu/menu_button_copper_H20-pressed@2x.png',
    'check': 'images/buttons/checkbox@2x.png',
    'check-on': 'images/buttons/checkbox-pressed@2x.png',
    'panel-bg': 'images/dialogs/opaque-background.png',
}


def build_ui():
    ensure(os.path.join(OUT, 'ui'))
    for key, rel in UI.items():
        src = os.path.join(WES, rel)
        if not os.path.exists(src):
            print('ui missing', rel)
            continue
        dst = os.path.join(OUT, 'ui', key + '.png')
        if not os.path.exists(dst):
            Image.open(src).convert('RGBA').save(dst, optimize=True)
        credit(rel, 'interface')
    print(f'ui: {len(UI)}')


if __name__ == '__main__':
    ensure(OUT)
    ensure(os.path.join(ROOT, 'src/assets'))
    build_images()
    build_fx()
    build_audio()
    build_icons()
    build_ui()
    write_credits()
    print('done')
