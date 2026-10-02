# GitHub Pages で公開する（ログイン不要で遊べるようにする）

CPU 対戦・ストーリー・パック開封は静的サイトだけで動くので、GitHub Pages に置けば
**URL を開くだけ（ログイン不要）** で誰でも遊べます。

## 手順（はじめの1回）

1. GitHub で新しい **Public** リポジトリを作る（例: `arcane-beasts`）。README などは追加しない。
2. このフォルダ（`arcane-beasts-tcg`）で、次を実行する。

   ```bash
   git remote add origin https://github.com/<あなたのID>/arcane-beasts.git
   git branch -M main
   git push -u origin main
   ```

3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
4. **Actions** タブで「Deploy to GitHub Pages」が緑になるのを待つ（数分）。
   公開URLは `https://<あなたのID>.github.io/arcane-beasts/`。

以降は `main` に push するたびに自動で更新されます。

## オンライン対戦について

オンライン対戦は専用サーバー（`npm run server`、[ONLINE.md](ONLINE.md)）が必要です。
サーバーを Cloudflare Tunnel などで公開したら、ゲームの「オンライン」画面の「サーバー変更」にそのアドレス
（例: `xxxx.trycloudflare.com`）を入力するか、URLの末尾に `?server=xxxx.trycloudflare.com` を付けて開くと、
Pages 上のゲームからも対戦できます（一度設定すれば保存されます）。
