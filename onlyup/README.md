# SKYWARD 天空登攀（Only Up! 系 3D 高所登りゲーム）

海に浮かぶ岩から宇宙まで、ガラクタを積み上げた **標高約1km の一本の塔** を登るブラウザ3Dゲームです。
**チェックポイントはありません。** 落ちたら、落ちた先からまた登ります。海に落ちるとスタートの岩へ戻ります。
PC（キーボード＋マウス）、スマホ（タッチ）、ゲームパッドで遊べます。クリアまでの目安は約1時間です。

## 起動方法

ビルドは不要です。ES Modules と import map を使っているため、**HTTP サーバー経由**で開いてください（`file://` では動きません）。

```bash
cd onlyup
npx http-server -c-1 .     # または: python3 -m http.server 8080
# → http://localhost:8080/ を開く
```

リポジトリ版は素材を各配布元（Poly Haven・GitHub・jsDelivr）から直接読み込みます。
下層の素材を読み込んだらすぐ遊べ、上層の素材は遊んでいる間に裏で読み込みます。

### claude.ai アーティファクト版

アーティファクトの中では、画像・音・モデルを外部サイトから読み込めません。そこで素材をすべてダウンロードして同梱した版を作ります。

```bash
NODE_USE_ENV_PROXY=1 node tools/build-artifact.mjs dist-artifact   # 約40MB・約210ファイル
```

外部URL と同梱ファイルの対応表（`window.SKYWARD_ASSETS`）がページに埋め込まれ、`js/assets.js` の `resolve()` が読み込み先を切り替えます。
ガラクタのモデル用テクスチャは 512px に縮小しています。

## 塔の構成（7ゾーン・約1000 m・足場 約690個）

| # | ゾーン | 主な素材 | 主なギミック |
|---|---|---|---|
| 1 | 潮騒の岩礁 | 岩・海岸の岩・ブイ | 基本のジャンプ、最初の綱渡り |
| 2 | 路地裏のガラクタ街 | 巨大な木箱・ドラム缶・段ボール・テレビ・配電盤、トタン小屋 | **電線の綱渡り**、**巨大扇風機**、**マットレス**、動く足場、昇降台 |
| 3 | 錆びた工業区 | パイプ・コンテナ・鉄格子の足場・スチール棚・タイヤ | **吊られた車**、**クレーンの腕（回転）**、薙ぎ払いバー |
| 4 | 崩れゆく都市 | コンクリート・レンガ・事務机・道路の切れ端 | **崩れる足場**、吊られた車 |
| 5 | 凍てつく雲海 | 雪・氷 | 滑る氷、突風、扇風機、マットレス。頂上で **雲海** を抜ける |
| 6 | 天空の神殿 | 大理石の柱・胸像・馬の像 | ほぼすべてのギミックの組み合わせ |
| 7 | 静かの軌道 | 月の岩・人工衛星・漂うガラクタ | **低重力**（高く遠くへ跳べる）、眼下に地球、星空 → ゴール |

- 下層の中心には、煉瓦・トタン → 鉄パイプ → コンクリートと積み上がる「塔の芯」が海から伸びています。
- 経路の周りには約360個のガラクタ（ソファ・椅子・工具箱・ガスボンベ・車など）を詰め込みました。塔の密度感を出すと同時に、落ちたときの受け皿にもなります。ジャンプの軌道には置かないようにしています。
- 足場は固定シード付きで手続き生成します。キャラクターのジャンプ物理（重力・初速・走る速さ、軌道では低重力）から届く距離を計算して配置しています。
  自動で跳ぶボットのテストでは、ギミックを含む足場どうしのジャンプ 362 組のうち 351 組が成功しました（失敗は、全速で跳んで小さな足場を飛び越える組み合わせが中心です）。

### ルール
- チェックポイントなしの一本勝負です。落ちたら、着地した場所から登り直します。
- 10 m 以上落ちると、落ちた高さを大きく表示し、落下回数と落ちた距離の合計を記録します。
- 最後に立っていた場所を自動で保存するので、中断しても「つづきから」で再開できます。

## 操作

| | PC | スマホ | ゲームパッド |
|---|---|---|---|
| 移動 | WASD / 矢印 | 画面左半分をドラッグ（仮想スティック） | 左スティック |
| ダッシュ | Shift | スティックを倒し切る / DASH ボタン | RT / LB |
| ジャンプ | Space（長押しで高く跳ぶ） | ▲ ボタン | A |
| カメラ | マウス（クリックでポインタロック）、ホイールでズーム | 画面右半分をドラッグ | 右スティック、十字キー上下でズーム |
| ポーズ | Esc / P | ❚❚ | Start |

## 使用技術

