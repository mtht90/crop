# CREDITS（使用素材一覧）

このゲームのモデル・アニメーション・効果音・BGM・テクスチャはすべて外部素材です（自作素材・プリミティブ図形の代用はありません）。
CC0 素材はできるだけ避け、**CC-BY（帰属表示）系の素材を優先**して選んでいます。

- 形式変換について：FBX / .blend / .7z などの配布形式は、ゲームで読み込むために Blender（bpy）で glTF(GLB) に変換し、テクスチャを 1024px 以下に縮小しています。音声は Ogg Vorbis に変換し、一部は長さを切り詰めています（`shell_load`、`boss_grunt`）。モデル形状・アニメーションの内容は改変していません。
- 改変：ゲーム内で一部メッシュの表示/非表示（部位破壊）、色味（被弾フラッシュ・魔核の色付け）、スケールを実行時に変更しています。
- ライセンス本文：CC BY 3.0 <https://creativecommons.org/licenses/by/3.0/> ／ CC BY 4.0 <https://creativecommons.org/licenses/by/4.0/>

---

## 3D モデル・アニメーション

| ゲーム内での用途 | 素材名 | 作者 | ライセンス | URL | ファイル |
|---|---|---|---|---|---|
| 錆牙狼（モデル＋アニメ） | [Animated] Wolf | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-wolf | `models/wolf.glb` |
| 坑殻蟹（モデル＋アニメ） | [Animated] Crab | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-crab | `models/crab.glb` |
| 煤鼠（モデル＋アニメ） | [Animated] Rat | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-rat-0 | `models/rat.glb` |
| 骸弩兵（モデル＋アニメ） | [Animated] Crossbowman Skeleton | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-crossbowman-skeleton | `models/skeleton.glb` |
| ボス 骸鍛王グラウムドル（モデル＋アニメ） | [Animated] Boss | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-boss | `models/boss.glb` |
| 喰弓ウィスパー（一人称の腕・弓・矢＋アニメ） | [Animated] Bow | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-bow | `models/fp_bow.glb` |
| 喰銃ファング（一人称の腕・拳銃＋アニメ） | [Animated] Pistol | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-pistol | `models/fp_pistol.glb` |
| 喰砲ブロウバック（一人称の腕・散弾銃＋アニメ） | [Animated] Shotgun | CoinCoin | CC-BY 4.0 | https://opengameart.org/content/animated-shotgun | `models/fp_shotgun.glb` |
| 霧刺蜂・沼織蜘蛛・紅翼蝙蝠・爆嚢花（モデル＋アニメ） | Animated Creatures PS1 Style | Zsky（https://www.patreon.com/Zsky） | CC-BY 4.0 | https://opengameart.org/content/animated-creatures-ps1-style | `models/wasp.glb` `models/spider.glb` `models/bat.glb` `models/plant.glb` |
| 沼地の地面・木・岩・崖・岩壁・草・キノコ・柵など | Free Mid Poly Stylized Swamp Remastered（FBX と swamp_texture の Colorsheet） | EmacEArt | CC-BY 4.0 | https://opengameart.org/content/free-mid-poly-stylized-swamp-remastered | `models/swamp_lib.glb` |
| 闘技場・工房の石床・柱・壁・扉 | Medieval Dungeon – Modular Base Kit (Free) | Nodex3D | CC-BY 4.0 | https://opengameart.org/content/medieval-dungeon-%E2%80%93-modular-base-kit-free | `models/dungeon_kit.glb` |
| 炉心のモノリス・道中の魔導標 | Mysterious Monolith | bobjh | CC-BY 4.0 | https://opengameart.org/content/mysterious-monolith | `models/monolith.glb` |
| 工房のスチームパンク灯 | Steampunk Lamp | JustinARay | CC-BY 4.0 | https://opengameart.org/content/steampunk-lamp | `models/lamp.glb` |
| 魔核（ドロップする結晶） | Gems | Clint Bellanger | CC-BY 3.0 | https://opengameart.org/content/gems | `models/gems.glb` |

> 補足：Medieval Dungeon Kit に同梱されている石・金属・木のテクスチャは、作者が Poly Haven の CC0 テクスチャ（cobblestone_color / metal_plate_02 / wood_cabinet_worn_long）を使用したものです。キット全体は CC-BY 4.0 として配布されています。

## 効果音

