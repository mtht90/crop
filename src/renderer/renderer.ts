import type {
  Bookmark,
  BrowserApi,
  BrowserState,
  DownloadInfo,
  HistoryEntry,
  Settings,
  TabState,
  UiCommand,
} from '../shared/types';
import { icon, setIcon } from './icons.js';

declare global {
  interface Window {
    browser: BrowserApi;
  }
}

const api = window.browser;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const chrome = $('chrome');
const tabsEl = $('tabs');
const address = $<HTMLInputElement>('address');
const addressForm = $<HTMLFormElement>('address-form');
const security = $('security');
const zoomIndicator = $<HTMLButtonElement>('zoom-indicator');
const star = $<HTMLButtonElement>('bookmark-star');
const backBtn = $<HTMLButtonElement>('back');
const forwardBtn = $<HTMLButtonElement>('forward');
const reloadBtn = $<HTMLButtonElement>('reload');
const findbar = $('findbar');
const findInput = $<HTMLInputElement>('find-input');
const findCount = $('find-count');
const bookmarksBar = $('bookmarks-bar');
const panel = $('panel');
const panelTitle = $('panel-title');
const panelBody = $('panel-body');
const downloadBadge = $('download-badge');

let state: BrowserState = { tabs: [], activeTabId: null };
let bookmarks: Bookmark[] = [];
let settings: Settings | null = null;
let downloads: DownloadInfo[] = [];
let addressDirty = false;

type PanelKind = 'bookmarks' | 'history' | 'downloads' | 'settings';
let openPanelKind: PanelKind | null = null;

// 静的なボタンのアイコンを設定
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => setIcon(node, node.dataset.icon!));

function activeTab(): TabState | undefined {
  return state.tabs.find((t) => t.id === state.activeTabId);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

// ----------------------------------------------------------------------
// レイアウト: UI が占める高さ・幅をメインプロセスに伝え、Web ページの表示領域を決める
// ----------------------------------------------------------------------

let lastLayout = '';
function reportLayout(): void {
  const top = chrome.getBoundingClientRect().height;
  panel.style.top = `${top}px`;
  const right = panel.hidden ? 0 : panel.getBoundingClientRect().width;
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
  updateTabWidths();
});

// ----------------------------------------------------------------------
// タブストリップ
// ----------------------------------------------------------------------

const tabEls = new Map<number, HTMLElement>();
let draggingId: number | null = null;

function createTabEl(id: number): HTMLElement {
  const tab = el('div', 'tab');
  tab.setAttribute('role', 'tab');
  tab.draggable = true;

  const favicon = el('span', 'favicon');
  const title = el('span', 'title');
  const audio = el('button', 'icon-btn small audio');
  const close = el('button', 'icon-btn small close');
  close.title = 'タブを閉じる (Ctrl+W)';
  setIcon(close, 'close');
  tab.append(favicon, title, audio, close);

  tab.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button')) api.activateTab(id);
  });
  // 中クリックで閉じる
  tab.addEventListener('auxclick', (e) => {
    if (e.button === 1) api.closeTab(id);
  });
  close.addEventListener('click', () => api.closeTab(id));
  audio.addEventListener('click', () => api.toggleMute(id));

  tab.addEventListener('dragstart', (e) => {
    draggingId = id;
    e.dataTransfer?.setData('text/plain', String(id));
  });
  tab.addEventListener('dragend', () => {
    draggingId = null;
    tabEls.forEach((t) => t.classList.remove('drag-over'));
  });
  tab.addEventListener('dragover', (e) => {
    if (draggingId === null) return;
    e.preventDefault();
    tab.classList.add('drag-over');
  });
  tab.addEventListener('dragleave', () => tab.classList.remove('drag-over'));
  tab.addEventListener('drop', (e) => {
    e.preventDefault();
    tab.classList.remove('drag-over');
    if (draggingId === null || draggingId === id) return;
    // ドロップ先のタブの位置へ移動する
    api.moveTab(draggingId, state.tabs.findIndex((t) => t.id === id));
  });

  return tab;
}

