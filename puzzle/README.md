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

## Render で公開する
リポジトリ直下の `render.yaml`（Blueprint）で静的サイトとしてデプロイできます。
1. https://dashboard.render.com で GitHub を連携
2. 「New」→「Blueprint」→ このリポジトリとブランチを選ぶ
3. `render.yaml` の内容（`puzzle/` で `npm ci && npm run build`、`dist/` を公開）で自動作成されます
以後はブランチに push するたびに自動で再デプロイされます。

## オンラインランキング（Supabase）
1. https://supabase.com で無料プロジェクトを作成
2. 「SQL Editor」で `puzzle/supabase/ranking.sql` の中身を貼り付けて Run
3. 「Project Settings → API」の **Project URL** と **anon public key** を、Render の環境変数
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` に設定して再デプロイ
   （ローカルなら `puzzle/.env.local` に同じ2行を書く）
- 週は日本時間の月曜0時に切り替わり、各プレイヤーの週ベストだけが残ります
- 書き込みは `submit_score()` 経由のみ（あり得ない点数・30秒以内の連続送信は拒否）
- 未設定のときはランキング画面に「準備中」と出るだけで、ゲームは普通に遊べます

## 開発者モード
設定 →「かいはつ」→ パスワード。コードにはソルト付き SHA-256 だけを入れています
（`src/core/Dev.ts` の `HASH`）。パスワードを変えるときは
`node -e "console.log(require('crypto').createHash('sha256').update('punitto-dev:'+'新しいパスワード').digest('hex'))"`
の結果で `HASH` を置き換えてください。

## 構成
- PixiJS v8 (WebGL) + GSAP、物理は円ピース専用の自作PBDソルバー（`src/game/Physics.ts`）
- 効果音は Web Audio：なぞるたびペンタトニックで音階が上がる合成音＋効果音ラボの素材、リバーブ/ダッキング付き
- 操作の手触り調整は `src/game/Board.ts` の `BOARD_TUNING`（隣接判定・吸着距離・ボム閾値など）
- バランスは `src/data/characters.ts` / `bosses.ts` / `gacha.ts`

## 素材パイプライン
- ピース・ボス: KayKit の3Dモデルを three.js でレンダリングした画像（5色ストリップ＋ポートレート）。
  ピースは肌まで各色に着色し、全キャラ同じ見た目サイズ・重心中心にそろえています（`tools/mkpieces.py`）。

## クレジット
- キャラ・ボス: KayKit (CC0) — Adventurers / Skeletons / Dungeon
- 妨害・かべがみ: KayKit (CC0) — Halloween Bits / Dungeon Remastered / Mini-Game Variety Pack / Mixed Bag 1（three.js でレンダリング。`tools/mkobstacles.py`, `tools/render-wallpapers.mjs`）
- 必殺技の小道具: KayKit (CC0) — Dungeon Pack / Mini-Game Variety Pack（`public/assets/fx3d/CREDITS.txt`）
- かべがみ「まほうのもり」ほか4種: CraftPix — Fairy-Tale 2D Backgrounds
- 背景・UI: CraftPix — Fairy-Tale 2D Backgrounds / Jungle GUI
- 効果音: 効果音ラボ
- ガチャ筐体: "gumball machine" by myles_683 (CC BY 4.0) — https://www.thingiverse.com/thing:5385414 （パーツ分割・着色して three.js でレンダリング。`public/assets/gacha/CREDITS.txt`）
- 音楽: 魔王魂 (CC BY 4.0) — https://maou.audio/ 「音楽：魔王魂」
- フォント: めもかっち / やっちゃん (SIL OFL 1.1) — `public/fonts/OFL-Memokatchi.txt`。サブセット化には `fonts-src/Memokatchi.ttf` を置いて `npm run fonts`

## ショップ（課金：Stripe）

コインとライフを Stripe Checkout で販売します。支払いの確認は Supabase の Edge Function が行い、
ゲームは端末ごとの秘密キーで受け取ります（ランキングのIDでは受け取れないので、他人に横取りされません）。
最初は **テストモード** で動作確認してから本番に切りかえてください。

1. **Stripe** でアカウントを作り、ダッシュボード → 開発者 → API キーで「シークレットキー」（テストは `sk_test_…`）をコピー。
2. **Supabase** の SQL Editor で `supabase/shop.sql` を実行（購入テーブルと受け取り用の関数ができます）。
3. **Edge Function を2つ作る**（Supabase CLI の場合）:
   ```
   supabase functions deploy checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... ALLOWED_ORIGINS=https://puni-puzzle-battle.onrender.com
   ```
   （ダッシュボードの Edge Functions 画面から `supabase/functions/` の中身を貼りつけても作れます。`_shared/packs.ts` も一緒に。）
4. **Stripe の Webhook** を追加：エンドポイント URL `https://<プロジェクト>.supabase.co/functions/v1/stripe-webhook`、
   イベント `checkout.session.completed` と `checkout.session.async_payment_succeeded`。表示される署名シークレット（`whsec_…`）を
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...` で登録。
5. **Render** の環境変数に `VITE_SHOP_ENABLED=1`（テスト中は `VITE_SHOP_TEST=1` も）を追加して再デプロイ。
   ホームのコインとライフの横に「＋」が出て、ショップがひらけます。テストカード `4242 4242 4242 4242` で購入を確認。
6. **公開前に** `public/legal.html`（特定商取引法に基づく表記）の【】を書きかえてください。
   有償コインは資金決済法の「前払式支払手段」にあたる場合があります（未使用残高が基準日に1,000万円を超えると届出が必要）。

価格と中身は `supabase/functions/_shared/packs.ts`（サーバー側・正）と `src/data/shop.ts`（表示用）で同じにしてください。

## たいせん（リアルタイム対戦）

Supabase Realtime（broadcast / presence）だけで動きます。テーブルや SQL は不要です。
ホームの「たいせん」から入ると、15秒間オンラインの相手をさがし、見つからなければ CPU（表示つき）と対戦します。
60秒のスコア勝負で、8チェイン以上・必殺技・フィーバーのたびに相手へ妨害が飛びます。
