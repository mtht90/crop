# Phase 3: 抽選ロジック・保留システム・変動フロー

## 設計原則(Phase -1リサーチの反映)

**「結果を先に確定させ、演出はあとから選ぶ」**という業界標準の処理順序を、
クラス構成そのもので強制する設計にした。

- `LotterySystem.draw()` は**始動チャッカー入賞の瞬間に1回だけ**呼ばれ、`LotteryResult`
  (当落・大当たり種別・確変突入可否)を確定させる。
- 確定した`LotteryResult`は`HoldSlot`として`HoldQueue`にそのまま保存される
  (=保留に入った時点で、実は当否はもう決まっている)。
- `SpinController`は保留を1つ消化して`spin_duration_sec`待つだけで、抽選には一切関与しない。
  演出選択(Phase4で実装する`EffectSelector`)は、この確定済み`LotteryResult`を**引数として
  受け取る側**であり、抽選結果を書き換えたり後から変えたりすることは構造上できない。

## クラス構成

| ファイル | 役割 |
|---|---|
| `resources/lottery/jackpot_type_def.gd` | 大当たり種別1つ分の定義(Resource) |
| `resources/lottery/probability_table.gd` | 確率テーブル本体(Resource)。種別の重み付き抽選も持つ |
| `resources/lottery/default_probability_table.tres` | 3.2節の仮パラメータ(1/319, 1/99等)を実データ化したもの |
| `scripts/lottery/GameMode.gd` | 通常/時短/確変の列挙(共有定義) |
| `scripts/lottery/LotteryResult.gd` | 1回の変動分の確定済み抽選結果 |
| `scripts/lottery/LotterySystem.gd` | 内部抽選本体。`RandomNumberGenerator`をシード指定可能にし、テスト時に結果を再現できるようにした |
| `scripts/lottery/HoldSlot.gd` / `HoldQueue.gd` | 保留(最大4)のFIFOキュー |
| `scripts/lottery/GameState.gd` | 確率モードと時短残数・累計出玉を保持し、状態遷移を管理 |
| `scripts/lottery/SpinController.gd` | 変動フロー(保留消化→待機→結果通知) |
| `scripts/lottery/JackpotController.gd` | 大当たり中のラウンド消化・出玉加算・状態遷移トリガー |
| `scripts/GameManager.gd` | 上記すべてを結線し、始動チャッカー入賞をトリガーに抽選を実行するオーケストレーター |

## 数値パラメータ(3.2節準拠、仮値)

`default_probability_table.tres`:

| 項目 | 値 |
|---|---|
| 通常時大当たり確率 | 1/319 |
| 確変中大当たり確率 | 1/99 |
| 時短回数 | 100 |
| 大当たり種別 | 通常4R(重み45・確変突入50%) / 通常8R(重み30・確変突入50%) / 確変16R(重み25・確変突入100%) |

## この段階で意図的に近似・省略している箇所(TODO)

- **変動時間**: 現状`spin_duration_sec`(3秒)固定。実機はリーチ有無・SPリーチ種別で大きく
  変わる。Phase4で演出選択結果に応じた可変時間にする。
- **ラウンド時間・出玉計算**: `round_duration_sec`(1.5秒)+`payout_per_round`(75発)の
  固定値で近似している。実機は大入賞口(アタッカー)の物理的な開閉時間と実際の入賞球数で
  決まる。Phase 4/6で盤面にAttacker用の`Area2D`を追加し、物理ベースの出玉計算に置き換える
  必要がある(README/このドキュメントに明記した既知の制約)。
- **保留色(先読み予告)**: `LotteryResult`は既に確定しているため予告演出の元データとしては
  十分だが、色への変換テーブル自体はPhase4の演出システムで実装する。

## デバッグ表示

`GameManager._update_debug_label()`で以下を常時表示する:
発射数/入賞数/保留数、現在の状態(通常/時短(残n)/確変)、累計出玉、直近の変動結果
(変動中/大当たり!/ハズレ)、ラウンド消化状況。これは3.4節が要求する
「内部抽選結果を確認できるデバッグモード」の第一段階であり、Phase4で
「選ばれた演出」も並べて表示できるように拡張する。

## 未検証事項

このリポジトリの開発環境にはGodotエディタ本体が無いため、`await`を使った
`JackpotController._run_jackpot()`のコルーチン動作や、`HoldQueue`のシグナル接続による
自動連鎖(`try_advance()`)は**コード上の整合性確認のみ**で、実機での動作確認は
まだ行っていない。次にGodotが使える環境で、連続入賞→保留4個消化→大当たり→
ラウンド消化→時短/確変移行、の一連の流れを実際に動かして確認すること。
