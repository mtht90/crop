# 素材クレジット

このゲームのキャラクターとステージ小物には、以下の外部素材を使っています。いずれも **CC0 1.0 Universal**（パブリックドメイン相当・クレジット表記不要）ですが、作者への感謝を込めて記載します。

| 素材 | 作者 | ライセンス | 入手元 | 使っているもの |
|---|---|---|---|---|
| KayKit : Adventurers Character Pack (1.0) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | Knight / Barbarian / Mage / Rogue / Rogue_Hooded（モデル・武器・アニメーション） |
| KayKit : Skeletons Character Pack (1.0) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | Skeleton_Mage、Skeleton_Staff |
| KayKit : Dungeon Remastered (1.0) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | 床タイル、壁、柱、木箱、樽、バリア、旗 |

- `public/assets/` の GLB は、`scripts/optimize-assets.mjs` で配布物から **使うアニメーションだけを残して** 軽量化したものです（キャラ1体 約3.6MB → 約1.3MB）。モデルやテクスチャ自体は改変していません。
- 効果音は外部素材ではなく、WebAudio でその場合成しています（`src/audio.ts`）。BGM はまだありません。
- 描画ライブラリ: [three.js](https://threejs.org/)（MIT License）
