// Folio の UI のエントリーポイント: 上部バー・アドレス欄・ページ内検索・シート・見た目
import type { Appearance, DownloadInfo, GlassSetting, Settings, ShelfSetting, ThemeSetting, UiCommand } from '../shared/types';
import { activeTab, api, ctx, dropThumbs, el, setThumb } from './ctx.js';
import { icon, iconSvg, setIcon } from './icons.js';
import { installSpringVariables } from './motion.js';
import * as overview from './overview.js';
import { initShelf, renderShelf } from './shelf.js';

installSpringVariables();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = document.documentElement;

const address = $<HTMLInputElement>('address');
const omnibox = $<HTMLFormElement>('omnibox');
const omniSite = $('omni-site');
const omniIcon = $('omni-icon');
const omniBadge = $('omni-badge');
const omniHint = $('omni-hint');
const zoomIndicator = $<HTMLButtonElement>('zoom-indicator');
const pinBtn = $<HTMLButtonElement>('pin-btn');
const backBtn = $<HTMLButtonElement>('back');
const forwardBtn = $<HTMLButtonElement>('forward');
const reloadBtn = $<HTMLButtonElement>('reload');
const findbar = $('findbar');
const findInput = $<HTMLInputElement>('find-input');
const findCount = $('find-count');
const pageSlot = $('page-slot');
const pageEmpty = $('page-empty');
const sheet = $('sheet');
const sheetTitle = $('sheet-title');
const sheetBody = $('sheet-body');
const downloadBadge = $('download-badge');

let settings: Settings | null = null;
let downloads: DownloadInfo[] = [];
let addressDirty = false;

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => setIcon(node, node.dataset.icon!));

// ----------------------------------------------------------------------
// 見た目 (テーマ・ガラス・プラットフォーム)
// ----------------------------------------------------------------------

function applyAppearance(look: Appearance): void {
  root.dataset.theme = look.theme;
  root.dataset.glass = look.glass;
  root.dataset.platform = look.platform;
  // ウィンドウ操作ボタン (最小化・最大化・閉じる) の分だけ上部バーの右端を空ける
  root.style.setProperty('--wco-w', look.platform === 'darwin' ? '0px' : 'max(0px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)), 138px)');
  root.style.setProperty('--mac-lights', look.platform === 'darwin' ? '72px' : '0px');
}

// ----------------------------------------------------------------------
// シェルフの幅 (自動: ウィンドウが狭いときはアイコンだけに)
// ----------------------------------------------------------------------

function applyShelfMode(): void {
  const mode: ShelfSetting = settings?.shelf ?? 'auto';
  const rail = mode === 'rail' || (mode === 'auto' && window.innerWidth < 1060);
  document.body.dataset.shelf = rail ? 'rail' : 'expanded';
  setIcon($('shelf-btn'), rail ? 'rail' : 'sidebar');
}

function toggleShelf(): void {
  const rail = document.body.dataset.shelf === 'rail';
  void api.updateSettings({ shelf: rail ? 'expanded' : 'rail' }).then((s) => {
    settings = s;
    applyShelfMode();
  });
}

// ----------------------------------------------------------------------
// Web ページの表示領域をメインプロセスへ伝える
// ----------------------------------------------------------------------

