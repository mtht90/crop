import { BrowserWindow, Menu, app, dialog, ipcMain, nativeTheme, session } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import * as os from 'node:os';
import type { Appearance, Settings } from '../shared/types';
import { getUiSession, isAppFrameUrl, registerAppScheme } from './appProtocol';
import { DownloadManager } from './downloads';
import { buildAppMenu, buildPageMenu } from './menu';
import { Store } from './store';
import type { SessionTab } from './store';
import { ThumbnailDisk } from './thumbnails';
import { isAllowedUrl } from './url';
import { BrowserWindowController } from './window';

// "Electron/xx" やアプリ名を含む UA だと表示が崩れるサイトがあるため、一般的な Chrome の UA に近づける
const appToken = new RegExp(`\\s${app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\S+`);
app.userAgentFallback = app.userAgentFallback.replace(appToken, '').replace(/\sElectron\/\S+/, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// すべてのプロセスをサンドボックスで動かす (セキュリティチェックリスト #4)。
// 各ページの webPreferences でも sandbox: true にしている。--no-sandbox はコンテナでの自動テスト用
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
// UI を配信する folio:// を登録する (ready より前に必要)
registerAppScheme();

const controllers = new Set<BrowserWindowController>();
let store: Store;
let thumbs: ThumbnailDisk;
let downloads: DownloadManager;
let quitting = false;

function urlsFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((arg) => /^(https?:\/\/|file:\/\/\/)/i.test(arg) && isAllowedUrl(arg));
}

