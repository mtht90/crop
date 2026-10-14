// Folio の UI のエントリーポイント: ツールバー・アドレス欄・ページ内検索・パネル
import type { DownloadInfo, Settings, UiCommand } from '../shared/types';
import { activeTab, api, ctx, dropThumbs, el, setThumb } from './ctx.js';
import { icon, setIcon } from './icons.js';
import { installSpringVariables } from './motion.js';
import * as overview from './overview.js';
import { initStrip, renderStrip } from './strip.js';

installSpringVariables();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const chrome = $('chrome');
const address = $<HTMLInputElement>('address');
const omnibox = $<HTMLFormElement>('omnibox');
const omniIcon = $('omni-icon');
const omniHint = $('omni-hint');
const zoomIndicator = $<HTMLButtonElement>('zoom-indicator');
const pinBtn = $<HTMLButtonElement>('pin-btn');
const backBtn = $<HTMLButtonElement>('back');
const forwardBtn = $<HTMLButtonElement>('forward');
const reloadBtn = $<HTMLButtonElement>('reload');
const findbar = $('findbar');
const findInput = $<HTMLInputElement>('find-input');
const findCount = $('find-count');
const panel = $('panel');
const panelTitle = $('panel-title');
const panelBody = $('panel-body');
const downloadBadge = $('download-badge');

let settings: Settings | null = null;
let downloads: DownloadInfo[] = [];
let addressDirty = false;

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => setIcon(node, node.dataset.icon!));

// ----------------------------------------------------------------------
// レイアウト: UI が占める領域をメインプロセスに伝え、Web ページの表示位置を決める
// ----------------------------------------------------------------------

let lastLayout = '';
function reportLayout(): void {
  const top = chrome.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--chrome-h', `${top}px`);
  const right = panel.hidden ? 0 : panel.getBoundingClientRect().width;
  document.documentElement.style.setProperty('--panel-w', `${right}px`);
  const key = `${top}:${right}`;
  if (key === lastLayout) return;
  lastLayout = key;
  api.setLayout(top, right);
}
new ResizeObserver(reportLayout).observe(chrome);
new ResizeObserver(reportLayout).observe(panel);
window.addEventListener('resize', () => {
  lastLayout = '';
  reportLayout();
});

// ----------------------------------------------------------------------
// タブストリップとオーバービュー
// ----------------------------------------------------------------------

initStrip({
  select: (id) => {
    if (overview.isOpen()) void overview.openTab(id);
    else api.activateTab(id);
  },
  openStack: () => {
    overview.focusPile();
    if (!overview.isOpen()) api.openOverview(false);
  },
  hover: (id) => overview.highlight(id),
});

overview.initOverview({
  hint: (text) => {
    omniHint.textContent = text;
    omniHint.hidden = !text;
  },
  closed: () => {
    addressDirty = false;
    address.placeholder = '検索するか URL を入力';
    renderToolbar();
  },
});

$('overview-btn').addEventListener('click', () => {
  if (overview.isOpen()) overview.back();
  else api.openOverview(false);
});
$('new-tab').addEventListener('click', () => api.openOverview(true));

api.onOverviewEnter((enter) => {
  if (overview.isOpen() && !enter.launcher) {
    void overview.handleEnter(enter);
    return;
  }
  closeFind();
  address.value = '';
  address.placeholder = enter.launcher ? 'URL・検索語を入力、または開いているページを探す' : '開いているページを探す、または URL・検索語を入力';
  setIcon(omniIcon, 'search');
  omniIcon.classList.remove('insecure');
  address.focus();
  void overview.handleEnter(enter);
});

// ----------------------------------------------------------------------
// ツールバーとアドレス欄
// ----------------------------------------------------------------------

function renderToolbar(): void {
  const tab = activeTab();
  const browsing = !overview.isOpen();
  backBtn.disabled = !browsing || !tab?.canGoBack;
  forwardBtn.disabled = !browsing || !tab?.canGoForward;
  reloadBtn.disabled = !browsing || !tab;

  const loading = tab?.loading ?? false;
  setIcon(reloadBtn, loading ? 'stop' : 'reload');
  reloadBtn.title = loading ? '読み込みを中止' : '再読み込み (Ctrl+R)';

  pinBtn.hidden = !browsing || !tab;
  setIcon(pinBtn, tab?.pinned ? 'pinFilled' : 'pin');
  pinBtn.classList.toggle('active', !!tab?.pinned);
  pinBtn.title = tab?.pinned ? '固定を解除 (Ctrl+D)' : 'このタブを固定して、常に大きく表示 (Ctrl+D)';

  const zoom = tab?.zoomPercent ?? 100;
  zoomIndicator.hidden = !browsing || zoom === 100;
  zoomIndicator.textContent = `${zoom}%`;

  if (!browsing) return;
  if (!addressDirty) address.value = tab?.url ?? '';
  const url = tab?.url ?? '';
  omniIcon.classList.remove('insecure');
  if (url.startsWith('https:')) {
    setIcon(omniIcon, 'lock');
    omniIcon.title = '保護された通信';
  } else if (url.startsWith('http:')) {
    setIcon(omniIcon, 'warning');
    omniIcon.classList.add('insecure');
    omniIcon.title = '保護されていない通信';
  } else if (url.startsWith('file:')) {
    setIcon(omniIcon, 'file');
    omniIcon.title = 'ローカルファイル';
  } else {
    setIcon(omniIcon, 'search');
    omniIcon.title = '';
  }
}

