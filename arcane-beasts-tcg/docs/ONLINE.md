# オンライン対戦の遊び方・サーバーの動かし方

ARCANE BEASTS のオンライン対戦は、**自宅のパソコンで動かす専用サーバー**につないで遊びます。
サーバーがゲーム画面の配信・通信・マッチング・ランクの保存をすべて行うので、
「サーバーのURLを開く」だけで誰でも遊べます（QRコードで友達を招待できます）。

> claude.ai のアーティファクト版では外部サーバーにつなげないため、オンライン対戦は使えません（CPU対戦のみ）。

## 仕組み

```
スマホ/PC ──https──▶ Cloudflare Tunnel ──▶ 自宅PC: npm run server (ポート8787)
                                           ├ ゲーム画面の配信 (dist/)
                                           ├ WebSocket /ws  … 対戦の通信
                                           └ data/players.json … プレイヤーとランク
```

- ルールの判定は**サーバー側のエンジン**が行います。手札・山札・サイドの中身は相手に送られません。
- プレイヤーは端末ごとの匿名IDで識別します（アカウント登録なし）。機種変更は「引き継ぎコード」で。
- オンラインのランク（10級 → 1級 → 初段〜十段 → 名人）はサーバーに保存されます。CPUとのランクマッチとは別です。

## 準備（Windows）

1. **Node.js**（LTS版）を入れる … https://nodejs.org
2. このフォルダ（`arcane-beasts-tcg`）を自宅PCに置く
3. **cloudflared**（無料）を入れる … コマンドプロンプトで
   `winget install --id Cloudflare.cloudflared`
4. `online\start-all.bat` をダブルクリック
   - 1つ目のウィンドウ: ゲームのビルドとサーバー起動（初回は `npm install` で数分）
   - 2つ目のウィンドウ: `https://xxxx.trycloudflare.com` というURLが表示される

### 遊ぶとき

1. **ホストも、表示された `https://xxxx.trycloudflare.com` をブラウザで開く**
   （`localhost` で開くと、QRコードに他の人が開けないアドレスが入ってしまいます）
2. ホーム →「オンライン対戦」→「部屋を作る」→ 出てくる**QRコード**を友達のスマホで読み取る
3. 友達はそのままゲームが開き、（初めてなら最初のデッキを選んで）部屋に入ります

`xxxx.trycloudflare.com` は起動のたびに変わります。変えたくない場合は下の「固定URL」を参照。

## 対戦モード

| モード | 内容 |
|---|---|
| フレンド対戦 | 部屋コード（4文字）かQRコードで招待。コインは増えません |
| ランダムマッチ | 待っている誰かと対戦。勝つと60コイン |
| オンラインランク | 近いランクの相手と対戦（待つほど範囲が広がる）。昇級・昇段の報酬あり。月ごとにシーズン |
| 観戦 | ランダム／ランクの試合は一覧から、フレンド対戦は部屋コードで観戦。手札は見えません |

- 持ち時間は1回の操作につき90秒（カード選びなどは60秒、最初の準備は150秒）。時間切れは負けです。
- 通信が切れても60秒以内に同じ端末で開き直せば続きから戻れます。戻らなければ相手の勝ちです。
- 降参すると負けになります。

## 固定URLにする（任意）

独自ドメイン（Cloudflareで管理）があれば、名前付きトンネルで固定URLにできます。

```
cloudflared tunnel login
cloudflared tunnel create arcane
cloudflared tunnel route dns arcane arcane.example.com
cloudflared tunnel run --url http://localhost:8787 arcane
```

固定URLにしたら、サーバー起動時に `PUBLIC_URL` を設定すると、誰がホストでもQRコードがそのURLで作られます。

```
set PUBLIC_URL=https://arcane.example.com
npm run server
```

## Render（無料のクラウド）で公開する

PCをつけっぱなしにしたくないときは、Render の無料枠に置けます。リポジトリの `render.yaml` に設定が入っています。

