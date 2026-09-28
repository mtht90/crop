import { BrowserWindow, Menu, app, dialog, ipcMain, session } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import type { Settings } from '../shared/types';
import { DownloadManager } from './downloads';
import { buildAppMenu } from './menu';
import { Store } from './store';
import { isAllowedUrl } from './url';
import { BrowserWindowController } from './window';

// "Electron/xx" やアプリ名を含む UA だと表示が崩れるサイトがあるため、一般的な Chrome の UA に近づける
const appToken = new RegExp(`\\s${app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\S+`);
app.userAgentFallback = app.userAgentFallback.replace(appToken, '').replace(/\sElectron\/\S+/, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const controllers = new Set<BrowserWindowController>();
let store: Store;
let downloads: DownloadManager;
let quitting = false;

function urlsFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((arg) => /^(https?:\/\/|file:\/\/\/)/i.test(arg) && isAllowedUrl(arg));
}

function openWindow(urls: string[] = []): BrowserWindowController {
  const controller = new BrowserWindowController(
    {
      store,
      openWindow: (u) => openWindow(u),
      onClose: (c) => {
        // 最後のウィンドウを閉じるときにタブを保存しておき、次回起動時に復元する
        if (!quitting && controllers.size === 1) store.saveSession(c.tabUrls());
      },
      onClosed: (c) => controllers.delete(c),
    },
    urls,
  );
  controllers.add(controller);
  return controller;
}

function currentController(): BrowserWindowController | undefined {
  const focused = BrowserWindow.getFocusedWindow();
  return [...controllers].find((c) => c.win === focused) ?? [...controllers].at(-1);
}

function controllerFor(wc: WebContents): BrowserWindowController | undefined {
  return [...controllers].find((c) => c.ownsWebContents(wc));
}

function broadcast(channel: string, payload: unknown): void {
  for (const c of controllers) c.send(channel, payload);
}

function updateSettings(patch: Partial<Settings>): Settings {
  const settings = store.updateSettings(patch);
  broadcast('settings', settings);
  return settings;
}

function toggleActiveBookmark(controller: BrowserWindowController | undefined): void {
  const info = controller?.activeTabInfo();
  if (!info || !/^(https?|file):/.test(info.url)) return;
  broadcast('bookmarks', store.toggleBookmark(info.url, info.title));
}

// ----------------------------------------------------------------------
// 権限リクエスト (カメラ・位置情報など) はユーザーに確認する
// ----------------------------------------------------------------------

const ALWAYS_ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock']);
const PROMPTED: Record<string, string> = {
  media: 'カメラ・マイク',
  geolocation: '位置情報',
  notifications: '通知の表示',
  'clipboard-read': 'クリップボードの読み取り',
  'display-capture': '画面の共有',
  midi: 'MIDI デバイス',
  midiSysex: 'MIDI デバイス',
};
const permissionDecisions = new Map<string, boolean>();

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function setupPermissions(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALWAYS_ALLOWED.has(permission)) return callback(true);
    const label = PROMPTED[permission];
    const origin = originOf(details.requestingUrl);
    if (!label || !origin) return callback(false);

    const key = `${origin}|${permission}`;
    const remembered = permissionDecisions.get(key);
    if (remembered !== undefined) return callback(remembered);

    const parent = controllerFor(wc)?.win;
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['許可', 'ブロック'],
      defaultId: 1,
      cancelId: 1,
      message: `${origin} が「${label}」へのアクセスを求めています`,
      checkboxLabel: 'このサイトでの選択を記憶する',
      checkboxChecked: true,
    };
    (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options))
      .then(({ response, checkboxChecked }) => {
        const granted = response === 0;
        if (checkboxChecked) permissionDecisions.set(key, granted);
        callback(granted);
      })
      .catch(() => callback(false));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (!(permission in PROMPTED)) return true;
    return permissionDecisions.get(`${originOf(requestingOrigin) ?? requestingOrigin}|${permission}`) === true;
  });
}

// ----------------------------------------------------------------------
// UI (renderer) からの IPC
// ----------------------------------------------------------------------

type Handler = (c: BrowserWindowController, ...args: unknown[]) => void;

function on(channel: string, handler: Handler): void {
  ipcMain.on(channel, (e: IpcMainEvent, ...args: unknown[]) => {
    const c = controllerFor(e.sender);
    // タブの中身 (Web ページ) からのメッセージは受け付けない
    if (c && c.win.webContents === e.sender) handler(c, ...args);
  });
}

