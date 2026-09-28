// Electron メインプロセス
// dist/ をローカル HTTP サーバーで配信して読み込む（YouTube 埋め込みは http(s) のオリジンが必要なため）
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    // ポートを固定しておく（ローカルストレージ等のオリジンが変わらないように）。使用中なら空きポート
    server.once('error', () => server.listen(0, '127.0.0.1'));
    server.on('listening', () => resolve(server.address().port));
    server.listen(47631, '127.0.0.1');
    setTimeout(() => reject(new Error('server start timeout')), 10000);
  });
}

// 保存データ（譜面・設定・スコア）は userData/store/*.json
const storeDir = () => path.join(app.getPath('userData'), 'store');
const storeFile = (name) => {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('bad store name');
  return path.join(storeDir(), name + '.json');
};

ipcMain.handle('store:read', async (_e, name) => {
  try {
    return await fs.promises.readFile(storeFile(name), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('store:write', async (_e, name, data) => {
  if (typeof data !== 'string') throw new Error('bad data');
  await fs.promises.mkdir(storeDir(), { recursive: true });
  const file = storeFile(name);
  const tmp = file + '.tmp';
  await fs.promises.writeFile(tmp, data, 'utf8');
  await fs.promises.rename(tmp, file);
});

ipcMain.on('win:fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});

async function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    backgroundColor: '#0b0d1c',
    autoHideMenuBar: true,
    title: 'Sekai Rhythm',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);

  // 外部リンクはブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    const root = path.join(__dirname, '..', 'dist');
    const port = await startServer(root);
    await win.loadURL(`http://127.0.0.1:${port}/`);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
