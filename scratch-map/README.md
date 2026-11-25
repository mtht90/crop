# 共同スクラッチマップ（scratch-map）

友達と一緒に地図の「霧」を晴らしていく共同スクラッチマップの Web アプリ（PWA）です。
訪れた場所の霧が晴れていき、**グループで1枚の地図を一緒に塗れる**のが特徴です。

- 🗺️ **霧の地図** — 全世界を覆う暗い面から、塗ったセル（H3 解像度10・約 0.015km²）をくり抜いて表示
- 👣 **スクラッチ散歩モード** — 画面をつけたまま歩くと、新しいセルを塗るたびに音と振動（Android）で演出
- 👥 **共同マップ** — 招待リンクで参加（ログイン前でも閲覧可）。メンバーごとに色、「自分だけ／グループ全体／メンバー色分け」の表示切り替え
- ⚡ **リアルタイム同期** — 誰かが塗ると、他のメンバーの地図にもすぐ反映（SSE）
- 📡 **外部アプリ連携** — Overland / OwnTracks から受信し、アプリを閉じている間の移動もサーバーで塗る
- 📊 **統計** — 総セル数、メンバー別の貢献（開拓数・訪問数）、今週の新規開拓数
- 🏠 **プライバシー** — 自宅ゾーンは記録しない、退出時に自分の寄与を消せる、生の緯度経度はサーバーに保存しない
- 📱 **PWA** — ホーム画面に追加でき、オフラインでも記録して後で同期

---

## 目次

