# 使用素材とライセンス

このゲームの絵・音・文字は、すべて外部の素材を使っている。
素材は `npm run fetch-assets` で配布元から取得してゲーム用に加工する（`scripts/fetch-assets.mjs` に一覧がある）。
加工後のファイルはリポジトリに含めず、ビルドのたびに取得する。

## 3D モデル・アニメーション

| 素材 | 作者・配布元 | ライセンス | 使い方 |
|---|---|---|---|
| KayKit Character Pack: Adventurers 1.0（Knight / Barbarian / Mage / Rogue） | Kay Lousberg（[kaylousberg.com](https://www.kaylousberg.com)）／[GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | CC0 | 選手の体と頭。武器と装飾を外し、服の色面をチームのユニフォーム色に塗り替えて使う |
| 上記同梱のアニメーション（Idle, Running, Throw, PickUp, Cheer ほか） | Kay Lousberg | CC0 | 守備・走塁・喜びの動き |
| KayKit Character Animations 1.1（Crouching ほか） | Kay Lousberg。公式配布は itch.io のため、ライセンス文を同梱した [GitHub のミラー](https://github.com/NoLimitNexus/game-models) から取得 | CC0 | 捕手の構え |
| KayKit City Builder Bits 1.0 | Kay Lousberg／[GitHub](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | CC0 | 空き地を囲む町並み（建物・街灯・ベンチ・車など） |
| Baseball Bat | [Poly Haven](https://polyhaven.com/a/baseball_bat) | CC0 | バット（色テクスチャのみ使用） |

## 空

| 素材 | 配布元 | ライセンス |
|---|---|---|
| Kloofendal 48d Partly Cloudy (Pure Sky) | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | CC0 |

## 音楽（BGM）

[OpenTracks（旧 DOVA-SYNDROME）](https://opentracks.com/) の音源。商用利用可・クレジット任意・**音源そのものの再配布は禁止**（ゲームへの組み込みは可）。

| 曲 | 作曲 | 使いどころ |
|---|---|---|
| [夏の日のベースボール](https://opentracks.com/bgm/detail/1887) | F3 | タイトル・設定画面 |
| [メジャーの星 cheering pep squad](https://opentracks.com/bgm/detail/8965) | TOGA | 試合中 |
| [勝利したあと](https://opentracks.com/bgm/detail/23140) | VeryGoodMan | 勝利画面 |

## 効果音

[効果音ラボ](https://soundeffect-lab.info/)。商用利用可・クレジット不要・**直リンクと再配布は禁止**。
自動取得はせず、手で保存したファイルを取り込む（[SOUNDS.md](SOUNDS.md)）。

## フォント

| フォント | 配布元 | ライセンス |
|---|---|---|
| M PLUS Rounded 1c | Google Fonts（npm `@fontsource/m-plus-rounded-1c`） | SIL Open Font License 1.1 |
| Dela Gothic One | Google Fonts（npm `@fontsource/dela-gothic-one`） | SIL Open Font License 1.1 |

## コードで作っているもの

素材として配られていない、ゲーム固有の小物と画面の部品はコードで形を作っている。

- ボール代わりのペットボトルのキャップ（ギザギザの側面とラベル）
- 選手の野球帽
- グラウンドの土・ライン・ベース、金網フェンス
- ストライクゾーン、カーソル、スコアボードなどの UI

選手やチームの名前は、すべてこのゲームのために作った架空のもの。
