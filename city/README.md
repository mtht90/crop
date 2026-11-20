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

1. `assets_src/*.unitypackage` を展開（tar.gz。GUIDフォルダの `pathname` から元のパスを復元）
2. FBX を FBX2glTF（npm パッケージ `fbx2gltf` 同梱のバイナリ）で `.glb` に変換 → `.import-cache/glb/`
3. `src/config/buildings.ts` に書いたモデルだけを `public/assets/models/` にコピー（使わない素材はビルドに入らない）

変換済みモデルの一覧: `npm run import-assets -- --list`

## 数値の設定

- `src/config/city.ts` … 街の大きさ・道路・地価・人通り・カメラ
- `src/config/buildings.ts` … 業種・店のレベルと建物モデルの対応表