function updateTabEl(node: HTMLElement, tab: TabState): void {
  node.classList.toggle('active', tab.id === state.activeTabId);
  node.title = tab.title;
  node.setAttribute('aria-selected', String(tab.id === state.activeTabId));

  const favicon = node.querySelector('.favicon') as HTMLElement;
  const faviconKey = tab.loading ? 'loading' : tab.favicon ?? (tab.url.startsWith('file:') ? 'file' : 'globe');
  if (favicon.dataset.key !== faviconKey) {
    favicon.dataset.key = faviconKey;
    favicon.replaceChildren();
    if (tab.loading) {
      favicon.append(el('span', 'spinner'));
    } else if (tab.favicon) {
      const img = el('img');
      img.src = tab.favicon;
      img.addEventListener('error', () => {
        favicon.dataset.key = 'globe';
        favicon.replaceChildren(icon('globe'));
      });
      favicon.append(img);
    } else {
      favicon.append(icon(faviconKey));
    }
  }

  (node.querySelector('.title') as HTMLElement).textContent = tab.title;

  const audio = node.querySelector('.audio') as HTMLElement;
  audio.hidden = !tab.audible && !tab.muted;
  audio.title = tab.muted ? 'ミュートを解除' : 'このタブをミュート';
  setIcon(audio, tab.muted ? 'muted' : 'volume');
}

function renderTabs(): void {
  const ids = new Set(state.tabs.map((t) => t.id));
  for (const [id, node] of tabEls) {
    if (!ids.has(id)) {
      node.remove();
      tabEls.delete(id);
    }
  }
  state.tabs.forEach((tab, i) => {
    let node = tabEls.get(tab.id);
    if (!node) {
      node = createTabEl(tab.id);
      tabEls.set(tab.id, node);
    }
    updateTabEl(node, tab);
    if (tabsEl.children[i] !== node) tabsEl.insertBefore(node, tabsEl.children[i] ?? null);
  });
  updateTabWidths();
}

function updateTabWidths(): void {
  // 狭いタブではタイトルを隠してアイコンだけにする
  tabEls.forEach((node) => node.classList.toggle('narrow', node.getBoundingClientRect().width < 72));
}

// ----------------------------------------------------------------------
// ツールバー
// ----------------------------------------------------------------------

function displayUrl(url: string): string {
  return url === 'about:blank' ? '' : url;
}

function renderToolbar(): void {
  const tab = activeTab();
  backBtn.disabled = !tab?.canGoBack;
  forwardBtn.disabled = !tab?.canGoForward;

  const loading = tab?.loading ?? false;
  setIcon(reloadBtn, loading ? 'stop' : 'reload');
  reloadBtn.title = loading ? '読み込みを中止 (Esc)' : '再読み込み (Ctrl+R)';

  if (!addressDirty) address.value = displayUrl(tab?.url ?? '');

  const url = tab?.url ?? '';
  security.classList.remove('insecure');
  if (url.startsWith('https:')) {
    setIcon(security, 'lock');
    security.title = '保護された通信';
  } else if (url.startsWith('http:')) {
    setIcon(security, 'warning');
    security.classList.add('insecure');
    security.title = '保護されていない通信';
  } else if (url.startsWith('file:')) {
    setIcon(security, 'file');
    security.title = 'ローカルファイル';
  } else {
    setIcon(security, 'search');
    security.title = '';
  }

  const zoom = tab?.zoomPercent ?? 100;
  zoomIndicator.hidden = zoom === 100;
  zoomIndicator.textContent = `${zoom}%`;

  const bookmarked = !!url && bookmarks.some((b) => b.url === url);
  setIcon(star, bookmarked ? 'starFilled' : 'star');
  star.classList.toggle('active', bookmarked);
  star.disabled = !/^(https?|file):/.test(url);
  star.title = bookmarked ? 'ブックマークを削除 (Ctrl+D)' : 'このページをブックマーク (Ctrl+D)';
}

addressForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = address.value.trim();
  if (!value) return;
  addressDirty = false;
  api.navigate(value);
  address.blur();
});
address.addEventListener('input', () => {
  addressDirty = true;
});
address.addEventListener('focus', () => address.select());
// クリックでフォーカスした直後の mouseup で選択が解除されないようにする
address.addEventListener('mouseup', (e) => {
  if (address.selectionStart === address.selectionEnd && document.activeElement === address && !addressDirty) {
    e.preventDefault();
    address.select();
  }
});
address.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    addressDirty = false;
    renderToolbar();
    address.select();
  }
});
address.addEventListener('blur', () => {
  addressDirty = false;
  renderToolbar();
});

backBtn.addEventListener('click', () => api.goBack());
forwardBtn.addEventListener('click', () => api.goForward());
reloadBtn.addEventListener('click', () => (activeTab()?.loading ? api.stop() : api.reload()));
$('home').addEventListener('click', () => api.goHome());
$('new-tab').addEventListener('click', () => api.newTab());
tabsEl.parentElement!.addEventListener('dblclick', (e) => {
  // タブストリップの空き領域をダブルクリックで新しいタブ
  if (e.target === tabsEl || e.target === tabsEl.parentElement) api.newTab();
});
zoomIndicator.addEventListener('click', () => api.zoom('reset'));
star.addEventListener('click', async () => {
  const tab = activeTab();
  if (!tab) return;
  bookmarks = await api.toggleBookmark(tab.url, tab.title);
  renderBookmarks();
});
$('btn-bookmarks').addEventListener('click', () => togglePanel('bookmarks'));
$('btn-history').addEventListener('click', () => togglePanel('history'));
$('btn-downloads').addEventListener('click', () => togglePanel('downloads'));
$('btn-settings').addEventListener('click', () => togglePanel('settings'));
$('panel-close').addEventListener('click', () => closePanel());

// ----------------------------------------------------------------------
// ページ内検索
// ----------------------------------------------------------------------