omnibox.addEventListener('submit', (e) => e.preventDefault());
address.addEventListener('input', () => {
  if (overview.isOpen()) overview.setFilter(address.value);
  else addressDirty = true;
});
address.addEventListener('keydown', (e) => {
  if (overview.isOpen()) {
    if (overview.handleKey(e, address)) e.preventDefault();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const value = address.value.trim();
    if (!value) return;
    addressDirty = false;
    api.navigate(value);
    address.blur();
  } else if (e.key === 'Escape') {
    addressDirty = false;
    renderToolbar();
    address.select();
  }
});
address.addEventListener('focus', () => {
  if (!overview.isOpen()) address.select();
});
address.addEventListener('blur', () => {
  if (overview.isOpen()) return;
  addressDirty = false;
  renderToolbar();
});

// オーバービューでは、ボタンなどにフォーカスがあってもキー操作を受け付ける
document.addEventListener('keydown', (e) => {
  if (!overview.isOpen() || e.target === address) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (overview.handleKey(e, address)) {
    e.preventDefault();
    address.focus();
  } else if (e.key.length === 1) {
    // 文字を打ち始めたら入力欄へ (そのまま絞り込みになる)
    address.focus();
  }
});

backBtn.addEventListener('click', () => api.goBack());
forwardBtn.addEventListener('click', () => api.goForward());
reloadBtn.addEventListener('click', () => (activeTab()?.loading ? api.stop() : api.reload()));
zoomIndicator.addEventListener('click', () => api.zoom('reset'));
pinBtn.addEventListener('click', () => {
  const tab = activeTab();
  if (tab) api.togglePin(tab.id);
});
$('btn-downloads').addEventListener('click', () => togglePanel('downloads'));
$('btn-settings').addEventListener('click', () => togglePanel('settings'));
$('panel-close').addEventListener('click', () => closePanel());

// ----------------------------------------------------------------------
// ページ内検索
// ----------------------------------------------------------------------

function openFind(): void {
  if (overview.isOpen()) return;
  findbar.hidden = false;
  findInput.focus();
  findInput.select();
  if (findInput.value) api.find(findInput.value, true, false);
}

function closeFind(): void {
  if (findbar.hidden) return;
  findbar.hidden = true;
  findCount.textContent = '';
  findInput.classList.remove('not-found');
  api.stopFind();
}

findInput.addEventListener('input', () => api.find(findInput.value, true, false));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (findInput.value) api.find(findInput.value, !e.shiftKey, true);
  } else if (e.key === 'Escape') {
    closeFind();
  }
});
$('find-next').addEventListener('click', () => findInput.value && api.find(findInput.value, true, true));
$('find-prev').addEventListener('click', () => findInput.value && api.find(findInput.value, false, true));
$('find-close').addEventListener('click', closeFind);

api.onFindResult((result) => {
  if (!findInput.value) {
    findCount.textContent = '';
    findInput.classList.remove('not-found');
    return;
  }
  findCount.textContent = `${result.activeMatchOrdinal}/${result.matches}`;
  findInput.classList.toggle('not-found', result.matches === 0);
});

// ----------------------------------------------------------------------
// サイドパネル (ダウンロード / 設定)
// ----------------------------------------------------------------------

type PanelKind = 'downloads' | 'settings';
let openPanelKind: PanelKind | null = null;

function togglePanel(kind: PanelKind): void {
  if (openPanelKind === kind) closePanel();
  else openPanel(kind);
}

function openPanel(kind: PanelKind): void {
  openPanelKind = kind;
  panel.hidden = false;
  panelTitle.textContent = kind === 'downloads' ? 'ダウンロード' : '設定';
  $('btn-downloads').classList.toggle('active', kind === 'downloads');
  $('btn-settings').classList.toggle('active', kind === 'settings');
  renderPanel();
  reportLayout();
}

function closePanel(): void {
  openPanelKind = null;
  panel.hidden = true;
  $('btn-downloads').classList.remove('active');
  $('btn-settings').classList.remove('active');
  reportLayout();
}

