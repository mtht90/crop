import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Bookmark, HistoryEntry, Settings } from '../shared/types';

const MAX_HISTORY = 5000;

export const DEFAULT_SETTINGS: Settings = {
  homePage: 'https://www.google.com/',
  searchEngine: 'google',
  showBookmarksBar: true,
  restoreSession: true,
};

/** userData ディレクトリ内の JSON ファイルに値を保存する簡易ストア */
class JsonFile<T> {
  private value: T;
  private timer: NodeJS.Timeout | null = null;

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
    // 書き込みをまとめるため少し遅延させる
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.value, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`Failed to save ${this.file}:`, err);
    }
  }
}

export class Store {
  private readonly bookmarks: JsonFile<Bookmark[]>;
  private readonly history: JsonFile<HistoryEntry[]>;
  private readonly settings: JsonFile<Settings>;
  private readonly session: JsonFile<string[]>;

  constructor(dir = app.getPath('userData')) {
    this.bookmarks = new JsonFile(path.join(dir, 'bookmarks.json'), []);
    this.history = new JsonFile(path.join(dir, 'history.json'), []);
    this.settings = new JsonFile(path.join(dir, 'settings.json'), { ...DEFAULT_SETTINGS });
    this.session = new JsonFile(path.join(dir, 'session.json'), []);
  }

  // ---- ブックマーク ----
  getBookmarks(): Bookmark[] {
    return this.bookmarks.get();
  }

  isBookmarked(url: string): boolean {
    return this.bookmarks.get().some((b) => b.url === url);
  }

  toggleBookmark(url: string, title: string): Bookmark[] {
    const list = this.bookmarks.get();
    const next = list.some((b) => b.url === url)
      ? list.filter((b) => b.url !== url)
      : [...list, { id: randomUUID(), url, title: title || url, createdAt: Date.now() }];
    this.bookmarks.set(next);
    return next;
  }

  removeBookmark(id: string): Bookmark[] {
    const next = this.bookmarks.get().filter((b) => b.id !== id);
    this.bookmarks.set(next);
    return next;
  }

  // ---- 履歴 ----
  addHistory(url: string, title: string): void {
    if (!/^(https?|file):/.test(url)) return;
    const list = this.history.get();
    const last = list[0];
    // 同じ URL の連続訪問 (リロード等) はタイトルと時刻だけ更新する
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

  searchHistory(query: string, limit = 300): HistoryEntry[] {
    const q = query.trim().toLowerCase();
    const list = this.history.get();
    const matched = q
      ? list.filter((h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q))
      : list;
    return matched.slice(0, limit);
  }

  clearHistory(): void {
    this.history.set([]);
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
  getSession(): string[] {
    return this.session.get();
  }

  saveSession(urls: string[]): void {
    this.session.set(urls);
  }

  flush(): void {
    this.bookmarks.flush();
    this.history.flush();
    this.settings.flush();
    this.session.flush();
  }
}