1. [構成](#構成)
2. [ローカルでの起動方法](#ローカルでの起動方法)
3. [スマホ実機での確認方法（HTTPS が必要）](#スマホ実機での確認方法https-が必要)
4. [テスト](#テスト)
5. [Render へのデプロイ手順](#render-へのデプロイ手順)
6. [環境変数](#環境変数)
7. [ユーザー向け: 外部アプリ連携ガイド](#ユーザー向け-外部アプリ連携ガイド)
8. [設計判断](#設計判断)
9. [後のフェーズに向けた拡張ポイント](#後のフェーズに向けた拡張ポイント)

---

## 構成

```
scratch-map/
├── shared/cells.ts          # 位置→H3セル変換（フロントとサーバーで共通）
├── server/                  # API（Node.js + TypeScript + Hono）
│   └── src/
│       ├── app.ts           # ルーティング（認証・グループ・セル・招待・自宅ゾーン・SSE・外部受信）
│       ├── store.ts         # Postgres へのクエリ
│       ├── ingest/          # Overland / OwnTracks のパースと取り込み
│       ├── realtime.ts      # SSE 用の Pub/Sub とチケット
│       └── migrations/      # SQL マイグレーション（起動時に自動適用）
├── web/                     # フロント（Vite + TypeScript + MapLibre GL JS）
│   ├── src/
│   │   ├── map.ts / fog.ts  # 地図と霧レイヤー
│   │   ├── walk.ts          # スクラッチ散歩（watchPosition + Wake Lock）
│   │   ├── localdb.ts       # IndexedDB（端末内の記録・送信待ち）
│   │   ├── sync.ts          # 送信待ちのアップロードと SSE 購読
│   │   ├── ui/              # 画面（シート）
│   │   └── sw-template.js   # Service Worker（ビルド時に生成）
│   └── public/              # manifest・アイコン
└── tests/                   # Vitest（セル変換・受信 API・霧ポリゴン・Postgres 結合テスト）
```

リポジトリ直下の `render.yaml` が Render Blueprint です。

---

## ローカルでの起動方法

必要なもの: **Node.js 20 以上**（22 推奨）、**PostgreSQL 14 以上**

```bash
cd scratch-map
```

```bash
npm install
```

データベースを作成します（Docker を使う場合の例）。

```bash
docker run -d --name scratch-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
```

```bash
docker exec scratch-pg createdb -U postgres scratchmap
```

API の環境変数を用意します（中身はそのままで動きます）。

```bash
cp server/.env.example server/.env
```

API（:8787）とフロント（:5173）を起動します。テーブルは API の起動時に自動で作成されます。

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開きます。

- 開発時はフロントの Vite が `/api` と `/ingest` を API にプロキシするので、URL は 5173 番の1つだけで済みます。
- `DEV_MAGIC_LINK=true` の間は、メールを送らずに「（開発モード）このリンクでログイン」ボタンが画面に出ます（リンクは API のログにも出力されます）。
- パスキーは `localhost` ならそのまま試せます。
- **GPS なしで動作確認**するには URL に `?simulate` を付けます（例: `http://localhost:5173/?simulate=1000&lat=35.68&lng=139.76`）。「スクラッチ散歩」を押すと、指定位置から1秒ごとに疑似的に歩きます。

本番ビルドの確認:

```bash
npm run build
```

```bash
npm run start:server
```

```bash
npm run preview -w web
```

---

## スマホ実機での確認方法（HTTPS が必要）

位置情報（Geolocation）・Wake Lock・Service Worker・パスキーは、**HTTPS（または localhost）でしか動きません**。
スマホから PC の開発サーバーへ `http://192.168.x.x:5173` で繋いでも位置情報は取れないので、次のどちらかを使います。

### 方法A: トンネルで本物の HTTPS にする（おすすめ）

[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) を使うと、証明書の警告なしでスマホから開けます。

```bash
npm run dev
```

別のターミナルで:

```bash
cloudflared tunnel --url http://localhost:5173
```

表示された `https://xxxx.trycloudflare.com` をスマホで開きます。外部アプリ連携やマジックリンクもこの URL で試す場合は、
`server/.env` に次を追記して API を再起動してください（トンネルの URL は起動のたびに変わります）。

```
APP_ORIGIN=https://xxxx.trycloudflare.com
PUBLIC_API_URL=https://xxxx.trycloudflare.com
```

こうすると、Overland / OwnTracks の受信 URL もトンネル経由になり、実機のロガーアプリから PC の API に届きます。
パスキーもトンネルのドメインで動きます（`WEBAUTHN_RP_ID` は `APP_ORIGIN` から自動で決まります）。

### 方法B: 自己署名証明書で LAN 内 HTTPS

```bash
VITE_HTTPS=1 npm run dev
```

スマホで `https://<PCのIPアドレス>:5173` を開き、証明書の警告を承認して進みます（Android Chrome / iOS Safari とも可）。
この方法では **パスキーは使えません**（IP アドレスは WebAuthn の対象外）。ログインは開発モードのマジックリンクを使ってください。
`server/.env` に `CORS_EXTRA_ORIGINS=https://<PCのIP>:5173` を追加しておくと、マジックリンクがその URL で発行されます。

### 実機で確認するポイント

- 「👣 スクラッチ散歩」を押すと位置情報の許可を求められます。許可後、歩くと霧が晴れていきます。
- 画面下に「誤差 ±◯m」が出ます。50m を超える点は捨てるので、屋内では塗られないことがあります。
- 散歩中は Wake Lock で画面が消えません（iOS は 16.4 以降）。
- ホーム画面に追加: iOS は Safari の共有メニュー →「ホーム画面に追加」、Android は Chrome のメニュー →「アプリをインストール」。
- iOS のホーム画面アプリではメールのリンクが Safari 側で開くため、アプリ側でログインするには **パスキー** を使ってください（設定 → パスキーを追加）。

---

## テスト

```bash
npm test
```

- `tests/cells.test.ts` — セル変換（accuracy 50m の足切り、gridPathCells による塗り埋め、距離・時間ギャップ、バッチをまたぐ連結、自宅ゾーン除外）
- `tests/ingest.test.ts` — `POST /ingest/overland/:token`・`POST /ingest/owntracks/:token`（レスポンス形式、トークン検証、端末別の連結、自宅ゾーン、不正入力）
- `tests/fog.test.ts` — 霧ポリゴンの穴・島・リングの向き
- `tests/db.integration.test.ts` — 実 Postgres での結合テスト（ログイン、招待・参加、全グループへの反映、反映オフ、統計、自宅ゾーンの遡及削除、退出時の寄与削除と再計算、履歴の持ち込み、SSE 権限）

結合テストは `TEST_DATABASE_URL` を指定したときだけ動きます（**指定した DB の public スキーマを作り直す**ので専用の DB を使ってください）。

```bash
createdb -U postgres scratchmap_test
```

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/scratchmap_test npm test
```

型チェック:

```bash
npm run typecheck
```

GitHub Actions（`.github/workflows/scratch-map-ci.yml`）では Postgres 付きで型チェック・全テスト・ビルドを実行します。

---

## Render へのデプロイ手順

`render.yaml`（リポジトリ直下）で次の3つを作成します。リージョンは日本から近いシンガポールにしています。

| 名前 | 種類 | 内容 |
| --- | --- | --- |
| `scratch-map-web` | Static Site | フロント（`web/dist`）。SPA 用に `/*` → `/index.html` へリライト |
| `scratch-map-api` | Web Service（Starter） | API。`/health` でヘルスチェック。起動時にマイグレーション |
| `scratch-map-db` | Postgres（basic-256mb） | データベース |

1. このリポジトリを GitHub に push します。
2. Render のダッシュボードで **New → Blueprint** を選び、リポジトリを接続します。
3. `RESEND_API_KEY` と `MAIL_FROM` の入力を求められます（マジックリンクのメール送信用。後述）。メールを使わずパスキーだけで運用するなら空でも構いません。
4. **Apply** で3つが作成・デプロイされます。
5. 作成後、実際の URL を確認します。`render.yaml` は次の URL を前提にしています。
   - フロント: `https://scratch-map-web.onrender.com`
   - API: `https://scratch-map-api.onrender.com`

   名前が既に使われていて URL に接尾辞が付いた場合（例: `scratch-map-api-x1y2.onrender.com`）は、
   - API の環境変数 `APP_ORIGIN` を実際のフロント URL に
   - フロントの環境変数 `VITE_API_URL` を実際の API URL に

   変更し、両方を再デプロイしてください（フロントはビルド時に URL が埋め込まれるため **Clear build cache & deploy**）。
   `render.yaml` 側の値も合わせて直しておくと、次回の同期で戻りません。
6. 独自ドメインを使う場合も同様に `APP_ORIGIN` / `VITE_API_URL` を変更します。パスキーはドメインに紐づくので、ドメインを変えると登録済みのパスキーは使えなくなります。

### メール送信（マジックリンク）

[Resend](https://resend.com/) の API キーを `RESEND_API_KEY` に設定すると、ログインリンクをメールで送ります。
`MAIL_FROM` には Resend で認証したドメインの送信元を指定します（例: `Scratch Map <login@example.com>`）。
未設定の場合はメールを送らず、リンクを API のログにだけ出力します（本番では実質パスキーのみでのログインになります）。

### 補足

- Postgres の `free` プランは作成から30日で期限切れになるため、`basic-256mb` にしています。試すだけなら `render.yaml` の `plan` を `free` に変更できます。
- Starter プランの API は1インスタンス前提です（リアルタイム配信はプロセス内の Pub/Sub。[設計判断](#設計判断)参照）。
- Service Worker（`/sw.js`）と manifest はキャッシュしないヘッダーを付けているので、デプロイ後は次回起動時に新しい版へ切り替わります。

---

## 環境変数

### API（`scratch-map-api`）

| 変数 | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | `postgres://localhost:5432/scratchmap` | Postgres の接続文字列（Render では DB から自動設定）。`sslmode=require` を含むか `PGSSL=require` で SSL 接続 |
| `APP_ORIGIN` | ✅ | `http://localhost:5173` | フロントのオリジン。CORS 許可・マジックリンクの URL・パスキーの検証に使う。ホスト名だけでも可（`https://` を補う） |
| `PUBLIC_API_URL` | | `RENDER_EXTERNAL_URL` → `http://localhost:PORT` | API の公開 URL。外部アプリ連携の受信 URL・Overland 設定リンクの生成に使う。Render では自動 |
| `WEBAUTHN_RP_ID` | | `APP_ORIGIN` のホスト名 | パスキーの RP ID |
| `WEBAUTHN_RP_NAME` | | `共同スクラッチマップ` | パスキー登録時に表示される名前 |
| `RESEND_API_KEY` | | なし | マジックリンクのメール送信用（Resend） |
| `MAIL_FROM` | | `Scratch Map <onboarding@resend.dev>` | 送信元 |
| `DEV_MAGIC_LINK` | | Render 上・本番は `false`、それ以外は `true` | `true` だとログインリンクを API のレスポンスに含める（**ローカル専用。本番で有効にするとメールを見ずにログインできてしまう**） |
| `CORS_EXTRA_ORIGINS` | | なし | 追加で許可するフロントのオリジン（カンマ区切り）。LAN の HTTPS 開発 URL など |
| `SESSION_DAYS` | | `90` | ログインセッションの有効日数 |
| `PORT` | | `8787` | 待ち受けポート（Render では自動） |
| `PG_POOL_MAX` | | `10` | DB コネクションプールの上限 |

### フロント（`scratch-map-web`、ビルド時）

| 変数 | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `VITE_API_URL` | 本番で ✅ | 空（同一オリジン） | API の URL。空なら同じオリジンの `/api` を使う（開発時は Vite がプロキシ） |
| `VITE_MAP_STYLE` | | `https://tiles.openfreemap.org/styles/liberty` | MapLibre のスタイル URL |

開発用の変数: `VITE_HTTPS=1`（自己署名 HTTPS）、`API_PROXY_TARGET`（プロキシ先、既定 `http://localhost:8787`）。

---

## ユーザー向け: 外部アプリ連携ガイド

ブラウザは**画面が表示されている間しか**位置情報を取れません。
スマホをポケットに入れている間やアプリを閉じている間の移動も塗りたいときは、GPS ロガーアプリを入れて、記録をこのアプリに送るように設定します。
受信した足跡は、あなたが参加している**反映オンのすべてのマップ**に塗られます（マップごとの切り替えは「👥 メンバー」→「自分の足跡をこのマップに反映する」）。

### 準備: 連携用 URL を発行する

1. アプリにログインし、右上の **⚙️ 設定** を開きます。
2. 「外部アプリ連携」の **連携用URLを発行** を押します。
3. Overland 用のボタンと、OwnTracks 用の受信 URL が表示されます。

> URL はあなた専用の合言葉を含みます。他人に教えると、その人の位置があなたの足跡として記録されてしまいます。
> セキュリティのため URL は発行した時だけ表示されます。分からなくなったら **再発行** してください（古い URL は使えなくなります）。

### Overland（iPhone）

1. App Store で **Overland GPS Tracker** をインストールします。
2. 同じ iPhone でこのアプリの設定画面を開き、**📲 Overland にワンタップで設定** を押します。
   Overland が開き、受信 URL が自動で設定されます（`overland://setup?url=…&token=…&device_id=…`）。
3. Overland で位置情報の利用を **「常に」** 許可し、**Tracking をオン** にします。
4. おすすめ設定: Desired Accuracy は **Best**、Points per Batch は **50** 前後。
5. しばらく歩いた後にアプリを開くと、霧が晴れています。設定画面の「最終受信」で届いているか確認できます。

うまく設定されないときは、Overland の Settings → Receiver Endpoint に、表示された「受信URL」を貼り付けてください。

### OwnTracks（iPhone / Android）

1. **OwnTracks** をインストールして開きます。
2. 設定（Preferences）→ **Connection** を開き、**Mode を「HTTP」** にします。
3. **URL（Host）** に、設定画面に表示された OwnTracks 用の受信 URL を貼り付けます。ユーザー名・パスワードは空のままで構いません。
4. 位置情報の利用を **「常に許可」** にします（Android はバッテリー最適化の対象から外すと安定します）。
5. 地図画面のモニタリングモードを **Move（移動）** にすると細かく記録されます（Significant だと数百 m〜km 単位になり、間が埋まらないことがあります）。

### 記録のルール

- 誤差（accuracy）が **50m を超える点は捨てます**。
- 連続する点の間は自動で塗り埋めます。ただし **1km 以上離れている**、または **5分以上空いている** 場合は埋めません（電車移動や GPS の飛びで線が引かれないように）。
- **自宅ゾーン内の点は記録しません**（設定 → 自宅ゾーン）。
- 正確な緯度経度はサーバーに保存されません。届いた座標はすぐにセルに変換して破棄します。

---

## 設計判断

実装中に決めたことのまとめです。

### 技術スタック（指定からの変更・補足）

| 項目 | 選択 | 理由 |
| --- | --- | --- |
| バックエンド | **Hono**（`@hono/node-server`） | 型が素直で軽量。`app.request()` でサーバーを起動せずにテストできる |
| リアルタイム | **Server-Sent Events** | 配信はサーバー→クライアントの一方向だけで足りる。ブラウザの自動再接続・HTTP/2・プロキシとの相性が良い。送信は通常の `POST /api/cells` |
| UI | **フレームワークなし**（素の TypeScript + 小さな DOM ヘルパー） | 画面は地図＋シート数枚で、依存とバンドルを増やす理由が薄い |
| メール | **Resend**（任意） | HTTP API だけで送れて追加依存が不要。未設定ならログ出力のみ |
| パスキー | `@simplewebauthn/server` / `browser` | 実績のある実装。Discoverable credential でメールなしの新規登録も可能 |
| テスト | **Vitest** | TS をそのまま実行でき、フロント・サーバー共通のコードをまとめてテストできる |
| ビルド | API は **esbuild** で1ファイルにバンドル | フロントと共有する `shared/` を含めて Node でそのまま実行するため |

### データ・プライバシー

- **位置はすべて H3 解像度10 のセル ID（15桁の16進文字列）で扱う。** DB に緯度経度のカラムは存在しない。
  - スクラッチ散歩: ブラウザ内でセルに変換してから送信。
  - 外部アプリ: サーバーで受信したリクエストの処理中にだけ座標を扱い、セルに変換したら破棄（ログにも出さない）。
  - 自宅ゾーンも「中心セル＋半径」で保存（中心の座標は保存しない）。
- **バッチをまたいだ塗り埋め** のために、外部アプリごと（`device_id` / `X-Limit-D`）に「直前のセルと時刻」だけを `ingest_state` に保持する。直前の点が自宅ゾーン内なら保持しない。
- **塗り埋めの上限**: 連続点の間隔が 1km 超、または 5 分超なら埋めない（`shared/cells.ts` の `MAX_GAP_M` / `MAX_GAP_MS`）。
- **自宅ゾーンはサーバー側でも必ず適用**する（クライアントを信用しない）。ゾーン追加時は「既存の記録からも消す」を選べる（既定オン）。半径は 50〜2000m。地図上の自宅ゾーン表示は本人にしか見えない。
- **未来の時刻**は端末時計のずれとみなし、受信時刻に丸める。

### テーブル（指定案からの追加）

指定の `users` / `groups` / `group_members` / `cells` / `invites` / `ingest_tokens` に加えて:

| テーブル | 用途 |
| --- | --- |
| `member_cells` | メンバーごとの寄与（group, user, h3）。「自分だけ」表示、メンバー別統計、退出時の寄与削除後の `cells` 再計算に必要 |
| `sessions` / `magic_links` / `passkeys` / `webauthn_challenges` | ログイン。トークンはすべて SHA-256 ハッシュで保存 |
| `ingest_state` | 外部アプリのバッチ間の直前セル（座標ではない） |
| `home_zones` | 自宅ゾーン（中心セル＋半径） |

`groups.is_personal`（各ユーザーの「マイマップ」）と `groups.mode`（将来の陣取りモード用）も追加しています。

### 塗りの集計ルール

- `cells.first_user_id / first_at` = 最初に塗った人（開拓者）。オフラインで後から届いた古い記録の方が早ければ入れ替わる。
- `cells.last_user_id / last_at` = 最後に通った人（陣取りモードの土台）。
- `visit_count` は同じセルへの **30 分以上空けた再訪** で +1（散歩中は数秒ごとに送るので、毎回数えると意味のない数になるため）。
- 「メンバー色分け」は **開拓者（first_user）の色** で塗る。
- 統計の「メンバー別の貢献」は開拓数（first_user のセル数）と訪問数（member_cells の件数）。「今週」は端末のタイムゾーンで **月曜 0:00** から。

### グループ・アカウント

- アカウント作成時に、自分だけの **マイマップ**（個人グループ）を自動で作る。退出・招待はできない。ここが個人の全履歴になる。
- 自分の足跡（散歩・外部アプリ）は、所属するグループのうち **反映オン** のすべてに入る（マイマップは常にオン）。グループごとの反映オン/オフは `group_members.share_enabled`。
- 招待リンクで参加するとき、**マイマップのこれまでの足跡を持ち込む** かを選べる（既定オン。自宅ゾーン内は除外）。
- 招待リンクは 30 日有効。**ログイン前でも閲覧可能**（`X-Invite-Token` ヘッダーで認可）。どのメンバーでも発行できる。
- 退出時: 「自分の記録も消す」を選ぶと `member_cells` を削除して `cells` を残りのメンバーの記録から再計算。最後の1人が抜けたらグループごと削除。オーナーが抜けたら最古参のメンバーに引き継ぐ。
- メンバーの色は 10 色のパレットから空いている色を自動で割り当て、各自が変更できる。
- ログイン前は「この端末」マップ（IndexedDB）に記録し、ログインした時点でまとめてアップロードする。

### 認証

- API とフロントは別ドメイン（`*.onrender.com` は Public Suffix List に載っておりクロスサイト扱い）なので、Cookie ではなく **Bearer トークン（localStorage）** にした。
- マジックリンクは 15 分有効・1回限り。同じメールへの送信は 10 分に 5 回まで。
- **EventSource はヘッダーを付けられない** ため、SSE は `POST /api/groups/:id/stream-ticket` で 60 秒有効・1回限りのチケットを発行し、URL に載せる（セッショントークンを URL に載せない）。
- 外部アプリのトークンは URL パスに含める（Overland / OwnTracks の HTTP モードの仕様上）。DB にはハッシュのみ保存し、画面には発行時だけ表示する。

### リアルタイム同期

- サーバーはグループ単位のインメモリ Pub/Sub（`server/src/realtime.ts`）。**Render Starter の1インスタンス前提**。複数インスタンスにする場合は `Bus` を Postgres `LISTEN/NOTIFY` などに置き換える（`publish` / `subscribe` だけのインターフェース）。
- 25 秒ごとに ping を送り、プロキシのアイドル切断を防ぐ。
- クライアントは切断されたら指数バックオフで再接続し、再接続時はセルを取り直して取りこぼしを補う。
- 自分の送信分は SSE を待たずに即座に表示に反映する。

### クライアント

- **送信待ち（outbox）** は IndexedDB。オフラインでも記録を続け、オンライン復帰・画面復帰・60 秒ごと・散歩終了時に送る。最後に見たグループのセルもキャッシュし、オフライン起動時に表示する。
- 霧は「世界を覆うポリゴン − `cellsToMultiPolygon` の外周」。塗った領域の内側に残った未踏の穴は「霧の島」として別ポリゴンにする。MapLibre はリングの向きで外周と穴を判別するので、向きを明示的にそろえている。
- 描画は `requestAnimationFrame` でまとめ、連続更新でも `cellsToMultiPolygon` は1フレーム1回。
- 新規セルの演出: Web Audio で合成した短い効果音（音源ファイル不要）＋ Vibration API（Android）＋ セルが光るアニメーション＋「+N」カウンター。音は設定でオフにできる。他のメンバーが開拓したセルもその人の色で光る。
- 散歩中は地図が現在地に追従。地図を指で動かすと追従を止め、◎ボタンで再開。
- MapLibre のワーカーはバンドル後に見つからなくなるため、ワーカーファイルをアセットとして出力し `setWorkerUrl` で渡している（静的ホスティングでも確実に JS として配信されるよう拡張子を `.js` にする）。

### PWA

- Service Worker はビルド時に生成し、ビルド成果物の一覧を埋め込んでプリキャッシュ（一度開けばオフラインで起動可）。
- 地図タイル・スタイル・フォント（OpenFreeMap）は stale-while-revalidate で最大 3000 件キャッシュ。API と SSE はキャッシュしない。
- アイコンは SVG から 192 / 512 / maskable / apple-touch-icon の PNG を生成して同梱。

---

## 後のフェーズに向けた拡張ポイント

今回は実装していませんが、次のように拡張できる形にしています。

| 機能 | 拡張のしかた |
| --- | --- |
| 市区町村・町丁目ごとの探索率 | 境界ポリゴン（国土数値情報など）を `polygonToCells(…, 10)` で解像度10のセル集合にして `area_cells(area_id, h3)` に入れておけば、`cells` との JOIN で探索率を出せる。セル ID が文字列なので索引もそのまま使える |
| 陣取りモード | `cells.last_user_id` に「最後に通った人」を既に保持している。`groups.mode = 'territory'` のとき色分けを `last_user_id` 基準にするだけで表示でき、`state.ts` の `computeDisplay` の参照先を切り替えればよい |
| 期間限定のお題・ランキング | `member_cells.first_at` / `cells.first_at` に時刻があるので、期間で絞った集計がそのまま可能（`stats` の `since` と同じ考え方）。お題エリアは探索率と同じくセル集合で表せる |
| GPX / Google タイムラインの取り込み | `shared/cells.ts` の `pointsToCells`（accuracy 足切り・塗り埋め・自宅ゾーン除外）と `server/src/ingest/service.ts` の `ingestBatches` をそのまま使える。パーサー（`ingest/parse.ts` と同じ `ParsedBatch` を返す関数）を追加するだけで、座標を保存しない方針も保たれる |