function renderPanel(): void {
  if (openPanelKind === 'downloads') renderDownloads();
  if (openPanelKind === 'settings') renderSettings();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function actionButton(iconName: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', 'icon-btn small');
  btn.title = title;
  setIcon(btn, iconName);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function renderDownloads(): void {
  panelBody.replaceChildren();
  if (downloads.length === 0) {
    panelBody.append(el('div', 'panel-empty', 'ダウンロードはありません'));
    return;
  }
  for (const d of downloads) {
    const status =
      d.state === 'progressing'
        ? d.totalBytes > 0
          ? `${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}`
          : formatBytes(d.receivedBytes)
        : d.state === 'completed'
          ? `完了 · ${formatBytes(d.receivedBytes)}`
          : d.state === 'cancelled'
            ? 'キャンセルされました'
            : '中断されました';
    const item = el('div', 'item');
    const text = el('div', 'text');
    text.append(el('div', 'primary', d.filename), el('div', 'secondary', status));
    item.append(icon('file'), text);
    item.title = d.savePath;
    if (d.state === 'progressing' && d.totalBytes > 0) {
      const bar = el('div', 'progress');
      const fill = el('div');
      fill.style.width = `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`;
      bar.append(fill);
      text.append(bar);
    }
    const actions = el('div', 'actions');
    if (d.state === 'progressing') actions.append(actionButton('close', 'キャンセル', () => api.cancelDownload(d.id)));
    if (d.state === 'completed') {
      actions.append(actionButton('folder', 'フォルダを開く', () => api.showDownloadInFolder(d.id)));
      item.addEventListener('click', () => api.openDownload(d.id));
    }
    item.append(actions);
    panelBody.append(item);
  }
}

function renderSettings(): void {
  if (!settings) return;
  const current = settings;
  panelBody.replaceChildren();

  const home = el('div', 'setting');
  const homeInput = el('input');
  homeInput.type = 'text';
  homeInput.value = current.homePage;
  const homeHint = el('div', 'hint', '最初のタブで開くページ');
  const saveHome = async () => {
    let value = homeInput.value.trim();
    if (value && !/^[a-z]+:/i.test(value)) value = `https://${value}`;
    try {
      new URL(value);
    } catch {
      homeHint.textContent = '有効な URL を入力してください';
      return;
    }
    settings = await api.updateSettings({ homePage: value });
    homeInput.value = settings.homePage;
    homeHint.textContent = '保存しました';
  };
  homeInput.addEventListener('keydown', (e) => e.key === 'Enter' && void saveHome());
  homeInput.addEventListener('change', () => void saveHome());
  home.append(el('label', undefined, 'ホームページ'), homeInput, homeHint);

  const engine = el('div', 'setting');
  const select = el('select');
  const engines: [Settings['searchEngine'], string][] = [
    ['google', 'Google'],
    ['duckduckgo', 'DuckDuckGo'],
    ['bing', 'Bing'],
    ['yahoo_jp', 'Yahoo! JAPAN'],
  ];
  for (const [value, label] of engines) {
    const option = el('option', undefined, label);
    option.value = value;
    option.selected = value === current.searchEngine;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    settings = await api.updateSettings({ searchEngine: select.value as Settings['searchEngine'] });
  });
  engine.append(el('label', undefined, '検索エンジン'), select);

  const restore = el('div', 'setting checkbox');
  const label = el('label');
  const check = el('input');
  check.type = 'checkbox';
  check.checked = current.restoreSession;
  check.addEventListener('change', async () => {
    settings = await api.updateSettings({ restoreSession: check.checked });
  });
  label.append(check, document.createTextNode('起動時に前回のタブを復元する'));
  restore.append(label);

  const about = el('div', 'setting about');
  about.append(
    el('label', undefined, 'ページの大きさについて'),
    el(
      'p',
      'hint',
      '別のページから戻ってきた回数が多いページほど、オーバービューで大きく表示されます。' +
        '一度開いたきりのページは、しばらくすると「あまり見ないページ」にまとまります。' +
        '古い行動の影響は 3 日ごとに半分になります。',
    ),
  );

  panelBody.append(home, engine, restore, about);
}

function applyDownloads(list: DownloadInfo[]): void {
  const known = new Set(downloads.map((d) => d.id));
  const started = list.some((d) => !known.has(d.id));
  downloads = list;
  downloadBadge.hidden = !list.some((d) => d.state === 'progressing');
  if (started && openPanelKind !== 'downloads') openPanel('downloads');
  else if (openPanelKind === 'downloads') renderDownloads();
}

// ----------------------------------------------------------------------
// メインプロセスからのイベント
// ----------------------------------------------------------------------

api.onState((next) => {
  const prevActive = ctx.state.activeTabId;
  ctx.state = next;
  if (prevActive !== next.activeTabId) {
    addressDirty = false;
    closeFind();
  }
  dropThumbs(new Set(next.tabs.map((t) => t.id)));
  renderStrip();
  overview.onState();
  renderToolbar();
});

api.onThumb((thumb) => setThumb(thumb));

api.onCommand((command: UiCommand) => {
  switch (command) {
    case 'focus-address':
      address.focus();
      address.select();
      break;
    case 'open-find':
      openFind();
      break;
    case 'toggle-downloads':
      togglePanel('downloads');
      break;
    case 'toggle-settings':
      togglePanel('settings');
      break;
  }
});

api.onSettingsChanged((next) => {
  settings = next;
  if (openPanelKind === 'settings') renderSettings();
});
api.onDownloadsChanged(applyDownloads);

void (async () => {
  [settings, downloads] = await Promise.all([api.getSettings(), api.getDownloads()]);
  reportLayout();
})();
reportLayout();
