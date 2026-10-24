# 素材クレジット

外部素材は `npm run fetch-assets`（`scripts/fetch-assets.sh`）で取得し、`public/assets/` に同梱しています。

| 素材 | 出典 | ライセンス |
|---|---|---|
| 地形テクスチャ（aerial_grass_rock / forest_ground_04 / coast_sand_01 / gray_rocks / brown_mud_leaves_01 / weathered_planks / bark_brown_02） | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| モデル（barrel_03 / Lantern_01 / fern_02） | [Poly Haven](https://polyhaven.com/models) | CC0 |
| 水面の法線マップ（waternormals.jpg） | [three.js examples](https://github.com/mrdoob/three.js/tree/r169/examples/textures) | MIT |
| 空・水面シェーダ（Sky / Water） | three.js examples (`three/examples/jsm/objects`) | MIT |
| フォント（M PLUS Rounded 1c） | [Google Fonts](https://fonts.google.com/specimen/M+PLUS+Rounded+1c) | SIL Open Font License 1.1 |

## コードで生成しているもの
- 魚のモデルと色・模様テクスチャ（`src/render/fishMesh.ts`）
- 樹木・岩・葦・スイレンの葉・小屋・桟橋
- 効果音・環境音・BGM（WebAudio で合成。`public/assets/audio/<名前>.mp3` を置くと効果音はそのファイルに差し替わる：cast / splash / nibble / bite / hookset / snap / land）
