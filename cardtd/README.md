# カードTD

手札のカードから兵士を送り込み、相手の城を落とすリアルタイムのカードバトルです(HTML5、ビルド不要)。

## 遊び方

`cardtd/` を静的サーバーで配信して `index.html` を開きます。音声の読み込みに fetch を使うため、`file://` では動きません。

```bash
cd cardtd && python3 -m http.server 8000
```

- 手札のカードを自陣(中央線より左)へドラッグして出します。タップでカードを選び、戦場をタップしても出せます
- 数字キーの 1〜5 でもカードを選べます。Space で一時停止します
- 3分の試合で、相手の城を壊せば勝ちです。時間切れのときは、城の HP の割合が多い方が勝ちます

## 中身

| ファイル | 内容 |
| --- | --- |
| `js/data.js` | ルールの数値・カード18枚・15ステージ・チュートリアル |
| `js/battle.js` | 戦闘のシミュレーションと描画 |
| `js/ai.js` | CPU(プレイヤーと同じ手札・マナ・クールダウンのルールで動く) |
| `js/ui.js` | タイトル・ステージ選択・デッキ編成・ガチャ・HUD・リザルト |
| `js/art.js` / `js/audio.js` | 素材の読み込みと描画、効果音と BGM |
| `js/save.js` | セーブ(ブラウザの localStorage) |
| `assets/` | ゲーム用に縮小・切り出し済みの素材 |
| `tools/build_assets.py` | 素材パックの zip を展開したフォルダから `assets/` を作り直すスクリプト |

## 素材

| 種類 | 素材 | ライセンス |
| --- | --- | --- |
| キャラ | 2D Fantasy Knight / 2D Fantasy Woman Warrior / 2D Fantasy Fairy / Free 2D Orcs / 2D Fantasy Trolls / Free 2D Knight Sprite Sheets | CraftPix(無料素材) |
| 城 | Free Stone Tower Game Assets | CraftPix |
| 背景 | Free Horizontal Game Backgrounds / Free Cartoon Forest 2D Backgrounds / Free Elven Land 2D Battle Backgrounds | CraftPix |
| カード・UI | Mechanized Magic: 2D Vector Cards Pack / Ultimate UI Pack(Dumivid) | CC0 |
| UI 部品(ゲージ・羊皮紙・カーソル) | Kenney UI Pack: RPG Expansion | CC0 |
| エフェクト | 2D Spell Effects(Martin Jelinek) | CC0 |
| 効果音 | Kenney 50 RPG Sound Effects | CC0 |
| BGM | FREE Music Loop Bundle(Tallbeard Studios / Abstraction) | CC0 |

CraftPix の素材は、元ファイルの再配布が禁止されています。`assets/` には、ゲームで使う縮小済みの画像だけを入れています。

企画書に載っている次の素材は、まだ入っていません。2D Fantasy Elf と Elf Warrior Sprites は CraftPix 本体からしか入手できず、Skeletons 2D は有料のためです。カードは、入手できた18体で組んでいます。
