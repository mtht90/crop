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

## キャラ素材の差し替え
ピースは現在プロシージャル描画の仮キャラです。差し替える場合：
1. `public/assets/characters/<キャラID>/red.png`（blue / green / yellow / purple も）を置く
   - 正方形・透過PNG・キャラを中央に。横幅がピースの直径に合わせて自動フィットします
2. `src/data/characters.ts` の該当キャラに `customArt: true` を追加

## クレジット
- Music: Juhani Junkala (CC0) — OpenGameArt
- Art / SFX: Kenney.nl (CC0) — Monster Builder, Particle, Game Icons, Emotes, Background Elements, Interface/Impact/Digital/Casino/RPG/UI Audio, Music Jingles
- Fonts: M PLUS Rounded 1c, Dela Gothic One (SIL OFL) — Google Fonts サブセット
