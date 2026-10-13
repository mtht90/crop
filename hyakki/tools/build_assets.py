#!/usr/bin/env python3
"""Ninja Adventure Asset Pack (CC0, Pixel-boy & AAA) から使う素材だけを hyakki/assets へ取り込む。

使い方:
  python3 tools/build_assets.py "<展開した 'Ninja Adventure - Asset Pack' フォルダ>"
入手先: https://pixel-boy.itch.io/ninja-adventure-asset-pack
画像はそのままコピー（加工なし）。音声は Safari でも鳴るよう mp3 に変換する（ffmpeg が必要）。
"""
import os, shutil, subprocess, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Ninja Adventure - Asset Pack'
DST = os.path.join(os.path.dirname(__file__), '..', 'assets')

IMAGES = {
    # プレイヤー・式神（4方向×歩行4フレームのシート）
    'chars/player.png': 'Actor/Character/Master/SpriteSheet.png',
    'chars/player_face.png': 'Actor/Character/Master/Faceset.png',
    'chars/kami.png': 'Actor/Character/Spirit/SpriteSheet.png',
    'chars/karasu.png': 'Actor/Character/Tengu/SpriteSheet.png',
    'chars/byakko.png': 'Actor/Animal/CatWhite/SpriteSheet.png',
    'chars/zenki.png': 'Actor/Boss/GiantBlueSamurai/Walk.png',
    'chars/zenki_attack.png': 'Actor/Boss/GiantBlueSamurai/AttackRight.png',
    # 妖怪
    'yokai/onibi.png': 'Actor/Monster/Flam2/SpriteSheet.png',
    'yokai/kooni.png': 'Actor/Character/DemonRed/SpriteSheet.png',
    'yokai/hitotsume.png': 'Actor/Monster/Cyclope2/SpriteSheet.png',
    'yokai/kappa.png': 'Actor/Monster/KappaGreen/SpriteSheet.png',
    'yokai/chochin.png': 'Actor/Monster/LanternRed/SpriteSheet.png',
    'yokai/gashadokuro.png': 'Actor/Monster/Skull/SpriteSheet.png',
    'yokai/oni.png': 'Actor/Boss/DemonCyclop/Walk.png',
    'yokai/tengu_walk.png': 'Actor/Boss/TenguRed/Walk.png',
    'yokai/tengu_attack.png': 'Actor/Boss/TenguRed/Attack.png',
    'yokai/tengu_hit.png': 'Actor/Boss/TenguRed/Hit.png',
    'yokai/tengu_face.png': 'Actor/Boss/TenguRed/Faceset.png',
    # エフェクト・弾
    'fx/smoke.png': 'FX/Smoke/Smoke/SpriteSheet.png',
    'fx/explosion.png': 'FX/Elemental/Explosion/SpriteSheet.png',
    'fx/thunder.png': 'FX/Elemental/Thunder/SpriteSheet.png',
    'fx/boost.png': 'FX/Magic/Boost/SpriteSheet.png',
    'fx/circle.png': 'FX/Magic/Circle/SpriteSheetWhite.png',
    'fx/circle_spark.png': 'FX/Magic/Circle/SpriteSheetSpark.png',
    'fx/spirit_blue.png': 'FX/Magic/Spirit/SpriteSheetBlue.png',
    'fx/aura.png': 'FX/Magic/Aura/SpriteSheet.png',
    'fx/cut.png': 'FX/Attack/Cut/SpriteSheet.png',
    'fx/spark.png': 'FX/Particle/Spark.png',
    'fx/leaf_pink.png': 'FX/Particle/LeafPink.png',
    'fx/fireball.png': 'FX/Projectile/Fireball.png',
    'fx/energyball.png': 'FX/Projectile/EnergyBall.png',
    'fx/shuriken_magic.png': 'FX/Projectile/ShurikenMagic.png',
    'fx/arrow.png': 'FX/Projectile/Arrow.png',
    'fx/kunai.png': 'FX/Projectile/Kunai.png',
    # アイテム
    'items/scroll.png': 'Items/Scroll/Scroll.png',
    'items/scroll_thunder.png': 'Items/Scroll/ScrollThunder.png',
    'items/onigiri.png': 'Items/Food/Onigiri.png',
    'items/chest.png': 'Items/Treasure/LittleTreasureChest.png',
    'items/gem_yellow.png': 'Items/Resource/GemYellow.png',
    'items/gem_green.png': 'Items/Resource/GemGreen.png',
    'items/gem_red.png': 'Items/Resource/GemRed.png',
    'items/gem_purple.png': 'Items/Resource/GemPurple.png',
    'items/coin.png': 'Items/Treasure/Coin2.png',
    'items/gourd.png': 'Items/Object/Gourd.png',
    # 地面・装飾
    'tiles/floor.png': 'Backgrounds/Tilesets/TilesetFloor.png',
    'tiles/nature.png': 'Backgrounds/Tilesets/TilesetNature.png',
    # UI
    'ui/panel_red.png': 'Ui/Theme/Wip/ThemeRed/nine_path_panel.png',
    'ui/panel_dark.png': 'Ui/Theme/Wip/ThemeDark/nine_path_panel.png',
    'ui/panel_bamboo.png': 'Ui/Theme/Wip/ThemeBamboo/nine_path_panel.png',
    'ui/panel_wood.png': 'Ui/Theme/Theme Wood/nine_path_panel_3.png',
    'ui/heart.png': 'Ui/Receptacle/IconHeart.png',
    'ui/NinjaAdventure.ttf': 'Ui/Font/NormalFont.ttf',
}

