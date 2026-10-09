# CREDITS — 外部素材の出典とライセンス

SLOT で使う素材は、テキストを描画する Canvas の演出コードを除いてすべて外部から入手したものです。
選定では **商用利用可** を条件にし、その中でも CC0 / パブリックドメインを優先しました。
帰属表示が必要な素材 (CC-BY / OFL / MIT) は、下の表の表記をそのまま再配布物に含めてください。

| 区分 | ライセンス | 商用 | 帰属表示 |
|---|---|---|---|
| Poly Haven / ambientCG / Kenney | CC0 1.0 | ✅ | 不要 (推奨) |
| Twemoji グラフィック | CC-BY 4.0 | ✅ | **必要** |
| Blackmoor Tides (BIG 中 BGM) / Matthew Pablo | CC-BY 3.0 | ✅ | **必要** |
| Quaternius / EZduzziteh / Thimras / qubodup / Eldritch Grim | CC0 1.0 | ✅ | 不要 |
| Cougarmint Slot Machine Resource Pack (図柄) | CC-BY 3.0 | ✅ | **必要** |
| Bungee / Orbitron / DSEG7 / Shippori Mincho B1 / Zen Kaku Gothic New | SIL OFL 1.1 | ✅ | フォント単体の販売は禁止 |
| three.js / lil-gui / ios-haptics | MIT | ✅ | 著作権表示を同梱 |

---

## HDRI (環境マップ・反射)

| ファイル | 素材 | 作者 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/hdri/neon_photostudio_2k.hdr` | Neon Photostudio (2K HDR) | Sergej Majboroda | https://polyhaven.com/a/neon_photostudio | CC0 1.0 |

## PBR テクスチャ (ambientCG)

いずれも 1K-JPG セットから必要なマップ (Color / NormalGL / Roughness / Metalness) だけを取り出しています。

| ファイル | 素材 | 用途 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/textures/Metal009/*` | Metal 009 (ヘアライン金属) | 筐体サイドパネル・看板 | https://ambientcg.com/view?id=Metal009 | CC0 1.0 |
| `assets/textures/Metal032/*` | Metal 032 (傷入り金属) | 液晶枠・カウンター・受け皿 | https://ambientcg.com/view?id=Metal032 | CC0 1.0 |
| `assets/textures/Carpet016/*` | Carpet 016 | ホールの床 (ワインレッドに着色) | https://ambientcg.com/view?id=Carpet016 | CC0 1.0 |
| `assets/textures/Leather037/*` | Leather 037 (Normal/Roughness のみ) | 島カウンターの側面 | https://ambientcg.com/view?id=Leather037 | CC0 1.0 |

## 3D モデル (Kenney)

