# ぷにっと☆バトル (Punitto Battle)

スマホ縦画面向けの「なぞって消す」パズルバトル。60秒間に与えた総ダメージ（スコア）が
ボスの討伐ラインを超えていれば、タイムアップ後に討伐演出が入ります。

## 遊び方
- 同じ色のぷにを **3つ以上なぞって** 指を離すと消えてボスにダメージ（8方向・斜めOK、戻ると解除）
- **7個以上** つなぐとボム、**12個以上** でメガボム（タップで爆発・連鎖あり）
- デカぷにはつなぐと3個分
- 素早く消し続けると **コンボ** 倍率アップ（2.4秒途切れるとリセット）
- 消すとたまる **フィーバー**：7.5秒間ダメージ2倍＆タップでかたまりごと消せる
- キャラごとの **必殺技**：ゲージが満タンになったらキャラアイコンをタップ
- ボスLv2以降は「おじゃま岩」を投げてくる。隣で消すと壊せる
- 討伐でボスLvアップ。コインでガチャ → キャラ入手 / 被りでレベルアップ

## 開発
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に静的ファイル出力（相対パスなのでどこにでも置ける）
npm run fonts    # ゲーム内の日本語を追加・変更したらフォントのサブセットを再生成
```
`?scene=battle` / `home` / `gacha` / `chara` で各画面に直接入れます。

## 構成
- PixiJS v8 (WebGL) + GSAP、物理は円ピース専用の自作PBDソルバー（`src/game/Physics.ts`）
- 効果音は Web Audio：なぞるたびペンタトニックで音階が上がる合成音＋Kenney素材、リバーブ/ダッキング付き
- 操作の手触り調整は `src/game/Board.ts` の `BOARD_TUNING`（隣接判定・吸着距離・ボム閾値など）
- バランスは `src/data/characters.ts` / `bosses.ts` / `gacha.ts`

## 素材パイプライン
- ピース・ボス: KayKit の3Dモデルを three.js でレンダリングした画像（5色ストリップ＋ポートレート）。
  ピースは肌まで各色に着色し、全キャラ同じ見た目サイズ・重心中心にそろえています（`tools/mkpieces.py`）。

## クレジット
- キャラ・ボス: KayKit (CC0) — Adventurers / Skeletons / Dungeon
- 背景・UI: CraftPix — Fairy-Tale 2D Backgrounds / Jungle GUI
- 効果音: 効果音ラボ
- 音楽: 魔王魂 (CC BY 4.0) — https://maou.audio/ 「音楽：魔王魂」
- フォント: めもかっち / やっちゃん (SIL OFL 1.1) — `public/fonts/OFL-Memokatchi.txt`。サブセット化には `fonts-src/Memokatchi.ttf` を置いて `npm run fonts`
