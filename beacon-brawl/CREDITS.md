# 素材クレジット

このゲームのキャラクターとステージ小物には、以下の外部素材を使っています。いずれも **CC0 1.0 Universal**（パブリックドメイン相当・クレジット表記不要）ですが、作者への感謝を込めて記載します。

| 素材 | 作者 | ライセンス | 入手元 | 使っているもの |
|---|---|---|---|---|
| VRoid Studio サンプルモデル（Sakurada Fumiriya / Sendagaya Shibu / Sendagaya Shino / Victoria Rubin / Vita / Darkness Shibu） | pixiv Inc.（VRoid プロジェクト） | CC0 1.0 | https://github.com/madjin/vrm-samples （`vroid/beta/`）／ 条件: https://vroid.pixiv.help/hc/en-us/articles/4402614652569 | ヒーロー6体の本体（VRM） |
| KayKit : Adventurers Character Pack (1.0) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | モーション（骨とアニメーションのみ `rig.glb`）、武器（剣・盾・斧・杖・短剣・クロスボウ） |
| KayKit : Dungeon Remastered (1.0) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | 床タイル、壁、柱、木箱、樽、バリア、旗 |

- `public/assets/vrm/` の VRM は `scripts/optimize-vrm.py` でテクスチャを最大1024pxに縮小し WebP 化したものです（1体 約15〜20MB → 約4.5MB）。形状・ボーン・VRM メタ情報は変えていません。各ファイルのメタ情報にも `licenseName: CC0` と記録されています。
- モーションは KayKit のリグ用アニメーションを、読み込み時に VRM のヒューマノイド骨へ移植しています（`src/assets.ts` の `retarget`）。
- `public/assets/rig.glb` と `props/` は `scripts/optimize-assets.mjs` で生成しています。
- 効果音は外部素材ではなく、WebAudio でその場合成しています（`src/audio.ts`）。BGM はまだありません。
- 描画ライブラリ: [three.js](https://threejs.org/)（MIT License）
