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
NODE_USE_ENV_PROXY=1 node tools/build-artifact.mjs dist-artifact   # 約100MB・約350ファイル
```

外部URL と同梱ファイルの対応表（`window.SKYWARD_ASSETS`）がページに埋め込まれ、`js/assets.js` の `resolve()` が読み込み先を切り替えます。
ガラクタのモデル用テクスチャは 512px に縮小しています。

## 塔の構成（本家 Only Up! の流れに沿った 12 エリア・約1000 m）

| # | エリア | 主な素材・セットピース | 主なギミック |
|---|---|---|---|
| 1 | スラムのゴミ山 | トタン小屋の列、ゴミの山、非常階段、ゴミ袋・ソファ・テレビ | ベッドで跳ねる、動く足場、電線 |
| 2 | 線路と貨物列車 | 線路の高架橋、走る貨物列車、枕木 | **列車の屋根**・**トロッコ**に乗って渡る |
| 3 | 危険物の工場 | 配管の連なり、キャットウォーク、タンク群 | **ベルトコンベア**、回転アーム、薙ぎ払いバー、扇風機、昇降台 |
| 4 | 地下鉄 | タイル張りのホームと車両 | 動く足場、崩れる足場 |
| 5 | 工事現場 | 積み上がったコンテナ、足場（よじ登り） | **回るクレーン**、吊られた鉄骨 |
| 6 | 崩れた高架道路 | 道路の切れ端、ガードレール、バス | 走る車両、崩れる足場 |
| 7 | ショッピングモール | 売り場の床、エスカレーター、陳列棚・レジ | **罠のエレベーター**（上がってから落ちる） |
| 8 | 観覧車 | 回り続ける観覧車 | **ゴンドラを乗り継いで上へ** |
| 9 | 金ピカの社長室 | 金の床と柱、シャンデリア、事務机 | 昇降台 |
| 10 | ビルの配管と階段 | 外壁の窓枠（よじ登り）、非常階段、室外機 | 扇風機 |
| 11 | 天国への階段 | 雲の上の大理石の階段、彫像 | トランポリン、回る足場。頂上で **雲海** を抜ける |
| 12 | 宇宙とブラックホール | 月の岩、人工衛星、漂うガラクタ | **低重力**、眼下に地球、彼方にブラックホール → 宇宙船でゴール |

- エリアごとに大きな「セットピース」（小屋の列・列車・コンテナの山・観覧車など）を組み立て、その間を単発の足場でつなぎます。セットピースは、角を丸めた箱・管・階段・手すり・窓枠などの部品と、実物の3Dモデルを組み合わせた構造物です。
- **縁つかみ → よじ登り**：届かない段差も、跳んで壁の縁をつかめば登れます。低い段差は勢いのまま乗り越えます。
- 足場は固定シード付きで手続き生成します。キャラクターのジャンプ物理（重力・初速・走る速さ・軌道の低重力）から届く距離を計算して配置し、部品どうしが重ならないよう高さ 8 m ごとの占有グリッドで判定しています。
- 経路の周りには約1000個のガラクタを詰め込み、遠くには岩盤ごと浮かぶ街の欠片を置いています。

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
| よじ登る | 縁をつかんだら W / Space（S で離す） | ▲ / 壁へスティック | A / 左スティック |
| カメラ | マウス（クリックでポインタロック）、ホイールでズーム | 画面右半分をドラッグ | 右スティック、十字キー上下でズーム |
| ポーズ | Esc / P | ❚❚ | Start |

## 使用技術

- **three.js r170** … PBR（MeshStandardMaterial＋ARMマップ）、HDRI による IBL（PMREM）、PCF ソフトシャドウ、**GTAO**（スクリーンスペースの環境遮蔽・高画質のみ）、`Water`（リアルタイム反射）、`Lensflare`、`InstancedMesh`（ガラクタ・風の筋・上昇気流）、静的な足場の結合（`mergeGeometries`）、高さ 60 m ごとの描画範囲の切り替え、描画レイヤーで水面反射から小物を除外
- **質感** … 実寸に合わせたボックス投影UV、頂点カラーで焼き込んだ擬似AO（下ほど暗い）と部品ごとの色ばらつき、ワールド座標のノイズで汚れを重ねるシェーダー注入（`onBeforeCompile`）
- **meshoptimizer（WebAssembly）** … 何百個も並べる小物モデルを、読み込み時に約3000ポリゴンへ間引いてからインスタンス描画
- **自作シェーダー** … ブラックホール（降着円盤と光のリング）、着地点の影、雲海（Perlin ノイズの fbm）、地球の大気の発光（フレネル）、星空のフェード、ビーム、マットレスの波紋、ポストエフェクト（落下時の放射ブラー・色収差・カラーグレーディング・ビネット）
- **HDRI の解析** … 画素を走査して太陽の方向と地平線の色を求め、光源とフォグの色を空に合わせています
- **Rapier（WebAssembly 物理）** … キネマティック・キャラクターコントローラー、キネマティック剛体（動く足場・吊られた車・クレーンの腕）、カプセル型のロープ、凸包コライダー（月の岩はモデル読み込み後に差し替え）、レイキャスト（足元の判定・カメラのめり込み防止）
- **人間キャラクター** … Mixamo リグの Soldier を使っています。待機・歩き・走りのアニメーションに、ジャンプ・落下（腕をばたつかせる）・綱渡り（両腕でバランスを取る）・ぶら下がり・よじ登りのポーズを、ボーンの回転として上乗せしています
- **GSAP**（UI演出）・**Howler.js**（BGM・効果音）・**nipplejs**（仮想スティック）・**lil-gui**（設定）・**simplex-noise**（岩の形状）・**stats.js**
- **Web API** … Pointer Lock、Gamepad（振動を含む）、Vibration、Fullscreen と Screen Orientation、Screen Wake Lock、Page Visibility、Web Share／Clipboard、localStorage、Service Worker と PWA マニフェスト（リポジトリ版のみ）
- **動的解像度** … フレーム時間に合わせてピクセル比を自動で調整します。画質は 低・中・高 の3段階で、スマホでは「低」が初期値です

## 外部素材

| 種類 | 素材 | 提供元 / ライセンス |
|---|---|---|
| PBR テクスチャ（35種） | rock_wall_10, coast_sand_rocks_02, weathered_planks, blue_painted_planks, painted_metal_shutter, denim_fabric, rusty_metal_02, red_brick_03, corrugated_iron_02, metal_grate_rusty, concrete_wall_008, snow_02, marble_01, plastered_wall_03, rusty_corrugated_iron, gravel_floor, box_profile_metal_sheet, square_tiled_wall, terrazzo, raw_plank_wall, rusty_painted_metal, asphalt_02, clay_roof_tiles, concrete_tile_facade, dirty_carpet, metal_plate_02 ほか（一覧は `js/asset-data.js`） | [Poly Haven](https://polyhaven.com) / CC0 |
| HDRI | kloofendal_48d_partly_cloudy_puresky | Poly Haven / CC0 |
| 3Dモデル（38種） | ocean_buoy, wooden_crate_01, Barrel_01, cardboard_box_01, utility_box_02, Television_01, Sofa_01, ArmChair_01, ceiling_fan, barrel_03, metal_tool_chest, steel_frame_shelves_01, propane_tank, old_tyre, covered_car, metal_office_desk, marble_bust_01, horse_statue_01, moon_rock_01/03/05, trashbag, exterior_aircon_unit, vintage_day_bed, rollershutter_door, modular_industrial_pipes_01, plastic_crate_01, cement_bag, street_lamp_01, CashRegister_01, wooden_display_shelves_01, CoffeeCart_01, modern_arm_chair_01, Chandelier_01, classic_laptop, drawer_cabinet, gothic_statue, vintage_spacecraft_instrument | Poly Haven / CC0 |
| 氷テクスチャ | Ice002 | ambientCG / CC0（three.js examples 経由） |
| 主人公 | Soldier.glb | three.js examples（Mixamo） |
| 地球・星空・ノイズ・水面・雲・火花 | earth_atmos_2048, earth_clouds_1024, MilkyWay, perlin noise, waternormals, smoke1, spark1 | three.js examples |
| レンズフレア | lensflare0/3.png | three.js examples（ROME, CC BY-NC-SA 3.0） |
| BGM | Project Utopia (congusbongus) | OpenGameArt / CC0 |
| 効果音 | uisfx 0.4.0 | MIT |
| ポリゴン削減 | meshoptimizer 0.22 | MIT |
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
│   ├── kit.js           # セットピースの部品（箱・管・階段・窓）と12エリアの構造物
│   ├── player.js        # キャラクター制御・手続き的ポーズ
│   ├── camera.js / input.js / fx.js / audio.js / save.js
├── tools/
│   ├── gen-asset-list.py    # Poly Haven API → asset-models.js
│   └── build-artifact.mjs   # 素材を同梱したアーティファクト版を生成
├── sw.js / manifest.webmanifest
```
