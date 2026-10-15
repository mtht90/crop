// UI 全体で共有する状態
import type { BrowserApi, BrowserState, TabState, Thumb } from '../shared/types';
import { iconSvg } from './icons.js';

declare global {
  interface Window {
    browser: BrowserApi;
  }
}

export const api = window.browser;

export const ctx = {
  state: { mode: 'browse', tabs: [], activeTabId: null, suggestions: [] } as BrowserState,
};

export function activeTab(): TabState | undefined {
  return ctx.state.tabs.find((t) => t.id === ctx.state.activeTabId);
}

export function tabById(id: number): TabState | undefined {
  return ctx.state.tabs.find((t) => t.id === id);
}

// ----------------------------------------------------------------------
// プレビュー画像 (JPEG) を Blob URL として保持する
// ----------------------------------------------------------------------

const thumbUrls = new Map<number, { version: number; url: string }>();

export function setThumb(thumb: Thumb): void {
  const prev = thumbUrls.get(thumb.tabId);
  if (prev && prev.version >= thumb.version) return;
  const url = URL.createObjectURL(new Blob([thumb.data as BlobPart], { type: 'image/jpeg' }));
  thumbUrls.set(thumb.tabId, { version: thumb.version, url });
  // 表示中の画像を差し替える
  document.querySelectorAll<HTMLImageElement>(`img[data-thumb="${thumb.tabId}"]`).forEach((img) => {
    img.src = url;
  });
  // 差し替え直後に古い画像を消すとちらつくので、少し待ってから解放する
  if (prev) setTimeout(() => URL.revokeObjectURL(prev.url), 3000);
}

export function thumbUrl(tabId: number): string | null {
  return thumbUrls.get(tabId)?.url ?? null;
}

export function dropThumbs(liveIds: Set<number>): void {
  for (const [id, entry] of thumbUrls) {
    if (liveIds.has(id)) continue;
    thumbUrls.delete(id);
    setTimeout(() => URL.revokeObjectURL(entry.url), 3000);
  }
}

// ----------------------------------------------------------------------
// 表示用の小さなヘルパー
// ----------------------------------------------------------------------

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return decodeURIComponent(u.pathname.split('/').pop() || 'ファイル');
    return u.host.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/** タブにアクセントカラーを CSS 変数として設定する */
export function applyAccent(node: HTMLElement, accent: string | null): void {
  if (accent) node.style.setProperty('--accent', accent);
  else node.style.removeProperty('--accent');
}

/**
 * ファビコンのタイル。ページの色 (--accent) をうっすら敷いた角丸の上に載せる。
 * 読み込めなければ頭文字、エラー中は警告の印。
 */
export function faviconEl(favicon: string | null, title: string, opts: { large?: boolean; error?: boolean } = {}): HTMLElement {
  const wrap = el('span', opts.large ? 'fav large' : 'fav');
  const letter = () => {
    wrap.replaceChildren();
    wrap.classList.add('letter');
    wrap.textContent = (title.trim()[0] ?? '·').toUpperCase();
  };
  if (opts.error) {
    wrap.classList.add('error');
    wrap.innerHTML = iconSvg('broken');
  } else if (favicon) {
    const img = el('img');
    img.src = favicon;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', letter, { once: true });
    wrap.append(img);
  } else {
    letter();
  }
  return wrap;
}

/** ファビコンの見た目が変わったかを判定するためのキー */
export function faviconKey(tab: TabState): string {
  if (tab.error) return 'error';
  if (tab.loading) return 'loading';
  return `${tab.favicon ?? ''}|${tab.title.trim()[0] ?? ''}`;
}

/** タブのアイコン (読み込み中はスピナー、エラー中は警告) */
export function tabIcon(tab: TabState): HTMLElement {
  if (tab.loading && !tab.error) {
    const wrap = el('span', 'fav');
    wrap.append(el('span', 'spinner'));
    return wrap;
  }
  return faviconEl(tab.favicon, tab.title, { error: tab.error });
}

/** 要素の位置を ancestor 基準で求める (アニメーション中の transform を含まない、レイアウト上の位置) */
export function layoutBox(node: HTMLElement, ancestor: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = node;
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}
