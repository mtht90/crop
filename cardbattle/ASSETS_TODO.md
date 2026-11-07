# ASSETS_TODO（素材の配置依頼と不足リスト）

素材は自分でダウンロードできないため、下の一覧を手元でダウンロードして
`packages/client/public/assets/thirdparty/<作者名>/<パック名>/` に置いてください。
（このフォルダは `.gitignore` 済みです。ライセンス上、再配布できない素材が混ざるため git には入れません）

配置が終わるまでは、仮の図形（円柱・カプセル・箱）と CSS だけで動くようにしてあります。

## 1. ダウンロードして置いてほしい素材

Web版では 3D モデルは **glTF（.gltf / .glb）形式** を使います。Quaternius のパックは glTF 版を選んでください。

| # | 素材 | 作者 / ライセンス | ダウンロード先 | 置き場所 |
|---|---|---|---|---|
| 1 | Ultimate Animated Character Pack | Quaternius / CC0 | https://quaternius.com/packs/ultimatedanimatedcharacter.html | `thirdparty/Quaternius/UltimateAnimatedCharacter/` |
| 2 | Modular Character Outfits - Fantasy | Quaternius / CC0 | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html | `thirdparty/Quaternius/ModularCharacterOutfitsFantasy/` |
| 3 | Universal Base Characters | Quaternius / CC0 | https://quaternius.com/packs/universalbasecharacters.html | `thirdparty/Quaternius/UniversalBaseCharacters/` |
| 4 | Ultimate Monsters Pack | Quaternius / CC0 | https://quaternius.com/packs/ultimatemonsters.html | `thirdparty/Quaternius/UltimateMonsters/` |
| 5 | Medieval Village MegaKit | Quaternius / CC0 | https://quaternius.com/packs/medievalvillagemegakit.html | `thirdparty/Quaternius/MedievalVillageMegaKit/` |
| 6 | 3D Card Kit - Fantasy | Quaternius / CC0 | https://quaternius.com/packs/3dcardkitfantasy.html | `thirdparty/Quaternius/3DCardKitFantasy/` |
| 7 | Universal Animation Library 1 | Quaternius / CC0 | https://quaternius.com/packs/universalanimationlibrary.html | `thirdparty/Quaternius/UniversalAnimationLibrary/` |
| 8 | Universal Animation Library 2 | Quaternius / CC0 | https://quaternius.com/packs/universalanimationlibrary2.html | `thirdparty/Quaternius/UniversalAnimationLibrary2/` |
| 9 | GUI - Card Frame（Free） | LAYERLAB / パックの利用規約に従う | https://layerlab.itch.io/gui-card-frame | `thirdparty/LAYERLAB/GUICardFrame/` |
| 10 | Fantasy UI Borders | Kenney / CC0 | https://kenney-assets.itch.io/fantasy-ui-borders | `thirdparty/Kenney/FantasyUIBorders/` |
| 11 | UI Pack | Kenney / CC0 | https://kenney.nl/assets/ui-pack | `thirdparty/Kenney/UIPack/` |
| 12 | UI Pack - RPG Expansion | Kenney / CC0 | https://kenney.nl/assets/ui-pack-rpg-expansion | `thirdparty/Kenney/UIPackRPG/` |
| 13 | Particle Pack | Kenney / CC0 | https://kenney.nl/assets/particle-pack | `thirdparty/Kenney/ParticlePack/` |
| 14 | Impact Sounds | Kenney / CC0 | https://kenney.nl/assets/impact-sounds | `thirdparty/Kenney/ImpactSounds/` |
| 15 | RPG Audio | Kenney / CC0 | https://kenney.nl/assets/rpg-audio | `thirdparty/Kenney/RPGAudio/` |
| 16 | Interface Sounds | Kenney / CC0 | https://kenney.nl/assets/interface-sounds | `thirdparty/Kenney/InterfaceSounds/` |
| 17 | BGM（バトル用1曲・ホーム用1曲） | 魔王魂 / 魔王魂の利用規約 | https://maou.audio/ | `thirdparty/MaouDamashii/BGM/` |
| 18 | M PLUS Rounded 1c（Bold / ExtraBold の TTF） | Coji Morishita ほか / SIL OFL 1.1 | https://fonts.google.com/specimen/M+PLUS+Rounded+1c | `thirdparty/fonts/MPLUSRounded1c-Bold.ttf`, `MPLUSRounded1c-ExtraBold.ttf` |

- フォントは置くだけで自動的に使われます（ファイル名を上の通りにしてください）。
- BGM は曲が決まったらファイル名と曲名を教えてください（クレジットに曲名が必要です）。
- Mixamo（https://www.mixamo.com）は、Quaternius のアニメーションで足りないものが出たときだけ使います。今のところ不要です。

## 2. 足りない素材・仮置きしているもの（マイルストーン1 時点）

| 何が足りないか | 今の代用 | 予定 |
|---|---|---|
| ユニットの3Dモデル（8種） | 色付きのカプセル・球・箱 | M2で Quaternius のモデルに差し替え |
| タワー・アリーナ・橋・柵・木 | 円柱・箱・頂点カラーの地面 | M2で Medieval Village MegaKit に差し替え |
| 「守りの砲台」の大砲パーツ | 箱＋円柱 | M2で MegaKit の中を確認。大砲が無ければ近いパーツを組み合わせ、ここに理由を書く |
| カードの絵 | 種類アイコン（⚔ 🏰 ✦）※端末の絵文字 | M2で撮影ツールを作り、モデル／Card Kit を撮影して PNG 化 |
| カード枠 | CSS の枠線（レアリティ色は仕様通り） | M2で LAYERLAB の枠を色替えして使用 |
| パネル・ボタン・ゲージ | CSS のグラデーション | M2で Kenney の画像（border-image）に差し替え |
| エフェクト（着地・ヒット・破片・呪文） | テクスチャなしの破片・リング | M3で Kenney Particle Pack のテクスチャを使う |
| 効果音・BGM | なし（無音） | M2で組み込み |
| フォント | 端末のフォント（ヒラギノ丸ゴ等） | 上の #18 を置けば自動で切り替わる |
| クラウン・トロフィーのアイコン | 文字（♛ 🏆） | M2で Kenney UI Pack のアイコンに差し替え |

## 3. モデル選定のメモ（M2で中身を確認して確定させる）

| カード | 第1候補 |
|---|---|
| 鉄の騎士 | Modular Character Outfits - Fantasy の騎士装備 |
| 弓兵コンビ | Ultimate Animated Character Pack の弓を持つキャラ ×2 |
| 岩の巨兵 | Ultimate Monsters Pack のゴーレム系（無ければ一番大きい地上モンスター） |
| 骨の軍団 | Ultimate Monsters Pack のスケルトン系 |
| 翼竜 | Ultimate Monsters Pack のドラゴン系 |
| 守りの砲台 | Medieval Village MegaKit の塔パーツ＋大砲系パーツ |
| 火球 / 雷撃 | 3D Card Kit - Fantasy の炎系 / 雷系の場面 |