1. このリポジトリを GitHub に置く（ブランチは `main`）
2. Render で **New → Blueprint** → このリポジトリを選び、**Apply**
3. 5分ほどで `https://（サービス名）.onrender.com` が開く（`main` に push するたびに自動で更新）
4. 無料枠は15分アクセスがないと眠るので、UptimeRobot などで `https://（サービス名）.onrender.com/healthz` を5分おきに見に行く
5. ランクなどの保存先 `data/` は、Render の無料枠では再起動で消えます（カードやコインは各端末に保存されているので消えません）

### ランクを消さない（Supabase の無料データベース）

Render の無料枠は、再起動や更新のたびにサーバーのファイルが消えます。オンラインのランクとプレイヤー情報を残すには、Supabase（無料）を使います。

1. https://supabase.com に登録し、**New project** でプロジェクトを作る（地域は Tokyo、パスワードは何でも）
2. 左メニューの **SQL Editor** を開き、次の3行を貼って **Run**

   ```sql
   create table if not exists public.players (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
   alter table public.players enable row level security;
   ```

3. 左下の **Project Settings → API**（または **API Keys**）を開き、次の2つを控える
   - **Project URL**（`https://xxxx.supabase.co`）
   - **service_role** の秘密キー（新しい画面では **secret** キー。`eyJ…` か `sb_secret_…` で始まる。**公開しない**こと）
4. Render のサービスの **Environment** に、次の2つを追加して保存（自動で再デプロイされます）
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_KEY` = 秘密キー
5. Render の **Logs** に `player data: hosted database (Supabase)` と出れば成功です

- 2つとも設定したときだけデータベースを使います。どちらかがないときは、今までどおりサーバーのファイル（`data/players.json`）を使います。
- データベースの読み書きに失敗しても、ゲームは止まりません（書き込みは15秒ごとにやり直します）。

### プレイヤー名の制限

暴言・性的な言葉・差別的な言葉・運営になりすます名前（「運営」「admin」など）は使えません。全角/半角、カタカナ/ひらがな、記号や数字での言い換え（`sh1t`、`し.ね`）も見抜きます。足したい言葉は、環境変数 `NG_WORDS` にカンマ区切りで入れてください。

## 設定（環境変数）

| 名前 | 既定値 | 内容 |
|---|---|---|
| `PORT` | 8787 | サーバーのポート |
| `DATA_DIR` | `./data` | プレイヤー情報の保存先 |
| `WEB_DIR` | `./dist` | 配信するゲームのフォルダ |
| `PUBLIC_URL` | なし | QRコードに入れる公開URL |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | なし | プレイヤー情報の保存先（上の説明） |
| `NG_WORDS` | なし | 名前に使えない言葉を足す（カンマ区切り） |

## 運用メモ

- **バックアップ**: `data/players.json` をコピーしておけば、ランクとプレイヤー情報を復元できます。
- **更新したあと**: `git pull` などでコードを更新したら、`online\start-server.bat` を起動し直すとビルドし直します。
- **同じWi-Fiの中だけで遊ぶ**: 起動時に表示される `http://192.168.x.x:8787` をスマホで開けば、トンネルなしで遊べます
  （振動・ホーム画面に追加はhttpsが必要なので使えません）。
- **動作確認**: ブラウザで `…/healthz` を開くと、オンライン人数などが見られます。
- **開発**: `npm run server`（ポート8787）と `npm run dev`（ポート5173）を同時に動かすと、5173側の `/ws` が8787につながります。
- **テスト**: `npm test`（サーバー通信のテストを含む）

## 既知の制限

- デッキは「60枚・同名4枚まで・存在するカード」だけをサーバーで確認します。**持っているカードかどうかは確認しません**
  （手持ちの記録は各端末にあるため）。友達同士で遊ぶ前提です。
- 同じ端末の別タブで同時に入ると、あとから開いたタブが優先されます。
- プレイヤー情報はJSONファイルに保存しています。数百人規模までを想定しています。
