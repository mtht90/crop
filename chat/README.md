# Aoi Chat

白ベース × 青系統一のリアルタイムチャット。Node.js + WebSocket（`ws`）のみで、ビルド工程はありません。

## ローカルで動かす

```bash
cd chat
npm install
npm start
```

`http://localhost:3000` を開き、ニックネームとルーム名を入れて入室します。同じルーム名（`?room=xxx` のリンク）を開いた人同士で会話できます。

## Render にデプロイ

リポジトリ直下の `render.yaml` を使います。

1. Render ダッシュボードで **New → Blueprint** を選び、このリポジトリを接続
2. `aoi-chat` サービスが作成され、自動でビルド・起動されます

手動で Web Service を作る場合は Root Directory `chat`、Build `npm install`、Start `npm start`、Health Check Path `/healthz`。

## 仕様メモ

- メッセージ履歴はメモリ上に保持（ルームごと最新200件）。サーバー再起動や、無料プランのスリープで消えます
- ログイン機能はなく、ニックネームは自己申告です
- 操作: Enter で送信（スマホは送信ボタン）、吹き出しをダブルタップ／ダブルクリックで 💙、スマホは右スワイプで返信・タップでリアクション
