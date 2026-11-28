# 使用素材とライセンス一覧

条件:無料で商用利用できるもののみ。**CC0 の素材は使用しない。**

## 同梱しているもの

| 素材 | 用途 | 入手元 | ライセンス | 商用 | 備考 |
|---|---|---|---|---|---|
| three.js r180 | 3D描画ライブラリ | npm `three` | MIT License | 可 | 全文: `public/licenses/three.js-MIT.txt` |
| M PLUS Rounded 1c(Regular / ExtraBold / Black) | 本文・数字のフォント | Google Fonts(npm `@expo-google-fonts/m-plus-rounded-1c` 経由) | SIL Open Font License 1.1 | 可 | 使用文字だけに絞り「EW Rounded」として同梱。全文: `public/licenses/M_PLUS_Rounded_1c-OFL.txt` |
| Dela Gothic One | 見出しフォント | Google Fonts(npm `@expo-google-fonts/dela-gothic-one` 経由) | SIL Open Font License 1.1 | 可 | 使用文字だけに絞り「EW Display」として同梱。全文: `public/licenses/Dela_Gothic_One-OFL.txt` |
| 3Dモデル(キャラ4・敵11・ボス4・景観17・小物) | 見た目 | 本作のコード(`src/render/models.js`)が生成 | 本作オリジナル | 可 | 外部ファイルなし |
| アニメーション | 歩行・跳ねる・羽ばたき等 | 本作のコードが毎フレーム計算 | 本作オリジナル | 可 | 外部ファイルなし |
| 効果音 約35種 | 攻撃・撃破・取得・爆発など | Web Audio でリアルタイム合成(`src/audio/audio.js`) | 本作オリジナル | 可 | 外部ファイルなし |
| BGM 4曲(タイトル・通常・夜・ボス) | 状況で楽器が重なる可変BGM | Web Audio でリアルタイム合成 | 本作オリジナル | 可 | 外部ファイルなし |

開発時だけ使うもの(配布物に含まれない):Vite(MIT)、fontTools(MIT)。

## 候補に挙がっていたが使わなかったもの

| 候補 | 使わなかった理由 |
|---|---|
| Synty の無料パック | ダウンロードに Synty Store のアカウントが必要で、この開発環境から取得できない。またEULAで素材そのものの再配布が禁止されており、公開リポジトリには置けない |
| Mixamo | Adobe アカウントでのログインが必要で取得できない。Synty のモデルが無い状態ではリターゲット先もない |
| Sonniss GDC Bundle | 配布サイトがこの環境からのアクセスを拒否(403)。数十GBの一括配布で、素材単体の再配布も禁止 |
| DOVA-SYNDROME(現 OpenTracks) | 各曲ページで規約に同意してブラウザからダウンロードする方式で、自動取得は規約の趣旨に反する。素材の再配布も禁止 |

代わりに、見た目と音を **すべてコードで生成** しました。素材ファイルが1つもないので、ライセンス違反の心配がなく、読み込みも速くなります。

## 自分で音源を差し替える場合

`public/audio/` に `manifest.json` と音声ファイルを置くと、合成音の代わりに使われます(書式は `public/audio/manifest.example.json` と `public/audio/README.md`)。
DOVA-SYNDROME の BGM や Sonniss GDC Bundle の効果音を自分でダウンロードして使えます。そのときは各配布元の規約に従い、音声ファイルはリポジトリにコミットしないでください(`.gitignore` で除外済み)。
