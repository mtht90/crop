import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HistoryEntry, Settings } from '../shared/types';
import { REVISIT_GAP_MS, WEIGHTS, bump, decay, pageKey } from './frecency';
import type { Score } from './frecency';

const MAX_HISTORY = 5000;
const MAX_PAGES = 2000;

export const DEFAULT_SETTINGS: Settings = {
  homePage: 'https://www.google.com/',
  searchEngine: 'google',
  restoreSession: true,
};

/** ページごとの再閲覧の記録 (セッションをまたいで保存) */
export interface PageStat {
  url: string;
  title: string;
  favicon: string | null;
  accent: string | null;
  visits: number;
  returns: number;
  lastVisit: number;
  score: Score;
}

export interface SessionTab {
  url: string;
  pinned: boolean;
}

/** userData ディレクトリ内の JSON ファイルに値を保存する簡易ストア */
class JsonFile<T> {
  private value: T;
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(private readonly file: string, fallback: T) {
    this.value = fallback;
    try {
      this.value = JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
      // 初回起動時やファイル破損時は既定値を使う
    }
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    this.dirty = true;
    // 書き込みをまとめるため少し遅延させる
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1000);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.value));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`Failed to save ${this.file}:`, err);
    }
  }
}

export class Store {
  readonly dir: string;
  private readonly history: JsonFile<HistoryEntry[]>;
  private readonly settings: JsonFile<Settings>;
  private readonly session: JsonFile<Array<SessionTab | string>>;
  private readonly pages: JsonFile<Record<string, PageStat>>;

  constructor(dir = app.getPath('userData')) {
    this.dir = dir;
    this.history = new JsonFile(path.join(dir, 'history.json'), []);
    this.settings = new JsonFile(path.join(dir, 'settings.json'), { ...DEFAULT_SETTINGS });
    this.session = new JsonFile(path.join(dir, 'session.json'), []);
    this.pages = new JsonFile(path.join(dir, 'pages.json'), {});
  }

  // ---- 再閲覧の記録 ----

  getPage(url: string): PageStat | undefined {
    const key = pageKey(url);
    return key ? this.pages.get()[key] : undefined;
  }

  pageScore(url: string, now = Date.now()): number {
    return decay(this.getPage(url)?.score, now);
  }

  /**
   * ページを開いたことを記録する。
   * しばらく間をあけて同じページを開いた場合は「戻ってきた」として大きく加点する。
   * 戻り値: 戻ってきた訪問だったか
   */
  recordVisit(url: string, title: string, now = Date.now()): boolean {
    const key = pageKey(url);
    if (!key) return false;
    const pages = this.pages.get();
    const prev = pages[key];
    const isReturn = !!prev && now - prev.lastVisit >= REVISIT_GAP_MS;
    pages[key] = {
      url,
      title: title || prev?.title || url,
      favicon: prev?.favicon ?? null,
      accent: prev?.accent ?? null,
      visits: (prev?.visits ?? 0) + 1,
      returns: (prev?.returns ?? 0) + (isReturn ? 1 : 0),
      lastVisit: now,
      score: bump(prev?.score, isReturn ? WEIGHTS.return : WEIGHTS.visit, now),
    };
    this.prunePages(pages, now);
    this.pages.set(pages);
    return isReturn;
  }

  /** 別のタブからこのページに戻ってきたことを記録する */
  recordReturn(url: string, now = Date.now()): void {
    const key = pageKey(url);
    const pages = this.pages.get();
    const prev = key ? pages[key] : undefined;
    if (!key || !prev) return;
    pages[key] = {
      ...prev,
      returns: prev.returns + 1,
      lastVisit: now,
      score: bump(prev.score, WEIGHTS.return, now),
    };
    this.pages.set(pages);
  }

  updatePage(url: string, patch: Partial<Pick<PageStat, 'title' | 'favicon' | 'accent'>>): void {
    const key = pageKey(url);
    const pages = this.pages.get();
    const prev = key ? pages[key] : undefined;
    if (!key || !prev) return;
    const next = { ...prev };
    if (patch.title) next.title = patch.title;
    if (patch.favicon !== undefined) next.favicon = patch.favicon;
    if (patch.accent !== undefined) next.accent = patch.accent;
    pages[key] = next;
    this.pages.set(pages);
  }

  /** スコアの高い順にページを返す */
  topPages(limit: number, minScore: number, now = Date.now()): Array<PageStat & { key: string; current: number }> {
    return Object.entries(this.pages.get())
      .map(([key, p]) => ({ ...p, key, current: decay(p.score, now) }))
      .filter((p) => p.current >= minScore)
      .sort((a, b) => b.current - a.current)
      .slice(0, limit);
  }

  private prunePages(pages: Record<string, PageStat>, now: number): void {
    const keys = Object.keys(pages);
    if (keys.length <= MAX_PAGES) return;
    keys
      .sort((a, b) => decay(pages[a].score, now) - decay(pages[b].score, now))
      .slice(0, keys.length - MAX_PAGES)
      .forEach((k) => delete pages[k]);
  }

  // ---- 履歴 ----

  addHistory(url: string, title: string): void {
    if (!/^(https?|file):/.test(url)) return;
    const list = this.history.get();
    const last = list[0];
    if (last && last.url === url) {
      list[0] = { url, title: title || last.title, visitedAt: Date.now() };
      this.history.set(list);
      return;
    }
    this.history.set([{ url, title: title || url, visitedAt: Date.now() }, ...list].slice(0, MAX_HISTORY));
  }

  updateHistoryTitle(url: string, title: string): void {
    const list = this.history.get();
    if (list[0] && list[0].url === url && title) {
      list[0] = { ...list[0], title };
      this.history.set(list);
    }
  }

  /** 履歴を検索する (同じ URL は 1 件にまとめる) */
  searchHistory(query: string, limit = 30): HistoryEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const result: HistoryEntry[] = [];
    for (const h of this.history.get()) {
      if (seen.has(h.url)) continue;
      if (!h.url.toLowerCase().includes(q) && !h.title.toLowerCase().includes(q)) continue;
      seen.add(h.url);
      result.push(h);
      if (result.length >= limit) break;
    }
    return result;
  }

  // ---- 設定 ----

  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.settings.get() };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.getSettings(), ...patch };
    this.settings.set(next);
    return next;
  }

  // ---- セッション (前回開いていたタブ) ----

  getSession(): SessionTab[] {
    return this.session.get().map((t) => (typeof t === 'string' ? { url: t, pinned: false } : t));
  }

  saveSession(tabs: SessionTab[]): void {
    this.session.set(tabs);
  }

  flush(): void {
    this.history.flush();
    this.settings.flush();
    this.session.flush();
    this.pages.flush();
  }
}