- **three.js r170** … PBR（MeshStandardMaterial＋ARMマップ）、HDRI による IBL（PMREM）、PCF ソフトシャドウ、`Water`（リアルタイム反射）、`Lensflare`、`InstancedMesh`（ガラクタ・風の筋・上昇気流）、静的な足場の結合（`mergeGeometries`）、高さ 60 m ごとの描画範囲の切り替え、描画レイヤーで水面反射から小物を除外
- **自作シェーダー** … 雲海（Perlin ノイズの fbm）、地球の大気の発光（フレネル）、星空のフェード、ビーム、マットレスの波紋、ポストエフェクト（落下時の放射ブラー・色収差・カラーグレーディング・ビネット）
- **HDRI の解析** … 画素を走査して太陽の方向と地平線の色を求め、光源とフォグの色を空に合わせています
- **Rapier（WebAssembly 物理）** … キネマティック・キャラクターコントローラー、キネマティック剛体（動く足場・吊られた車・クレーンの腕）、カプセル型のロープ、凸包コライダー（月の岩はモデル読み込み後に差し替え）、レイキャスト（足元の判定・カメラのめり込み防止）
- **人間キャラクター** … Mixamo リグの Soldier を使っています。待機・歩き・走りのアニメーションに、ジャンプ・落下（腕をばたつかせる）・綱渡り（両腕でバランスを取る）のポーズを、ボーンの回転として上乗せしています
- **GSAP**（UI演出）・**Howler.js**（BGM・効果音）・**nipplejs**（仮想スティック）・**lil-gui**（設定）・**simplex-noise**（岩の形状）・**stats.js**
- **Web API** … Pointer Lock、Gamepad（振動を含む）、Vibration、Fullscreen と Screen Orientation、Screen Wake Lock、Page Visibility、Web Share／Clipboard、localStorage、Service Worker と PWA マニフェスト（リポジトリ版のみ）
- **動的解像度** … フレーム時間に合わせてピクセル比を自動で調整します。画質は 低・中・高 の3段階で、スマホでは「低」が初期値です

## 外部素材

| 種類 | 素材 | 提供元 / ライセンス |
|---|---|---|
| PBR テクスチャ | rock_wall_10, coast_sand_rocks_02, weathered_planks, blue_painted_planks, painted_metal_shutter, denim_fabric, rusty_metal_02, red_brick_03, corrugated_iron_02, metal_grate_rusty, concrete_wall_008, snow_02, marble_01 | [Poly Haven](https://polyhaven.com) / CC0 |
| HDRI | kloofendal_48d_partly_cloudy_puresky | Poly Haven / CC0 |
| ガラクタの3Dモデル（21種） | ocean_buoy, wooden_crate_01, Barrel_01, cardboard_box_01, utility_box_02, Television_01, Sofa_01, ArmChair_01, ceiling_fan, barrel_03, metal_tool_chest, steel_frame_shelves_01, propane_tank, old_tyre, covered_car, metal_office_desk, marble_bust_01, horse_statue_01, moon_rock_01/03/05 | Poly Haven / CC0 |
| 氷テクスチャ | Ice002 | ambientCG / CC0（three.js examples 経由） |
| 主人公 | Soldier.glb | three.js examples（Mixamo） |
| 地球・星空・ノイズ・水面・雲・火花 | earth_atmos_2048, earth_clouds_1024, MilkyWay, perlin noise, waternormals, smoke1, spark1 | three.js examples |
| レンズフレア | lensflare0/3.png | three.js examples（ROME, CC BY-NC-SA 3.0） |
| BGM | Project Utopia (congusbongus) | OpenGameArt / CC0 |
| 効果音 | uisfx 0.4.0 | MIT |
| フォント | Bebas Neue, Zen Kaku Gothic New | Google Fonts / OFL |

モデルの一覧（URLと依存ファイル）は `tools/gen-asset-list.py` で Poly Haven API から生成しています（`js/asset-models.js`）。

## ファイル構成

```
onlyup/
├── index.html / css/style.css
├── js/
│   ├── main.js          # 起動・ゲームループ・ルール・UI
│   ├── asset-data.js    # 外部素材の一覧（テクスチャ・モデル・音）と計測済みの寸法
│   ├── asset-models.js  # Poly Haven モデルのURL（自動生成）
│   ├── assets.js        # ローダー・URL解決・HDRI解析
│   ├── materials.js     # PBRマテリアル・実寸ボックス投影UV・自作シェーダー
│   ├── props.js         # ガラクタの配置・インスタンス描画・コライダー
│   ├── level.js         # 塔の生成・ギミック
│   ├── player.js        # キャラクター制御・手続き的ポーズ
│   ├── camera.js / input.js / fx.js / audio.js / save.js
├── tools/
│   ├── gen-asset-list.py    # Poly Haven API → asset-models.js
│   └── build-artifact.mjs   # 素材を同梱したアーティファクト版を生成
├── sw.js / manifest.webmanifest
```
