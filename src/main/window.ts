import { BrowserWindow, Menu, WebContentsView, clipboard, dialog, shell } from 'electron';
import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron';
import * as path from 'node:path';
import type { BrowserState, TabState, UiCommand } from '../shared/types';
import type { Store } from './store';
import { errorPageUrl } from './errorPage';
import { isAllowedUrl, resolveInput, searchUrl } from './url';

const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const MAX_CLOSED_TABS = 25;
// 確認のうえ OS の既定アプリで開いてよい外部スキーム
const EXTERNAL_SCHEMES = new Set(['mailto:', 'tel:', 'sms:']);

interface Tab {
  id: number;
  view: WebContentsView;
  favicon: string | null;
  /** 読み込み失敗時: 失敗した URL と代わりに表示しているエラーページ */
  error: { url: string; pageUrl: string } | null;
}

export interface WindowHooks {
  store: Store;
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
  private layout = { top: 110, right: 0 };
  private htmlFullscreen = false;
  private closedTabs: { url: string; index: number }[] = [];
  private stateQueued = false;

  constructor(private readonly hooks: WindowHooks, urls: string[]) {
    this.win = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 480,
      minHeight: 320,
      title: 'Crop Browser',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    const ui = this.win.webContents;
    ui.loadFile(path.join(__dirname, '../renderer/index.html'));
    ui.on('did-finish-load', () => this.sendState());
    // UI ページ自体が別の場所へ遷移したり、ウィンドウを開いたりしないようにする
    ui.on('will-navigate', (e) => e.preventDefault());
    ui.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.win.once('ready-to-show', () => this.win.show());
    for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) {
      this.win.on(event as 'resize', () => this.updateBounds());
    }
    // マウスの戻る/進むボタン (Windows)
    this.win.on('app-command', (_e, command) => {
      if (command === 'browser-backward') this.goBack();
      if (command === 'browser-forward') this.goForward();
    });
    // トラックパッドのスワイプ (macOS)
    this.win.on('swipe', (_e, direction) => {
      if (direction === 'left') this.goBack();
      if (direction === 'right') this.goForward();
    });
    this.win.on('close', () => this.hooks.onClose(this));
    this.win.on('closed', () => {
      for (const tab of this.tabs) {
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
      }
      this.tabs = [];
      this.hooks.onClosed(this);
    });

