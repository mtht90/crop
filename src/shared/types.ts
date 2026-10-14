// メインプロセスと UI (renderer) の間で共有する型定義

/**
 * ページの「目立ち度」。再閲覧スコアから決まる。
 * - hero:    よく戻るページ。大きなプレビューで表示
 * - regular: 通常
 * - compact: あまり見ないページ。小さくまとめて表示
 */
export type Tier = 'hero' | 'regular' | 'compact';

export type ViewMode = 'browse' | 'overview';

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
  pinned: boolean;
  tier: Tier;
  /** 再閲覧スコア (減衰込み) */
  score: number;
  /** このセッションで別のタブから戻ってきた回数 */
  returns: number;
  /** ページを識別するアクセントカラー (#rrggbb) */
  accent: string | null;
  /** プレビュー画像の版。0 ならまだプレビューが無い */
  thumbVersion: number;
}

export interface Suggestion {
  url: string;
  title: string;
  favicon: string | null;
  accent: string | null;
  score: number;
}

export interface BrowserState {
  mode: ViewMode;
  tabs: TabState[];
  activeTabId: number | null;
  /** 開いていないが、よく戻るページ */
  suggestions: Suggestion[];
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

export interface Thumb {
  tabId: number;
  version: number;
  /** JPEG */
  data: Uint8Array;
}

/** オーバービューに入るときに UI に渡す、現在のページの画像 */
export interface OverviewEnter {
  tabId: number | null;
  /** 現在のページ全体の JPEG (無ければ null) */
  snapshot: Uint8Array | null;
  /** 新しいページを開くためのランチャーとして開いたか */
  launcher: boolean;
}

/** メニューやショートカットから UI に送られるコマンド */
export type UiCommand =
  | 'focus-address'
  | 'open-find'
  | 'toggle-settings'
  | 'toggle-downloads';

/** preload で UI に公開する API */
export interface BrowserApi {
  // タブ操作
  newTab(url: string): void;
  closeTab(id: number): void;
  activateTab(id: number): void;
  moveTab(id: number, toIndex: number): void;
  toggleMute(id: number): void;
  togglePin(id: number): void;

  // オーバービュー
  /** オーバービューを開く (メインがスナップショットを撮って onOverviewEnter を返す) */
  openOverview(launcher: boolean): void;
  /** UI がスナップショットを表示し終えた → メインはページを隠す */
  overviewReady(): void;
  /** オーバービューを閉じて tabId のページを表示する */
  closeOverview(tabId: number | null): void;

  // ナビゲーション (アクティブタブ)
  navigate(input: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  zoom(direction: 'in' | 'out' | 'reset'): void;

  // ページ内検索
  find(text: string, forward: boolean, findNext: boolean): void;
  stopFind(): void;

  // レイアウト (UI が占める上端の高さ・右側の幅)
  setLayout(top: number, right: number): void;

  // 履歴
  searchHistory(query: string): Promise<HistoryEntry[]>;

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
  onThumb(callback: (thumb: Thumb) => void): void;
  onOverviewEnter(callback: (enter: OverviewEnter) => void): void;
  onCommand(callback: (command: UiCommand) => void): void;
  onFindResult(callback: (result: FindResult) => void): void;
  onSettingsChanged(callback: (settings: Settings) => void): void;
  onDownloadsChanged(callback: (downloads: DownloadInfo[]) => void): void;
}
