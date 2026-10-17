import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const isTest = !!process.env.FOLIO_E2E;
let win: BrowserWindow | null = null;
let dirty = false;
let forceClose = false;
let pendingOpen: string | null = null;

function resourcePath(...p: string[]): string {
  // パッケージ後は resources/ 直下 (extraResources)、開発時はプロジェクトの resources/
  const base = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
  return path.join(base, ...p);
}

function fileArg(argv: string[]): string | null {
  const f = argv.slice(1).find((a) => /\.(folio|json)$/i.test(a) && !a.startsWith('-'));
  return f ? path.resolve(f) : null;
}

async function sendOpen(file: string) {
  try {
    const content = await fs.readFile(file, 'utf8');
    win?.webContents.send('file:opened', { path: file, content });
  } catch (e) {
    dialog.showErrorBox('ファイルを開けません', String(e));
  }
}

function cmd(command: string) {
  return () => win?.webContents.send('menu', command);
}

// 実際のキー処理はレンダラー側で行い、メニューのショートカットは表示のみ
function item(label: string, command: string, accelerator?: string): MenuItemConstructorOptions {
  return { label, click: cmd(command), accelerator, registerAccelerator: false };
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'ファイル(&F)',
      submenu: [
        item('新規作成…', 'new', 'Ctrl+N'),
        item('開く…', 'open', 'Ctrl+O'),
        { type: 'separator' },
        item('保存', 'save', 'Ctrl+S'),
        item('名前を付けて保存…', 'saveAs', 'Ctrl+Shift+S'),
        { type: 'separator' },
        item('PDF に書き出し…', 'exportPdf', 'Ctrl+P'),
        item('MusicXML に書き出し…', 'exportMusicXML'),
        item('MIDI に書き出し…', 'exportMidi'),
        item('WAV (音声) に書き出し…', 'exportWav'),
        { type: 'separator' },
        { label: '終了', role: 'quit' },
      ],
    },
    {
      label: '編集(&E)',
      submenu: [
        item('元に戻す', 'undo', 'Ctrl+Z'),
        item('やり直し', 'redo', 'Ctrl+Y'),
        { type: 'separator' },
        item('コピー', 'copy', 'Ctrl+C'),
        item('切り取り', 'cut', 'Ctrl+X'),
        item('貼り付け', 'paste', 'Ctrl+V'),
        item('削除（休符にする）', 'delete', 'Delete'),
        { type: 'separator' },
        item('楽譜の設定…', 'scoreSettings', 'Ctrl+T'),
      ],
    },
    {
      label: '音符(&N)',
      submenu: [
        item('音符入力モード', 'toggleInput', 'N'),
        { type: 'separator' },
        item('付点', 'dot', '.'),
        item('タイ', 'tie', '+'),
        item('休符', 'rest', '0'),
        item('半音上げる', 'up', 'Up'),
        item('半音下げる', 'down', 'Down'),
        item('1 オクターブ上げる', 'octUp', 'Ctrl+Up'),
        item('1 オクターブ下げる', 'octDown', 'Ctrl+Down'),
      ],
    },
    {
      label: '小節(&M)',
      submenu: [
        item('小節を末尾に追加', 'appendMeasure', 'Ctrl+B'),
        item('小節を前に挿入', 'insertMeasure', 'Ctrl+Insert'),
        item('選択した小節を削除', 'deleteMeasure', 'Ctrl+Delete'),
      ],
    },
    {
      label: '再生(&P)',
      submenu: [
        item('再生 / 一時停止', 'play', 'Space'),
        item('先頭に戻る', 'rewind', 'Home'),
      ],
    },
    {
      label: '表示(&V)',
      submenu: [
        item('拡大', 'zoomIn', 'Ctrl+='),
        item('縮小', 'zoomOut', 'Ctrl+-'),
        item('100%', 'zoomReset', 'Ctrl+0'),
        item('ピアノ鍵盤の表示切替', 'togglePiano', 'F9'),
        { type: 'separator' },
        { label: '開発者ツール', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'ヘルプ(&H)',
      submenu: [
        item('キーボードショートカット', 'help', 'F1'),
        item('FolioScore について / ライセンス', 'about'),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'FolioScore',
    backgroundColor: '#e9ecef',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (!dirty || forceClose || isTest) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win!, {
      type: 'question',
      buttons: ['保存して閉じる', '保存しないで閉じる', 'キャンセル'],
      defaultId: 0,
      cancelId: 2,
      title: 'FolioScore',
      message: '楽譜に保存されていない変更があります。',
    });
    if (r === 0) win!.webContents.send('menu', 'saveAndClose');
    else if (r === 1) { forceClose = true; win!.close(); }
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpen) { void sendOpen(pendingOpen); pendingOpen = null; }
    // 自動テスト: 指定されたスクリプトをレンダラーで実行する
    const script = process.env.FOLIO_E2E_SCRIPT;
    if (isTest && script) {
      void fs.readFile(script, 'utf8').then((code) => win?.webContents.executeJavaScript(code)).catch((e) => {
        console.error('[e2e]', e);
        app.exit(2);
      });
    }
  });
  if (isTest) win.webContents.on('console-message', (e) => console.log(`[renderer] ${e.message}`));
}

