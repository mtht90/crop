# ASSETS_TODO（素材の状況と不足リスト）

## 素材の流れ

1. ダウンロードした未加工の素材を `cardbattle/thirdparty/<作者>/<パック>/` に置く（gitignore 済み。再配布できない素材が混ざるため git には入れない）
2. `npm run assets:prepare` … 使うファイルだけを選んで加工し、`packages/client/public/assets/game/` に書き出す
3. `npm run dev` を起動した状態で `npm run assets:capture` … ユニット・建物のカード絵を撮影する

## ダウンロード済みの素材（2026-11-07）

| 素材 | 作者 / ライセンス | 入手元 | 置き場所 |
|---|---|---|---|
| Ultimate Animated Character Pack | Quaternius / CC0 | https://quaternius.com/packs/ultimatedanimatedcharacter.html | `thirdparty/Quaternius/UltimateAnimatedCharacter/` |
| Ultimate Monsters Pack | Quaternius / CC0 | https://quaternius.com/packs/ultimatemonsters.html | `thirdparty/Quaternius/UltimateMonsters/` |
| Modular Character Outfits - Fantasy（無料版） | Quaternius / CC0 | https://quaternius.itch.io/modular-character-outfits-fantasy | `thirdparty/Quaternius/ModularCharacterOutfitsFantasy/` |
| Universal Base Characters | Quaternius / CC0 | https://quaternius.itch.io/universal-base-characters | `thirdparty/Quaternius/UniversalBaseCharacters/` |
| Universal Animation Library 1・2 | Quaternius / CC0 | https://quaternius.itch.io/universal-animation-library 、…-2 | `thirdparty/Quaternius/UniversalAnimationLibrary(2)/` |
| Medieval Village MegaKit | Quaternius / CC0 | https://quaternius.itch.io/medieval-village-megakit | `thirdparty/Quaternius/MedievalVillageMegaKit/` |
| 3D Card Kit - Fantasy | Quaternius / CC0 | https://quaternius.itch.io/3d-card-kit-fantasy | `thirdparty/Quaternius/3DCardKitFantasy/` |
| GUI - Card Frame（Free） | LAYERLAB | https://layerlab.itch.io/gui-card-frame | `thirdparty/LAYERLAB/GUICardFrame/` |
| UI Pack / UI Pack RPG Expansion / Fantasy UI Borders | Kenney / CC0 | https://kenney.nl/assets | `thirdparty/Kenney/...` |
| Particle Pack | Kenney / CC0 | https://kenney.nl/assets/particle-pack | `thirdparty/Kenney/particle-pack/` |
| Impact Sounds / Interface Sounds / RPG Audio | Kenney / CC0 | https://kenney.nl/assets | `thirdparty/Kenney/...` |
| M PLUS Rounded 1c（Bold・ExtraBold） | M+ FONTS PROJECT / SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/mplusrounded1c | `thirdparty/Fonts/MPLUSRounded1c/` |

## 手動での対応が必要なもの

| 何が足りないか | 理由 | お願い |
|---|---|---|
| BGM（魔王魂） | 魔王魂のサーバーが自動ダウンロードを受け付けないため取得できなかった | https://maou.audio/game_battle01/ と https://maou.audio/game_town01/ から MP3 をダウンロードし、`thirdparty/MaouDamashii/maou_game_battle01.mp3` と `maou_game_town01.mp3` として置く → `npm run assets:prepare` で自動的に使われる（別の曲にする場合は `tools/assets/prepare.mjs` の `BGM` を変更） |
| LAYERLAB のライセンス文書 | ZIP にライセンスファイルが入っていない | 配布ページの利用条件を確認する（無料版。公開リポジトリには入れていない） |

## 仕様の目安と違うモデルにしたもの（パックの中身を確認した結果）

| カード | 使ったモデル | 理由 |
|---|---|---|
| 鉄の騎士 | Ultimate Animated Character の `Knight_Male` | Modular Outfits の無料版には Ranger と Peasant しかなく、騎士装備が無い |
| 弓兵コンビ | Ultimate Animated Character の `Elf` | 弓を持ったモデルがどのパックにも無い。緑の帽子のエルフが一番弓兵らしい。攻撃は `Shoot_OneHanded` |
| 岩の巨兵 | Ultimate Monsters の `Yeti`（石の色に色替え） | ゴーレムが無い。一番大きい地上モンスターを灰色寄りに色替え |
| 骨の軍団 | Ultimate Monsters の `Orc_Skull`（小さく表示） | スケルトンが無い。頭が骸骨のモンスターが一番近い |
| 翼竜 | Ultimate Monsters の `Dragon_Evolved` | 目安どおり |
| 守りの砲台 | MegaKit の `Prop_Crate`（土台）＋横倒しの `Prop_Chimney`（砲身） | MegaKit に大砲のパーツが無い |
| タワー | MegaKit の `Wall_UnevenBrick_Straight`・`Corner_Exterior_Brick`・`Prop_ExteriorBorder_Straight1`・`Roof_Tower_RoundTiles` を組み合わせ | 塔そのもののモデルが無いので部品を組んだ。屋根の瓦を青・赤に色替え |
| 火球・雷撃のカード絵 | 3D Card Kit の `Renders/1_Fireball.png`・`21_Element_Lightning.png` | パック同梱の同じ場面のレンダー画像を使った（自前で撮影する代わり）。周りの飾り枠は切り落とした |

アニメーションは Ultimate Animated Character / Ultimate Monsters に入っているもの（Quaternius 製・CC0）を使っている。
Universal Animation Library は、今のモデルが同じ骨格ではないため未使用（UAL 用の骨格を持つモデルに切り替えるときに使う）。

## まだ素材になっていないもの

| もの | 今の表示 | 予定 |
|---|---|---|
| 地面の芝生 | 頂点カラーの市松模様（テクスチャなし） | MegaKit に芝生・地面のタイルが無い。他の素材に置き換えるか相談 |
| 川の水面 | 単色の半透明な板 | 同上 |
| 木 | なし | MegaKit に木が無い（仕様では「木」も想定していた） |
| 弓兵の矢 | 細い円柱 | 適切なモデルが無い |
| 敵味方の足元のリング | 単色のリング | Kenney Particle Pack の円の画像にするか検討 |
| 音量・ミュートのアイコン | 端末の絵文字（🔊） | Kenney UI Pack のアイコンに差し替え |
| トロフィーのアイコン | 端末の絵文字（🏆） | Kenney UI Pack の星などに差し替え |