let lastRect = '';
let rectFrame = 0;
function reportPageRect(): void {
  cancelAnimationFrame(rectFrame);
  rectFrame = requestAnimationFrame(() => {
    const r = pageSlot.getBoundingClientRect();
    const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
    const key = `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
    if (key === lastRect) return;
    lastRect = key;
    api.setPageRect(rect);
  });
}
new ResizeObserver(reportPageRect).observe(pageSlot);
window.addEventListener('resize', () => {
  applyShelfMode();
  reportPageRect();
});
// シェルフの幅が変わるアニメーション中も、ページの位置を追従させる
document.body.addEventListener('transitionend', reportPageRect);

// ----------------------------------------------------------------------
// シェルフ・スペース
// ----------------------------------------------------------------------

initShelf({
  select: (id) => {
    if (overview.isOpen()) void overview.openTab(id);
    else api.activateTab(id);
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
    renderShelf();
  },
});

$('space-btn').addEventListener('click', () => {
  if (overview.isOpen()) overview.back();
  else api.openOverview(false);
});
$('new-page').addEventListener('click', () => api.openOverview(true));
$('shelf-btn').addEventListener('click', toggleShelf);
$('menu-btn').addEventListener('click', (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  api.openMenu(r.left, r.bottom + 4);
});

api.onOverviewEnter((enter) => {
  if (overview.isOpen() && !enter.launcher) {
    void overview.handleEnter(enter);
    return;
  }
  closeFind();
  address.value = '';
  address.placeholder = enter.launcher ? 'URL・検索語、または開いているページ' : '開いているページを探す、または URL・検索語';
  setIcon(omniIcon, 'search');
  omniSite.classList.remove('insecure');
  omniBadge.hidden = true;
  omnibox.classList.remove('loading');
  address.focus();
  void overview.handleEnter(enter);
});

// ----------------------------------------------------------------------
// 上部バーとアドレス欄
// ----------------------------------------------------------------------

function renderToolbar(): void {
  const tab = activeTab();
  const browsing = !overview.isOpen();
  backBtn.disabled = !browsing || !tab?.canGoBack;
  forwardBtn.disabled = !browsing || !tab?.canGoForward;
  reloadBtn.disabled = !browsing || !tab;

  const loading = !!tab?.loading && browsing;
  setIcon(reloadBtn, loading ? 'stop' : 'reload');
  reloadBtn.title = loading ? '読み込みを中止 (Esc)' : '再読み込み (Ctrl+R)';
  reloadBtn.setAttribute('aria-label', loading ? '読み込みを中止' : '再読み込み');
  omnibox.classList.toggle('loading', loading);

  pinBtn.hidden = !browsing || !tab;
  setIcon(pinBtn, tab?.pinned ? 'pinFilled' : 'pin');
  pinBtn.classList.toggle('active', !!tab?.pinned);
  pinBtn.title = tab?.pinned ? '固定を解除 (Ctrl+D)' : 'このタブを固定して、常に大きく表示 (Ctrl+D)';

  const zoom = tab?.zoomPercent ?? 100;
  zoomIndicator.hidden = !browsing || zoom === 100;
  zoomIndicator.textContent = `${zoom}%`;

  // 背景の色味を、表示中のページの色に寄せる
  if (tab?.accent) root.style.setProperty('--page-accent', tab.accent);
  if (tab?.accent) omnibox.style.setProperty('--accent', tab.accent);
  pageEmpty.hidden = !!tab;

  if (!browsing) return;
  if (!addressDirty) address.value = tab?.url ?? '';
  const url = tab?.url ?? '';
  omniSite.classList.remove('insecure');
  omniBadge.hidden = true;
  if (tab?.error) {
    setIcon(omniIcon, 'broken');
    omniSite.classList.add('insecure');
    omniSite.title = 'ページを読み込めませんでした';
  } else if (url.startsWith('https:')) {
    setIcon(omniIcon, 'lock');
    omniSite.title = '保護された通信';
  } else if (url.startsWith('http:')) {
    setIcon(omniIcon, 'warning');
    omniSite.classList.add('insecure');
    omniBadge.textContent = '保護なし';
    omniBadge.hidden = false;
    omniSite.title = 'この接続は暗号化されていません。パスワードなどを入力しないでください';
  } else if (url.startsWith('file:')) {
    setIcon(omniIcon, 'file');
    omniSite.title = 'このパソコンのファイル';
  } else {
    setIcon(omniIcon, 'search');
    omniSite.title = '';
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

// スペースでは、ボタンなどにフォーカスがあってもキー操作を受け付ける
document.addEventListener('keydown', (e) => {
  if (!overview.isOpen() || e.target === address) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).closest('#shelf, #sheet')) return;
  if (overview.handleKey(e, address)) {
    e.preventDefault();
    address.focus();
  } else if (e.key.length === 1) {
    address.focus(); // 文字を打ち始めたら入力欄へ (そのまま絞り込みになる)
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
$('downloads-btn').addEventListener('click', () => toggleSheet('downloads'));
$('sheet-close').addEventListener('click', () => closeSheet());

// ----------------------------------------------------------------------
// ページ内検索 (ページのカードの上に浮かぶガラスのバー)
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
// シート (設定・ダウンロード): ページのカードが縮んで横に並ぶ
// ----------------------------------------------------------------------

type SheetKind = 'downloads' | 'settings';
let sheetKind: SheetKind | null = null;

function toggleSheet(kind: SheetKind): void {
  if (sheetKind === kind) closeSheet();
  else openSheet(kind);
}

function openSheet(kind: SheetKind): void {
  sheetKind = kind;
  sheet.hidden = false;
  document.body.classList.add('sheet-open');
  sheetTitle.textContent = kind === 'downloads' ? 'ダウンロード' : '設定';
  $('downloads-btn').classList.toggle('active', kind === 'downloads');
  renderSheet();
  reportPageRect();
}

function closeSheet(): void {
  sheetKind = null;
  sheet.hidden = true;
  document.body.classList.remove('sheet-open');
  $('downloads-btn').classList.remove('active');
  reportPageRect();
}

function renderSheet(): void {
  if (sheetKind === 'downloads') renderDownloads();
  if (sheetKind === 'settings') renderSettings();
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
  btn.setAttribute('aria-label', title);
  setIcon(btn, iconName);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function renderDownloads(): void {
  sheetBody.replaceChildren();
  if (downloads.length === 0) {
    const empty = el('div', 'sheet-empty');
    empty.innerHTML = iconSvg('download');
    empty.append(el('div', undefined, 'ダウンロードはありません'));
    sheetBody.append(empty);
    return;
  }
  for (const d of downloads) {
    const status =
      d.state === 'progressing'
        ? d.totalBytes > 0
          ? `${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}`
          : formatBytes(d.receivedBytes)
        : d.state === 'completed'
          ? formatBytes(d.receivedBytes)
          : d.state === 'cancelled'
            ? 'キャンセル'
            : '中断';
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
    sheetBody.append(item);
  }
}

/** アイコンで選ぶセグメント */
function segmented<T extends string>(options: Array<[T, string, string]>, current: T, onPick: (value: T) => void): HTMLElement {
  const wrap = el('div', 'segmented');
  wrap.setAttribute('role', 'group');
  for (const [value, iconName, label] of options) {
    const btn = el('button');
    btn.setAttribute('aria-pressed', String(value === current));
    btn.title = label;
    btn.innerHTML = iconSvg(iconName);
    btn.append(el('span', undefined, label));
    btn.addEventListener('click', () => onPick(value));
    wrap.append(btn);
  }
  return wrap;
}

function field(label: string, ...children: HTMLElement[]): HTMLElement {
  const f = el('div', 'field');
  f.append(el('div', 'field-label', label), ...children);
  return f;
}

async function update(patch: Partial<Settings>): Promise<void> {
  settings = await api.updateSettings(patch);
  applyShelfMode();
  renderSettings();
}

function renderSettings(): void {
  if (!settings) return;
  const s = settings;
  const scroll = sheetBody.scrollTop;
  sheetBody.replaceChildren();

  sheetBody.append(
    field(
      'テーマ',
      segmented<ThemeSetting>(
        [
          ['system', 'monitor', '自動'],
          ['light', 'sun', 'ライト'],
          ['dark', 'moon', 'ダーク'],
        ],
        s.theme,
        (theme) => void update({ theme }),
      ),
    ),
    field(
      '透明効果',
      segmented<GlassSetting>(
        [
          ['auto', 'glass', 'ガラス'],
          ['off', 'opaque', '不透明'],
        ],
        s.glass,
        (glass) => void update({ glass }),
      ),
    ),
    field(
      'シェルフ',
      segmented<ShelfSetting>(
        [
          ['auto', 'auto', '自動'],
          ['expanded', 'sidebar', '広い'],
          ['rail', 'rail', '細い'],
        ],
        s.shelf,
        (shelf) => void update({ shelf }),
      ),
    ),
  );

  const engine = el('select', 'select');
  for (const [value, label] of [
    ['google', 'Google'],
    ['duckduckgo', 'DuckDuckGo'],
    ['bing', 'Bing'],
    ['yahoo_jp', 'Yahoo! JAPAN'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    option.selected = value === s.searchEngine;
    engine.append(option);
  }
  engine.addEventListener('change', () => void update({ searchEngine: engine.value as Settings['searchEngine'] }));
  sheetBody.append(field('検索エンジン', engine));

  const home = el('input', 'text-input');
  home.type = 'text';
  home.value = s.homePage;
  const homeHint = el('p', 'hint');
  const saveHome = () => {
    let value = home.value.trim();
    if (value && !/^[a-z]+:/i.test(value)) value = `https://${value}`;
    try {
      new URL(value);
    } catch {
      homeHint.textContent = '有効な URL を入力してください';
      return;
    }
    void api.updateSettings({ homePage: value }).then((next) => {
      settings = next;
      homeHint.textContent = '保存しました';
    });
  };
  home.addEventListener('keydown', (e) => e.key === 'Enter' && saveHome());
  home.addEventListener('change', saveHome);
  sheetBody.append(field('ホームページ', home, homeHint));

  const restoreRow = el('div', 'switch-row');
  const restore = el('button', 'switch');
  restore.setAttribute('role', 'switch');
  restore.setAttribute('aria-checked', String(s.restoreSession));
  restore.setAttribute('aria-label', '前回のタブを復元');
  restore.addEventListener('click', () => void update({ restoreSession: !s.restoreSession }));
  restoreRow.append(el('span', undefined, '起動時に前回のタブを復元'), restore);
  sheetBody.append(field('起動', restoreRow));

  const clear = el('button', 'text-btn danger', '閲覧データを消去');
  const clearHint = el(
    'p',
    'hint',
    '履歴・再訪の記録・プレビュー・キャッシュを消します。データはこのパソコンの中だけに保存され、外部へ送信されません。',
  );
  clear.addEventListener('click', async () => {
    if (!confirm('閲覧データ (履歴・再訪の記録・プレビュー・キャッシュ) を消去しますか？')) return;
    await api.clearBrowsingData();
    clearHint.textContent = '消去しました';
  });
  sheetBody.append(field('プライバシー', clear, clearHint));

  sheetBody.append(
    field(
      'ページの大きさ',
      el('p', 'hint', '別のページから戻ってきた回数が多いページほど大きく表示されます。一度開いたきりのページは、しばらくすると「あまり見ない」にまとまります。古い行動の影響は 3 日ごとに半分になります。'),
    ),
  );
  sheetBody.scrollTop = scroll;
}

function applyDownloads(list: DownloadInfo[]): void {
  const known = new Set(downloads.map((d) => d.id));
  const started = list.some((d) => !known.has(d.id));
  downloads = list;
  downloadBadge.hidden = !list.some((d) => d.state === 'progressing');
  if (started && sheetKind !== 'downloads') openSheet('downloads');
  else if (sheetKind === 'downloads') renderDownloads();
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
  renderShelf();
  overview.onState();
  renderToolbar();
});

api.onThumb((thumb) => {
  setThumb(thumb);
  // プレビューが初めて届いたときは、代わりの絵を差し替える
  renderShelf();
  overview.refresh();
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
    case 'toggle-downloads':
      toggleSheet('downloads');
      break;
    case 'toggle-settings':
      toggleSheet('settings');
      break;
    case 'toggle-shelf':
      toggleShelf();
      break;
  }
});

api.onSettingsChanged((next) => {
  settings = next;
  applyShelfMode();
  if (sheetKind === 'settings') renderSettings();
});
api.onAppearance(applyAppearance);
api.onDownloadsChanged(applyDownloads);

void (async () => {
  const [s, d, look] = await Promise.all([api.getSettings(), api.getDownloads(), api.getAppearance()]);
  settings = s;
  downloads = d;
  applyAppearance(look);
  applyShelfMode();
  reportPageRect();
})();
reportPageRect();
