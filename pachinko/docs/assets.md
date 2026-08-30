# アセット出典メモ

## 生成物(Canva AI生成)

| ファイル | 用途 | 生成方法 |
|---|---|---|
| `assets/logo/fugaku_logo.png` | タイトルロゴ(UI上部) | Canva `generate-design`(design_type: logo) |
| `assets/backgrounds/command_room.png` | 通常時ステージ背景 | Canva `generate-design`(design_type: phone_wallpaper) |
| `assets/backgrounds/jackpot_awakening.png` | 大当たり覚醒カットイン背景 | 同上 |
| `assets/backgrounds/ally_arrival.png` | SPリーチ(僚機参戦)背景 | 同上 |

いずれもPillowで下部の不要なプレースホルダーテキスト(Canvaが自動挿入した"Lorem ipsum"等)を
トリミング済み。

## 既知の懸念(要レビュー)

**`jackpot_awakening.png`**: 生成された機体デザインが、頭部のV字アンテナ形状・配色
(タン×グレーの配色)など、実在の有名ロボットアニメ機体(ガンダム系)の意匠に
近い印象がある。プロジェクト方針(元プロジェクトプロンプト1章・0章: 「実在作品の
固有デザインを一切使用しない」)に照らすと、**そのまま公開・商用利用するには
デザイン差別化のための修正または再生成が必要**。現時点ではプロトタイプ確認用の
プレースホルダーとして使用している。

## ライセンス確認(要対応)

元プロジェクトプロンプト6章の原則「すべてのアセットは商用可・著作権者不明でない
ことを確認してから採用する」に従い、Canva AI生成物の商用利用条件(Canvaの利用規約上、
生成画像の権利がどう扱われるか)を、実際にリリースする前に必ず確認すること。
本コミット時点では未確認。

## 実素材(Kenney "UI Pack: Sci-Fi", CC0)

| ファイル | 出典 | 用途 |
|---|---|---|
| `assets/ui_kit/panel_bar.png` | Kenney UI Pack: Sci-Fi (Grey/Default/bar_square_large.png) | HUD統計パネルの背景(9-slice) |
| `assets/ui_kit/button_grey.png` / `button_blue.png` | 同上(button_square_header_large_square_screws.png) | 下部の「終了」「オート」「メニュー」ボタン |

出典: https://kenney.nl/assets/ui-pack-sci-fi (CC0 1.0, 商用利用可、クレジット任意)。
ライセンス全文は `assets/ui_kit/LICENSE_kenney.txt` に同梱。ログイン不要で直接ダウンロード
できるCC0配布元(Unity/Unreal Asset Storeはログイン必須のためこの環境からは取得不可)。

**現状のスコープ**: ヘッダー統計パネル・下部操作ボタン・盤面を囲む筐体フレームまで
実アセットで揃った(下記OpenGameArt由来の`cabinet_frame.png`)。

## 実素材(OpenGameArt "RPG Frames: Window Border Tiling-Textures", CC0)

| ファイル | 出典 | 用途 |
|---|---|---|
| `assets/ui_kit/cabinet_frame.png` | OpenGameArt(作者: hc)`plate_circuit.png`を加工 | 盤面を囲む筐体フレーム(9-slice) |

出典: https://opengameart.org/content/rpg-frames-window-border-tiling-textures (CC0 1.0)。
元ファイルの中央は不透明な単色パネルだったため、Pillowで中央部分のアルファ値を0にして
「盤面が透けて見える窓枠」に加工した(グラフィックの意匠そのものは変更していない、
中央の可視性のみを変更する非破壊的な編集)。

## 手作りベクター素材

| ファイル | 用途 |
|---|---|
| `assets/sprites/peg.svg` | 釘の見た目(ガンメタリック×レッドの警告灯風) |
| `assets/sprites/ball.svg` | 玉の見た目(クロム調) |

`icon.svg`(プロジェクトアイコン)と合わせて手作業のベクターグラフィック。
