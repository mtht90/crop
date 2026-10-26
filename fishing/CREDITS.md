# 素材クレジット

外部素材は `scripts/fetch-assets.sh`・`scripts/fetch-sources.sh` で取得し、モデルは `scripts/convert-models.cjs` で向きと大きさを揃えた glTF（`public/assets/fish|props/*.json`）に変換して同梱しています。

| 素材 | 出典 | ライセンス |
|---|---|---|
| 地形テクスチャ（aerial_grass_rock / forest_ground_04 / coast_sand_01 / gray_rocks / brown_mud_leaves_01 / weathered_planks / bark_brown_02 / concrete_floor_02 / coast_land_rocks_01） | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| モデル（barrel_03 / fern_02） | [Poly Haven](https://polyhaven.com/models) | CC0 |
| 魚：3D Fish Pack（Rainbow Trout / Sockeye Salmon / Koi / Channel Catfish / Silver Arowana。マス類・アメリカナマズ・錦鯉・主） | [Polyy.AI「[FREE] 3D Fish Pack」(itch.io)](https://polyyai.itch.io/3d-fish-pack)（作者の表記：AI Assisted Graphics） | CC0 |
| 魚：実写スキャン（コイ / ゲンゴロウブナ / ナマズ / カムルチー / オイカワ / ハス / ブルーギル / オオクチバス類 / アユ。コイ・フナ・ナマズ・ライギョ・オイカワ・ウグイ・ハス・ニゴイ・ブルーギル・バス類・ワカサギ・ソウギョに使用。軽くしたメッシュに、元モデルを真横から撮ったテクスチャを貼り直している） | [ffish.asia / floraZia.com（Sketchfab）](https://sketchfab.com/ffishAsia-and-floraZia)。取得は CC0 の複製（[lisa-1002/fishing3d](https://github.com/lisa-1002/fishing3d)）から | CC0 |
| 海の魚：実写スキャン（クロダイ / メジナ / マアジ / マサバ / カサゴ / スズキ / シロギス / カワハギ / キュウセン / ボラ / マダイ / イシダイ / ブリ / クサフグ / マイワシ / タチウオ / クエ。汐見港・磯の魚に使用） | [ffish.asia / floraZia.com（Sketchfab）](https://sketchfab.com/ffishAsia-and-floraZia)。取得は CC0 の複製（[lisa-1002/fishing3d](https://github.com/lisa-1002/fishing3d)）から | CC0 |
| 樹木・岩・草・スイレン・カヌーなど | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 |
| 釣り場の人（ケンタ・ハル・ゲンジ・ヒデ・サキ） | [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) | CC0 |
| 水面の法線マップ（waternormals.jpg） | [three.js examples](https://github.com/mrdoob/three.js/tree/r169/examples/textures) | MIT |
| 空・水面シェーダ（Sky / Water） | three.js examples (`three/examples/jsm/objects`) | MIT |
| フォント（Zen Kaku Gothic New / Jost） | [Google Fonts](https://fonts.google.com/) | SIL Open Font License 1.1 |

## コードで生成しているもの
- 魚の配色・模様（元の魚種そのものは元テクスチャのまま。別の魚種・色違いは元テクスチャの陰影の上にシェーダで配色と模様を乗せる。`src/render/fishMesh.ts`）
- 竿・小屋・桟橋の形（テクスチャは外部素材）
- 効果音・環境音・BGM（WebAudio で合成。`public/assets/audio/<名前>.mp3` を置くと効果音はそのファイルに差し替わる：cast / splash / nibble / bite / hookset / snap / land）
