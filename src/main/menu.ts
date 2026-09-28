import { Menu, app, dialog } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { BrowserWindowController } from './window';

export interface MenuActions {
  /** フォーカス中のブラウザウィンドウ */
  current(): BrowserWindowController | undefined;
  openWindow(): void;
  toggleBookmark(): void;
  toggleBookmarksBar(): void;
}

export function buildAppMenu(actions: MenuActions): Menu {
  const isMac = process.platform === 'darwin';
  const withWin = (fn: (c: BrowserWindowController) => void) => () => {
    const c = actions.current();
    if (c) fn(c);
  };
  // 同じ操作に別のショートカットを割り当てるための非表示項目
  const alias = (accelerator: string, click: () => void): MenuItemConstructorOptions => ({
    label: accelerator,
    accelerator,
    click,
    visible: false,
    acceleratorWorksWhenHidden: true,
  });

  const tabNumberItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: i === 8 ? '最後のタブ' : `タブ ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: withWin((c) => c.selectTabAt(i === 8 ? -1 : i)),
  }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'ファイル',
      submenu: [
        { label: '新しいタブ', accelerator: 'CmdOrCtrl+T', click: withWin((c) => c.newTab()) },
        { label: '新しいウィンドウ', accelerator: 'CmdOrCtrl+N', click: () => actions.openWindow() },
        { label: '閉じたタブを開く', accelerator: 'CmdOrCtrl+Shift+T', click: withWin((c) => c.reopenClosedTab()) },
        { type: 'separator' },
        { label: 'タブを閉じる', accelerator: 'CmdOrCtrl+W', click: withWin((c) => c.closeActiveTab()) },
        alias('CmdOrCtrl+F4', withWin((c) => c.closeActiveTab())),
        { label: 'ウィンドウを閉じる', accelerator: 'CmdOrCtrl+Shift+W', click: withWin((c) => c.win.close()) },
        ...(isMac ? [] : [{ type: 'separator' } as MenuItemConstructorOptions, { label: '終了', role: 'quit' } as MenuItemConstructorOptions]),
      ],
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', role: 'undo' },
        { label: 'やり直す', role: 'redo' },
        { type: 'separator' },
        { label: '切り取り', role: 'cut' },
        { label: 'コピー', role: 'copy' },
        { label: '貼り付け', role: 'paste' },
        { label: 'すべて選択', role: 'selectAll' },
        { type: 'separator' },
        { label: 'ページ内を検索', accelerator: 'CmdOrCtrl+F', click: withWin((c) => c.sendCommand('open-find')) },
        alias('F3', withWin((c) => c.sendCommand('open-find'))),
      ],
    },
    {
      label: '表示',
      submenu: [
        { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: withWin((c) => c.reload()) },
        alias('F5', withWin((c) => c.reload())),
        { label: 'キャッシュを無視して再読み込み', accelerator: 'CmdOrCtrl+Shift+R', click: withWin((c) => c.reload(true)) },
        alias('Shift+F5', withWin((c) => c.reload(true))),
        { type: 'separator' },
        { label: '拡大', accelerator: 'CmdOrCtrl+Plus', click: withWin((c) => c.zoom('in')) },
        alias('CmdOrCtrl+=', withWin((c) => c.zoom('in'))),
        alias('CmdOrCtrl+numadd', withWin((c) => c.zoom('in'))),
        { label: '縮小', accelerator: 'CmdOrCtrl+-', click: withWin((c) => c.zoom('out')) },
        alias('CmdOrCtrl+numsub', withWin((c) => c.zoom('out'))),
        { label: '実際のサイズ', accelerator: 'CmdOrCtrl+0', click: withWin((c) => c.zoom('reset')) },
        { type: 'separator' },
        { label: 'ブックマークバーを表示', accelerator: 'CmdOrCtrl+Shift+B', click: () => actions.toggleBookmarksBar() },
        { label: '全画面表示', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'ページのソースを表示', accelerator: 'CmdOrCtrl+U', click: withWin((c) => c.viewSource()) },
        { label: '開発者ツール', accelerator: 'F12', click: withWin((c) => c.toggleDevTools()) },
        alias('CmdOrCtrl+Shift+I', withWin((c) => c.toggleDevTools())),
      ],
    },
    {
      label: '移動',
      submenu: [
        { label: '戻る', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: withWin((c) => c.goBack()) },
        { label: '進む', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: withWin((c) => c.goForward()) },
        { label: 'ホーム', accelerator: 'Alt+Home', click: withWin((c) => c.goHome()) },
        { label: 'アドレスバーに移動', accelerator: 'CmdOrCtrl+L', click: withWin((c) => c.sendCommand('focus-address')) },
        alias('F6', withWin((c) => c.sendCommand('focus-address'))),
        alias('Alt+D', withWin((c) => c.sendCommand('focus-address'))),
        { type: 'separator' },
        { label: '次のタブ', accelerator: 'Ctrl+Tab', click: withWin((c) => c.cycleTab(1)) },
        alias('CmdOrCtrl+PageDown', withWin((c) => c.cycleTab(1))),
        { label: '前のタブ', accelerator: 'Ctrl+Shift+Tab', click: withWin((c) => c.cycleTab(-1)) },
        alias('CmdOrCtrl+PageUp', withWin((c) => c.cycleTab(-1))),
        { label: 'タブを選択', submenu: tabNumberItems },
        { type: 'separator' },
        { label: '履歴', accelerator: 'CmdOrCtrl+H', click: withWin((c) => c.sendCommand('toggle-history')) },
        { label: 'ダウンロード', accelerator: 'CmdOrCtrl+J', click: withWin((c) => c.sendCommand('toggle-downloads')) },
        { label: '設定', accelerator: 'CmdOrCtrl+,', click: withWin((c) => c.sendCommand('toggle-settings')) },
      ],
    },
    {
      label: 'ブックマーク',
      submenu: [
        { label: 'このページをブックマーク', accelerator: 'CmdOrCtrl+D', click: () => actions.toggleBookmark() },
        { label: 'ブックマーク一覧', accelerator: 'CmdOrCtrl+Shift+O', click: withWin((c) => c.sendCommand('toggle-bookmarks')) },
      ],
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'Crop Browser について',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              message: 'Crop Browser',
              detail: `バージョン ${app.getVersion()}\nElectron ${process.versions.electron} / Chromium ${process.versions.chrome}`,
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
