# ASSETS.md — 使用素材の記録

> この表は `scripts/gen-assets-md.py` で `src/data/assets-manifest.json` から生成しています。素材を追加・差し替えたらマニフェストを更新し、再生成してください。

- 確認日: 2026-11-04（配布ページ上のライセンス表記を確認）
- ライセンス区分: A（明記あり）14 件 / B（表記なし）0 件 / C（不可）は不使用
- 市販ゲーム由来の素材（ripped assets）や Supercell 社の素材は一切含みません。
- すべて CC0 または SIL OFL のため、クレジット表記は義務ではありませんが、ゲーム内クレジット画面に全作者を表示しています。

## 素材パック（入手元）

| ID | 素材名 | 作者 | 入手元 | 区分 | ライセンス | クレジット表記 |
|---|---|---|---|---|---|---|
| kenney-tiny-dungeon | Tiny Dungeon | Kenney | https://opengameart.org/content/tiny-dungeon | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| kenney-tiny-town | Tiny Town | Kenney | https://opengameart.org/content/tiny-town | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| kenney-tiny-battle | Tiny Battle | Kenney | https://opengameart.org/content/tiny-battle | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| tiny-creatures | Tiny Creatures | Clint Bellanger | https://opengameart.org/content/tiny-creatures | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| kenney-ui-pixel-adventure | UI Pack - Pixel Adventure | Kenney | https://opengameart.org/content/ui-pack-pixel-adventure | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| explosion-32 | 32x32 Explosion | diamonddmgirl | https://opengameart.org/content/32x32-explosion | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| old-tower-inn | [Chiptune] Medieval: The Old Tower Inn | RandomMind | https://opengameart.org/content/chiptune-medieval-the-old-tower-inn | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| junkala-5-chiptunes | 5 Chiptunes (Action) | Juhani Junkala (SubspaceAudio) | https://opengameart.org/content/5-chiptunes-action | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| junkala-512-sfx | 512 Sound Effects (8-bit style) | Juhani Junkala (SubspaceAudio) | https://opengameart.org/content/512-sound-effects-8-bit-style | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| kenney-jingles | 85 Short music jingles | Kenney | https://opengameart.org/content/85-short-music-jingles | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| kenney-rpg-audio | 50 RPG sound effects | Kenney | https://opengameart.org/content/50-rpg-sound-effects | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| kenney-interface-sounds | Interface Sounds | Kenney | https://opengameart.org/content/interface-sounds | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| rubberduck-80-rpg | 80 CC0 RPG SFX | rubberduck | https://opengameart.org/content/80-cc0-rpg-sfx | A | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 任意（表示済み） |
| dotgothic16 | DotGothic16 | Fontworks Inc. (The DotGothic16 Project Authors) | https://fonts.google.com/specimen/DotGothic16 | A | [SIL OFL 1.1](https://openfontlicense.org/) | 必要（OFL 同梱） |

## ファイルごとの対応

