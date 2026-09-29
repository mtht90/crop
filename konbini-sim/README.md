# まいにちマート — コンビニ経営シミュレーター

ブラウザで動く一人称視点の 3D コンビニ経営シミュレーターです（Three.js + TypeScript + Vite）。
昼は品出し・レジ・ホットスナック・発注で店を回し、深夜には酔っ払い・クレーマー・万引き犯・立ち読み客・未成年客など「ちょっと困ったお客さん」がやってきます。

## 起動方法

```bash
cd konbini-sim
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # dist/ に静的ファイルを出力（どこにでも置けます）
```

WebGL2 が使える PC ブラウザ（Chrome / Edge / Firefox / Safari 最新版）と iPad（iPadOS 16 以降の Safari）で遊べます。

## 操作

| キー | 動作 |
| --- | --- |
| W A S D / Shift | 移動 / 走る |
| マウス | 視点 |
| E | 手に取る・使う・話しかける（レジ・PC・フライヤー・モップ・客） |
| 左クリック | 箱から棚へ陳列 / モップで掃除（長押し） / レジで商品スキャン |
| 右クリック | 棚の商品を箱に戻す |
| Q | 持っている箱を置く / モップを戻す |
| R | 期限切れ商品を撤去（棚・ホットケース） |
| T | 見ている棚の商品の売価を変更 |
| Space | （レジ）次の商品をスキャン |
| Tab / Esc | メニュー |

### iPad（タッチ操作）

| 操作 | 動作 |
| --- | --- |
| 画面左側をドラッグ | 移動（出てくるスティックを奥まで倒すと走る） |
| 画面右側をドラッグ | 視点 |
| 使う | 手に取る・使う・話しかける（キーボードの E） |
| 陳列/掃除 | 箱から棚へ陳列 / 押し続けてモップ掃除（左クリック） |
| 戻す / 置く / 撤去 / 価格 | 右クリック / Q / R / T と同じ |
| 走る | 走る（切り替え） |
| ☰ | メニュー |
| レジ | カウンターの商品をタップしてスキャン（「次の商品をスキャン」ボタンでも可） |

プロンプトのキー表示はタッチ中はボタン名に切り替わり、今使えるボタンは橙色に光ります。
iPad に Magic Keyboard やトラックパッドを接続している場合は、トラックパッドをクリックすると PC と同じ操作（ポインターロック + WASD）に切り替わります。画面に触れると再びタッチ操作に戻ります。
タブレットでは描画品質の初期値が「中」になります（設定で変更可）。横向きでプレイしてください。ホーム画面に追加するとフルスクリーンで遊べます。

## ゲームの流れ

- **1 日 = 6:00〜翌 2:00**（標準で約 20 分）。終業時に営業報告（売上・粗利・廃棄・万引き・固定費）が出ます。
- **発注**: バックヤードの PC で箱単位で発注 → 7 時・13 時・19 時の納品便で配達員が段ボールを届けます（特急便は 30 分）。
- **品出し**: 段ボールを持って、商品に合った売場（冷蔵庫・オープンケース・常温棚・雑誌ラック・アイスケース）に陳列。
- **レジ**: カウンターの商品をクリックしてスキャン → 年齢確認 → 電子マネー決済 or 現金でおつりを数えて渡す。
- **ホットスナック**: 冷凍ストッカーに補充 → フライヤーで揚げる（焦がすと廃棄）→ ホットケースから販売（3 時間で販売期限）。
- **鮮度管理**: おにぎり・弁当・サンドは翌日に期限切れ。放置すると客が不快になり評判が下がります。
- **清掃**: 雨の日の泥・こぼれたドリンク・酔っ払いの…をモップで掃除。
- **価格設定**: 相場より高いと売れにくく評判も下がる。安くすると利益が減る。
- **評判・ランク**: 評判が来客数を左右。累計売上で店舗ランクが上がり、新商品・設備（防犯カメラ、高性能フライヤー、自動釣銭機、アルバイト雇用など）が解放されます。

## 使用している外部素材