| ゲーム内での用途 | 素材名 | 作者 | ライセンス | URL | ファイル |
|---|---|---|---|---|---|
| 拳銃の発砲音 | Chaingun, pistol, rifle, shotgun shots | Michel Baradari（apollo-music.de）／投稿 qubodup | CC-BY 3.0 | https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots | `pistol_shot` |
| 散弾銃の発砲・ポンプ・装填、弾倉の着脱、空撃ち | Shotgun Shoot + Reload | Mike Koenig（SoundBible.com）／投稿 qubodup | CC-BY 3.0 | https://opengameart.org/content/shotgun-shoot-reload | `shotgun_shot` `shotgun_pump` `shell_load` `clip_in` `clip_out` `dry_fire` |
| 弓を引く・放つ・矢の命中、金属音、重い振り、回避、喰炉の起動、電撃・氷の着弾音、ボスの投射音 | JC Sounds - Fantasy SFX Pack Vol 1 | JC Sounds | CC-BY 4.0 | https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | `bow_draw` `bow_shoot` `arrow_hit` `armor_hit` `weak_hit` `heavy_swing` `dodge` `devour` `spark_hit` `bounce` `boss_projectile` |
| 爆発 | 2 High Quality Explosions | Michel Baradari（apollo-music.de）／投稿 qubodup | CC-BY 3.0 | https://opengameart.org/content/2-high-quality-explosions | `explosion` `explosion_small` |
| 炎の爆発・毒・地響き・竜巻・チャージ・雷（部位破壊） | 8 Magic Attacks（RPG Battle Magic SFX 無料サンプル） | leohpaz | CC-BY 4.0 | https://opengameart.org/content/8-magic-attacks | `fire_burst` `poison` `ground_slam` `whirlwind` `charge` `part_break` |
| モンスターの怯み・断末魔・唸り | 15 monster grunt/pain/death sounds | Michel Baradari（apollo-music.de）／投稿 qubodup | CC-BY 3.0 | https://opengameart.org/content/15-monster-gruntpaindeath-sounds | `mon_pain1` `mon_pain2` `mon_death1` `mon_death2` `mon_death3` `mon_grunt` |
| 鼠の鳴き声 | Rat Monster Screams | qubodup | CC-BY 3.0 | https://opengameart.org/content/rat-monster-screams | `rat_attack` `rat_death` |
| ボスの咆哮・うなり | Monster and Creatures Sound Effects PACK 001 | jalastram | CC-BY 3.0 | https://opengameart.org/content/monster-and-creatures-sound-effects-pack-001 | `boss_roar` `boss_grunt` |
| ボスの低いうなり、足音、UI、拾得、勝利/敗北ジングル、魔核装填音、環境音（洞窟） | Fantasy Sound Effects Library | Little Robot Sound Factory | CC-BY 3.0 | https://opengameart.org/content/fantasy-sound-effects-library | `boss_growl` `step1` `step2` `ui_select` `ui_open` `pickup` `jingle_win` `jingle_lose` `core_ready` `bgm/ambience` |

## BGM

| ゲーム内での用途 | 曲名 | 作者 | ライセンス | URL | ファイル |
|---|---|---|---|---|---|
| 工房船（拠点） | Teller of the Tales | Kevin MacLeod（incompetech.com） | CC-BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Teller%20of%20the%20Tales.mp3 | `bgm/base.ogg` |
| フィールド探索 | Darkling | Kevin MacLeod（incompetech.com） | CC-BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Darkling.mp3 | `bgm/field.ogg` |
| ボス戦 | Five Armies | Kevin MacLeod（incompetech.com） | CC-BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Five%20Armies.mp3 | `bgm/boss.ogg` |

表記例（作者指定の形式）：
"Five Armies", "Darkling", "Teller of the Tales" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

## テクスチャ

| ゲーム内での用途 | 素材名 | 作者 | ライセンス | URL | ファイル |
|---|---|---|---|---|---|
| 空（スカイボックス） | Stormy days skybox | Jockum Skoglund（hipshot） | CC-BY 3.0 | https://opengameart.org/content/stormy-days-skybox | `textures/sky/*.jpg` |
| マズルフラッシュ | Smoke/Shotgun Muzzle Flash Texture | marsonfire | CC-BY 4.0 | https://opengameart.org/content/smokeshotgun-muzzle-flash-texture | `textures/fx/muzzle.png` |
| 着弾の土煙（スプライトシート） | AlotofImpacts - 15 Frame Impacts w/smoke - 3 variations | JoesALotofThings | CC-BY 4.0 | https://opengameart.org/content/alotofimpacts-15-frame-impacts-wsmoke-3-variations | `textures/fx/impact_sheet.png` |
| 火花・閃光・衝撃波リング・弾の光・魔核の輝き | Lens-Flares and Particles（flares_20101219） | hc（hackcraft.de） | CC-BY 3.0 / CC0 のデュアルライセンス（本作は CC-BY 3.0 として表記） | https://opengameart.org/content/lens-flares-and-particles | `textures/fx/star.png` `sparkle.png` `ring.png` `flarefour.png` `x1.png` `nova.png` `corona.png` |

※ 地面・植生・岩などの色は、上記 Swamp パックの Colorsheet テクスチャ（モデルに埋め込み）を使用しています。

---

## ソフトウェア（素材ではないが参考として）

| 名前 | ライセンス | URL |
|---|---|---|
| three.js | MIT | https://github.com/mrdoob/three.js |
| three-mesh-bvh | MIT | https://github.com/gkjohnson/three-mesh-bvh |
| Vite / TypeScript | MIT / Apache-2.0 | https://vitejs.dev / https://www.typescriptlang.org |
| Blender（変換作業のみに使用・同梱なし） | GPL | https://www.blender.org |

## 名称・世界観について

ゲームタイトル「CORE EATER 喰核の狩人」、大陸ヴェルドラン、喰核団、工房船アンヴィル号、霧錆の沼沢ラスミア、骸鍛王グラウムドル、各モンスター名・魔核名・武器名・素材名はすべて本作オリジナルです。素材の元の名前（Wolf / Crab / Boss など）は上表のとおりです。
