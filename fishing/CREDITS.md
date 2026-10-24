# 素材クレジット

外部素材は `scripts/fetch-assets.sh`・`scripts/fetch-sources.sh` で取得し、モデルは `scripts/convert-models.cjs` で向きと大きさを揃えた glTF（`public/assets/fish|props/*.json`）に変換して同梱しています。

| 素材 | 出典 | ライセンス |
|---|---|---|
| 地形テクスチャ（aerial_grass_rock / forest_ground_04 / coast_sand_01 / gray_rocks / brown_mud_leaves_01 / weathered_planks / bark_brown_02） | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| モデル（barrel_03 / fern_02） | [Poly Haven](https://polyhaven.com/models) | CC0 |
| 魚：Barramundi Fish（オオクチバス・トラウト類などの元） | [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish) | CC0 |
| 魚：Esox（ライギョ・イトウの元） | [OpenGameArt: Esox - Animated Fish](https://opengameart.org/content/esox-animated-fish) | CC0 |
| 魚：3d low poly catfish（ナマズ類の元） | [OpenGameArt](https://opengameart.org/content/3d-low-poly-catfish) | CC0 |
| 魚：Big Gold Fish（コイ・フナ類の元） | [OpenGameArt](https://opengameart.org/content/big-gold-fish) | CC-BY 3.0 |
| 魚：Animated Fish Pack（小魚・伝説の魚の元） | [Quaternius（OpenGameArt）](https://opengameart.org/content/animated-fish) | CC0 |
| 樹木・岩・草・スイレン・カヌーなど | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 |
| 水面の法線マップ（waternormals.jpg） | [three.js examples](https://github.com/mrdoob/three.js/tree/r169/examples/textures) | MIT |
| 空・水面シェーダ（Sky / Water） | three.js examples (`three/examples/jsm/objects`) | MIT |
| フォント（M PLUS Rounded 1c） | [Google Fonts](https://fonts.google.com/specimen/M+PLUS+Rounded+1c) | SIL Open Font License 1.1 |

## コードで生成しているもの
- 魚の配色・模様（外部モデルの陰影の上にシェーダで乗せる。`src/render/fishMesh.ts`）
- 竿・小屋・桟橋の形（テクスチャは外部素材）
- 効果音・環境音・BGM（WebAudio で合成。`public/assets/audio/<名前>.mp3` を置くと効果音はそのファイルに差し替わる：cast / splash / nibble / bite / hookset / snap / land）
