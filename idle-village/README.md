# ちいさな島のくらし

村人たちが自分で考えて暮らし、村が勝手に育っていくのを眺める放置ゲームです(ブラウザで動きます)。

- 村人は木を切り、羊を育て、金を掘り、家を建て、恋をして子どもが生まれ、年を取って世代が替わります
- 季節ごとに **長老会議** が開かれ、次に建てるものや仕事の優先度を決めます(AIまたはルール)
- プレイヤーは見守り役です。村人の暮らしから貯まる **くらしポイント** で、村全体の能力を少しだけ後押しできます
- 時代は「開拓 → 村 → 町 → 王国」と進み、城が完成すると新しい島へ **旅立ち**(周回)ができます
- 盗賊の襲撃、昼と夜、四季(草の色・雪・雨)、留守中の進行があります

## 遊び方(開発用)

```bash
cd idle-village
npm install
```

グラフィック素材 **Tiny Swords** はライセンスで再配布が禁止されているため、リポジトリには含めていません。
[Tiny Swords(itch.io)](https://pixelfrog-assets.itch.io/tiny-swords) から無料の「Tiny Swords (Free Pack).zip」をダウンロードし、次のコマンドで取り込んでください。

```bash
npm run setup-assets -- "~/Downloads/Tiny Swords (Free Pack).zip"
```

```bash
npm run dev
```

ブラウザで表示されたURLを開くと遊べます。`npm run build` で `dist/` に公開用のファイルができます。

## 操作

| 操作 | 内容 |
|---|---|
| ドラッグ / WASD / 矢印キー | 画面を動かす |
| ホイール / ピンチ / +− ボタン | 拡大・縮小 |
| 村人をクリック | 村人の詳しい様子を見る(追いかけることもできる) |
| 恵み | くらしポイントで村を強化 |
| 歴史 | 村の歴史書を読む |
| ×1 | 速さを切り替え(×1 / ×2 / ×4) |

## 長老会議のAI(設定画面から選べます)

| 方式 | 内容 |
|---|---|
| ルール(既定) | AIなしで判断。会話は定型文 |
| ブラウザ内AI | [WebLLM](https://github.com/mlc-ai/web-llm) でAIモデルを自分のパソコンのGPU上で動かす。無料・無制限。WebGPU対応ブラウザが必要で、初回にモデルのダウンロードあり |
| 無料API | Google Gemini / Groq / OpenRouter など OpenAI互換API。APIキーはブラウザ内にのみ保存 |

AIが返した値は必ず範囲チェックしてから反映するので、AIがおかしな返事をしてもゲームは壊れません。失敗したときはルールの判断のまま進みます。

## 構成

```
src/
  sim/        シミュレーション(描画に依存しない。留守中の早送りにも使う)
    sim.ts      村人の判断・建設・襲撃・出産など
    council.ts  長老会議(ルール版)とAIに渡す要約
    mapgen.ts   島の自動生成
    path.ts     A*経路探索
  render/     Phaserでの描画(地形の自動接続、アニメーション、昼夜、天気、効果音)
  ai/         WebLLM / OpenAI互換APIによる長老会議
  ui/         HTMLのUI(Tiny SwordsのUIパーツをスキンとして使用)
  controller.ts  全体のつなぎ役(保存・留守中の進行・AI呼び出し)
```

## 素材・クレジット

- グラフィック:[Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog(商用利用可・再配布不可。リポジトリには含めていません)
- 音楽・効果音:[Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-Boy & AAA(CC0)。`public/assets/audio/` に使う分だけmp3に変換して同梱
- フォント:[DotGothic16](https://fonts.google.com/specimen/DotGothic16) by Fontworks(SIL Open Font License)
- ゲームエンジン:[Phaser 3](https://phaser.io/)
