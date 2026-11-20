# シティ・コングロマリット（仮）

ブラウザ向け放置経営ゲーム。Vite + TypeScript + three.js。

## 動かし方

```
npm install
npm run import-assets   # assets_src/ の素材を取り込む（初回と素材を変えたとき）
npm run dev             # 開発サーバー
npm run build           # dist/ に静的ファイルを出力
```

## 素材の取り込み（scripts/import-assets.mjs）

素材は `assets_src/` に zip のまま置く（git には入れない）。`npm run import-assets` で次を行う。

1. `FREE_VERSION_65_MODELS.zip`（dglopez「Low Poly City Builder Asset Pack」無料版）から GLB を取り出す
2. `src/config/` に `model: '...'` と書いたモデルだけを `public/assets/models.pack` にまとめる
   （使わない素材はビルドに入らない。素材を1ファイルずつ取り出しにくいよう簡単なスクランブルをかける）
3. ライセンス文書を `licenses/` にコピーする

zip の中のモデル一覧: `npm run import-assets -- --list`

## 数値の設定

- `src/config/city.ts` … 街の大きさ・道路・地価・人通り・カメラ
- `src/config/buildings.ts` … 業種・店のレベルと建物モデルの対応表
