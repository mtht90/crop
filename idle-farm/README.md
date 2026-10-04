# はたけ日和（仮）— 3D農業放置ゲーム 試作版

企画書：[`../docs/idle-game/GDD.md`](../docs/idle-game/GDD.md)

## 遊び方
- 空いている畑をクリック → 選んでいる作物を植える（キー 1〜3 で作物を切り替え）
- 光っている畑をクリック → 収穫（ドラッグでまとめて収穫・植え付けもできる）
- 倉庫タブで売る（キー S ですべて売る）
- 強化タブで、畑・倉庫・農夫・品種改良にお金を使う
- 手で収穫すると★2以上、農夫の収穫は★1
- マウスホイールでズーム

## 開発
```bash
npm install
npm run dev             # 開発サーバー
npm test                # ゲームロジックのテスト
npm run build           # dist/ に配布用ファイル（JS/CSS は index.html に埋め込み）
npm run build:artifact  # claude.ai のプレビュー用に dist-artifact/ を作る
```

## 構成
| パス | 内容 |
|---|---|
| `src/game/data.ts` | 作物・価格・コストなどのバランス値（調整はここ） |
| `src/game/logic.ts` | 植える・収穫・売る・強化などのルール |
| `src/game/state.ts` | セーブデータの形と保存・読み込み |
| `src/scene/world.ts` | 3Dの畑・景色・カメラ・クリック判定 |
| `src/scene/farmers.ts` | 歩き回って働く農夫 |
| `src/ui/` | 画面のUI |
| `public/assets/` | 外部素材（すべて CC0、`CREDITS.md` 参照） |
