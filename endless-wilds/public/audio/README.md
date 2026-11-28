# 音声の差し替え(任意)

このフォルダに `manifest.json` と音声ファイル(mp3 / ogg / wav)を置くと、ゲーム内で合成している音の代わりに使われます。
ファイルが無ければ、すべて Web Audio で合成した音で鳴ります。

`manifest.example.json` をコピーして `manifest.json` にし、使いたい項目だけ書いてください。

- `bgm.field` 通常時 / `bgm.night` 血月の夜 / `bgm.boss` ボス戦 / `bgm.title` タイトル(ループ再生)
- `se.*` 効果音。キー名は `src/audio/audio.js` の `play()` の名前(`kill`, `gem`, `levelup`, `explode`, `hurt`, `chest` など)

DOVA-SYNDROME(OpenTracks)の BGM や Sonniss GDC Bundle の効果音を使う場合は、それぞれの利用規約に従ってください。
どちらも「素材そのものの再配布」は禁止されているため、このリポジトリにはコミットしないでください(`.gitignore` で除外済み)。
