// メインプロセスと UI (renderer) の間で共有する型定義

export interface TabState {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomPercent: number;
  audible: boolean;
  muted: boolean;
}

export interface BrowserState {
  tabs: TabState[];
  activeTabId: number | null;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

export type SearchEngineId = 'google' | 'duckduckgo' | 'bing' | 'yahoo_jp';

export interface Settings {
  homePage: string;
  searchEngine: SearchEngineId;
  showBookmarksBar: boolean;
  restoreSession: boolean;
}

export interface FindResult {
  activeMatchOrdinal: number;
  matches: number;
}

export interface DownloadInfo {
  id: string;
  filename: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  receivedBytes: number;
  totalBytes: number;
  savePath: string;
}

/** メニューやショートカットから UI に送られるコマンド */
export type UiCommand =
  | 'focus-address'
  | 'open-find'
  | 'toggle-history'
  | 'toggle-bookmarks'
  | 'toggle-settings'
  | 'toggle-downloads';

/** preload で UI に公開する API */
export interface BrowserApi {
  // タブ操作
  newTab(url?: string): void;
  closeTab(id: number): void;
  activateTab(id: number): void;
  moveTab(id: number, toIndex: number): void;
  toggleMute(id: number): void;

  // ナビゲーション (アクティブタブ)
  navigate(input: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  goHome(): void;
  zoom(direction: 'in' | 'out' | 'reset'): void;

  // ページ内検索
  find(text: string, forward: boolean, findNext: boolean): void;
  stopFind(): void;

  // レイアウト (UI が占める領域をメインに伝える)
  setLayout(top: number, right: number): void;

  // ブックマーク
  getBookmarks(): Promise<Bookmark[]>;
  toggleBookmark(url: string, title: string): Promise<Bookmark[]>;
  removeBookmark(id: string): Promise<Bookmark[]>;

  // 履歴
  getHistory(query: string): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;

  // 設定
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  // ダウンロード
  getDownloads(): Promise<DownloadInfo[]>;
  openDownload(id: string): void;
  showDownloadInFolder(id: string): void;
  cancelDownload(id: string): void;

  // メイン → UI のイベント
  onState(callback: (state: BrowserState) => void): void;
  onCommand(callback: (command: UiCommand) => void): void;
  onFindResult(callback: (result: FindResult) => void): void;
  onBookmarksChanged(callback: (bookmarks: Bookmark[]) => void): void;
  onSettingsChanged(callback: (settings: Settings) => void): void;
  onDownloadsChanged(callback: (downloads: DownloadInfo[]) => void): void;
}