function openFind(): void {
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
// ブックマークバー
// ----------------------------------------------------------------------

function openUrl(url: string, e: MouseEvent): void {
  // Ctrl/Cmd + クリック・中クリックは新しいタブで開く
  if (e.button === 1 || e.ctrlKey || e.metaKey) api.newTab(url);
  else api.navigate(url);
}

function renderBookmarks(): void {
  bookmarksBar.hidden = !settings?.showBookmarksBar;
  bookmarksBar.replaceChildren();
  if (bookmarks.length === 0) {
    bookmarksBar.append(el('span', 'empty', '☆ を押すとここにブックマークが表示されます'));
  }
  for (const b of bookmarks) {
    const chip = el('button', 'bookmark-chip');
    chip.title = `${b.title}\n${b.url}`;
    chip.append(icon('globe'), el('span', undefined, b.title || hostOf(b.url)));
    chip.addEventListener('click', (e) => openUrl(b.url, e));
    chip.addEventListener('auxclick', (e) => e.button === 1 && openUrl(b.url, e));
    bookmarksBar.append(chip);
  }
  renderToolbar();
  if (openPanelKind === 'bookmarks') renderPanel();
}

// ----------------------------------------------------------------------
// サイドパネル (ブックマーク / 履歴 / ダウンロード / 設定)
// ----------------------------------------------------------------------

const PANEL_TITLES: Record<PanelKind, string> = {
  bookmarks: 'ブックマーク',
  history: '履歴',
  downloads: 'ダウンロード',
  settings: '設定',
};
const panelButtons: Record<PanelKind, HTMLElement> = {
  bookmarks: $('btn-bookmarks'),
  history: $('btn-history'),
  downloads: $('btn-downloads'),
  settings: $('btn-settings'),
};

function togglePanel(kind: PanelKind): void {
  if (openPanelKind === kind) closePanel();
  else openPanel(kind);
}

function openPanel(kind: PanelKind): void {
  openPanelKind = kind;
  panel.hidden = false;
  panelTitle.textContent = PANEL_TITLES[kind];
  for (const [k, btn] of Object.entries(panelButtons)) btn.classList.toggle('active', k === kind);
  renderPanel();
  reportLayout();
}

function closePanel(): void {
  openPanelKind = null;
  panel.hidden = true;
  Object.values(panelButtons).forEach((btn) => btn.classList.remove('active'));
  reportLayout();
}

function renderPanel(): void {
  switch (openPanelKind) {
    case 'bookmarks':
      return renderBookmarksPanel();
    case 'history':
      return void renderHistoryPanel();
    case 'downloads':
      return renderDownloadsPanel();
    case 'settings':
      return renderSettingsPanel();
  }
}

function listItem(primary: string, secondary: string, leading: HTMLElement): HTMLElement {
  const item = el('div', 'item');
  const text = el('div', 'text');
  text.append(el('div', 'primary', primary), el('div', 'secondary', secondary));
  item.append(leading, text);
  return item;
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

function renderBookmarksPanel(): void {
  panelBody.replaceChildren();
  if (bookmarks.length === 0) {
    panelBody.append(el('div', 'panel-empty', 'ブックマークはまだありません'));
    return;
  }
  for (const b of [...bookmarks].reverse()) {
    const item = listItem(b.title || b.url, b.url, icon('globe'));
    item.title = b.url;
    const actions = el('div', 'actions on-hover');
    actions.append(
      actionButton('delete', '削除', async () => {
        bookmarks = await api.removeBookmark(b.id);
        renderBookmarks();
      }),
    );
    item.append(actions);
    item.addEventListener('click', (e) => openUrl(b.url, e));
    item.addEventListener('auxclick', (e) => e.button === 1 && openUrl(b.url, e));
    panelBody.append(item);
  }
}

let historyQuery = '';
async function renderHistoryPanel(): Promise<void> {
  const entries = await api.getHistory(historyQuery);
  if (openPanelKind !== 'history') return;

  const search = el('input', 'panel-search');
  search.type = 'text';
  search.placeholder = '履歴を検索';
  search.value = historyQuery;
  let timer = 0;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      historyQuery = search.value;
      void renderHistoryPanel().then(() => {
        const input = panelBody.querySelector<HTMLInputElement>('.panel-search');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }, 200);
  });

  panelBody.replaceChildren(search);
  if (entries.length === 0) {
    panelBody.append(el('div', 'panel-empty', historyQuery ? '一致する履歴はありません' : '履歴はありません'));
    return;
  }

  const dateFormat = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  let lastGroup = '';

  for (const h of entries as HistoryEntry[]) {
    const date = new Date(h.visitedAt);
    const day = date.toDateString();
    const group = day === today ? '今日' : day === yesterday ? '昨日' : dateFormat.format(date);
    if (group !== lastGroup) {
      panelBody.append(el('div', 'panel-group', group));
      lastGroup = group;
    }
    const item = listItem(h.title || h.url, hostOf(h.url), el('span', 'time', timeFormat.format(date)));
    item.title = h.url;
    item.addEventListener('click', (e) => openUrl(h.url, e));
    item.addEventListener('auxclick', (e) => e.button === 1 && openUrl(h.url, e));
    panelBody.append(item);
  }

  const footer = el('div', 'panel-footer');
  const clear = el('button', 'text-btn danger', '閲覧履歴をすべて削除');
  clear.addEventListener('click', async () => {
    if (!confirm('閲覧履歴をすべて削除しますか？')) return;
    await api.clearHistory();
    void renderHistoryPanel();
  });
  footer.append(clear);
  panelBody.append(footer);
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

function renderDownloadsPanel(): void {
  panelBody.replaceChildren();
  if (downloads.length === 0) {
    panelBody.append(el('div', 'panel-empty', 'ダウンロードはありません'));
    return;
  }
  for (const d of downloads) {
    let status: string;
    switch (d.state) {
      case 'progressing':
        status = d.totalBytes > 0
          ? `${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}`
          : formatBytes(d.receivedBytes);
        break;
      case 'completed':
        status = `完了 ・ ${formatBytes(d.receivedBytes)}`;
        break;
      case 'cancelled':
        status = 'キャンセルされました';
        break;
      default:
        status = '中断されました';
    }
    const item = listItem(d.filename, status, icon('file'));
    item.title = d.savePath;
    if (d.state === 'progressing' && d.totalBytes > 0) {
      const bar = el('div', 'progress');
      const fill = el('div');
      fill.style.width = `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`;
      bar.append(fill);
      item.querySelector('.text')!.append(bar);
    }
    const actions = el('div', 'actions');
    if (d.state === 'progressing') {
      actions.append(actionButton('close', 'キャンセル', () => api.cancelDownload(d.id)));
    }
    if (d.state === 'completed') {
      actions.append(actionButton('folder', 'フォルダを開く', () => api.showDownloadInFolder(d.id)));
      item.addEventListener('click', () => api.openDownload(d.id));
    }
    item.append(actions);
    panelBody.append(item);
  }
}

function renderSettingsPanel(): void {
  if (!settings) return;
  const current = settings;
  panelBody.replaceChildren();

  // ホームページ
  const home = el('div', 'setting');
  const homeLabel = el('label', undefined, 'ホームページ / 新しいタブ');
  const homeInput = el('input');
  homeInput.type = 'text';
  homeInput.value = current.homePage;
  const homeHint = el('div', 'hint', 'http(s):// から始まる URL を入力して Enter');
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
  const useCurrent = el('button', 'text-btn', '現在のページを使用');
  useCurrent.style.marginTop = '6px';
  useCurrent.addEventListener('click', () => {
    const url = activeTab()?.url;
    if (url) {
      homeInput.value = url;
      void saveHome();
    }
  });
  home.append(homeLabel, homeInput, homeHint, useCurrent);

  // 検索エンジン
  const engine = el('div', 'setting');
  const engineSelect = el('select');
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
    engineSelect.append(option);
  }
  engineSelect.addEventListener('change', async () => {
    settings = await api.updateSettings({ searchEngine: engineSelect.value as Settings['searchEngine'] });
  });
  engine.append(el('label', undefined, 'アドレスバーで使う検索エンジン'), engineSelect);

  const checkbox = (key: 'showBookmarksBar' | 'restoreSession', text: string) => {
    const row = el('div', 'setting checkbox');
    const label = el('label');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = current[key];
    input.addEventListener('change', async () => {
      settings = await api.updateSettings({ [key]: input.checked });
      renderBookmarks();
    });
    label.append(input, document.createTextNode(text));
    row.append(label);
    return row;
  };

  panelBody.append(
    home,
    engine,
    checkbox('showBookmarksBar', 'ブックマークバーを表示する'),
    checkbox('restoreSession', '起動時に前回開いていたタブを復元する'),
  );
}

