# ちいさな島のくらし

村人たちがAIで自分の生き方を考え、島の村が勝手に育っていくのを見守る放置ゲームです(ブラウザで動きます)。

- エンジンが決めているのは **本能** だけ:おなかがすいたら食べる、眠くなったら寝る、盗賊から逃げる、人恋しくなる
- それ以外はすべて **AI(API)** が村人一人ひとりとして考えます
  - 何をして生きるか(木を切る・羊を獲る・探検する・祈る・話しに行く…)と、そのときの心の声
  - 誰と何を話すか(会話の中身、関係の変化、「親友」「恋人」などの呼び名、記憶)
  - 何を建てて何と呼ぶか(見た目・働き・名前・目的)
  - 子どもの名前と性格、時代の名前、村の習わし、歴史書の一文
- 恋人や夫婦になった二人には子どもが生まれ、年を取って世代が替わります
- プレイヤーは見守り役です。暮らしから貯まる **くらしポイント** で、村全体の能力を少しだけ後押しできます
- 城が完成すると、新しい島へ **旅立ち**(周回)ができます

AIのAPIキーがないときは、本能と習慣だけで暮らします(会話は定型文になります)。

## AIの設定

ゲームの最初に出る画面、または「設定 → AI」から、APIキーを入れます。

| サービス | 内容 |
|---|---|
| Google Gemini(おすすめ) | [Google AI Studio](https://aistudio.google.com/apikey) で無料のキーを作れます |
| Groq | [console.groq.com](https://console.groq.com/keys) で無料のキーを作れます |
| OpenRouter | 名前の末尾が `:free` のモデルは無料です |
| その他 | OpenAI互換の `/chat/completions` に対応したAPI |

- 1回の呼び出しで、数人分の判断と会話をまとめて考えます(既定は25秒ごと。設定で変えられます)
- キーはブラウザの中にだけ保存されます
- AIの返事は必ず範囲チェックしてから反映するので、おかしな返事でもゲームは壊れません

## 公開(GitHub Pages)

`.github/workflows/idle-village-pages.yml` が、`main` ブランチへのpushで自動的にビルドして GitHub Pages に公開します。
Tiny Swords はビルドのたびに配布元から取得するので、リポジトリには入りません。

初回だけ、リポジトリの **Settings → Pages → Build and deployment → Source** を「**GitHub Actions**」にしてください。

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
| 記録 | 出来事・会話・村のかたち(時代・習わし・建物)を読む |
| 村人 | 村人の帳面(性格・心の声・まわりの人・記憶)を見る |
| ×1 | 速さを切り替え(×1 / ×2 / ×4) |

## 構成

```
src/
  sim/        シミュレーション(描画に依存しない。留守中の早送りにも使う)
    sim.ts      本能・体の動き・建設・襲撃・出産など
    mapgen.ts   島の自動生成
    path.ts     A*経路探索
  render/     Phaserでの描画(地形の自動接続、アニメーション、昼夜、天気、効果音)
  ai/mind.ts  村の心:APIに村人たちの判断・会話・名付け・発案をまとめて考えてもらう
  ui/         HTMLのUI(Tiny SwordsのUIパーツをスキンとして使用)
  controller.ts  全体のつなぎ役(保存・留守中の進行・AI呼び出し)
```

## 素材・クレジット

- グラフィック・UI:[Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog(商用利用可・再配布不可。リポジトリには含めていません)
- 音楽・効果音:[Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-Boy & AAA(CC0)。`public/assets/audio/` に使う分だけmp3に変換して同梱
- フォント:[DotGothic16](https://fonts.google.com/specimen/DotGothic16) by Fontworks(SIL Open Font License)
- ゲームエンジン:[Phaser 3](https://phaser.io/)