// ------------------------------------------------------------------ IPC

const FILTERS: Record<'folio' | 'musicxml' | 'mid' | 'wav' | 'pdf', { name: string; extensions: string[] }[]> = {
  folio: [{ name: 'FolioScore 楽譜', extensions: ['folio'] }],
  musicxml: [{ name: 'MusicXML', extensions: ['musicxml'] }],
  mid: [{ name: 'MIDI', extensions: ['mid'] }],
  wav: [{ name: 'WAV 音声', extensions: ['wav'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
};

type ExportKind = keyof typeof FILTERS;

async function askSavePath(kind: ExportKind, defaultName: string): Promise<string | null> {
  if (isTest && process.env.FOLIO_E2E_OUT) return path.join(process.env.FOLIO_E2E_OUT, `${defaultName}.${FILTERS[kind][0].extensions[0]}`);
  const r = await dialog.showSaveDialog(win!, {
    defaultPath: `${defaultName}.${FILTERS[kind][0].extensions[0]}`,
    filters: [...FILTERS[kind]],
  });
  return r.canceled || !r.filePath ? null : r.filePath;
}

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win!, { filters: [...FILTERS.folio, { name: 'すべてのファイル', extensions: ['*'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], content: await fs.readFile(r.filePaths[0], 'utf8') };
});

ipcMain.handle('file:save', async (_e, args: { path: string | null; content: string; defaultName: string }) => {
  const target = args.path ?? (await askSavePath('folio', args.defaultName));
  if (!target) return null;
  await fs.writeFile(target, args.content, 'utf8');
  return target;
});

ipcMain.handle('file:export', async (_e, args: { kind: ExportKind; data: string | Uint8Array; defaultName: string }) => {
  const target = await askSavePath(args.kind, args.defaultName);
  if (!target) return null;
  await fs.writeFile(target, typeof args.data === 'string' ? args.data : Buffer.from(args.data));
  return target;
});

ipcMain.handle('file:exportPdf', async (_e, args: { defaultName: string }) => {
  const target = await askSavePath('pdf', args.defaultName);
  if (!target || !win) return null;
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' },
  });
  await fs.writeFile(target, pdf);
  return target;
});

ipcMain.handle('resource:read', async (_e, name: string) => {
  const allowed: Record<string, string[]> = {
    soundfont: ['soundfonts', 'MuseScore_General.sf3'],
    processor: ['spessasynth_processor.min.js'],
  };
  const p = allowed[name];
  if (!p) throw new Error('unknown resource');
  const file = name === 'processor' ? path.join(__dirname, 'renderer', ...p) : resourcePath(...p);
  const buf = await fs.readFile(file);
  return name === 'processor' ? buf.toString('utf8') : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

ipcMain.on('state:dirty', (_e, d: boolean) => { dirty = d; });
ipcMain.on('state:title', (_e, t: string) => { win?.setTitle(t); });
ipcMain.on('app:closeNow', () => { forceClose = true; win?.close(); });
ipcMain.handle('app:info', () => ({ version: app.getVersion(), test: isTest }));
ipcMain.on('e2e:done', (_e, code: number) => { if (isTest) app.exit(code); });
ipcMain.handle('e2e:screenshot', async (_e, name: string) => {
  if (!isTest || !win || !process.env.FOLIO_E2E_OUT) return null;
  const img = await win.webContents.capturePage();
  const f = path.join(process.env.FOLIO_E2E_OUT, `${name}.png`);
  await fs.writeFile(f, img.toPNG());
  return f;
});

// ------------------------------------------------------------------ app

if (!isTest && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArg(argv);
    if (f) void sendOpen(f);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    pendingOpen = fileArg(process.argv);
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
