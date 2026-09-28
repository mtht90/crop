# Crop Browser

Electron (Chromium) をエンジンに使った、シンプルなタブ型のデスクトップ Web ブラウザです。
TypeScript で書かれており、Windows / macOS / Linux で動作します。

## 機能

- **タブ**: 追加・閉じる・ドラッグで並べ替え・中クリックで閉じる・閉じたタブを復元・ミュート
- **ナビゲーション**: 戻る / 進む / 再読み込み / 中止 / ホーム、マウスの戻る・進むボタン
- **アドレスバー**: URL の自動補完 (`example.com` → `https://example.com`)、URL 以外は検索
- **検索エンジン**: Google / DuckDuckGo / Bing / Yahoo! JAPAN から選択
- **ブックマーク**: ☆ボタンで追加・削除、ブックマークバー、一覧パネル
- **履歴**: 日付ごとの一覧、検索、全削除
- **ダウンロード**: ダウンロードフォルダに保存、進捗表示、キャンセル、フォルダを開く
- **ページ内検索**、**ズーム**、**ページのソース表示**、**開発者ツール**
- **右クリックメニュー**: リンクを新しいタブで開く、画像の保存・コピー、選択テキストの検索 など
- **セッション復元**: 前回開いていたタブを起動時に復元
- **権限の確認**: カメラ・マイク・位置情報・通知などはサイトごとに許可を確認
- ライト / ダークテーマ (OS の設定に追従)

## 使い方

Node.js 20 以上が必要です。

```bash
npm install     # 依存関係のインストール
npm start       # ビルドして起動
npm test        # ユニットテスト
npm run dist    # インストーラーを作成 (release/ に出力)
```

GitHub Actions でも Windows (.exe) / macOS (.dmg) / Linux (.AppImage) のインストーラーが
自動でビルドされ、Actions の実行結果の Artifacts からダウンロードできます。

## キーボードショートカット

| 操作 | ショートカット |
| --- | --- |
| 新しいタブ / 新しいウィンドウ | Ctrl+T / Ctrl+N |
| タブを閉じる / 閉じたタブを開く | Ctrl+W / Ctrl+Shift+T |
| 次のタブ / 前のタブ | Ctrl+Tab / Ctrl+Shift+Tab |
| n 番目のタブ / 最後のタブ | Ctrl+1〜8 / Ctrl+9 |
| アドレスバーに移動 | Ctrl+L / F6 / Alt+D |
| 戻る / 進む | Alt+← / Alt+→ |
| 再読み込み / キャッシュを無視 | Ctrl+R, F5 / Ctrl+Shift+R |
| ページ内検索 | Ctrl+F |
| 拡大 / 縮小 / 元に戻す | Ctrl++ / Ctrl+- / Ctrl+0 |
| ブックマークに追加 / 一覧 | Ctrl+D / Ctrl+Shift+O |
| ブックマークバーの表示切替 | Ctrl+Shift+B |
| 履歴 / ダウンロード / 設定 | Ctrl+H / Ctrl+J / Ctrl+, |
| 開発者ツール | F12 |

macOS では Ctrl の代わりに Cmd を使います (戻る / 進むは Cmd+[ / Cmd+])。

## 構成

```
src/
  main/        メインプロセス (Node.js)
    main.ts        起動処理・IPC・権限リクエスト
    window.ts      ウィンドウとタブ (WebContentsView) の管理
    menu.ts        アプリケーションメニューとショートカット
    store.ts       ブックマーク・履歴・設定の保存 (JSON)
    downloads.ts   ダウンロード管理
    url.ts         アドレスバー入力の解釈
    errorPage.ts   読み込み失敗時のエラーページ
  preload/     UI に安全な API だけを公開する preload スクリプト
  renderer/    ブラウザの UI (タブバー・ツールバー・サイドパネル)
  shared/      メインと UI で共有する型定義
test/          ユニットテスト
```

- 各タブは独立した `WebContentsView` で、`sandbox` と `contextIsolation` を有効にし、
  Node.js の機能には一切アクセスできません。
- UI 自身も sandbox で動き、preload 経由の限られた IPC だけでメインプロセスと通信します。
- データはユーザーデータフォルダ (例: Windows なら `%APPDATA%/Crop Browser`) に JSON で保存されます。
