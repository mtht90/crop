# あさなぎ水切り

朝焼けの湖で石を投げて、何回跳ねるかを競う3D水切りゲームです。スマホのブラウザ向け（PCではマウスのドラッグで遊べます）。

## 遊び方

- **上へはじく**と投げる。速くはじくほど遠くへ飛び、左右にはじくと向きが変わる
- 水面の**リングが小さい瞬間**に投げると石の傾きがよくなり、よく跳ねる。最初の着水が輪の中なら Nice ×1.2 / Great ×1.5 / Excellent ×2.0
- 投げる前に指で**くるくる回す**と回転が溜まる。回した量と速さで溜まり方が変わり、強いほど大きくカーブして安定して長く跳ねる（得点は最大 ×1.4）。回す向きでカーブの向きが変わる
  - 回すのを止めると回転はだんだん抜ける（約0.45秒で半分）。回しながらそのままはじくのがコツ
  - 回しすぎると石が暴れて、曲がりすぎたり早く沈んだりする
- 沖に浮かぶ**金色の光の輪**の中で跳ねると +250
- 5投の合計で勝負。Excellent が続くと連続ボーナス

### 得点

| 項目 | 点数 |
|---|---|
| スキップ | 1回目 10点、以後 1回ごとに +4点ずつ増える |
| 飛距離 | 1m あたり 6点 |
| 光の輪 | 1個 250点 |
| 倍率 | 判定 × カーブ（回転量に応じて ×1.0〜1.4）× 連続Excellent |

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
