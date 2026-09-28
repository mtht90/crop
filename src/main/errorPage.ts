function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const MESSAGES: Record<number, string> = {
  [-105]: 'サーバーのアドレスが見つかりませんでした (DNS エラー)。',
  [-106]: 'インターネットに接続されていません。',
  [-102]: 'サーバーへの接続が拒否されました。',
  [-118]: '接続がタイムアウトしました。',
  [-109]: 'アドレスに到達できません。',
  [-200]: 'サーバーの証明書が無効です。',
  [-201]: 'サーバーの証明書の有効期限が切れているか、まだ有効ではありません。',
  [-202]: 'サーバーの証明書が信頼されていません。',
};

/** 読み込みに失敗したときに表示するエラーページ (data: URL) を生成する */
export function errorPageUrl(url: string, code: number, description: string): string {
  const message = MESSAGES[code] ?? 'ページを読み込めませんでした。';
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>ページを表示できません</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center; padding: 12vh 24px; margin: 0; }
  main { max-width: 560px; }
  h1 { font-size: 24px; font-weight: 600; }
  p { line-height: 1.6; opacity: .85; }
  code { font-size: 12px; opacity: .6; word-break: break-all; }
</style></head>
<body><main>
  <h1>このページを表示できません</h1>
  <p>${escapeHtml(message)}</p>
  <p><code>${escapeHtml(url)}</code></p>
  <p><code>${escapeHtml(description)} (${code})</code></p>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