    const initial = urls.length > 0 ? urls : [this.hooks.store.getSettings().homePage];
    initial.forEach((url, i) => this.createTab(url, { activate: i === 0 }));
  }

  // ------------------------------------------------------------------
  // 状態
  // ------------------------------------------------------------------

  ownsWebContents(wc: WebContents): boolean {
    return this.win.webContents === wc || this.tabs.some((t) => t.view.webContents === wc);
  }

  tabUrls(): string[] {
    return this.tabs.map((t) => this.tabUrl(t)).filter((url) => /^(https?|file):/.test(url));
  }

  private activeTab(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  private indexOf(id: number): number {
    return this.tabs.findIndex((t) => t.id === id);
  }

  private tabUrl(tab: Tab): string {
    if (tab.error) return tab.error.url;
    const url = tab.view.webContents.getURL();
    return url === 'about:blank' ? '' : url;
  }

  private tabState(tab: Tab): TabState {
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
    };
  }

  /** UI に状態を送る (同じイベントループ内の複数の変更はまとめる) */
  private sendState(): void {
    if (this.stateQueued) return;
    this.stateQueued = true;
    setImmediate(() => {
      this.stateQueued = false;
      if (this.win.isDestroyed()) return;
      const state: BrowserState = {
        tabs: this.tabs.filter((t) => !t.view.webContents.isDestroyed()).map((t) => this.tabState(t)),
        activeTabId: this.activeId,
      };
      this.win.webContents.send('state', state);
      const active = this.activeTab();
      this.win.setTitle(active ? `${this.tabState(active).title} - Crop Browser` : 'Crop Browser');
    });
  }

  send(channel: string, payload: unknown): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  sendCommand(command: UiCommand): void {
    if (command === 'focus-address' || command === 'open-find') {
      this.win.webContents.focus();
    }
    this.send('command', command);
  }

  // ------------------------------------------------------------------
  // レイアウト
  // ------------------------------------------------------------------

  setLayout(top: number, right: number): void {
    this.layout = { top: Math.max(0, Math.round(top)), right: Math.max(0, Math.round(right)) };
    this.updateBounds();
  }

  private updateBounds(): void {
    if (this.win.isDestroyed()) return;
    const tab = this.activeTab();
    if (!tab) return;
    const { width, height } = this.win.getContentBounds();
    if (this.htmlFullscreen) {
      tab.view.setBounds({ x: 0, y: 0, width, height });
      return;
    }
    const top = Math.min(this.layout.top, height);
    tab.view.setBounds({
      x: 0,
      y: top,
      width: Math.max(0, width - this.layout.right),
      height: Math.max(0, height - top),
    });
  }

  // ------------------------------------------------------------------
  // タブ操作
  // ------------------------------------------------------------------

  createTab(url: string, opts: { activate?: boolean; afterActive?: boolean } = {}): void {
    const { activate = true, afterActive = false } = opts;
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        safeDialogs: true,
      },
    });
    view.setBackgroundColor('#ffffff');

    const tab: Tab = { id: nextTabId++, view, favicon: null, error: null };
    const activeIndex = this.activeId === null ? -1 : this.indexOf(this.activeId);
    const index = afterActive && activeIndex >= 0 ? activeIndex + 1 : this.tabs.length;
    this.tabs.splice(index, 0, tab);
    this.attachTabEvents(tab);

    if (activate || this.activeId === null) this.activateTab(tab.id);
    this.load(tab, url);
    this.sendState();
  }

  newTab(url?: string): void {
    const settings = this.hooks.store.getSettings();
    const target = url ? resolveInput(url, settings.searchEngine) : settings.homePage;
    this.createTab(target);
    if (!url) this.sendCommand('focus-address');
  }

  activateTab(id: number): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const prev = this.activeTab();
    if (prev && prev !== tab) {
      this.win.contentView.removeChildView(prev.view);
      prev.view.webContents.stopFindInPage('clearSelection');
    }
    this.activeId = id;
    this.win.contentView.addChildView(tab.view);
    this.updateBounds();
    tab.view.webContents.focus();
    this.sendState();
  }

  closeTab(id: number): void {
    const index = this.indexOf(id);
    if (index < 0) return;
    const tab = this.tabs[index];
    const url = this.tabUrl(tab);
    if (url) {
      this.closedTabs.push({ url, index });
      if (this.closedTabs.length > MAX_CLOSED_TABS) this.closedTabs.shift();
    }

    this.tabs.splice(index, 1);
    if (this.activeId === id) {
      this.win.contentView.removeChildView(tab.view);
      this.activeId = null;
      const next = this.tabs[index] ?? this.tabs[index - 1];
      if (next) this.activateTab(next.id);
    }
    tab.view.webContents.close();

    if (this.tabs.length === 0) {
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
    this.createTab(closed.url);
    // 元の位置に戻す
    if (this.activeId !== null) this.moveTab(this.activeId, closed.index);
  }

  moveTab(id: number, toIndex: number): void {
    const from = this.indexOf(id);
    if (from < 0) return;
    const [tab] = this.tabs.splice(from, 1);
    const to = Math.max(0, Math.min(this.tabs.length, Math.round(toIndex)));
    this.tabs.splice(to, 0, tab);
    this.sendState();
  }

  /** offset 分だけ隣のタブへ移動 (循環する) */
  cycleTab(offset: number): void {
    if (this.tabs.length === 0 || this.activeId === null) return;
    const index = this.indexOf(this.activeId);
    const next = (index + offset + this.tabs.length) % this.tabs.length;
    this.activateTab(this.tabs[next].id);
  }

  /** 0 始まりの位置のタブへ移動。-1 なら最後のタブ */
  selectTabAt(index: number): void {
    const tab = index < 0 ? this.tabs[this.tabs.length - 1] : this.tabs[index];
    if (tab) this.activateTab(tab.id);
  }

  toggleMute(id: number): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.view.webContents.setAudioMuted(!tab.view.webContents.isAudioMuted());
    this.sendState();
  }

  // ------------------------------------------------------------------
  // ナビゲーション (アクティブタブ)
  // ------------------------------------------------------------------

  private load(tab: Tab, url: string): void {
    if (!isAllowedUrl(url)) return;
    tab.error = null;
    // 失敗時は did-fail-load で処理するので、ここでの reject は無視する
    tab.view.webContents.loadURL(url).catch(() => undefined);
  }

  navigate(input: string): void {
    const tab = this.activeTab();
    if (!tab) return;
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
    if (tab.error) {
      this.load(tab, tab.error.url);
    } else if (ignoreCache) {
      tab.view.webContents.reloadIgnoringCache();
    } else {
      tab.view.webContents.reload();
    }
  }

  stop(): void {
    this.activeTab()?.view.webContents.stop();
  }

  goHome(): void {
    const tab = this.activeTab();
    if (tab) this.load(tab, this.hooks.store.getSettings().homePage);
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
    if (!wc) return;
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

  activeTabInfo(): { url: string; title: string } | null {
    const tab = this.activeTab();
    if (!tab) return null;
    return { url: this.tabUrl(tab), title: tab.view.webContents.getTitle() };
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
      update();
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons.find((f) => /^(https?|data):/.test(f)) ?? null;
      update();
    });
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', update);
    wc.on('audio-state-changed', update);
    wc.on('zoom-changed', (_e, direction) => this.zoomTab(tab, direction === 'in' ? 'in' : 'out'));

    wc.on('did-navigate', (_e, url) => {
      tab.favicon = null;
      if (tab.error && url !== tab.error.pageUrl) tab.error = null;
      store.addHistory(url, wc.getTitle());
      update();
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      store.addHistory(url, wc.getTitle());
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
      this.openExternal(e.url);
    });

    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (!isAllowedUrl(url)) {
        this.openExternal(url);
        return { action: 'deny' };
      }
      // サイズ指定付きの window.open (OAuth ログイン等) はポップアップウィンドウとして開く
      if (disposition === 'new-window') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: { autoHideMenuBar: true },
        };
      }
      this.createTab(url, { activate: disposition !== 'background-tab', afterActive: true });
      return { action: 'deny' };
    });

    wc.on('context-menu', (_e, params) => this.showContextMenu(tab, params));
  }

  private openExternal(url: string): void {
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      return;
    }
    if (!EXTERNAL_SCHEMES.has(protocol)) return;
    const response = dialog.showMessageBoxSync(this.win, {
      type: 'question',
      buttons: ['開く', 'キャンセル'],
      defaultId: 0,
      cancelId: 1,
      message: '外部アプリケーションで開きますか？',
      detail: url,
    });
    if (response === 0) shell.openExternal(url).catch(() => undefined);
  }

  private showContextMenu(tab: Tab, params: ContextMenuParams): void {
    const wc = tab.view.webContents;
    const items: MenuItemConstructorOptions[] = [];
    const separator: MenuItemConstructorOptions = { type: 'separator' };

    if (params.linkURL && isAllowedUrl(params.linkURL)) {
      const link = params.linkURL;
      items.push(
        { label: 'リンクを新しいタブで開く', click: () => this.createTab(link, { activate: false, afterActive: true }) },
        { label: 'リンクを新しいウィンドウで開く', click: () => this.hooks.openWindow([link]) },
        { label: 'リンクのアドレスをコピー', click: () => clipboard.writeText(link) },
        separator,
      );
    }

    if (params.mediaType === 'image' && params.srcURL) {
      const src = params.srcURL;
      items.push(
        { label: '画像を新しいタブで開く', click: () => this.createTab(src, { activate: false, afterActive: true }) },
        { label: '名前を付けて画像を保存', click: () => wc.downloadURL(src) },
        { label: '画像をコピー', click: () => wc.copyImageAt(params.x, params.y) },
        { label: '画像のアドレスをコピー', click: () => clipboard.writeText(src) },
        separator,
      );
    }

    const selection = params.selectionText.trim();
    if (params.isEditable) {
      const flags = params.editFlags;
      items.push(
        { label: '元に戻す', enabled: flags.canUndo, click: () => wc.undo() },
        { label: 'やり直す', enabled: flags.canRedo, click: () => wc.redo() },
        separator,
        { label: '切り取り', enabled: flags.canCut, click: () => wc.cut() },
        { label: 'コピー', enabled: flags.canCopy, click: () => wc.copy() },
        { label: '貼り付け', enabled: flags.canPaste, click: () => wc.paste() },
        { label: 'すべて選択', enabled: flags.canSelectAll, click: () => wc.selectAll() },
        separator,
      );
    } else if (selection) {
      const label = selection.length > 20 ? `${selection.slice(0, 20)}…` : selection;
      const engine = this.hooks.store.getSettings().searchEngine;
      items.push(
        { label: 'コピー', click: () => wc.copy() },
        { label: `「${label}」を検索`, click: () => this.createTab(searchUrl(selection, engine), { afterActive: true }) },
        separator,
      );
    }

    if (items.length === 0) {
      items.push(
        { label: '戻る', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: '進む', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: '再読み込み', click: () => (tab.id === this.activeId ? this.reload() : wc.reload()) },
        separator,
        { label: 'ページのソースを表示', click: () => this.viewSource() },
        separator,
      );
    }

    items.push({ label: '検証', click: () => wc.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(items).popup({ window: this.win, frame: params.frame ?? undefined });
  }
}