| キー | ファイル | 素材パック | 元ファイル | 改変 | 用途 |
|---|---|---|---|---|---|
| `unit_swordsman` | `public/assets/sprites/units/swordsman.png` | kenney-tiny-dungeon | tile_0097 | なし（タイルシートから1枚を抽出） | カード「剣士」 |
| `unit_archer` | `public/assets/sprites/units/archer.png` | kenney-tiny-dungeon | tile_0112 | なし（タイルシートから1枚を抽出） | カード「弓兵」 |
| `unit_heavy_knight` | `public/assets/sprites/units/heavy_knight.png` | kenney-tiny-dungeon | tile_0096 | なし（タイルシートから1枚を抽出） | カード「重装騎士」 |
| `unit_goblin` | `public/assets/sprites/units/goblin.png` | tiny-creatures | tile_0011 | 黒背景を透過に変更 | カード「ゴブリン隊」 |
| `unit_mage` | `public/assets/sprites/units/mage.png` | kenney-tiny-dungeon | tile_0084 | なし（タイルシートから1枚を抽出） | カード「魔術師」 |
| `unit_wyvern` | `public/assets/sprites/units/wyvern.png` | tiny-creatures | tile_0034 | 黒背景を透過に変更 | カード「飛竜」 |
| `bld_cannon` | `public/assets/sprites/buildings/cannon.png` | kenney-tiny-dungeon | tile_0041 | なし（タイルシートから1枚を抽出） | カード「防衛砲台」 |
| `tile_grass_0` | `public/assets/tiles/grass_0.png` | kenney-tiny-town | tile_0000 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_grass_1` | `public/assets/tiles/grass_1.png` | kenney-tiny-town | tile_0001 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_grass_2` | `public/assets/tiles/grass_2.png` | kenney-tiny-town | tile_0002 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_dirt` | `public/assets/tiles/dirt.png` | kenney-tiny-town | tile_0025 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_tree_pine` | `public/assets/tiles/tree_pine.png` | kenney-tiny-town | tile_0004 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_tree_round` | `public/assets/tiles/tree_round.png` | kenney-tiny-town | tile_0028 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_bush` | `public/assets/tiles/bush.png` | kenney-tiny-town | tile_0005 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_mushroom` | `public/assets/tiles/mushroom.png` | kenney-tiny-town | tile_0029 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_fence_v` | `public/assets/tiles/fence_v.png` | kenney-tiny-town | tile_0047 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_water` | `public/assets/tiles/water.png` | kenney-tiny-battle | tile_0037 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_water_alt` | `public/assets/tiles/water_alt.png` | kenney-tiny-battle | tile_0038 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_shore_top` | `public/assets/tiles/shore_top.png` | kenney-tiny-battle | tile_0019 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_shore_bottom` | `public/assets/tiles/shore_bottom.png` | kenney-tiny-battle | tile_0055 | なし（タイルシートから1枚を抽出） | アリーナ地形・装飾 |
| `tile_flag_blue` | `public/assets/tiles/flag_blue.png` | kenney-tiny-battle | tile_0052 | なし（タイルシートから1枚を抽出） | 塔の旗（チーム色） |
| `tile_flag_red` | `public/assets/tiles/flag_red.png` | kenney-tiny-battle | tile_0070 | なし（タイルシートから1枚を抽出） | 塔の旗（チーム色） |
| `tile_castle_tl` | `public/assets/tiles/castle_tl.png` | kenney-tiny-town | tile_0096 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_t` | `public/assets/tiles/castle_t.png` | kenney-tiny-town | tile_0097 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_tr` | `public/assets/tiles/castle_tr.png` | kenney-tiny-town | tile_0098 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_l` | `public/assets/tiles/castle_l.png` | kenney-tiny-town | tile_0108 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_c` | `public/assets/tiles/castle_c.png` | kenney-tiny-town | tile_0109 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_r` | `public/assets/tiles/castle_r.png` | kenney-tiny-town | tile_0110 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_bl` | `public/assets/tiles/castle_bl.png` | kenney-tiny-town | tile_0120 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_b` | `public/assets/tiles/castle_b.png` | kenney-tiny-town | tile_0121 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `tile_castle_br` | `public/assets/tiles/castle_br.png` | kenney-tiny-town | tile_0122 | なし（タイルシートから1枚を抽出） | 塔（城タイルを組み合わせ） |
| `fx_arrow` | `public/assets/effects/arrow.png` | kenney-tiny-town | tile_0119 | なし（タイルシートから1枚を抽出） | 弓兵・守護塔の矢 |
| `fx_magic_orb` | `public/assets/effects/magic_orb.png` | tiny-creatures | tile_0090 | 黒背景を透過に変更 | 魔術師の魔弾 |
| `fx_flame` | `public/assets/effects/flame.png` | tiny-creatures | tile_0056 | 黒背景を透過に変更 | カード「火球」・飛竜の炎 |
| `fx_cannonball` | `public/assets/effects/cannonball.png` | kenney-tiny-town | tile_0105 | なし（タイルシートから1枚を抽出） | 防衛砲台・王の塔の砲弾 |
| `fx_heart` | `public/assets/effects/heart.png` | kenney-tiny-battle | tile_0195 | なし（タイルシートから1枚を抽出） | 回復エフェクト |
| `icon_attack` | `public/assets/ui/icon_attack.png` | kenney-tiny-dungeon | tile_0104 | なし（タイルシートから1枚を抽出） | カード「鼓舞の角笛」・攻撃バフ表示 |
| `icon_shield` | `public/assets/ui/icon_shield.png` | kenney-tiny-dungeon | tile_0102 | なし（タイルシートから1枚を抽出） | カード「守りの加護」・シールド表示 |
| `icon_haste` | `public/assets/ui/icon_haste.png` | kenney-tiny-dungeon | tile_0116 | なし（タイルシートから1枚を抽出） | カード「疾風の加護」・速度バフ表示 |
| `icon_heal` | `public/assets/ui/icon_heal.png` | kenney-tiny-dungeon | tile_0115 | なし（タイルシートから1枚を抽出） | カード「癒しの光」 |
| `ui_panel_card` | `public/assets/ui/panel_card.png` | kenney-ui-pixel-adventure | Large/Thick tile_0000 | なし | カード枠・パネル・ボタン |
| `ui_panel_card_back` | `public/assets/ui/panel_card_back.png` | kenney-ui-pixel-adventure | Large/Thick tile_0001 | なし | カード枠・パネル・ボタン |
| `ui_panel_blue` | `public/assets/ui/panel_blue.png` | kenney-ui-pixel-adventure | Large/Thick tile_0002 | なし | カード枠・パネル・ボタン |
| `ui_panel_dark` | `public/assets/ui/panel_dark.png` | kenney-ui-pixel-adventure | Large/Thick tile_0003 | なし | カード枠・パネル・ボタン |
| `ui_panel_frame` | `public/assets/ui/panel_frame.png` | kenney-ui-pixel-adventure | Large/Thick tile_0032 | なし | カード枠・パネル・ボタン |
| `ui_button_left` | `public/assets/ui/button_left.png` | kenney-ui-pixel-adventure | Large/Thick tile_0043 | なし | カード枠・パネル・ボタン |
| `ui_button_mid` | `public/assets/ui/button_mid.png` | kenney-ui-pixel-adventure | Large/Thick tile_0044 | なし | カード枠・パネル・ボタン |
| `ui_button_right` | `public/assets/ui/button_right.png` | kenney-ui-pixel-adventure | Large/Thick tile_0045 | なし | カード枠・パネル・ボタン |
| `ui_gem_cost` | `public/assets/ui/gem_cost.png` | kenney-ui-pixel-adventure | Large/Thick tile_0041 | なし | カード枠・パネル・ボタン |
| `fx_explosion` | `public/assets/effects/explosion_sheet.png` | explosion-32 | explosion_pixelfied.png | なし | 爆発・死亡・塔破壊エフェクト |
| `bgm_title` | `public/assets/audio/bgm/title.mp3` | old-tower-inn | NES_TheOldTowerInn.mp3 | MP3 に変換（音量・長さは無改変） | タイトル BGM |
| `bgm_battle` | `public/assets/audio/bgm/battle.mp3` | junkala-5-chiptunes | Level 1.wav | MP3 に変換（音量・長さは無改変） | バトル BGM |
| `bgm_battle_final` | `public/assets/audio/bgm/battle_final.mp3` | junkala-5-chiptunes | Level 3.wav | MP3 に変換（音量・長さは無改変） | 残り1分〜延長の BGM |
| `bgm_win` | `public/assets/audio/bgm/win.mp3` | kenney-jingles | jingles_NES00.ogg | MP3 に変換（音量・長さは無改変） | 勝利ジングル |
| `bgm_lose` | `public/assets/audio/bgm/lose.mp3` | kenney-jingles | jingles_NES09.ogg | MP3 に変換（音量・長さは無改変） | 敗北ジングル |
| `se_draw` | `public/assets/audio/se/draw.mp3` | kenney-rpg-audio | bookFlip1.ogg | MP3 に変換（音量・長さは無改変） | 効果音 draw |
| `se_shuffle` | `public/assets/audio/se/shuffle.mp3` | kenney-rpg-audio | bookFlip3.ogg | MP3 に変換（音量・長さは無改変） | 効果音 shuffle |
| `se_card_play` | `public/assets/audio/se/card_play.mp3` | kenney-interface-sounds | drop_002.ogg | MP3 に変換（音量・長さは無改変） | 効果音 card_play |
| `se_support` | `public/assets/audio/se/support.mp3` | junkala-512-sfx | sfx_sounds_powerup2.wav | MP3 に変換（音量・長さは無改変） | 効果音 support |
| `se_heal` | `public/assets/audio/se/heal.mp3` | junkala-512-sfx | sfx_sounds_powerup10.wav | MP3 に変換（音量・長さは無改変） | 効果音 heal |
| `se_melee` | `public/assets/audio/se/melee.mp3` | junkala-512-sfx | sfx_wpn_sword1.wav | MP3 に変換（音量・長さは無改変） | 効果音 melee |
| `se_arrow` | `public/assets/audio/se/arrow.mp3` | kenney-rpg-audio | drawKnife1.ogg | MP3 に変換（音量・長さは無改変） | 効果音 arrow |
| `se_magic` | `public/assets/audio/se/magic.mp3` | rubberduck-80-rpg | spell_01.ogg | MP3 に変換（音量・長さは無改変） | 効果音 magic |
| `se_fireball` | `public/assets/audio/se/fireball.mp3` | rubberduck-80-rpg | spell_fire_01.ogg | MP3 に変換（音量・長さは無改変） | 効果音 fireball |
| `se_explosion` | `public/assets/audio/se/explosion.mp3` | junkala-512-sfx | sfx_exp_medium1.wav | MP3 に変換（音量・長さは無改変） | 効果音 explosion |
| `se_cannon` | `public/assets/audio/se/cannon.mp3` | junkala-512-sfx | sfx_wpn_cannon1.wav | MP3 に変換（音量・長さは無改変） | 効果音 cannon |
| `se_tower_destroy` | `public/assets/audio/se/tower_destroy.mp3` | junkala-512-sfx | sfx_exp_long1.wav | MP3 に変換（音量・長さは無改変） | 効果音 tower_destroy |
| `se_unit_die` | `public/assets/audio/se/unit_die.mp3` | rubberduck-80-rpg | creature_die_01.ogg | MP3 に変換（音量・長さは無改変） | 効果音 unit_die |
| `se_no_mana` | `public/assets/audio/se/no_mana.mp3` | kenney-interface-sounds | error_004.ogg | MP3 に変換（音量・長さは無改変） | 効果音 no_mana |
| `se_button` | `public/assets/audio/se/button.mp3` | kenney-interface-sounds | click_002.ogg | MP3 に変換（音量・長さは無改変） | 効果音 button |
| `se_countdown` | `public/assets/audio/se/countdown.mp3` | junkala-512-sfx | sfx_sounds_Blip7.wav | MP3 に変換（音量・長さは無改変） | 効果音 countdown |
| `se_deploy` | `public/assets/audio/se/deploy.mp3` | rubberduck-80-rpg | item_misc_01.ogg | MP3 に変換（音量・長さは無改変） | 効果音 deploy |
| `se_hit` | `public/assets/audio/se/hit.mp3` | junkala-512-sfx | sfx_damage_hit2.wav | MP3 に変換（音量・長さは無改変） | 効果音 hit |
| `DotGothic16` | `public/assets/fonts/DotGothic16-Regular.ttf` | dotgothic16 | DotGothic16-Regular.ttf | なし | フォント（全画面） |

## 見た目の統一方針

- メインパックは **Kenney の Tiny シリーズ**（Tiny Dungeon / Tiny Town / Tiny Battle、16px ドット絵・真上視点）。不足したゴブリンと竜は、同じ 16px・同じ縁取りの作風で作られた Clint Bellanger 作「Tiny Creatures」で補った。
- UI も同じ Kenney の「UI Pack - Pixel Adventure」で統一。ドット絵以外の素材は混ぜていない。
- 16px の素材は描画時に 2 倍（32px＝1 タイル）を基準にし、ユニットごとの大きさは `cards.json` の `displayScale` で正規化している（ゴブリン 1.6／弓兵 1.8／剣士・魔術師 2.0／飛竜 2.4／重装騎士・砲台 2.6）。
- 単一フレームの素材のため、歩行・攻撃・出現・被弾は Tween（上下の揺れ・拡大・白点滅・フェード）で表現している。
