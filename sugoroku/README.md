# ダイスキングダム（王国カードバトル）

空に浮かぶ島の13の領地を、カードバトルで奪い合う3Dの陣取りゲーム。あなた1人とCPU3人の領主で8ラウンドを戦い、領地の数で1位を目指す。

- ルールと設計：[`SPEC.md`](SPEC.md)
- 素材のクレジット：[`CREDITS.md`](CREDITS.md)

## 動かし方

```bash
npm install
```

```bash
npm run dev
```

ブラウザで表示されたURL（通常 http://localhost:5173/ ）を開く。

## 本番ビルド

```bash
npm run build
```

`dist/` に出力される。ビルドの最後に `scripts/prune-models.mjs` が、ゲームで使わない3Dモデルを `dist/models` から取り除く（新しいモデルを使うときはこのスクリプトの一覧に足す）。

## バランス確認

CPU 4人の自動対戦を繰り返して、勝ち方や破産の頻度、キャラ別の勝率を出す。

```bash
npm run sim -- 1000 meadow
```

ステージは `meadow` `snow` `volcano` `sky`。

## 動作確認用の URL パラメータ

- `?auto` … 自分の手番もCPUが打つ（早送り4倍）
- `?auto&rounds=2` … さらにラウンド数を短くして、結果画面まで早く進める

## 構成

| ファイル | 役割 |
|---|---|
| `src/game/engine.ts` | ルール本体。描画と判断を差し込む作りで、画面なしでも動く |
| `src/game/ai.ts` | CPU の判断（慎重・強欲・博打） |
| `src/data/defs.ts` | マス・カード・キャラ・ステージの定義 |
| `src/render/world.ts` | 3D の盤面・建物・駒・サイコロ（物理演算）・演出 |
| `src/view.ts` | エンジンの通知を演出に変える View と、あなたの操作 |
| `src/ui/` | HUD・ダイアログ・各画面 |
| `src/meta.ts` | レベル・王冠・開放・実績（ブラウザに保存） |
| `src/audio.ts` | BGM と効果音 |

## 素材の更新

- 3Dモデル：`public/models/` に KayKit の3パックを置いている。取り直すときは `node scripts/fetch-itch.mjs <ページURL> <ファイル名> <保存先>` で itch.io から取得できる。
- アイコン：`scripts/icon-list.txt` に名前を足し、game-icons.net の公式アーカイブを展開したフォルダを指定して `node scripts/extract-icons.mjs <.../icons/ffffff/transparent/1x1>` を実行すると `src/data/icons.gen.ts` が作り直される。
