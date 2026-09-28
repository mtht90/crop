import type { SearchEngineId } from '../shared/types';

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  yahoo_jp: { name: 'Yahoo! JAPAN', url: 'https://search.yahoo.co.jp/search?p=%s' },
};

// タブ内で開くことを許可するスキーム
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:', 'data:', 'view-source:']);

export function isAllowedUrl(url: string): boolean {
  try {
    return ALLOWED_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * アドレスバーの入力を URL に変換する。
 * URL らしければそのまま (必要なら https:// を補完)、それ以外は検索エンジンの検索 URL にする。
 */
export function resolveInput(input: string, engine: SearchEngineId): string {
  const text = input.trim();
  if (text === '') return 'about:blank';

  // スキーム付き (http://, https://, file://, about:blank など)
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text)) {
    // "localhost:3000" や "example.com:8080/path" はスキームではなくホスト:ポート
    if (/^[^/:\s]+:\d+(\/|$)/.test(text)) {
      return `http://${text}`;
    }
    if (isAllowedUrl(text)) return text;
  }

  if (!/\s/.test(text)) {
    const host = text.split(/[/?#]/)[0];
    // localhost, IPv4 アドレス, ドメイン名 (ドットを含み TLD が英字)
    if (/^localhost(:\d+)?$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) {
      return `http://${text}`;
    }
    if (/^[^.\s]+(\.[^.\s]+)*\.[a-z]{2,}(:\d+)?$/i.test(host) || /^\[[0-9a-f:]+\](:\d+)?$/i.test(host)) {
      return `https://${text}`;
    }
  }

  return searchUrl(text, engine);
}

export function searchUrl(text: string, engine: SearchEngineId): string {
  const template = (SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.google).url;
  return template.replace('%s', encodeURIComponent(text.trim()));
}