function openWindow(urls: string[] = [], tabs: SessionTab[] = []): BrowserWindowController {
  const controller = new BrowserWindowController(
    {
      store,
      thumbs,
      appearance,
      openWindow: (u) => openWindow(u),
      onClose: (c) => {
        // 最後のウィンドウを閉じるときにタブを保存しておき、次回起動時に復元する
        if (!quitting && controllers.size === 1) store.saveSession(c.sessionTabs());
      },
      onClosed: (c) => controllers.delete(c),
    },
    [...tabs.map((t) => ({ ...t, restored: true })), ...urls.map((url) => ({ url, pinned: false }))],
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
  if ('theme' in patch || 'glass' in patch) applyAppearance();
  return settings;
}

// ----------------------------------------------------------------------
// 見た目 (テーマ・透明効果)
// ----------------------------------------------------------------------

/** Windows 11 22H2 (ビルド 22621) 以降なら OS の Acrylic が使える */
function supportsOsGlass(): boolean {
  if (process.platform !== 'win32') return false;
  const build = Number(os.release().split('.')[2] ?? 0);
  return build >= 22621;
}

function appearance(): Appearance {
  const settings = store.getSettings();
  if (nativeTheme.themeSource !== settings.theme) nativeTheme.themeSource = settings.theme;
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  let glass: Appearance['glass'] = supportsOsGlass() ? 'os' : 'css';
  // 設定でオフ・OS の「透明効果」がオフ・ハイコントラスト表示のときは不透明にする
  if (settings.glass === 'off' || nativeTheme.prefersReducedTransparency || nativeTheme.inForcedColorsMode) glass = 'off';
  return { theme, glass, platform: process.platform };
}

function applyAppearance(): void {
  const look = appearance();
  for (const c of controllers) c.applyAppearance(look);
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

/**
 * IPC の送り主を確認する (セキュリティチェックリスト #17)。
 * Folio の UI ウィンドウの、folio://app から読み込まれたメインフレームだけを受け付ける。
 */
function trustedSender(e: IpcMainEvent | IpcMainInvokeEvent): BrowserWindowController | undefined {
  const c = controllerFor(e.sender);
  if (!c || c.win.webContents !== e.sender) return undefined;
  const frame = e.senderFrame;
  // メインフレーム (iframe ではない) で、folio://app から読み込まれたもの
  if (!frame || frame.parent !== null || !isAppFrameUrl(frame.url)) return undefined;
  return c;
}

function on(channel: string, handler: Handler): void {
  ipcMain.on(channel, (e: IpcMainEvent, ...args: unknown[]) => {
    const c = trustedSender(e);
    if (c) handler(c, ...args);
  });
}

function handle<T>(channel: string, handler: (c: BrowserWindowController, ...args: unknown[]) => T): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    const c = trustedSender(e);
    if (!c) throw new Error('forbidden');
    return handler(c, ...args);
  });
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function setupIpc(): void {
  on('tab:new', (c, input) => c.newTab(str(input)));
  on('tab:close', (c, id) => c.closeTab(num(id)));
  on('tab:activate', (c, id) => c.activateTab(num(id)));
  on('tab:move', (c, id, index) => c.moveTab(num(id), num(index)));
  on('tab:mute', (c, id) => c.toggleMute(num(id)));
  on('tab:pin', (c, id) => c.togglePin(num(id)));

  on('overview:open', (c, launcher) => void c.openOverview(launcher === true));
  on('overview:ready', (c) => c.overviewReady());
  on('overview:close', (c, id) => c.closeOverview(typeof id === 'number' ? id : null));

  on('nav:go', (c, input) => c.navigate(str(input)));
  on('nav:back', (c) => c.goBack());
  on('nav:forward', (c) => c.goForward());
  on('nav:reload', (c) => c.reload());
  on('nav:stop', (c) => c.stop());
  on('nav:zoom', (c, dir) => {
    if (dir === 'in' || dir === 'out' || dir === 'reset') c.zoom(dir);
  });

  on('find:start', (c, text, forward, findNext) => c.find(str(text), forward !== false, findNext === true));
  on('find:stop', (c) => c.stopFind());

  on('layout', (c, rect) => {
    const r = (rect ?? {}) as Record<string, unknown>;
    c.setPageRect({ x: num(r.x), y: num(r.y), width: num(r.width), height: num(r.height) });
  });
  on('menu:open', (c, x, y) =>
    buildPageMenu({ controller: c, openWindow: () => openWindow() }).popup({ window: c.win, x: Math.round(num(x)), y: Math.round(num(y)) }),
  );

  handle('history:search', (_c, query) => store.searchHistory(str(query)));

  handle('settings:get', () => store.getSettings());
  handle('appearance:get', () => appearance());
  handle('data:clear', async () => {
    store.clearBrowsingData();
    thumbs.clear();
    await session.defaultSession.clearCache();
    broadcast('settings', store.getSettings());
  });
  handle('settings:update', (_c, patch) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    const clean: Partial<Settings> = {};
    if (typeof p.homePage === 'string' && isAllowedUrl(p.homePage)) clean.homePage = p.homePage;
    if (p.searchEngine === 'google' || p.searchEngine === 'duckduckgo' || p.searchEngine === 'bing' || p.searchEngine === 'yahoo_jp') {
      clean.searchEngine = p.searchEngine;
    }
    if (typeof p.restoreSession === 'boolean') clean.restoreSession = p.restoreSession;
    if (p.theme === 'system' || p.theme === 'light' || p.theme === 'dark') clean.theme = p.theme;
    if (p.glass === 'auto' || p.glass === 'off') clean.glass = p.glass;
    if (p.shelf === 'auto' || p.shelf === 'expanded' || p.shelf === 'rail') clean.shelf = p.shelf;
    return updateSettings(clean);
  });

  handle('downloads:get', () => downloads.list());
  handle('downloads:open', (_c, id) => downloads.open(str(id)));
  handle('downloads:show', (_c, id) => downloads.showInFolder(str(id)));
  handle('downloads:cancel', (_c, id) => downloads.cancel(str(id)));
}

// ----------------------------------------------------------------------
// アプリのライフサイクル
// ----------------------------------------------------------------------

// <webview> は使わない。ポップアップで開いたウィンドウも含め、あらゆる WebContents で禁止する (チェックリスト #12)
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

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
  thumbs = new ThumbnailDisk(store.dir);
  getUiSession();
  nativeTheme.on('updated', () => applyAppearance());
  downloads = new DownloadManager((list) => broadcast('downloads', list));
  downloads.attach(session.defaultSession);
  setupPermissions();
  setupIpc();

  Menu.setApplicationMenu(
    buildAppMenu({
      current: currentController,
      openWindow: () => openWindow(),
    }),
  );

  const argvUrls = urlsFromArgv(process.argv);
  const settings = store.getSettings();
  const restored = settings.restoreSession ? store.getSession() : [];
  openWindow(argvUrls, restored);

  app.on('activate', () => {
    if (controllers.size === 0) openWindow();
  });
});

app.on('before-quit', () => {
  if (!store) return;
  // 終了時は全ウィンドウのタブを保存する (ウィンドウが残っていない場合は onClose で保存済み)
  if (!quitting && controllers.size > 0) store.saveSession([...controllers].flatMap((c) => c.sessionTabs()));
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => store?.flush());
