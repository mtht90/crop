import { BrowserWindow, WebContentsView } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'node:path';
import type { Appearance, BrowserState, Rect, Suggestion, TabState, Tier, UiCommand, ViewMode } from '../shared/types';
import { APP_ORIGIN, getUiSession } from './appProtocol';
import { resolveFavicon } from './favicons';
import type { SessionTab, Store } from './store';
import { accentFromThemeColor, hostColor } from './color';
import { openExternal, showContextMenu } from './contextMenu';
import { errorPageUrl } from './errorPage';
import { DEFAULT_TIER_OPTIONS, RETURN_MIN_AWAY_MS, WEIGHTS, assignTiers, bump, decay, pageKey } from './frecency';
import type { Score, TierOptions } from './frecency';
import { capture } from './thumbnails';
import type { ThumbnailDisk } from './thumbnails';
import { isAllowedUrl, resolveInput } from './url';

const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const MAX_CLOSED_TABS = 25;
/** 表示中のタブのプレビューを撮り直す間隔 */
const RECAPTURE_INTERVAL_MS = 6000;
/** ティアを定期的に見直す間隔 (時間経過で「あまり見ないページ」になるため) */
const RETIER_INTERVAL_MS = 15000;
/** ページを表示するカードの角丸 (UI の --radius-page と同じ) */
const PAGE_RADIUS = 12;
/** 上部バーの高さ (ウィンドウの最小化・最大化・閉じるボタンもこの高さ) */
export const TOPBAR_HEIGHT = 48;

// 開発・デモ用: FOLIO_FAST_TIERS=1 で「あまり見ないページ」になるまでの猶予を短くする
const TIER_OPTIONS: TierOptions = process.env.FOLIO_FAST_TIERS
  ? { ...DEFAULT_TIER_OPTIONS, compactGraceMs: 3000 }
  : DEFAULT_TIER_OPTIONS;

interface Tab {
  id: number;
  view: WebContentsView;
  favicon: string | null;
  /** 読み込み失敗時: 失敗した URL と代わりに表示しているエラーページ */
  error: { url: string; pageUrl: string } | null;
  pinned: boolean;
  openedAt: number;
  /** 一度でも画面に表示されたか */
  viewed: boolean;
  /** 最後にこのタブから離れた時刻 */
  leftAt: number | null;
  /** このタブ自体のスコア (ページが変わっても引き継ぐ) */
  score: Score | undefined;
  returns: number;
  tier: Tier | null;
  /** 直前にスコアを付けた URL (再読み込みを二重に数えないため) */
  scoredKey: string | null;
  themeAccent: string | null;
  capturedAccent: string | null;
  thumb: Buffer | null;
  thumbVersion: number;
  captureTimer: NodeJS.Timeout | null;
}

export interface WindowHooks {
  store: Store;
  appearance(): Appearance;
  thumbs: ThumbnailDisk;
  openWindow(urls: string[]): void;
  onClose(controller: BrowserWindowController): void;
  onClosed(controller: BrowserWindowController): void;
}

let nextTabId = 1;