| 素材 | 出典 | ライセンス |
| --- | --- | --- |
| 人物モデル 26 体・アニメーション 20 種（男女） | [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) | MIT |
| ゴンドラ棚・エンド棚・冷蔵オープンケース・アイスケース・雑誌ラック・バックカウンター・電子レンジ | [SIGVerse convenience-store-3d-models](https://github.com/SIGVerse/convenience-store-3d-models)（NII 稲邑グループ） | SIGVerse ライセンス（非商用で利用） |
| レジ（numiteg）・コーヒーマシン（Kreutergarten）・コピー機（thethieme）・買い物カゴ（kowbassen） | SIGVerse 経由 / Sketchfab | CC-BY 4.0 |
| ATM（kavabanga） | SIGVerse 経由 / Blend Swap | CC0 |
| 床タイル・ヘアライン金属・アルミ・コンクリートのテクスチャ | SIGVerse 経由 / ShareTextures | CC0 |
| 段ボール箱・番重（プラスチックコンテナ）・防犯カメラ・分電盤・配電箱・ゴミ袋・スツール・ブラウン管テレビ・カバー付きの車・コンクリート車止め・マンホール・外灯・観葉植物・蛍光灯器具 | [Poly Haven](https://polyhaven.com)（[localgpt-world-assets](https://github.com/localgpt-app/localgpt-world-assets) 経由） | CC0 |
| ドリンク冷蔵ケース（CommercialRefrigerator） | [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) / Sean Thomas | CC-BY 4.0 |
| 駐車中の車（CarConcept） | Khronos glTF Sample Assets（元: Unity Fan, Public Domain） | CC-BY 4.0 |
| カラーコーン（TrafficCone） | Khronos glTF Sample Assets / hinndia | CC-BY 4.0 |
| HDRI（昼・夕方・夜空）、アスファルト | [Poly Haven](https://polyhaven.com)（three.js / Khronos 経由） | CC0 |
| 効果音（足音・物音・硬貨・UI） | [Kenney](https://kenney.nl)（[open-game-sfx-index](https://github.com/Mcamento8/open-game-sfx-index) 経由） | CC0 |
| フォント | Noto Sans JP / Dela Gothic One（@fontsource） | OFL |

SIGVerse 素材は NII 稲邑グループによる SIGVerse プロジェクトを元にしています（Unity 形式から glTF へ変換・圧縮。詳細は `public/assets/licenses/sigverse/NOTICE.md`）。SIGVerse ライセンスでは商用利用に事前承諾が必要なため、本プロジェクトは非商用（個人・趣味）での利用に限ります。

外部素材が見つからなかったもの（無料でリアルなものが入手できなかったフライヤー・ホットケース・レジカウンター本体・建物の壁と天井・商品パッケージ）と、ドアチャイム・BGM はプロシージャル生成です。登場する商品名・ブランド名・店名はすべて架空のものです。
各ライセンス文は `public/assets/licenses/` と `public/assets/characters/LICENSE-Rocketbox.md` にあります。

## 素材パイプライン

`tools/asset-pipeline/` に、Rocketbox の FBX を Web 用 GLB に変換したスクリプトがあります。

- `rb_avatar.py` — Blender (bpy) で FBX を読み込み、スペキュラ→ラフネス変換、WebP テクスチャで GLB 出力
- `rb_anims.py` — 複数のアニメ FBX を 1 つの GLB に（NLA トラックごとにクリップ化）
- `anim_opt.mjs` — 不要トラック削除・リサンプル・meshopt 圧縮（15MB → 1.7MB）
- `opt.mjs` — glTF の不要ノード削除・テクスチャ縮小・meshopt 圧縮
- `batch.sh` — 上記を一括実行
- `unity2glb.py` — Unity の prefab / Mesh アセット / FBX（.meta の scale とマテリアル対応を反映）を GLB に変換（SIGVerse 素材用）

## 開発用ツール

- `tools/playtest.mjs` — ヘッドレス Chromium で実際にゲームを進め、レジ接客まで自動で行うテスト
- `tools/interact.mjs` — キーボード・マウス入力で品出し・発注・フライヤーを操作するテスト
- `tools/touchtest.mjs` — iPad をエミュレートし、タッチイベントでスティック・視点・ボタンを操作するテスト
- `tools/shots.mjs` — 指定カメラ位置のスクリーンショット
- URL に `?test=new` を付けるとタイトルを飛ばしてテスト用フック（`window.__sim`, `window.__shot`）が有効になります

## ソース構成

```
src/
  core/    Engine（描画・ポストエフェクト）, Input, Assets, Audio（サンプル再生＋合成音）
  data/    products.ts（商品カタログ）
  world/   Store（店舗・什器・外構の構築）, Environment（昼夜・雨）, ProductVisuals（商品パッケージ生成）, Nav（A*）, Collision
  game/    Game（全体制御）, State, Slot（棚）, Boxes, Checkout（レジ）, HotSnacks, Deliveries, Dirt, Dialog
  npc/     Character（アニメーション付き人物）, Customers（客 AI・迷惑客）
  player/  Player（一人称操作）
  ui/      UI, PCMenu, Menus, style.css
```

## ホスト版ビルド

`tools/build-artifact.sh` で、フォントを Google Fonts から読み込み、WebAssembly を使わない（meshopt を展開した）GLB を使い、JS/CSS をインライン化した配布版を `dist-artifact/` に出力します。ポインターロックが使えない環境では、右ボタンドラッグで視点を動かせます。
