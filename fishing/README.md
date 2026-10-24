# Angler's Atlas（釣魚図鑑）

釣った魚を集める図鑑がメインの一人称3D釣りゲーム（Three.js + TypeScript + Vite）。仕様は [SPEC.md](SPEC.md)。

## 遊び方
```bash
cd fishing
npm install
npm run dev      # http://localhost:5173
```

| 操作 | 内容 |
|---|---|
| WASD / Shift / マウス | 移動 / 走る / 視点 |
| F | 水辺で釣りを始める・やめる |
| E | 釣り小屋（売却・ショップ・休憩） |
| 左クリック長押し → 離す | キャスト（溜めすぎるとブレる） |
| 左クリック長押し | リールを巻く（Shift でゆっくり） |
| 右クリック | ロッドアクション / アワセ |
| R | ウキ下の変更（エサ釣り） |
| ファイト中：マウス左右 / ホイール | 竿を倒す / ドラグ調整 |
| Tab / I / M / Esc | 図鑑 / タックル / マップ / メニュー |

## 開発
```bash
npm test             # 出現率・個体値・ファイトのバランスなどのテスト
npm run typecheck
npm run build        # dist/ に静的ファイルを出力
npm run fetch-assets # 外部素材の再取得
```

- `lab.html` … 全魚種（`?variants=1` で色違い・模様違いも）を並べて見た目を確認する開発用ページ
- URL パラメータ（開発用）：`?start&hour=21&weather=storm&x=113&z=0&yaw=1.57&fish` で時刻・天候・位置を指定して即開始、`&q=low` で低負荷描画
- 魚種は `src/data/species.ts`、タックルは `src/data/tackle.ts`、釣り場は `src/data/spots.ts` に追記するだけで増やせる
- `scripts/shot.cjs` / `scripts/play.cjs` / `scripts/ui.cjs` … Playwright でスクリーンショットを撮る確認用スクリプト（`npm run dev` 起動中に `node scripts/play.cjs http://localhost:5173 <出力先>`）
