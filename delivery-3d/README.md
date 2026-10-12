# あおば町 宅配日誌 3D

地方都市〜郊外の町「あおば町」を舞台にした、宅配ドライバーの仕事シミュレーターです。
Euro Truck Simulator のように自分で軽バンを運転しつつ、営業所での荷物確認・積み込み、配達先でのインターホン・手渡し・置き配・不在票まで、体を動かして段取りよく仕事を進めることを楽しむゲームです。

## 町について

町の形は、実在する地方都市の郊外（栃木県宇都宮市東部の約 880m × 740m）を OpenStreetMap の地図データから取り込んでいます。
曲がった道・T字路・袋小路・一方通行の分離帯つきの通り・川・畑・信号の位置は実際のままで、家の見た目・塀・門・表札などはデータからプログラムで作っています。
町名・住所・人の名前・店の名前は架空です。地図データの作り直しは `python3 tools/osm_to_town.py <地図.osm> assets/town/town.json` で行えます。

## 起動方法

ES モジュールを使うため、**ローカルサーバー経由**で開いてください（`index.html` を直接開くと動きません）。

```bash
cd delivery-3d
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

- 推奨：PC の Chrome / Edge / Firefox（キーボード＋マウス）
- 進行状況と設定はブラウザに自動保存されます
- 外部ライブラリは `lib/` に同梱（Three.js r169）。フォントだけ Google Fonts から読み込みます

### Artifact 版

claude.ai の Artifact としても公開しています（https://claude.ai/artifact/TLGU5a9ZdtaMMCvHeQT7kn ）。Artifact では `.glb` `.gltf` `.hdr` を配信できないため、
モデルと HDRI は **GLB を base64 化した `.glb.txt` / `.hdr.txt`** で持っています（`tools/pack_b64.py` で変換、`js/b64.js` で復元）。
公開用ページは `python3 tools/build_artifact.py <出力.html>` で `index.html` から作ります（CSS をインライン化し、`js/` `lib/` `assets/` は同じパスで添付）。

## 操作

| 場面 | 操作 |
|---|---|
| 歩く | `W` `A` `S` `D`、走る `Shift`、見回す マウス（画面クリックで固定、`Esc` で解除） |
| 調べる・持つ・置く | 画面中央で狙って `E` |
| 車に乗る・降りる | 運転席のドアの近くで `F` |
| 運転（AT） | `W` アクセル、`S` ブレーキ（止まってから押し直すと R に入ってバック）、`A` `D` ハンドル、`Space` サイドブレーキ |
| ハンドル（マウス） | 設定で「マウスでハンドル」をオンにすると、マウスの左右でハンドルを切れます（右ボタンを押している間は見回し） |
| 運転中 | `1` 運転席 `2` 後方 `3` ボンネット（`V` で切替）、`Q` `E` ウインカー（曲がり終わると自動で戻る）、`G` ハザード、`L` ライト、`H` クラクション、`C` クルーズコントロール |
| 待機 | 停車中・歩行中に `T` 長押しで時間を早送り |
| 業務端末 | `Tab`（伝票一覧・地図とルート・荷台・業務・設定・操作説明） |
| メニュー | `Esc`（再開・設定・タイトルへ） |

## 1日の流れ

1. **朝礼**：営業所のホワイトボードに当日の注意が書かれています。
2. **荷物確認**：作業台の箱を見ると伝票が表示されます。宛先が「わかば町」の荷物は担当外なので「仕分け戻し」のカゴへ。
3. **積み込み**：荷台は左右 × 後ろ／中央／前 × 棚／床。
   - 後ろのリアハッチからは「後ろ」、左（歩道側）のスライドドアからは「前・中央」がすぐ取り出せます。遠い場所は荷台に乗り込むので時間がかかります。
   - 重い物・ワレモノを棚に載せると、急ブレーキや衝突で落ちて破損します。クール便は保冷ボックスへ。
4. **ルート計画**：タブレットの地図で配達先をクリックして順番を決めます。
5. **運転**：国道は 50km/h、生活道路は 30km/h。信号無視・速度超過・接触は反則金と減点。ドアを開けたまま走ると荷物が落ちます。
6. **配達**：車を停めて荷物を取り出し、門柱のインターホンを押します。
   - 在宅なら玄関（マンションはエントランス）で手渡し。「〇〇様ですね？」と確認もできます（同じ苗字の家が並んでいる所に注意）。
   - 不在なら、伝票の指定どおりに**置き配**（玄関前・宅配ボックス・メーターボックス・物置に実際に置く）、無理なら郵便受けに**不在票**を入れて持ち戻り。再配達の電話がかかってくることもあります。
   - 入口が分かりにくい家、アパートの2階、オートロックのマンション、営業時間のある店などがあります。
7. **帰庫**：営業所の事務机で日報を書くと、評価（S〜D）・給料・経験値が出ます。
8. **改善ショップ**：台車、カーナビ、大きな保冷ボックス、手袋、在宅お知らせ、バックカメラ。

## ファイル構成

```
delivery-3d/
├── index.html / css/style.css
├── js/
│   ├── main.js     描画ループ・入力・時刻による太陽と空の変化
│   ├── assets.js   素材の読み込み、色の自動補正、まとめ描画・インスタンス描画・文字アトラス
│   ├── town.js     地図データから町を組み立てる（道路・白線・側溝・歩道・家・塀と門・アパート・店・川・電柱・信号・標識）、当たり判定、道路網の経路探索
│   ├── van.js      軽バン（右ハンドル・リアハッチ・スライドドア・荷台・保冷箱・メーター）と運転の挙動、他の車の見た目
│   ├── traffic.js  他の車（道路網の上を左側通行で走り、信号・一時停止を守り、車間距離を保つ）と信号の周期
│   ├── player.js   一人称で歩くプレイヤー
│   ├── game.js     荷物・積み込み・配達先のやりとり・交通違反・時間・人の配置・設定・セーブ
│   ├── ui.js       HUD・ナビ・会話・業務端末・メニュー・業務報告（車載ディスプレイ調）
│   ├── people.js   人物（Rocketbox）と犬の読み込み・アニメーション
│   ├── b64.js      base64 化したモデル／HDRI の読み込み
│   └── data.js     住民18人・荷物の種類・改善アイテム
├── tools/          地図データの変換（osm_to_town.py）・Artifact 用の変換とページ生成
├── lib/            Three.js（MIT）
└── assets/         外部素材（下記）
```

## 使用素材

| 素材 | 用途 | ライセンス |
|---|---|---|
| [Poly Haven](https://polyhaven.com) テクスチャ：asphalt_02, concrete_pavement, grey_roof_tiles, white_plaster_rough_01, beige_wall_001, rectangular_facade_tiles, concrete_block_wall, box_profile_metal_sheet, concrete_floor_02, farm_soil, leafy_grass, gravel, painted_metal_shutter, japanese_cedar_planks, white_stucco | 道路・歩道・瓦・外壁・ブロック塀・倉庫・畑など | CC0 |
| Poly Haven モデル：cardboard_box_01, hand_truck, exterior_aircon_unit, covered_car, shrub_02, planter_box_01, plastic_crate_01 ほか | 段ボール箱・台車・室外機・カバーをかけた車・植え込み など | CC0 |
| Poly Haven HDRI：kloofendal_48d_partly_cloudy_puresky | 空と環境光 | CC0 |
| [Kenney](https://kenney.nl)：Impact Sounds / Interface Sounds / Music Jingles | 足音・衝突音・操作音・ジングル | CC0 |
| [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox)：Business_Female_03, Female_Adult_03/05/11, Medical_Female_01, Chef_Female_01, Business_Male_02/07, Male_Adult_03/09/10, Gardener_Male_01, Dog_Beagle_01 と idle / talk / wave / walk のアニメーション | 住民・所長・通行人・犬（FBX から GLB に変換、テクスチャを縮小） | MIT |
| 地図データ © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)（栃木県宇都宮市東部の一部） | 町の道路網・建物の輪郭・土地利用・川・信号の位置（`assets/town/town.json`。店名などは架空の名前に置き換え） | ODbL |
| [Three.js](https://threejs.org) | 3D描画 | MIT |
| [Zen Kaku Gothic New](https://fonts.google.com/specimen/Zen+Kaku+Gothic+New) / [Barlow Semi Condensed](https://fonts.google.com/specimen/Barlow+Semi+Condensed) | 文字／数字のフォント | OFL |

家・車・電柱などの形はプログラムで組み立て、表面に上記の実写テクスチャを貼っています。エンジン音は WebAudio で合成しています。
