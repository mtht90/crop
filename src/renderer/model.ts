// シェルフとスペース (オーバービュー) で共通の「並べ方」
// - 並び順はタブの順番のまま (場所を覚えやすいように、頻度で並べ替えない)
// - 固定したページは先頭
// - 通常のページは、同じサイト (ファイルなら同じフォルダ) が 2 つ以上あればまとめる
// - よく戻るページはまとめず、単独で大きく見せる
// - あまり見ないページは最後の「束」へ
import type { TabState } from '../shared/types';

export type Entry =
  | { kind: 'tab'; tab: TabState }
  | { kind: 'group'; key: string; label: string; tabs: TabState[] };

export interface Arrangement {
  entries: Entry[];
  compact: TabState[];
}

/** 関連するページをまとめるためのキー */
export function siteKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname.replace(/^www\./, '');
    if (u.protocol === 'file:') {
      const dir = u.pathname.split('/').slice(0, -1).join('/');
      return dir ? `file:${dir}` : null;
    }
  } catch {
    // 対象外
  }
  return null;
}

export function siteLabel(key: string): string {
  if (key.startsWith('file:')) {
    const parts = decodeURIComponent(key.slice(5)).split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'ファイル';
  }
  return key;
}

export function arrange(tabs: TabState[]): Arrangement {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);

  // サイトごとに、よく戻るページ以外を数える。
  // 通常のページを 1 つ以上含み、合わせて 2 つ以上あるサイトをまとめる
  // (そのサイトのあまり見ないページも、束ではなくこのまとまりに入れる)
  const sites = new Map<string, { total: number; regular: number }>();
  for (const t of rest) {
    if (t.tier === 'hero') continue;
    const key = siteKey(t.url);
    if (!key) continue;
    const s = sites.get(key) ?? { total: 0, regular: 0 };
    s.total++;
    if (t.tier === 'regular') s.regular++;
    sites.set(key, s);
  }
  const grouped = (t: TabState): string | null => {
    if (t.tier === 'hero') return null;
    const key = siteKey(t.url);
    const s = key ? sites.get(key) : undefined;
    return key && s && s.total >= 2 && s.regular >= 1 ? key : null;
  };

  const entries: Entry[] = pinned.map((tab) => ({ kind: 'tab', tab }));
  const compact: TabState[] = [];
  const groups = new Map<string, Extract<Entry, { kind: 'group' }>>();
  for (const t of rest) {
    const key = grouped(t);
    if (key) {
      let group = groups.get(key);
      if (!group) {
        group = { kind: 'group', key, label: siteLabel(key), tabs: [] };
        groups.set(key, group);
        entries.push(group);
      }
      group.tabs.push(t);
    } else if (t.tier === 'compact') {
      compact.push(t);
    } else {
      entries.push({ kind: 'tab', tab: t });
    }
  }
  return { entries, compact };
}