| ファイル | パック | 用途 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/models/arcade/*.glb`, `Textures/colormap.png` | Mini Arcade 1.2 (gambling-machine, arcade-machine, claw-machine, pinball, dance-machine, vending-machine, prize-wheel) | 奥のアーケードホール | https://kenney.nl/assets/mini-arcade | CC0 1.0 |
| `assets/models/platformer/coin-gold.glb`, `Textures/colormap.png` | Platformer Kit | 払い出しメダル (物理演算) | https://kenney.nl/assets/platformer-kit | CC0 1.0 |


| `assets/models/pirate/*.gltf.json` | Pirate Kit / Quaternius (船長バルバロッサ・アン・ヘンリー・骸骨・クラーケンの触手・帆船・宝箱・金貨・宝石・大砲・ヤシ・岩・崖・樽・地図) | 液晶の海賊の物語 (フルカラー・アニメーション付き) | https://quaternius.com/packs/piratekit.html | CC0 1.0 |
| `assets/models/kenney-pirate/ship-ghost.gltf.json`, `Textures/colormap.png` | Pirate Kit / Kenney | 骸骨船 (SP 砲撃戦の敵) | https://kenney.nl/assets/pirate-kit | CC0 1.0 |

各フォルダの `License*.txt` はパック同梱のものです。カットインの顔アップは、Quaternius のキャラクターモデルを起動時にその場で描画したものです。

> **主役筐体のジオメトリについて**: パチスロ筐体の 3D モデルで、商用可のままダウンロードできて、
> リール・ボタン・レバーを個別に動かせるものは見つかりませんでした (Sketchfab 等はログインが必要で、自動取得はできません)。
> そのため主役筐体の形状だけは Three.js のプリミティブを組み合わせて作り、質感はすべて上の外部 PBR テクスチャと HDRI でまかなっています。
> 隣台は主役筐体のクローンです。手持ちの GLB に差し替えたいときは `src/cabinet.js` の `buildBody()` を置き換えてください。

## リール図柄・アイコン

| ファイル | 素材 | 作者 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/images/twemoji/*.svg` | Twemoji 15.1 (🔔 🍉 🍒 🔁 ⭐ 🔥 ⚡ 💎 🍀) | Twitter, Inc. / X Corp. および jdecked/twemoji コントリビューター | https://github.com/jdecked/twemoji | CC-BY 4.0 (`LICENSE-GRAPHICS.txt` を同梱) |
| `assets/images/cougarmint/*.png` | Slot Machine Resource Pack (ドット絵スキン `symbolSkin: 'pixel'`) | Molly "Cougarmint" Willits | https://opengameart.org/content/slot-machine-resource-pack | CC-BY 3.0 / OGA-BY 3.0 (`SMRP-ReadMe.txt` を同梱) |

赤7・青7・BAR・REPLAY の文字は、Bungee フォントを Canvas に描画して作っています。

**必要な帰属表示 (ゲーム内クレジット等に記載):**
- Emoji graphics by Twemoji (https://github.com/jdecked/twemoji), licensed under CC-BY 4.0.
- Pixel slot symbols by Molly "Cougarmint" Willits (https://opengameart.org/content/slot-machine-resource-pack), licensed under CC-BY 3.0.

## 空 (液晶の背景)

| ファイル | 素材 | 作者 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/images/sky/kloofendal_48d_partly_cloudy_puresky.jpg` | Kloofendal 48d Partly Cloudy (Pure Sky) | Greg Zaal / Jarod Guest | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 |
| `assets/images/sky/belfast_sunset_puresky.jpg` | Belfast Sunset (Pure Sky) | Greg Zaal / Dimitrios Savva / Jarod Guest | https://polyhaven.com/a/belfast_sunset_puresky | CC0 1.0 |
| `assets/images/sky/qwantani_night_puresky.jpg` | Qwantani Night (Pure Sky) | Greg Zaal / Jarod Guest | https://polyhaven.com/a/qwantani_night_puresky | CC0 1.0 |
| `assets/images/sky/kloofendal_overcast_puresky.jpg` | Kloofendal Overcast (Pure Sky) | Greg Zaal | https://polyhaven.com/a/kloofendal_overcast_puresky | CC0 1.0 |

Poly Haven 配布のトーンマップ済み JPG (8K) を 2048×1024 に縮小しています。

## 形式変換について

アーティファクト (claude.ai) で配信できる形式に合わせ、次の変換だけを行っています (`tools/pack_web_formats.py`)。中身は無改変です。
- `.glb` → バイナリを埋め込んだ glTF JSON (`.gltf.json`)、`.gltf` → `.gltf.json` (名前のみ)
- `.hdr` → base64 テキスト (`.hdr.b64.txt`)
- 効果音の OGG → MP3

「ギュイン」音は Digital Audio の `phaserUp4.ogg` (`reach.mp3`) を再生時にピッチを急上昇させて連打したものです。

## 効果音 (Kenney / CC0)

OGG を MP3 に変換しただけで、音そのものには手を加えていません。iOS Safari でも再生できるようにするための変換です。

| ゲーム内名 (`assets/audio/sfx/`) | 元ファイル | パック (入手先) |
|---|---|---|
| `medal_in.mp3` | chips-stack-3.ogg | Casino Audio — https://kenney.nl/assets/casino-audio |
| `medal_out.mp3` | chips-collide-2.ogg | Casino Audio |
| `medal_pay.mp3` | chips-handle-2.ogg | Casino Audio |
| `lever.mp3` | impactMetal_medium_001.ogg | Impact Sounds — https://kenney.nl/assets/impact-sounds |
| `reel_stop.mp3` | impactPlank_medium_000.ogg | Impact Sounds |
| `bell.mp3` | impactBell_heavy_001.ogg | Impact Sounds |
| `shatter.mp3` | impactGlass_heavy_002.ogg | Impact Sounds |
| `lever_click.mp3` | switch3.ogg | UI Audio — https://kenney.nl/assets/ui-audio |
| `button.mp3` | click3.ogg | UI Audio |
| `reel_spin.mp3` | engineCircular_000.ogg | Sci-Fi Sounds — https://kenney.nl/assets/sci-fi-sounds |
| `freeze.mp3` | lowFrequency_explosion_000.ogg | Sci-Fi Sounds |
| `charge.mp3` | forceField_002.ogg | Sci-Fi Sounds |
| `reach.mp3` | phaserUp4.ogg | Digital Audio — https://kenney.nl/assets/digital-audio |
| `yokoku.mp3` | threeTone1.ogg | Digital Audio |
| `flash.mp3` | powerUp7.ogg | Digital Audio |
| `replay.mp3` | zapThreeToneUp.ogg | Digital Audio |
| `small_win.mp3` | pepSound3.ogg | Digital Audio |
| `fanfare_reg.mp3` | jingles_NES09.ogg | Music Jingles — https://kenney.nl/assets/music-jingles |
| `fanfare_big.mp3` | jingles_HIT06.ogg | Music Jingles |
| `bonus_end.mp3` | jingles_SAX03.ogg | Music Jingles |
| `tick.mp3` | tick_002.ogg | Interface Sounds — https://kenney.nl/assets/interface-sounds |
| `glitch.mp3` | glitch_002.ogg | Interface Sounds |
| `title_hit.mp3` | impactMetal_heavy_001.ogg | Impact Sounds |
| `explosion.mp3` | explosionCrunch_002.ogg | Sci-Fi Sounds |
| `computer.mp3` | computerNoise_001.ogg | Sci-Fi Sounds |
| `lose.mp3` | lowDown.ogg | Digital Audio |
| `cutin.mp3` | phaseJump2.ogg | Digital Audio |
| `window.mp3` | threeTone2.ogg | Digital Audio |

### その他の効果音

| ファイル | 素材 | 作者 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/audio/sfx/alarm.mp3` | Alarm (alarm_2.ogg) | EZduzziteh | https://opengameart.org/content/alarm-1 | CC0 1.0 |
| `assets/audio/sfx/cannon.mp3` | Cannon Fire (cannon_fire.ogg) | Thimras | https://opengameart.org/content/cannon-fire | CC0 1.0 |
| `assets/audio/sfx/cannon_hit.mp3` | Battle at Sea (cannon_hit_ship_short.ogg) | Thimras | https://opengameart.org/content/battle-at-sea | CC0 1.0 |
| `assets/audio/sfx/splash.mp3` | 6 Short Water Splashes (ws.mp3 の 1 つ目を切り出し) | qubodup | https://opengameart.org/content/6-short-water-splashes | CC0 1.0 |
| `assets/audio/sfx/ocean.mp3` | Beach Ocean Waves (wave_01) | qubodup (原音 jasinski) | https://opengameart.org/content/beach-ocean-waves | CC0 1.0 |

## BGM

| ファイル | 曲 | 作者 | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/audio/bgm/blackmoor_tides.mp3` (BIG 中) | Blackmoor Tides (Epic Pirate Battle Theme) | Matthew Pablo (http://www.matthewpablo.com) | https://opengameart.org/content/blackmoor-tides-epic-pirate-battle-theme | CC-BY 3.0 |
| `assets/audio/bgm/chest_of_adventure.mp3` (REG 中) | Chest of Adventure | Eldritch Grim | https://opengameart.org/content/chest-of-adventure | CC0 1.0 |

**必要な帰属表示:** "Blackmoor Tides" by Matthew Pablo (http://www.matthewpablo.com), licensed under CC-BY 3.0.

## フォント (Fontsource 経由で取得)

| ファイル | フォント | デザイナー | 入手先 | ライセンス |
|---|---|---|---|---|
| `assets/fonts/bungee-400.woff2` | Bungee | David Jonathan Ross | https://fontsource.org/fonts/bungee | SIL OFL 1.1 |
| `assets/fonts/orbitron-500.woff2`, `orbitron-900.woff2` | Orbitron | Matt McInerney | https://fontsource.org/fonts/orbitron | SIL OFL 1.1 |
| `assets/fonts/dseg7-700.woff2` | DSEG7 Classic | keshikan | https://fontsource.org/fonts/dseg7-classic | SIL OFL 1.1 |
| (Google Fonts から配信) | Shippori Mincho B1 (タイトル・結果) | FONTDASU | https://fonts.google.com/specimen/Shippori+Mincho+B1 | SIL OFL 1.1 |
| (Google Fonts から配信) | Zen Kaku Gothic New (台詞) | Yoshimichi Ohira | https://fonts.google.com/specimen/Zen+Kaku+Gothic+New | SIL OFL 1.1 |

日本語フォントは文字数が多く、使う文字だけを分割配信できる Google Fonts から読み込んでいます。

## ライブラリ

| ファイル | ライブラリ | 入手先 | ライセンス |
|---|---|---|---|
| `assets/lib/three/three.module.js`, `assets/lib/three/addons/**` (GLTFLoader, SkeletonUtils ほか) | three.js r170 (npm `three@0.170.0`) | https://github.com/mrdoob/three.js | MIT (`assets/lib/three/LICENSE`) |
| `assets/lib/ios-haptics/ios-haptics.js` | ios-haptics 3.2.0 (iPhone の Safari でタップ時に本体を振動させる) | https://github.com/tijnjh/ios-haptics | MIT (`assets/lib/ios-haptics/LICENSE.txt`) |
| `assets/lib/lil-gui/lil-gui.esm.min.js` | lil-gui 0.20.0 | https://github.com/georgealways/lil-gui | MIT (`assets/lib/lil-gui/LICENSE.md`) |
