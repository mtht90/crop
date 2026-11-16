# 麺屋インク

一杯のラーメン屋から世界チェーンを目指す、経営×放置インクリメンタルゲーム。
`index.html` をブラウザで開くだけで遊べます（ビルド不要）。

## 遊び方

- **店舗** — エリアに進出して出店。席・内装・スタッフ数を調整し、店長を置く
- **メニュー** — 価格と素材ランクを決める。安くて良いほど評判が上がり、利益率は下がる
- **人材** — 店長候補（接客 / 効率 / 節約 / 集客）を採用して店に配属
- **宣伝** — 知名度を上げて客を増やす
- **研究** — 新メニューや設備を解禁
- **財務** — 損益・融資・上場・次の都市への進出（のれんを得て最初から）

エリアごとに人通り・所得・家賃・競合・売れ筋が違い、価格はチェーン全体で共通です。
閉じている間も店は営業し、戻ると放置収益を受け取れます。

## 構成

| ファイル | 役割 |
| --- | --- |
| `js/data.js` | メニュー・エリア・研究などの定義 |
| `js/sim.js` | 経営シミュレーション（DOM非依存、Nodeでも動く） |
| `js/ui.js` | マップと各タブの描画 |
| `js/main.js` | 入力・ゲームループ・セーブ・サウンド |
| `js/icons.js` | `tools/build-assets.mjs` が生成するアイコンデータ |

## 使用素材

| 素材 | 作者 | ライセンス |
| --- | --- | --- |
| BGM "Bossa Antigua" / "Lobby Time" | Kevin MacLeod (incompetech.com) | CC BY 4.0 |
| 効果音 UI Sound Effects Library | Little Robot Sound Factory | CC BY 3.0 |
| 効果音 Inventory Sound Effects | artisticdude (opengameart.org) | CC BY 3.0 |
| 効果音 Picked Coin Echo 2 | abd (opengameart.org) | CC BY 3.0 |
| アイコン Phosphor Icons (duotone) | Phosphor Icons | MIT |
| ポートレート Micah（DiceBearで生成） | Micah Lanier | CC BY 4.0 |
| フォント Dela Gothic One / M PLUS Rounded 1c | artakana / Coji Morishita ほか | SIL OFL 1.1 |

音声は元ファイルから切り出し・再エンコードしています。Phosphor Icons のライセンス全文は `LICENSE-phosphor.txt` にあります。
