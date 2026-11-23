# あさなぎ水切り

朝焼けの湖で石を投げて、何回跳ねるかを競う3D水切りゲームです。スマホのブラウザ向け（PCではマウスのドラッグで遊べます）。

## 遊び方

- **上へはじく**と投げる。速くはじくほど遠くへ飛び、左右にはじくと向きが変わる
- **最初の着水の出来**で Nice ×1.5 / Great ×2 / Excellent ×3。入水角が約20°に近い（はじく強さがちょうどいい）ほど、石が安定している（まっすぐきれいにはじく・回転がある）ほど良い判定になる
- 投げる前に指で**くるくる回す**と回転が溜まる。回した量と速さで溜まり方が変わり、強いほど大きくカーブし、長く跳ねても崩れにくくなる。ただし回すとはじきが乱れやすく、得点の倍率はない（曲げて金色の輪を拾うための道具）。回す向きでカーブの向きが変わる
  - 溜まるほど重くなる（速く回して約6周で満タン）。回すのを止めると回転はだんだん抜ける（約0.45秒で半分）
  - 回しすぎると石が暴れて、曲がりすぎたり早く沈んだりする
- 沖に浮かぶ**金色の光の輪**の中で跳ねると +250
- 5投の合計で勝負。跳ねるたびに1回の点が少しずつ（1.09倍ずつ）増えていき、上限はない。Excellent が続くと連続ボーナス

### 得点

| 項目 | 点数 |
|---|---|
| スキップ | 1回目 15点、そこから毎回1.09倍ずつ増える（上限なし） |
| 飛距離 | 1m あたり 6点 |
| 光の輪 | 1個 250点 |
| 倍率 | 着水の判定 × 連続Excellent |

ふつうに遊ぶと1投 400〜3,500点、傾き・回転・強さが全部ハマると1投1.3〜1.8万点くらいまで伸びます。

## 動かし方

ビルドは不要です。静的ファイルとして配信すれば動きます。

```sh
cd skip-stone
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

three.js は jsDelivr から読み込みます（`index.html` の importmap）。

## ファイル

| ファイル | 内容 |
|---|---|
| `src/physics.js` | 石の物理（入水角・速度減衰・回転・ぐらつき）と得点計算。three.js に依存しない |
| `src/input.js` | スワイプ入力（はじく速さ・向き、回転の検出） |
| `src/world.js` | 空・水面・岸辺・岩・距離ブイ |
| `src/fx.js` | しぶき・波紋・軌跡・判定リング・光の輪 |
| `src/audio.js` | 効果音と環境音（Web Audio） |
| `src/main.js` | ゲームの流れ・カメラ・HUD |

調整したいときは `src/physics.js` の `TUNING` を変えます。

## 素材（すべて CC0）

| 素材 | 出典 |
|---|---|
| 空・環境光 | [Poly Haven – Lakeside Sunrise](https://polyhaven.com/a/lakeside_sunrise)（手前の枯れ木を消して切り出し） |
| 石の質感 | [Poly Haven – Rock Surface](https://polyhaven.com/a/rock_surface) |
| 岸辺の小石 | [Poly Haven – River Small Rocks](https://polyhaven.com/a/river_small_rocks) |
| 岩のモデル | [Poly Haven – Rock 07](https://polyhaven.com/a/rock_07)（JSON に変換） |
| 水しぶき・泡 | [OpenGameArt – 40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx)（rubberduck） |
| 投げる音 | [OpenGameArt – Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack)（artisticdude） |
| 判定の音 | [OpenGameArt – Bell dings/chimes](https://opengameart.org/content/bell-dingschimes)（PWL） |
| 鳥の声 | [OpenGameArt – Ambient Bird Sounds](https://opengameart.org/content/ambient-bird-sounds)（isaiah658） |
| 水辺の環境音 | [OpenGameArt – Park ambiences](https://opengameart.org/content/park-ambiences)（Thimras） |
| 水面の法線マップ | three.js examples の `waternormals.jpg`（MIT） |
| フォント | Google Fonts – Baloo 2 / M PLUS Rounded 1c（OFL） |
