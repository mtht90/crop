# SKYWARD — 天空登攀（Only Up! 系 3D 高所登りゲーム）

ブラウザで遊べる3Dの高所登りゲームです。海に浮かぶ岩礁からスタートし、足場を渡りながら、雲の上にある「天空の神殿」を目指します。
PC（キーボード＋マウス）、スマホ（タッチ）、ゲームパッドで遊べます。

## 起動方法

ビルドは不要です。ES Modules と import map を使っているため、**HTTP サーバー経由**で開いてください（`file://` では動きません）。

```bash
cd onlyup
npx http-server -c-1 .     # または: python3 -m http.server 8080
# → http://localhost:8080/ を開く
```

GitHub Pages などの静的ホスティングに `onlyup/` を置くだけでも動きます（HTTPS なら Service Worker が有効になり、2回目以降はオフラインでも起動します）。

## ステージ構成（標高 約190 m・足場 約180個）

| # | ゾーン | 素材 | 主なギミック |
|---|---|---|---|
| 1 | 潮騒の岩礁 | 岩・海岸の岩 | 基本のジャンプ |
| 2 | 朽ちた足場 | 古い板材 | 細い梁、支柱付き足場、**動く足場**、**エレベーター** |
| 3 | 錆びた工業区 | 錆びた鉄・波板 | 丸いパイプ、コンテナ、**回転梁**、**薙ぎ払いバー** |
| 4 | 崩れゆく都市 | コンクリート・レンガ | **崩れる足場**（乗って約0.9秒で落下し、4.5秒後に復活）、傾いた石板 |
| 5 | 凍てつく雲海 | 雪・氷 | **滑る氷**、**突風**（空中で横に流される） |
| 6 | 天空の神殿 | 大理石 | 円柱、**ジャンプパッド**、すべてのギミックの総仕上げ → ゴール |

- 各ゾーンの入口に**ビーコン（チェックポイント）**があります。ゾーンが進むほど、足場の間隔と高低差が少しずつ大きくなります。
- ステージは固定シード付きで手続き生成されます。キャラクターのジャンプの物理（重力・初速・走る速さ）から届く距離を計算し、その範囲内に足場を置いているので、必ずクリアできる配置になります。

### 難易度
- **かんたん** … 二段ジャンプあり、22 m 以上落ちると直前の足場へ自動で戻る、チェックポイントあり
- **ふつう** … チェックポイントあり。海に落ちると最後のチェックポイントへ戻る
- **ONLY UP** … チェックポイントなし。海に落ちたらスタートからやり直し

進行状況（最後に立っていた安全な足場・タイム・落下回数）は自動で保存され、「つづきから」で再開できます。

## 操作

| | PC | スマホ | ゲームパッド |
|---|---|---|---|
| 移動 | WASD / 矢印 | 画面左半分をドラッグ（仮想スティック） | 左スティック |
| ダッシュ | Shift | スティックを倒し切る / DASH ボタン | RT / LB |
| ジャンプ | Space（長押しで高く跳ぶ） | ▲ ボタン | A |
| カメラ | マウス（クリックでポインタロック）、ホイールでズーム | 画面右半分をドラッグ | 右スティック、十字キー上下でズーム |
| チェックポイントへ | R | ⟲ | Y |
| ポーズ | Esc / P | ❚❚ | Start |

## 使用技術

- **three.js r170** … PBR（MeshStandardMaterial＋ARMマップ）、HDRI による IBL（PMREM）、PCF ソフトシャドウ、`Water`（リアルタイム反射の水面）、`Lensflare`、`InstancedMesh`（風の筋）、スプライトの雲・パーティクル
- **HDRI の解析** … HDR の画素を走査して太陽の方向と地平線の色を求め、平行光源・水面のハイライト・フォグの色を空に合わせています
- **自作シェーダー** … 旗のはためき（`onBeforeCompile` で頂点シェーダーに注入）、ビーコン光柱、ジャンプパッドの波紋、ポストエフェクト（落下時の放射ブラー・色収差・カラーグレーディング・ビネット）
- **ポストプロセス** … EffectComposer + UnrealBloom + OutputPass + SMAA + 独自のグレーディングパス
- **Rapier（WebAssembly 物理）** … キネマティック・キャラクターコントローラー（段差の自動乗り越え・坂・地面への吸着）、キネマティック剛体で動く足場、レイキャスト（地面の判定とカメラのめり込み防止）、凸包コライダー
- **GSAP** … UI アニメーション ／ **Howler.js** … BGM・効果音 ／ **nipplejs** … 仮想スティック ／ **lil-gui** … 設定画面 ／ **simplex-noise** … 岩の形状生成 ／ **stats.js** … FPS 表示
- **Web API** … Pointer Lock、Gamepad（振動を含む）、Vibration、Fullscreen と Screen Orientation、Screen Wake Lock、Page Visibility（タブを切り替えると自動でポーズ）、Web Share／Clipboard、localStorage、Service Worker と PWA マニフェスト
- **動的解像度** … フレーム時間を監視してピクセル比を自動で調整します。画質は 低・中・高 の3段階で、スマホでは「低」が初期値です

## 外部素材（すべて外部ホストから読み込み）

| 種類 | 素材 | 提供元 / ライセンス |
|---|---|---|
| PBR テクスチャ | rock_wall_10, coast_sand_rocks_02, weathered_planks, rusty_metal_02, corrugated_iron_02, concrete_wall_008, red_brick_03, snow_02, marble_01 | [Poly Haven](https://polyhaven.com) / CC0 |
| HDRI | kloofendal_48d_partly_cloudy_puresky | Poly Haven / CC0 |
| 氷テクスチャ | Ice002 | ambientCG / CC0（three.js examples 経由） |
| キャラクター | RobotExpressive | Tomás Laulhé / CC0（three.js examples 経由） |
| 水面法線・雲・火花 | waternormals.jpg, smoke1.png, spark1.png | three.js examples |
| レンズフレア | lensflare0/3.png | three.js examples（ROME, CC BY-NC-SA 3.0） |
| BGM | Project Utopia (congusbongus) | OpenGameArt / CC0 |
| 効果音 | uisfx 0.4.0 | MIT |
| フォント | Bebas Neue, Zen Kaku Gothic New | Google Fonts / OFL |

ライブラリは jsDelivr、テクスチャと HDRI は dl.polyhaven.org、モデル・一部のテクスチャ・BGM は raw.githubusercontent.com から読み込みます。初回は約 20 MB をダウンロードします。

## ファイル構成

```
onlyup/
├── index.html            # UI・import map
├── css/style.css
├── js/
│   ├── main.js           # 起動処理・ゲームループ・進行・UI
│   ├── assets.js         # 外部素材のURL、ローダー、HDRI解析
│   ├── materials.js      # PBRマテリアル、実寸ボックス投影UV、自作シェーダー
│   ├── level.js          # ステージ生成・ギミック・チェックポイント・ゴール
│   ├── player.js         # キャラクターコントローラー・アニメーション
│   ├── camera.js         # 三人称カメラ
│   ├── input.js          # キーボード／マウス／タッチ／ゲームパッド
│   ├── fx.js             # 空・水・雲・影・パーティクル・ポストエフェクト
│   ├── audio.js          # Howler
│   └── save.js           # セーブ・記録
├── sw.js                 # Service Worker
└── manifest.webmanifest
```
