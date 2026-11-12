# 素材クレジット

このゲームのキャラクターとモーションには、以下の外部素材を使っています。いずれも **CC0 1.0 Universal**（パブリックドメイン相当・クレジット表記不要）ですが、作者への感謝を込めて記載します。

| 素材 | 作者 | ライセンス | 入手元 | 使っているもの |
|---|---|---|---|---|
| VRoid Studio サンプルモデル（Sakurada Fumiriya / Sendagaya Shibu / Sendagaya Shino / Victoria Rubin / Vita / Darkness Shibu） | pixiv Inc.（VRoid プロジェクト） | CC0 1.0 | https://github.com/madjin/vrm-samples （`vroid/beta/`）／ 条件: https://vroid.pixiv.help/hc/en-us/articles/4402614652569 | ヒーロー6体の本体（VRM） |
| Universal Animation Library（Standard 版） | Quaternius (quaternius.com) | CC0 1.0 | https://quaternius.itch.io/universal-animation-library （取得: https://github.com/J-Ponzo/gltf-universal-animation-library ） | モーション（骨とアニメーションのみ `rig.glb`） |

- `public/assets/vrm/` の VRM は `scripts/optimize-vrm.py` でテクスチャを最大1024pxに縮小し WebP 化したものです（1体 約15〜20MB → 約4.5MB）。形状・ボーン・VRM メタ情報は変えていません。各ファイルのメタ情報にも `licenseName: CC0` と記録されています。
- `public/assets/rig.glb` は `scripts/build-rig.mjs` で、配布物からメッシュを外し、使うアニメーション18種だけを残したものです。読み込み時に VRM のヒューマノイド骨へ移植しています（`src/assets.ts` の `retarget`）。
- 武器（`src/weapons.ts`）とステージ（`src/stage.ts`）は外部モデルを使わず、コードで形状を組み立てています。
- 効果音は外部素材ではなく、WebAudio でその場合成しています（`src/audio.ts`）。BGM はまだありません。
- 描画ライブラリ: [three.js](https://threejs.org/)（MIT License）