/** 1 つのブラウザウィンドウと、その中のタブを管理する */
export class BrowserWindowController {
  readonly win: BrowserWindow;
  private tabs: Tab[] = [];
  private activeId: number | null = null;
  private mode: ViewMode = 'browse';
  /** オーバービューへ移行中 (UI がスナップショットを表示するのを待っている) */
  private enteringOverview: NodeJS.Timeout | null = null;
  /** Web ページを表示する領域 (UI から通知される) */
  private pageRect: Rect = { x: 0, y: TOPBAR_HEIGHT, width: 800, height: 600 };
  private htmlFullscreen = false;
  private closedTabs: { url: string; index: number; pinned: boolean }[] = [];
  private stateQueued = false;
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(private readonly hooks: WindowHooks, tabs: Array<SessionTab & { restored?: boolean }>) {
    const look = hooks.appearance();
    this.win = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 640,
      minHeight: 420,
      title: 'Folio',
      show: false,
      // OS のタイトルバーを消し、上部バーと一体化する (最小化・最大化・閉じるボタンは OS が描く)
      titleBarStyle: 'hidden',
      titleBarOverlay: process.platform === 'darwin' ? undefined : titleBarOverlay(look),
      trafficLightPosition: { x: 16, y: 17 },
      // Windows 11: 背景に OS のすりガラス (Acrylic) を使う
      backgroundMaterial: look.glass === 'os' ? 'acrylic' : undefined,
      backgroundColor: windowBackground(look),
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        // UI は専用のセッションで動かし、Web ページとは Cookie やキャッシュも共有しない
        session: getUiSession(),
        spellcheck: false,
      },
    });

    const ui = this.win.webContents;
    ui.loadURL(`${APP_ORIGIN}/index.html`);
    ui.on('did-finish-load', () => {
      this.sendState();
      for (const tab of this.tabs) this.sendThumb(tab);
    });
    // UI ページ自体が別の場所へ遷移したり、ウィンドウを開いたりしないようにする
    ui.on('will-navigate', (e) => e.preventDefault());
    ui.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.win.once('ready-to-show', () => this.win.show());
    for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) {
      this.win.on(event as 'resize', () => this.updateBounds());
    }
    this.win.on('app-command', (_e, command) => {
      if (command === 'browser-backward') this.goBack();
      if (command === 'browser-forward') this.goForward();
    });
    this.win.on('swipe', (_e, direction) => {
      if (direction === 'left') this.goBack();
      if (direction === 'right') this.goForward();
    });
    this.win.on('close', () => this.hooks.onClose(this));
    this.win.on('closed', () => {
      this.timers.forEach((t) => clearInterval(t));
      for (const tab of this.tabs) {
        if (tab.captureTimer) clearTimeout(tab.captureTimer);
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
      }
      this.tabs = [];
      this.hooks.onClosed(this);
    });

    this.timers.push(
      setInterval(() => {
        const tab = this.activeTab();
        if (tab && this.mode === 'browse' && this.win.isFocused() && !tab.view.webContents.isLoading()) {
          void this.captureTab(tab);
        }
      }, RECAPTURE_INTERVAL_MS),
      setInterval(() => this.sendState(), RETIER_INTERVAL_MS),
    );

    const initial = tabs.length > 0 ? tabs : [{ url: this.hooks.store.getSettings().homePage, pinned: false }];
    initial.forEach((t, i) => this.createTab(t.url, { activate: i === 0, pinned: t.pinned, restored: 'restored' in t && t.restored }));
  }

  // ------------------------------------------------------------------
  // 状態
  // ------------------------------------------------------------------

  ownsWebContents(wc: WebContents): boolean {
    return this.win.webContents === wc || this.tabs.some((t) => t.view.webContents === wc);
  }

  sessionTabs(): SessionTab[] {
    return this.tabs
      .map((t) => ({ url: this.tabUrl(t), pinned: t.pinned }))
      .filter((t) => /^(https?|file):/.test(t.url));
  }

  private activeTab(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  private findTab(id: number): Tab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  private indexOf(id: number): number {
    return this.tabs.findIndex((t) => t.id === id);
  }

  private tabUrl(tab: Tab): string {
    if (tab.error) return tab.error.url;
    const url = tab.view.webContents.getURL();
    return url === 'about:blank' ? '' : url;
  }

  /** タブのスコア = タブ自体のスコアと、表示中ページの (過去のセッションを含む) スコアの大きい方 */
  private tabScore(tab: Tab, now: number): number {
    return Math.max(decay(tab.score, now), this.hooks.store.pageScore(this.tabUrl(tab), now));
  }

  private tabAccent(tab: Tab): string | null {
    const url = this.tabUrl(tab);
    if (!url) return null;
    return tab.themeAccent ?? tab.capturedAccent ?? this.hooks.store.getPage(url)?.accent ?? hostColor(url);
  }

  private computeTiers(now: number): void {
    const tiers = assignTiers(
      this.tabs.map((t) => ({
        id: t.id,
        score: this.tabScore(t, now),
        pinned: t.pinned,
        active: t.id === this.activeId,
        openedAt: t.openedAt,
        prevTier: t.tier,
      })),
      now,
      TIER_OPTIONS,
    );
    for (const t of this.tabs) t.tier = tiers.get(t.id) ?? 'regular';
  }

  private tabState(tab: Tab, now: number): TabState {
    const wc = tab.view.webContents;
    const url = this.tabUrl(tab);
    return {
      id: tab.id,
      title: wc.getTitle() || url || '新しいタブ',
      url,
      favicon: tab.favicon,
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      zoomPercent: Math.round(wc.getZoomFactor() * 100),
      audible: wc.isCurrentlyAudible(),
      muted: wc.isAudioMuted(),
      pinned: tab.pinned,
      tier: tab.tier ?? 'regular',
      score: Math.round(this.tabScore(tab, now) * 100) / 100,
      returns: tab.returns,
      accent: this.tabAccent(tab),
      thumbVersion: tab.thumb ? tab.thumbVersion : 0,
      error: !!tab.error,
    };
  }

  private suggestions(now: number): Suggestion[] {
    const open = new Set(this.tabs.map((t) => pageKey(this.tabUrl(t))));
    return this.hooks.store
      .topPages(24, 3, now)
      .filter((p) => !open.has(p.key))
      .slice(0, 8)
      .map((p) => ({
        url: p.url,
        title: p.title,
        favicon: p.favicon,
        accent: p.accent ?? hostColor(p.url),
        score: Math.round(p.current * 100) / 100,
      }));
  }

  /** UI に状態を送る (同じイベントループ内の複数の変更はまとめる) */
  private sendState(): void {
    if (this.stateQueued) return;
    this.stateQueued = true;
    setImmediate(() => {
      this.stateQueued = false;
      if (this.win.isDestroyed()) return;
      const now = Date.now();
      const live = this.tabs.filter((t) => !t.view.webContents.isDestroyed());
      this.computeTiers(now);
      const state: BrowserState = {
        mode: this.mode,
        tabs: live.map((t) => this.tabState(t, now)),
        activeTabId: this.activeId,
        suggestions: this.suggestions(now),
      };
      this.win.webContents.send('state', state);
      const active = this.activeTab();
      this.win.setTitle(active ? `${state.tabs.find((t) => t.id === active.id)?.title ?? ''} — Folio` : 'Folio');
    });
  }

  private sendThumb(tab: Tab): void {
    if (!tab.thumb) return;
    this.send('thumb', { tabId: tab.id, version: tab.thumbVersion, data: tab.thumb });
  }

  send(channel: string, payload: unknown): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  sendCommand(command: UiCommand): void {
    if (command === 'focus-address' || command === 'open-find') this.win.webContents.focus();
    this.send('command', command);
  }

  // ------------------------------------------------------------------
  // プレビュー画像
  // ------------------------------------------------------------------

  /** タブを撮影してプレビューを更新する。表示中のタブでのみ成功する */
  private async captureTab(tab: Tab, withSnapshot = false): Promise<Buffer | null> {
    if (tab.view.webContents.isDestroyed()) return null;
    const result = await capture(tab.view.webContents, withSnapshot);
    if (!result) return null;
    tab.thumb = result.thumb;
    tab.thumbVersion++;
    const url = this.tabUrl(tab);
    if (result.color && result.color !== tab.capturedAccent) {
      tab.capturedAccent = result.color;
      this.hooks.store.updatePage(url, { accent: tab.themeAccent ?? result.color });
      this.sendState();
    }
    if (!tab.error && url) this.hooks.thumbs.save(url, result.thumb);
    this.sendThumb(tab);
    return result.snapshot;
  }

  private scheduleCapture(tab: Tab, delay: number): void {
    if (tab.captureTimer) clearTimeout(tab.captureTimer);
    tab.captureTimer = setTimeout(() => {
      tab.captureTimer = null;
      if (tab.id === this.activeId && this.mode === 'browse' && !this.win.isMinimized()) void this.captureTab(tab);
    }, delay);
  }

  // ------------------------------------------------------------------
  // レイアウト
  // ------------------------------------------------------------------

  setPageRect(rect: Rect): void {
    const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    this.pageRect = { x: n(rect.x), y: n(rect.y), width: n(rect.width), height: n(rect.height) };
    this.updateBounds();
  }

  /** テーマや透明効果の変更を反映する */
  applyAppearance(look: Appearance): void {
    if (this.win.isDestroyed()) return;
    if (process.platform === 'win32') this.win.setBackgroundMaterial(look.glass === 'os' ? 'acrylic' : 'none');
    this.win.setBackgroundColor(windowBackground(look));
    if (process.platform !== 'darwin') this.win.setTitleBarOverlay(titleBarOverlay(look));
    this.send('appearance', look);
  }

  private updateBounds(): void {
    if (this.win.isDestroyed()) return;
    const tab = this.activeTab();
    if (!tab) return;
    const { width, height } = this.win.getContentBounds();
    if (this.htmlFullscreen) {
      tab.view.setBorderRadius(0);
      tab.view.setBounds({ x: 0, y: 0, width, height });
      return;
    }
    const r = this.pageRect;
    tab.view.setBorderRadius(PAGE_RADIUS);
    tab.view.setBounds({
      x: Math.min(r.x, width),
      y: Math.min(r.y, height),
      width: Math.max(0, Math.min(r.width, width - r.x)),
      height: Math.max(0, Math.min(r.height, height - r.y)),
    });
  }

  // ------------------------------------------------------------------
  // オーバービュー
  // ------------------------------------------------------------------

  /**
   * オーバービューを開く。
   * 1. 表示中のページを撮影して UI に渡す
   * 2. UI が同じ位置にその画像を表示したら (overviewReady) ページを外す
   * 3. UI は画像をタイルの位置へ縮めるアニメーションを行う
   */
  async openOverview(launcher: boolean): Promise<void> {
    if (this.mode === 'overview' || this.enteringOverview) {
      this.send('overview:enter', { tabId: this.activeId, snapshot: null, launcher });
      return;
    }
    const tab = this.activeTab();
    // 撮影中に二重に呼ばれないよう印を付けておく (UI が応答しないときの保険はスナップショット送信後に始める)
    this.enteringOverview = setTimeout(() => undefined, 60_000);
    const snapshot = tab ? await this.captureTab(tab, true) : null;
    if (!this.enteringOverview) return; // 撮影中に閉じられた
    clearTimeout(this.enteringOverview);
    this.enteringOverview = setTimeout(() => this.overviewReady(), 1500);
    this.send('overview:enter', { tabId: tab?.id ?? null, snapshot, launcher });
    this.win.webContents.focus();
  }

  overviewReady(): void {
    if (!this.enteringOverview) return;
    clearTimeout(this.enteringOverview);
    this.enteringOverview = null;
    this.mode = 'overview';
    const tab = this.activeTab();
    if (tab) {
      tab.view.webContents.stopFindInPage('clearSelection');
      this.win.contentView.removeChildView(tab.view);
    }
    this.sendState();
  }

  closeOverview(tabId: number | null): void {
    if (this.enteringOverview) {
      clearTimeout(this.enteringOverview);
      this.enteringOverview = null;
    }
    const target = (tabId !== null ? this.findTab(tabId) : undefined) ?? this.activeTab() ?? this.tabs[0];
    this.mode = 'browse';
    if (!target) {
      this.sendState();
      return;
    }
    this.activateTab(target.id);
  }

  // ------------------------------------------------------------------
  // タブ操作
  // ------------------------------------------------------------------

  /**
   * restored: 前回のセッションから復元したタブ。復元時の読み込みは「訪問」として数えず、
   * 開いた直後の猶予も与えない (あまり見ないページは、再起動後もまとめたままにする)
   */
  createTab(url: string, opts: { activate?: boolean; afterActive?: boolean; pinned?: boolean; restored?: boolean } = {}): number {
    const { activate = true, afterActive = false, pinned = false, restored = false } = opts;
    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, safeDialogs: true },
    });
    view.setBackgroundColor('#ffffff');

    const tab: Tab = {
      id: nextTabId++,
      view,
      favicon: this.hooks.store.getPage(url)?.favicon?.startsWith('data:') ? this.hooks.store.getPage(url)!.favicon : null,
      error: null,
      pinned,
      openedAt: restored ? 0 : Date.now(),
      viewed: false,
      leftAt: null,
      score: undefined,
      returns: 0,
      tier: null,
      scoredKey: restored ? pageKey(url) : null,
      themeAccent: null,
      capturedAccent: null,
      thumb: this.hooks.thumbs.load(url),
      thumbVersion: 1,
      captureTimer: null,
    };
    const activeIndex = this.activeId === null ? -1 : this.indexOf(this.activeId);
    const index = afterActive && activeIndex >= 0 ? activeIndex + 1 : this.tabs.length;
    this.tabs.splice(index, 0, tab);
    this.attachTabEvents(tab);

    if (activate || this.activeId === null) this.activateTab(tab.id);
    this.load(tab, url);
    this.sendThumb(tab);
    this.sendState();
    return tab.id;
  }

  /**
   * 入力 (URL または検索語) を新しいタブで開く。
   * オーバービュー (ランチャー) から開いた場合は、そのままページ表示に戻る。
   */
  newTab(input: string): void {
    const settings = this.hooks.store.getSettings();
    const target = input.trim() ? resolveInput(input, settings.searchEngine) : settings.homePage;
    const id = this.createTab(target);
    if (this.mode === 'overview' || this.enteringOverview) this.closeOverview(id);
  }

  activateTab(id: number): void {
    const tab = this.findTab(id);
    if (!tab) return;
    const now = Date.now();
    const prev = this.activeTab();

    // しばらく離れていたタブに戻ってきた → 「よく戻るページ」として加点
    if (prev !== tab && tab.viewed && tab.leftAt !== null && now - tab.leftAt >= RETURN_MIN_AWAY_MS) {
      tab.score = bump(tab.score, WEIGHTS.return, now);
      tab.returns++;
      this.hooks.store.recordReturn(this.tabUrl(tab), now);
    }
    if (prev && prev !== tab) prev.leftAt = now;
    this.activeId = id;

    if (this.mode === 'browse') {
      // 新しいページを先に重ねてから、隠れた前のページを撮影して外す (撮影は表示中のビューでしかできない)
      this.win.contentView.addChildView(tab.view);
      tab.viewed = true;
      this.updateBounds();
      tab.view.webContents.focus();
      if (prev && prev !== tab) {
        prev.view.webContents.stopFindInPage('clearSelection');
        void this.captureTab(prev).finally(() => {
          if (prev.id !== this.activeId && !this.win.isDestroyed()) this.win.contentView.removeChildView(prev.view);
        });
      }
      this.scheduleCapture(tab, 700);
    }
    this.sendState();
  }

  closeTab(id: number): void {
    const index = this.indexOf(id);
    if (index < 0) return;
    const tab = this.tabs[index];
    const url = this.tabUrl(tab);
    if (url) {
      this.closedTabs.push({ url, index, pinned: tab.pinned });
      if (this.closedTabs.length > MAX_CLOSED_TABS) this.closedTabs.shift();
    }
    if (tab.captureTimer) clearTimeout(tab.captureTimer);

    this.tabs.splice(index, 1);
    this.win.contentView.removeChildView(tab.view);
    if (this.activeId === id) {
      this.activeId = null;
      const next = this.tabs[index] ?? this.tabs[index - 1];
      if (next) this.activateTab(next.id);
    }
    tab.view.webContents.close();

    // ページ表示中に最後のタブを閉じたらウィンドウを閉じる (オーバービューでは空のまま残す)
    if (this.tabs.length === 0 && this.mode === 'browse') {
      this.win.close();
      return;
    }
    this.sendState();
  }

  closeActiveTab(): void {
    if (this.activeId !== null) this.closeTab(this.activeId);
  }

  reopenClosedTab(): void {
    const closed = this.closedTabs.pop();
    if (!closed) return;
    const id = this.createTab(closed.url, { pinned: closed.pinned });
    this.moveTab(id, closed.index);
    if (this.mode === 'overview') this.closeOverview(id);
  }

  moveTab(id: number, toIndex: number): void {
    const from = this.indexOf(id);
    if (from < 0) return;
    const [tab] = this.tabs.splice(from, 1);
    const to = Math.max(0, Math.min(this.tabs.length, Math.round(toIndex)));
    this.tabs.splice(to, 0, tab);
    this.sendState();
  }

  cycleTab(offset: number): void {
    if (this.tabs.length === 0 || this.activeId === null || this.mode !== 'browse') return;
    const index = this.indexOf(this.activeId);
    const next = (index + offset + this.tabs.length) % this.tabs.length;
    this.activateTab(this.tabs[next].id);
  }

  selectTabAt(index: number): void {
    if (this.mode !== 'browse') return;
    const tab = index < 0 ? this.tabs[this.tabs.length - 1] : this.tabs[index];
    if (tab) this.activateTab(tab.id);
  }

  toggleMute(id: number): void {
    const tab = this.findTab(id);
    if (!tab) return;
    tab.view.webContents.setAudioMuted(!tab.view.webContents.isAudioMuted());
    this.sendState();
  }

  togglePin(id: number): void {
    const tab = this.findTab(id);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    this.sendState();
  }

  togglePinActive(): void {
    if (this.activeId !== null) this.togglePin(this.activeId);
  }

  // ------------------------------------------------------------------
  // ナビゲーション (アクティブタブ)
  // ------------------------------------------------------------------

  private load(tab: Tab, url: string): void {
    if (!isAllowedUrl(url)) return;
    tab.error = null;
    tab.view.webContents.loadURL(url).catch(() => undefined);
  }

  navigate(input: string): void {
    const tab = this.activeTab();
    if (!tab) {
      this.newTab(input);
      return;
    }
    this.load(tab, resolveInput(input, this.hooks.store.getSettings().searchEngine));
    tab.view.webContents.focus();
  }

  goBack(): void {
    const history = this.activeTab()?.view.webContents.navigationHistory;
    if (history?.canGoBack()) history.goBack();
  }

  goForward(): void {
    const history = this.activeTab()?.view.webContents.navigationHistory;
    if (history?.canGoForward()) history.goForward();
  }

  reload(ignoreCache = false): void {
    const tab = this.activeTab();
    if (!tab) return;
    if (tab.error) this.load(tab, tab.error.url);
    else if (ignoreCache) tab.view.webContents.reloadIgnoringCache();
    else tab.view.webContents.reload();
  }

  stop(): void {
    this.activeTab()?.view.webContents.stop();
  }

  zoom(direction: 'in' | 'out' | 'reset'): void {
    const tab = this.activeTab();
    if (tab) this.zoomTab(tab, direction);
  }

  private zoomTab(tab: Tab, direction: 'in' | 'out' | 'reset'): void {
    const wc = tab.view.webContents;
    const current = Math.round(wc.getZoomFactor() * 100);
    let next = 100;
    if (direction === 'in') next = ZOOM_STEPS.find((z) => z > current) ?? current;
    if (direction === 'out') next = [...ZOOM_STEPS].reverse().find((z) => z < current) ?? current;
    wc.setZoomFactor(next / 100);
    this.sendState();
  }

  find(text: string, forward: boolean, findNext: boolean): void {
    const wc = this.activeTab()?.view.webContents;
    if (!wc || this.mode !== 'browse') return;
    if (text === '') {
      wc.stopFindInPage('clearSelection');
      this.send('find:result', { activeMatchOrdinal: 0, matches: 0 });
      return;
    }
    // Electron の findNext は「新しい検索セッションを開始するか」を表すので反転して渡す
    wc.findInPage(text, { forward, findNext: !findNext });
  }

  stopFind(): void {
    this.activeTab()?.view.webContents.stopFindInPage('keepSelection');
  }

  toggleDevTools(): void {
    this.activeTab()?.view.webContents.toggleDevTools();
  }

  viewSource(): void {
    const tab = this.activeTab();
    if (!tab) return;
    const url = this.tabUrl(tab);
    if (/^(https?|file):/.test(url)) this.createTab(`view-source:${url}`, { afterActive: true });
  }

  // ------------------------------------------------------------------
  // タブの WebContents イベント
  // ------------------------------------------------------------------

  private attachTabEvents(tab: Tab): void {
    const wc = tab.view.webContents;
    const store = this.hooks.store;
    const update = () => this.sendState();

    wc.on('page-title-updated', (_e, title) => {
      store.updateHistoryTitle(wc.getURL(), title);
      store.updatePage(wc.getURL(), { title });
      update();
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      const raw = favicons.find((f) => /^(https?|data):/.test(f));
      if (raw) void this.setFavicon(tab, raw, wc.getURL());
    });
    wc.on('did-change-theme-color', (_e, color) => {
      tab.themeAccent = accentFromThemeColor(color);
      if (tab.themeAccent) store.updatePage(wc.getURL(), { accent: tab.themeAccent });
      update();
    });
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', () => {
      update();
      if (tab.id === this.activeId) this.scheduleCapture(tab, 500);
    });
    wc.on('audio-state-changed', update);
    wc.on('zoom-changed', (_e, direction) => this.zoomTab(tab, direction === 'in' ? 'in' : 'out'));

    wc.on('did-navigate', (_e, url) => {
      tab.favicon = null;
      tab.themeAccent = null;
      tab.capturedAccent = null;
      if (tab.error && url !== tab.error.pageUrl) tab.error = null;
      store.addHistory(url, wc.getTitle());
      this.scoreNavigation(tab, url);
      update();
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      store.addHistory(url, wc.getTitle());
      this.scoreNavigation(tab, url);
      if (tab.id === this.activeId) this.scheduleCapture(tab, 800);
      update();
    });
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      // -3 (ERR_ABORTED) は中止やダウンロード開始など。エラーページは出さない
      if (!isMainFrame || code === -3 || url.startsWith('data:')) return;
      const pageUrl = errorPageUrl(url, code, description);
      tab.error = { url, pageUrl };
      wc.loadURL(pageUrl).catch(() => undefined);
      update();
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      const url = this.tabUrl(tab);
      const pageUrl = errorPageUrl(url, 0, `ページがクラッシュしました (${details.reason})`);
      tab.error = { url, pageUrl };
      wc.loadURL(pageUrl).catch(() => undefined);
    });

    wc.on('found-in-page', (_e, result) => {
      if (tab.id !== this.activeId) return;
      this.send('find:result', { activeMatchOrdinal: result.activeMatchOrdinal, matches: result.matches });
    });

    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreen = true;
      this.updateBounds();
    });
    wc.on('leave-html-full-screen', () => {
      this.htmlFullscreen = false;
      this.updateBounds();
    });

    // http(s) 等以外への遷移はブロックし、mailto: などは確認後に外部アプリで開く
    wc.on('will-navigate', (e) => {
      if (isAllowedUrl(e.url)) return;
      e.preventDefault();
      openExternal(this.win, e.url);
    });

    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (!isAllowedUrl(url)) {
        openExternal(this.win, url);
        return { action: 'deny' };
      }
      // サイズ指定付きの window.open (OAuth ログイン等) はポップアップウィンドウとして開く
      if (disposition === 'new-window') {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
      }
      this.createTab(url, { activate: disposition !== 'background-tab', afterActive: true });
      return { action: 'deny' };
    });

    wc.on('context-menu', (_e, params) =>
      showContextMenu(this.win, wc, params, {
        openInBackground: (u) => this.createTab(u, { activate: false, afterActive: true }),
        openInForeground: (u) => this.createTab(u, { afterActive: true }),
        openInNewWindow: (u) => this.hooks.openWindow([u]),
        reload: () => (tab.id === this.activeId ? this.reload() : wc.reload()),
        viewSource: () => this.viewSource(),
        searchEngine: () => this.hooks.store.getSettings().searchEngine,
      }),
    );
  }

  /** ファビコンを data: URL にしてから UI に渡す (UI は外部へ通信しない) */
  private async setFavicon(tab: Tab, raw: string, pageUrl: string): Promise<void> {
    const data = await resolveFavicon(raw);
    if (!data || tab.view.webContents.isDestroyed() || tab.view.webContents.getURL() !== pageUrl) return;
    tab.favicon = data;
    // 大きなファビコンは保存しない (保存データを小さく保つ)
    this.hooks.store.updatePage(pageUrl, { favicon: data.length <= 16_000 ? data : null });
    this.sendState();
  }

  /** ページの読み込み (再読み込みを除く) をスコアに反映する */
  private scoreNavigation(tab: Tab, url: string): void {
    const key = pageKey(url);
    if (!key || key === tab.scoredKey) return;
    tab.scoredKey = key;
    const now = Date.now();
    const isReturn = this.hooks.store.recordVisit(url, tab.view.webContents.getTitle(), now);
    tab.score = bump(tab.score, isReturn ? WEIGHTS.return : WEIGHTS.visit, now);
  }
}

/** ウィンドウの背景色。OS のすりガラスを使うときは透明にする */
function windowBackground(look: Appearance): string {
  if (look.glass === 'os') return '#00000000';
  return look.theme === 'dark' ? '#17181b' : '#eceae6';
}

/** 最小化・最大化・閉じるボタンの見た目 */
function titleBarOverlay(look: Appearance): Electron.TitleBarOverlayOptions {
  return {
    color: '#00000000',
    symbolColor: look.theme === 'dark' ? '#e9e7e3' : '#2a2825',
    height: TOPBAR_HEIGHT,
  };
}
