# Rune Arena（ルーン・アリーナ）

ブラウザで遊べるリアルタイム1v1カードバトル。スマホ（縦画面・タッチ）と PC（マウス）の両方で動きます。

- 描画：three.js（WebGPU、使えない環境では自動で WebGL2）＋ TypeScript ＋ Vite
- ゲームの計算：DOM や描画に依存しない純粋な TypeScript（`packages/sim`）
- オンライン対戦（マイルストーン4）：Node.js の WebSocket ホストサーバーを Render に置く予定

## 動かし方

```bash
cd cardbattle
npm install
npm run dev        # http://localhost:5173 を開く（スマホからは同じLANのIPで）
```

素材（3Dモデル・UI・効果音・フォント）は git に含めていません。無い場合は仮の図形で動きます。
素材を使うときは、ASSETS_TODO.md の一覧の素材を `cardbattle/thirdparty/` に置いてから：

```bash
npm run assets:prepare   # 使う素材を選んで加工し packages/client/public/assets/game/ に出力
npm run dev              # 別のターミナルで起動したまま
npm run assets:capture   # ユニット・建物のカード絵を撮影
```

GLB を配信できない場所（claude.ai のアーティファクトなど）に置くときは、ビルド後に
`node tools/assets/package-static.mjs packages/client/dist` でモデルを JSON 形式の glTF に変換します。

- タイトル画面で BOT の難易度（かんたん／ふつう／むずかしい）を選ぶと対戦が始まります。
- カードを手札からアリーナへドラッグして配置します。タップでカードを選び、アリーナをタップしても置けます。PC では 1〜4 キーでも選べます。
- 試合が終わったら「リプレイを見る」で同じ試合を再生できます。

デバッグ用の URL オプション：

| オプション | 内容 |
|---|---|
| `?renderer=webgl` | WebGL2 で描画する（WebGPU の不具合の切り分け用） |
| `?speed=4` | 試合を4倍速で進める |

## テスト・調整

```bash
npm test                              # ルール・配置・タワー・リプレイ一致などのテスト
npm run simulate -- 50 hard normal    # BOT同士を50試合させて勝率・カード使用数を出す
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
- 数値はすべて `packages/sim/data/*.json` にあり、コードには書かない。
