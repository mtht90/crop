# Spirit Master

放置系オートバトルRPG。霊獣（ガチャで引いたキャラ）を1体出撃させると、フィールドの魔物を勝手に狩り続け、
討伐ゲージが溜まるとボスに挑む。勝てば次のステージ、負けたら強くなるまでそのステージを周回する。

- 技術：Vite + TypeScript + Preact（メニュー）+ Canvas 2D（フィールド）
- 保存：localStorage（設定から書き出し／読み込み可）。閉じている間の進行は最大24時間分を計算で再現。

## 開発
```sh
cd idle
npm ci
npm run assets   # 素材を itch.io から idle/assets-src/ に取得し、public/gen/ に変換（どちらも git 管理外）
npm run dev
npm run sim -- 72  # バランス確認（72時間分の放置プレイをシミュレーション）
```

見た目・音はすべて外部素材（Librarium / Ravenmore の UI・アイコン / CraftPix の背景・エフェクト / game-icons.net / Kenney / OpenGameArt / フォント）。
CSS はレイアウトと素材画像の伸縮・配置・動きだけに使い、グラデーションや角丸の箱などで絵を描かない。
素材ライセンスにより元ファイルは再配布できないため、リポジトリには含めず、ビルド時に作者の配布ページから取得する。
どの素材を何に使うかは `src/data/assets.ts` にまとめてある。

## 構成
- `src/data/` 霊獣・敵・エリア（monsters.ts）、装備・秘術（items.ts）
- `src/game/core.ts` 数式とセーブ形式、`logic.ts` ガチャ・報酬・放置計算・任務、`store.ts` ライブ状態と自動保存
- `src/render/field.ts` フィールドの戦闘シミュレーションと描画（素材画像・スプライトシートのみ）
- `src/ui/` 画面（タブ・モーダル・HUD）

クレジットは [CREDITS.md](CREDITS.md) とゲーム内「その他 → クレジット」。