function handle<T>(channel: string, handler: (...args: unknown[]) => T): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    const c = controllerFor(e.sender);
    if (!c || c.win.webContents !== e.sender) throw new Error('forbidden');
    return handler(...args);
  });
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function setupIpc(): void {
  on('tab:new', (c, url) => c.newTab(typeof url === 'string' ? url : undefined));
  on('tab:close', (c, id) => c.closeTab(num(id)));
  on('tab:activate', (c, id) => c.activateTab(num(id)));
  on('tab:move', (c, id, index) => c.moveTab(num(id), num(index)));
  on('tab:mute', (c, id) => c.toggleMute(num(id)));

  on('nav:go', (c, input) => c.navigate(str(input)));
  on('nav:back', (c) => c.goBack());
  on('nav:forward', (c) => c.goForward());
  on('nav:reload', (c) => c.reload());
  on('nav:stop', (c) => c.stop());
  on('nav:home', (c) => c.goHome());
  on('nav:zoom', (c, dir) => {
    if (dir === 'in' || dir === 'out' || dir === 'reset') c.zoom(dir);
  });

  on('find:start', (c, text, forward, findNext) => c.find(str(text), forward !== false, findNext === true));
  on('find:stop', (c) => c.stopFind());

  on('layout', (c, top, right) => c.setLayout(num(top), num(right)));

  handle('bookmarks:get', () => store.getBookmarks());
  handle('bookmarks:toggle', (url, title) => {
    const list = isAllowedUrl(str(url)) ? store.toggleBookmark(str(url), str(title)) : store.getBookmarks();
    broadcast('bookmarks', list);
    return list;
  });
  handle('bookmarks:remove', (id) => {
    const list = store.removeBookmark(str(id));
    broadcast('bookmarks', list);
    return list;
  });

  handle('history:get', (query) => store.searchHistory(str(query)));
  handle('history:clear', () => store.clearHistory());

  handle('settings:get', () => store.getSettings());
  handle('settings:update', (patch) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    const clean: Partial<Settings> = {};
    if (typeof p.homePage === 'string' && isAllowedUrl(p.homePage)) clean.homePage = p.homePage;
    if (p.searchEngine === 'google' || p.searchEngine === 'duckduckgo' || p.searchEngine === 'bing' || p.searchEngine === 'yahoo_jp') {
      clean.searchEngine = p.searchEngine;
    }
    if (typeof p.showBookmarksBar === 'boolean') clean.showBookmarksBar = p.showBookmarksBar;
    if (typeof p.restoreSession === 'boolean') clean.restoreSession = p.restoreSession;
    return updateSettings(clean);
  });

  handle('downloads:get', () => downloads.list());
  handle('downloads:open', (id) => downloads.open(str(id)));
  handle('downloads:show', (id) => downloads.showInFolder(str(id)));
  handle('downloads:cancel', (id) => downloads.cancel(str(id)));
}

// ----------------------------------------------------------------------
// アプリのライフサイクル
// ----------------------------------------------------------------------

app.on('second-instance', (_e, argv) => {
  const urls = urlsFromArgv(argv);
  const c = currentController();
  if (c && urls.length > 0) {
    urls.forEach((url) => c.newTab(url));
  } else if (!c) {
    openWindow(urls);
    return;
  }
  if (c.win.isMinimized()) c.win.restore();
  c.win.focus();
});

app.whenReady().then(() => {
  store = new Store();
  downloads = new DownloadManager((list) => broadcast('downloads', list));
  downloads.attach(session.defaultSession);
  setupPermissions();
  setupIpc();

  Menu.setApplicationMenu(
    buildAppMenu({
      current: currentController,
      openWindow: () => openWindow(),
      toggleBookmark: () => toggleActiveBookmark(currentController()),
      toggleBookmarksBar: () => updateSettings({ showBookmarksBar: !store.getSettings().showBookmarksBar }),
    }),
  );

  const argvUrls = urlsFromArgv(process.argv);
  const settings = store.getSettings();
  const restored = settings.restoreSession ? store.getSession() : [];
  openWindow([...restored, ...argvUrls]);

  app.on('activate', () => {
    if (controllers.size === 0) openWindow();
  });
});

app.on('before-quit', () => {
  if (!store) return;
  // 終了時は全ウィンドウのタブを保存する (ウィンドウが残っていない場合は onClose で保存済み)
  if (!quitting && controllers.size > 0) store.saveSession([...controllers].flatMap((c) => c.tabUrls()));
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => store?.flush());
