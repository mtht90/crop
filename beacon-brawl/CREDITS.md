# 素材クレジット

このゲームのキャラクターとモーションには、以下の外部素材を使っています。いずれも **CC0 1.0 Universal**（パブリックドメイン相当・クレジット表記不要）ですが、作者への感謝を込めて記載します。

| 素材 | 作者 | ライセンス | 入手元 | 使っているもの |
|---|---|---|---|---|
| VRoid Studio サンプルモデル（Sakurada Fumiriya / Sendagaya Shibu / Sendagaya Shino / Victoria Rubin / Vita / Darkness Shibu / HairSample_Female / HairSample_Male / Vivi） | pixiv Inc.（VRoid プロジェクト） | CC0 1.0 | https://github.com/madjin/vrm-samples （`vroid/beta/`）／ 説明: https://vroid.pixiv.help/hc/en-us/articles/4402614652569 | ヒーロー9体の本体（VRM） |
| VRoid Studio サンプルモデル AvatarSample_A / B / C | pixiv Inc.（VRoid プロジェクト） | VRoid の利用条件付き（商用利用可。著作権は放棄されていない） | https://github.com/madjin/vrm-samples （`vroid/stable/`）／ 条件: https://vroid.pixiv.help/hc/en-us/articles/4402394424089 | ミオ・ノクス・レンの本体（VRM） |
| Universal Animation Library（Standard 版） | Quaternius (quaternius.com) | CC0 1.0 | https://quaternius.itch.io/universal-animation-library （取得: https://github.com/J-Ponzo/gltf-universal-animation-library ） | モーション（骨とアニメーションのみ `rig.glb`） |

- `public/assets/vrm/` の VRM は `scripts/optimize-vrm.py` でテクスチャを最大1024pxに縮小し WebP 化したものです（1体 約15〜20MB → 約4.5MB）。形状・ボーン・VRM メタ情報は変えていません。各ファイルのメタ情報にも `licenseName: CC0` と記録されています。
- `public/assets/rig.glb` は `scripts/build-rig.mjs` で、配布物からメッシュを外し、使うアニメーション18種だけを残したものです。読み込み時に VRM のヒューマノイド骨へ移植しています（`src/assets.ts` の `retarget`）。
- UI素材（`public/assets/ui/`）: Wenrexa（https://wenrexa.itch.io/ ）の CC0 素材を縮小・変換して使っています。
  - ボタン・パネル・バー: [Assets: UI Casual FREE](https://opengameart.org/content/assets-ui-casual-free-5-buttons-bars-panels)（CC0）
  - ジェム・かけらのアイコン: [Assets: Free UI Sprites Gem Stones](https://opengameart.org/content/assets-free-ui-sprites-gem-stones)（CC0）
  - 背景の星雲: [Assets: Free Space Backgrounds in 4K](https://opengameart.org/content/assets-free-space-backgrounds-in-4k)（CC0）
- アイコン（`src/icons.ts`）: [game-icons.net](https://game-icons.net/) の Lorc / Delapouite / DarkZaitzev / Faithtoken 作、**CC BY 3.0**（要クレジット表記）。
- フォント: Barlow Condensed、Noto Sans JP（いずれも SIL Open Font License 1.1、Google Fonts から読み込み）。
- キャラの顔アイコン（`public/assets/portraits/`）は、3Dモデルから `scripts/render-portraits.cjs` で書き出したものです。
- 武器（`src/weapons.ts`）とステージ（`src/stage.ts`）は外部モデルを使わず、コードで形状を組み立てています。
- 効果音は外部素材ではなく、WebAudio でその場合成しています（`src/audio.ts`）。BGM はまだありません。
- 描画ライブラリ: [three.js](https://threejs.org/)（MIT License）
