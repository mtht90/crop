function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const MESSAGES: Record<number, string> = {
  [-105]: 'サーバーが見つかりませんでした。アドレスを確かめてください。',
  [-106]: 'インターネットに接続されていません。',
  [-102]: 'サーバーが接続を拒否しました。',
  [-118]: '接続がタイムアウトしました。',
  [-109]: 'アドレスに到達できません。',
  [-111]: 'プロキシに接続できませんでした。',
  [-200]: 'サーバーの証明書が無効です。',
  [-201]: 'サーバーの証明書の有効期限が切れているか、まだ有効ではありません。',
  [-202]: 'サーバーの証明書が信頼されていません。',
};

/** 読み込みに失敗したときに表示するエラーページ (data: URL)。Folio の見た目に合わせる */
export function errorPageUrl(url: string, code: number, description: string): string {
  const message = MESSAGES[code] ?? 'ページを読み込めませんでした。';
  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    // そのまま
  }
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(host)} を表示できません</title>
<style>
  :root { color-scheme: light dark; --ink: #1c1b19; --ink-2: #57534d; --ink-3: #98938a; --well: rgba(30,25,15,.05); --danger: #c23d31; --bg: #fbfaf8; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ecebe7; --ink-2: #aba7a0; --ink-3: #6f6c67; --well: rgba(255,255,255,.06); --danger: #ff8b7c; --bg: #1f2024; } }
  html, body { height: 100%; margin: 0; background: var(--bg); color: var(--ink); }
  body { display: flex; align-items: center; justify-content: center; font: 14px/1.6 "Segoe UI Variable", "Segoe UI", "Yu Gothic UI", "Hiragino Sans", system-ui, sans-serif; }
  main { max-width: 480px; padding: 32px; text-align: center; }
  .mark { width: 56px; height: 56px; margin: 0 auto 20px; border-radius: 16px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 650; }
  p { margin: 0 0 20px; color: var(--ink-2); }
  code { display: inline-block; max-width: 100%; padding: 6px 12px; border-radius: 999px; background: var(--well); color: var(--ink-3); font: 12px ui-monospace, Consolas, monospace; word-break: break-all; }
</style></head>
<body><main>
  <div class="mark"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 3h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg></div>
  <h1>${escapeHtml(host)} を表示できません</h1>
  <p>${escapeHtml(message)}</p>
  <code>${escapeHtml(description)}</code>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
