# Rune Arena（ルーン・アリーナ）

ブラウザで遊べるリアルタイム1v1カードバトル。スマホ（縦画面・タッチ）と PC（マウス）の両方で動きます。

- 描画：three.js（WebGPU、使えない環境では自動で WebGL2）＋ TypeScript ＋ Vite
- ゲームの計算：DOM や描画に依存しない純粋な TypeScript（`packages/sim`）
- オンライン対戦（マイルストーン4）：Node.js の WebSocket ホストサーバーを Render に置く予定

## このゲームならでは：ルーン

試合開始30秒後から40秒ごとに、左右どちらかの**橋の上にルーン**（紫に光る石）が現れます。
最初にユニットで触れた側が「ルーンの力」を得て、**次に出すカード1枚が強化**されます（HP・攻撃力・呪文のダメージ +35%）。

- 橋の上は両軍がぶつかる場所なので、「守りに専念する」か「安いユニットでルーンを取りに行く」かの判断が生まれます
- 強化したタンクで押し込む・強化した呪文でタワーを削るなど、取ったあとの使い方にも駆け引きがあります
- どちらの橋に出るかはシードから決まるので、リプレイやオンライン対戦でも全員で同じになります
- 数値は `packages/sim/data/rules.json` の `rune` で調整できます（BOT の「ふつう」「むずかしい」も取りに来ます）

## 動かし方

```bash
cd cardbattle
npm install
npm run dev          # http://localhost:5173 を開く（BOT 戦・練習・リプレイ。スマホからは同じLANのIPで）
```

オンライン対戦を試すときは、クライアントをビルドしてゲームサーバーから配信します。

```bash
npm run build
npm run server       # http://localhost:8787 を2つのブラウザ（またはPCとスマホ）で開き、両方で「対戦」を押す
```

- ホーム：名前の変更、トロフィー、対戦（ランダムマッチ。10秒で相手が見つからなければ BOT と対戦）、BOT 練習、デッキ、リプレイ
- カードは手札からアリーナへドラッグ。タップでカードを選び、アリーナをタップしても置けます。PC では 1〜4 キーでも選べます
- 対戦の結果はトロフィーが ±30（0未満にはならない）。BOT 練習は増減なし
- 直近5試合のリプレイを端末に保存し、ホームの「リプレイ」から再生できます
- スマホでは「共有 → ホーム画面に追加」でアプリのように全画面で遊べます（PWA）

## 公開（Render）

リポジトリのルートにある `render.yaml` で、ゲームサーバーとクライアント配信を1つの Web サービスとして作れます。
Render の Dashboard → New → Blueprint でこのリポジトリを選ぶと、`npm run build` → `npm run server` で起動します（WebSocket は `/ws`、死活監視は `/healthz`）。
無料プランは15分アクセスがないと停止し、次のアクセスで起動に数十秒かかります。

素材について：Quaternius・Kenney（CC0）と M PLUS Rounded 1c（OFL、使う文字だけに軽量化）を加工したものは git に含めています。
LAYERLAB のカード枠と魔王魂の BGM は再配布できないため含めていません（無い場合、カード枠はレアリティ色の線、BGM は無音になります）。
これらも使うときは、素材を `cardbattle/thirdparty/` に置いて次を実行してから、ビルド・デプロイしてください。

```bash
npm run assets:prepare   # 使う素材を選んで加工し packages/client/public/assets/game/ に出力
npm run dev              # 別のターミナルで起動したまま
npm run assets:capture   # ユニット・建物のカード絵を撮影（変更したときだけ）
```

GLB を配信できない場所（claude.ai のアーティファクトなど）に置くときは、ビルド後に
`node tools/assets/package-static.mjs packages/client/dist` でモデルを .json の glTF に変換します。

デバッグ用の URL オプション：

| オプション | 内容 |
|---|---|
| `?renderer=webgl` | WebGL2 で描画する（WebGPU の不具合の切り分け用） |
| `?quality=low` / `high` | 画質（指定しないとスマホは軽量、PC は高画質＝ブルームあり） |
| `?fps` | フレームレート・ドローコール数・三角形数を表示 |
| `?speed=4` | オフラインの試合を4倍速で進める |
| `?server=wss://...` | オンライン対戦の接続先を変える |

## テスト・調整

```bash
npm test                              # ルール・配置・タワー・リプレイ一致・カードの相性・オンライン同期・切断のテスト
npm run simulate -- 50 hard normal    # BOT同士を50試合させて勝率・カード使用数を出す
npx tsx packages/sim/test/matchups.ts # カード同士の相性を1対1で確かめる
npm run typecheck
npm run build                         # packages/client/dist に静的ファイルを出力
```

## 構成

```
cardbattle/
  packages/sim/            ゲームロジック（ブラウザでもサーバーでも同じコードが動く）
    data/cards.json        カードの数値（HP・攻撃力・速度・射程…）
    data/rules.json        アリーナ・タワー・マナ・試合時間
    data/bots.json         BOT の難易度
    src/sim.ts             20tick/秒 の決定論的シミュレーション
    src/bot.ts             ルールベースの BOT
    src/session.ts         ネットワーク層との境界（MatchSession）・リプレイ
  packages/client/         three.js の描画・DOM の UI・入力
  packages/server/         オンライン対戦のゲームサーバー（WebSocket。ホストとしてコマンドを検証して配る）
  tools/assets/            素材の加工（prepare）・カード絵の撮影（capture）・静的配信用の変換
  thirdparty/              ダウンロードした未加工の素材（git には入れない）
  ASSETS_TODO.md           必要な外部素材と、足りないもの
  CREDITS.md               使った素材の一覧
```

### 設計の要点

- 座標は「ミリタイル」の整数（1タイル = 1000）。浮動小数点を状態に入れないので、どの端末でも同じ結果になる。
- クライアントが送るのは `DeployCommand`（カードID・配置位置・ティック番号）だけ。ホスト（オフラインでは自分の端末）が `tryAccept` でコスト・配置可能かを検証し、0.3秒後（6tick後）に実行する。
- 受理されたコマンド列を記録すればリプレイになる。同じ列を再生すると最後の状態ハッシュまで一致する（テストで確認）。
- BOT も人間と同じ `DeployCommand` を出すだけ。
- オンライン対戦はサーバーがホスト。受理したコマンドを tick ごとに配り、クライアントは同じシミュレーションをロックステップで進める。
  2秒ごとに状態ハッシュを送り、ずれを検出する。切断しても10秒以内に戻れば、受理済みのコマンド列から状態を作り直して続行（戻れなければ負け）。
- 数値はすべて `packages/sim/data/*.json` にあり、コードには書かない。