SOUNDS = {
    'hit': 'Audio/Sounds/Hit & Impact/Hit1.wav',
    'hit2': 'Audio/Sounds/Hit & Impact/Hit3.wav',
    'kill': 'Audio/Sounds/Hit & Impact/Impact.wav',
    'gem': 'Audio/Sounds/Bonus/Coin.wav',
    'shoot': 'Audio/Sounds/Whoosh & Slash/Whoosh.wav',
    'arrow': 'Audio/Sounds/Whoosh & Slash/Launch.wav',
    'slash': 'Audio/Sounds/Whoosh & Slash/Slash.wav',
    'summon': 'Audio/Sounds/Magic & Skill/Spirit.wav',
    'magic': 'Audio/Sounds/Magic & Skill/Magic1.wav',
    'thunder': 'Audio/Sounds/Elemental/Explosion2.wav',
    'slam': 'Audio/Sounds/Hit & Impact/Impact3.wav',
    'boom': 'Audio/Sounds/Elemental/Explosion.wav',
    'fire': 'Audio/Sounds/Elemental/Fireball.wav',
    'hurt': 'Audio/Sounds/Hit & Impact/Hit5.wav',
    'alarm': 'Audio/Sounds/Alert/Alert.wav',
    'chest': 'Audio/Sounds/Bonus/PowerUp1.wav',
    'heal': 'Audio/Sounds/Magic & Skill/Heal.wav',
    'select': 'Audio/Sounds/Menu/Accept.wav',
    'move': 'Audio/Sounds/Menu/Move1.wav',
    'levelup': 'Audio/Jingles/LevelUp1.wav',
    'gameover': 'Audio/Jingles/GameOver.wav',
    'success': 'Audio/Jingles/Success1.wav',
    'wings': 'Audio/Sounds/Creature/Wings.wav',
}

MUSIC = {
    'title': 'Audio/Musics/13 - Mystical.ogg',
    'stage': 'Audio/Musics/14 - Curse.ogg',
    'wave': 'Audio/Musics/17 - Fight.ogg',
    'boss': 'Audio/Musics/24 - Final Area.ogg',
}


def main():
    for dst, src in IMAGES.items():
        out = os.path.join(DST, dst)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.copyfile(os.path.join(SRC, src), out)
    os.makedirs(os.path.join(DST, 'audio'), exist_ok=True)
    for name, src in SOUNDS.items():
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(SRC, src),
                        '-ac', '1', '-b:a', '64k', os.path.join(DST, 'audio', name + '.mp3')], check=True)
    for name, src in MUSIC.items():
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(SRC, src),
                        '-b:a', '96k', os.path.join(DST, 'audio', 'bgm_' + name + '.mp3')], check=True)
    shutil.copyfile(os.path.join(SRC, 'LICENSE.txt'), os.path.join(DST, 'LICENSE-NinjaAdventure.txt'))
    print('done')


if __name__ == '__main__':
    main()