// ----------------------------------------------------------------------
// メインプロセスからのイベント
// ----------------------------------------------------------------------

api.onState((next) => {
  const prevActive = state.activeTabId;
  state = next;
  if (prevActive !== null && prevActive !== next.activeTabId) {
    addressDirty = false;
    closeFind();
  }
  renderTabs();
  renderToolbar();
});

api.onCommand((command: UiCommand) => {
  switch (command) {
    case 'focus-address':
      address.focus();
      address.select();
      break;
    case 'open-find':
      openFind();
      break;
    case 'toggle-history':
      togglePanel('history');
      break;
    case 'toggle-bookmarks':
      togglePanel('bookmarks');
      break;
    case 'toggle-downloads':
      togglePanel('downloads');
      break;
    case 'toggle-settings':
      togglePanel('settings');
      break;
  }
});

api.onBookmarksChanged((list) => {
  bookmarks = list;
  renderBookmarks();
});

api.onSettingsChanged((next) => {
  settings = next;
  renderBookmarks();
  if (openPanelKind === 'settings') renderSettingsPanel();
});

function applyDownloads(list: DownloadInfo[]): void {
  const known = new Set(downloads.map((d) => d.id));
  const started = list.some((d) => !known.has(d.id));
  downloads = list;
  downloadBadge.hidden = !list.some((d) => d.state === 'progressing');
  // 新しいダウンロードが始まったらパネルを開く
  if (started && openPanelKind !== 'downloads') openPanel('downloads');
  else if (openPanelKind === 'downloads') renderDownloadsPanel();
}
api.onDownloadsChanged(applyDownloads);

// 初期データの読み込み
void (async () => {
  [bookmarks, settings, downloads] = await Promise.all([api.getBookmarks(), api.getSettings(), api.getDownloads()]);
  renderBookmarks();
  reportLayout();
})();
reportLayout();
