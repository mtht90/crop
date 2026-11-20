# シティ・コングロマリット（仮）

ブラウザで遊ぶ放置経営ゲーム。Vite + TypeScript + three.js。スマホ縦画面優先。

## 動かし方

```
npm install
npm run import-assets   # assets_src/ の素材 zip を取り込む（ffmpeg が必要）
npm run dev             # 開発サーバー
npm run build           # dist/ に静的ファイルを出力
npm run build:artifact  # claude.ai アーティファクト用の1ページ版（dist-artifact/）
npm run balance -- 400  # 画面なしでボットに400日遊ばせ、進み方を表示（数値調整用）
npm run fetch-icons     # src/config/icons.ts のアイコンを Game-icons.net から取り直す
```

## 素材（assets_src/ に zip のまま置く。git には入れない）

| 用途 | ファイル |
|---|---|
| 3D（dglopez Low Poly City Builder 無料版） | `FREE_VERSION_65_MODELS.zip` |
| UI（Prinbles Bliss GUI） | `Prinbles_GUI_Asset_Bliss_1.0.0.zip` |
| 効果音（Shapeforms） | `Shapeforms Audio Free Sound Effects.zip` |
| BGM（JDSherbert） | `JDSherbert - Minigame Music Pack [FREE].zip` |
| BGM（SunixMuz） | `Casual-mobile-Platformer Music Pack FREE.zip` |

`npm run import-assets` は、設定ファイルで使うと決めた素材だけを取り出し、スクランブルをかけたパック
（`public/assets/*.pack`）にまとめる。素材を1ファイルずつ取り出しにくくするため（Shapeforms のライセンスの求め）。
アイコンは CC BY 3.0 なので `src/generated/icons.ts` としてリポジトリに入れている。

## 構成

- `src/config/` … ゲームの数値はすべてここ（economy / products / research / events / rivals / buildings / city / audio / icons / credits）
- `src/sim/` … 経済シミュレーション（画面に依存しない。`scripts/balance.ts` から直接動かせる）
  - `model.ts` 客数・売上の式（客数 = 人通り × 時間帯 × 知名度 × 価格の魅力 × 品質 × ライバルとの取り合い、上限はさばける客数）
  - `engine.ts` 時間の進行・日次/四半期処理・出来事 / `ai.ts` ライバルと店長 / `finance.ts` 融資・決算・時価総額 / `actions.ts` プレイヤーの操作 / `save.ts` 保存・移行・留守中の進行
- `src/render/` … three.js の街（同じ建物はインスタンス化、色だけ違う部分は頂点色にまとめて描画回数を削減、変化がないときは描画しない）
- `src/ui/` … 画面（上部バー・5つのタブ・シート・ダイアログ・設定・クレジット・デバッグ）

## セーブ

localStorage に 30 秒ごと・画面を閉じる/裏に回るときに保存。形式にバージョン番号があり、`src/sim/save.ts` の
`MIGRATIONS` に変換を足せば古いデータを移行できる。設定画面から文字列で書き出し・読み込みできる。
