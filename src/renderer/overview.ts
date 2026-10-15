// スペース: 開いているページを「見た目」で見つける画面
// - 並びはタブの順番のまま。よく戻るページはその場で大きくなる (場所の記憶を壊さない)
// - 同じサイトのページは紙を重ねた束にまとまり、開くと横長のトレイに広がる
// - あまり見ないページは小さなチップに
// - 表示中のページはカードへ縮み、選んだカードはページへ広がる (同じ絵が連続して動く)
import type { HistoryEntry, OverviewEnter, Suggestion, TabState } from '../shared/types';
import { api, applyAccent, ctx, el, faviconEl, faviconKey, hostOf, layoutBox, tabById, tabIcon, thumbUrl } from './ctx.js';
import { iconSvg, setIcon } from './icons.js';
import { arrange } from './model.js';
import type { Entry } from './model.js';
import { animate, fade, flipGroup, popIn, reducedMotion } from './motion.js';

const spaceEl = document.getElementById('space')!;
const backdropImg = document.getElementById('space-backdrop-img') as HTMLImageElement;
const scrollEl = document.getElementById('ov-scroll')!;
const contentEl = document.getElementById('ov-content')!;
const gridEl = document.getElementById('ov-grid')!;
const pileSec = document.getElementById('ov-pile')!;
const pileChips = pileSec.querySelector('.chips') as HTMLElement;
const pileCount = pileSec.querySelector('.count') as HTMLElement;
const suggestSec = document.getElementById('ov-suggest')!;
const suggestChips = suggestSec.querySelector('.chips') as HTMLElement;
const historySec = document.getElementById('ov-history')!;
const historyRows = historySec.querySelector('.rows') as HTMLElement;
const emptyEl = document.getElementById('ov-empty')!;
const ring = document.getElementById('ov-ring')!;
const peek = document.getElementById('ov-peek')!;
const morphLayer = document.getElementById('morph-layer')!;
const pageSlot = document.getElementById('page-slot')!;

const GAP = 18;

/** キー: tab:ID (カード) / group:サイト (束) / tray:サイト (開いたまとまり) */
const nodes = new Map<string, HTMLElement>();
/** スペースで開いているまとまり (シェルフとは別に覚える) */
const expandedGroups = new Set<string>();
/** キー: tab:ID (あまり見ないページのチップ) */
const chips = new Map<number, HTMLElement>();
const sugEls = new Map<string, HTMLElement>();
const histEls = new Map<string, HTMLElement>();

let open = false;
let exiting = false;
let launcher = false;
let filter = '';
let selKey: string | null = null;
let history: HistoryEntry[] = [];
let historyTimer = 0;
let ringPos: { x: number; y: number; w: number; h: number } | null = null;
let pendingPileFocus = false;
let browseResolver: (() => void) | null = null;
let backdropUrl: string | null = null;
/** 開く処理の世代。開いている途中で閉じられたら、古い処理はそこで止める */
let enterSeq = 0;
/** メインプロセスがスペースに切り替わったことを確認したか */
let mainInSpace = false;

export interface OverviewHandlers {
  /** Enter キーで何が起きるかのヒントを表示する */
  hint(text: string): void;
  /** スペースが閉じた (アドレス欄を URL 表示に戻す) */
  closed(): void;
}

let handlers: OverviewHandlers;

export function initOverview(h: OverviewHandlers): void {
  handlers = h;
  window.addEventListener('resize', () => {
    if (!open) return;
    layoutGrid();
    placeRing(false);
  });
  scrollEl.addEventListener('scroll', () => hidePeek());
  // 背景をクリックしたら元のページに戻る
  scrollEl.addEventListener('click', (e) => {
    if (e.target === scrollEl || e.target === contentEl) back();
  });
}

export function isOpen(): boolean {
  return open;
}

// ----------------------------------------------------------------------
// 位置の計算
// ----------------------------------------------------------------------

/** Web ページが表示される領域 (メインプロセスの WebContentsView と同じ位置) */
function contentRect(): DOMRect {
  return pageSlot.getBoundingClientRect();
}

function previewRectOf(node: HTMLElement): DOMRect {
  const thumb = node.querySelector('.thumb');
  return (thumb ?? node).getBoundingClientRect();
}

/** ウィンドウ (ページ表示領域) の縦横比に合わせてグリッドを組む。カードはページの形そのまま */
function layoutGrid(): void {
  const width = gridEl.clientWidth;
  if (width === 0) return;
  // 狭いウィンドウでも 3 列以上にして、よく戻るページ (2×2) が全幅を占めないようにする
  let cols = Math.max(3, Math.min(6, Math.floor((width + GAP) / (240 + GAP))));
  // ページが少ないときは列を減らして、1 枚 1 枚を大きく見せる
  const cells = [...gridEl.children].reduce((n, c) => n + ((c as HTMLElement).dataset.tier === 'hero' ? 4 : 1), 0);
  if (cells > 0 && cells < cols) cols = Math.max(3, cells);
  const page = contentRect();
  const aspect = Math.max(1.25, Math.min(2.1, page.width / Math.max(1, page.height)));
  const setup = (grid: HTMLElement, w: number, grow: boolean) => {
    const cellW = (w - GAP * (cols - 1)) / cols;
    const rowH = cellW / aspect;
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    // 外側のグリッドの行は、開いたまとまり (トレイ) の高さに合わせて伸びる
    grid.style.gridAutoRows = grow ? `minmax(${rowH}px, auto)` : `${rowH}px`;
    grid.style.gap = `${GAP}px`;
  };
  setup(gridEl, width, true);
  gridEl.querySelectorAll<HTMLElement>('.tray-grid').forEach((g) => setup(g, g.clientWidth || width - 24, false));
}

// ----------------------------------------------------------------------
// カード
// ----------------------------------------------------------------------

function createTile(id: number): HTMLElement {
  const tile = el('div', 'tile');
  tile.dataset.sel = `tab:${id}`;
  tile.setAttribute('role', 'button');
  const card = el('div', 'card');
  const meta = el('div', 'meta');
  const text = el('div', 'text');
  text.append(el('div', 'title'), el('div', 'sub'));
  meta.append(el('span', 'meta-icon'), text);
  const tools = el('div', 'tools');
  const pin = el('button', 'tool pin');
  const close = el('button', 'tool close');
  close.title = 'タブを閉じる';
  close.setAttribute('aria-label', 'タブを閉じる');
  setIcon(close, 'close');
  tools.append(pin, close);
  card.append(el('div', 'thumb'), meta, tools);
  tile.append(card);

  tile.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.tool')) return;
    void openTab(id);
  });
  tile.addEventListener('auxclick', (e) => {
    if (e.button === 1) api.closeTab(id);
  });
  tile.addEventListener('mouseenter', () => select(`tab:${id}`, false));
  pin.addEventListener('click', () => api.togglePin(id));
  close.addEventListener('click', () => api.closeTab(id));
  return tile;
}

/** プレビューが無いページの代わりの絵: ページの色と大きなファビコン */
function placeholder(tab: TabState): HTMLElement {
  const ph = el('div', tab.error ? 'placeholder error' : 'placeholder');
  ph.append(faviconEl(tab.favicon, tab.title, { large: true, error: tab.error }), el('span', 'ph-host', hostOf(tab.url) || '新しいタブ'));
  return ph;
}

function fillThumb(box: HTMLElement, tab: TabState): void {
  const url = thumbUrl(tab.id);
  const key = url && !tab.error ? 'img' : `ph|${faviconKey(tab)}|${tab.url}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (key === 'img') {
    const img = el('img');
    img.dataset.thumb = String(tab.id);
    img.alt = '';
    img.draggable = false;
    img.src = url!;
    box.replaceChildren(img);
  } else {
    box.replaceChildren(placeholder(tab));
  }
}

function updateTile(tile: HTMLElement, tab: TabState, inTray: boolean): void {
  tile.dataset.tier = inTray ? 'regular' : tab.pinned ? 'hero' : tab.tier;
  tile.classList.toggle('active', tab.id === ctx.state.activeTabId);
  tile.classList.toggle('pinned', tab.pinned);
  tile.setAttribute('aria-label', tab.title);
  applyAccent(tile, tab.accent);
  fillThumb(tile.querySelector('.thumb') as HTMLElement, tab);

  const icon = tile.querySelector('.meta-icon') as HTMLElement;
  const iconKey = faviconKey(tab);
  if (icon.dataset.key !== iconKey) {
    icon.dataset.key = iconKey;
    icon.replaceChildren(tabIcon(tab));
  }
  (tile.querySelector('.title') as HTMLElement).textContent = tab.title;
  const sub = tile.querySelector('.sub') as HTMLElement;
  sub.replaceChildren(el('span', undefined, hostOf(tab.url) || '新しいタブ'));
  if (tab.returns > 0) {
    const r = el('span', 'returns');
    r.title = `このセッションで ${tab.returns} 回戻ってきました`;
    r.innerHTML = iconSvg('returns');
    r.append(document.createTextNode(String(tab.returns)));
    sub.append(r);
  }
  const pin = tile.querySelector('.pin') as HTMLElement;
  setIcon(pin, tab.pinned ? 'pinFilled' : 'pin');
  pin.title = tab.pinned ? '固定を解除' : '固定する (常に大きく表示)';
  pin.setAttribute('aria-label', pin.title);
}

/** 同じサイトの束 (閉じた状態) */
function createGroupTile(key: string): HTMLElement {
  const tile = el('div', 'tile group-tile');
  tile.dataset.sel = `group:${key}`;
  tile.setAttribute('role', 'button');
  const card = el('div', 'card');
  const sheets = el('div', 'sheets');
  sheets.append(el('div', 'sheet-layer'), el('div', 'sheet-layer'));
  const front = el('div', 'thumb sheet-front');
  const meta = el('div', 'meta');
  const text = el('div', 'text');
  text.append(el('div', 'title'), el('div', 'sub'));
  meta.append(el('span', 'meta-icon'), text, el('span', 'group-count'));
  card.append(sheets, front, meta);
  tile.append(card);
  tile.addEventListener('click', () => toggleGroup(key, true));
  tile.addEventListener('mouseenter', () => select(`group:${key}`, false));
  return tile;
}

function updateGroupTile(tile: HTMLElement, group: Extract<Entry, { kind: 'group' }>): void {
  const [first, second, third] = group.tabs;
  applyAccent(tile, first.accent);
  tile.setAttribute('aria-label', `${group.label} (${group.tabs.length} ページ)`);
  tile.setAttribute('aria-expanded', 'false');
  tile.title = group.tabs.map((t) => `・${t.title}`).join('\n');
  const front = tile.querySelector('.sheet-front') as HTMLElement;
  front.style.borderRadius = 'var(--r-lg)';
  front.style.overflow = 'hidden';
  front.style.boxShadow = 'var(--shadow-2)';
  fillThumb(front, first);
  const layers = tile.querySelectorAll<HTMLElement>('.sheet-layer');
  [third ?? second, second].forEach((t, i) => {
    const layer = layers[i];
    applyAccent(layer, t?.accent ?? first.accent);
    const url = t ? thumbUrl(t.id) : null;
    const key = url ?? 'none';
    if (layer.dataset.key === key) return;
    layer.dataset.key = key;
    if (url) {
      const img = el('img');
      img.alt = '';
      img.src = url;
      layer.replaceChildren(img);
    } else {
      layer.replaceChildren();
    }
  });
  const icon = tile.querySelector('.meta-icon') as HTMLElement;
  const iconKey = faviconKey(first);
  if (icon.dataset.key !== iconKey) {
    icon.dataset.key = iconKey;
    icon.replaceChildren(tabIcon(first));
  }
  (tile.querySelector('.title') as HTMLElement).textContent = group.label;
  (tile.querySelector('.sub') as HTMLElement).textContent = group.tabs.map((t) => t.title).join(' · ');
  (tile.querySelector('.group-count') as HTMLElement).textContent = String(group.tabs.length);
}

/** 同じサイトのまとまり (開いた状態): 横いっぱいのトレイ */
function createTray(key: string): HTMLElement {
  const tray = el('div', 'tray');
  const head = el('div', 'tray-head');
  const collapse = el('button', 'icon-btn small');
  collapse.title = 'まとめる';
  collapse.setAttribute('aria-label', 'まとめる');
  setIcon(collapse, 'layers');
  collapse.addEventListener('click', () => toggleGroup(key, false));
  head.append(el('span', 'tray-icon'), el('span', 'tray-title'), el('span', 'group-count'), collapse);
  tray.append(head, el('div', 'tray-grid'));
  return tray;
}

function createChip(id: number): HTMLElement {
  const chip = el('button', 'chip');
  chip.dataset.sel = `tab:${id}`;
  chip.append(el('span', 'chip-icon'), el('span', 'chip-title'));
  chip.addEventListener('click', () => void openTab(id));
  chip.addEventListener('auxclick', (e) => {
    if (e.button === 1) api.closeTab(id);
  });
  chip.addEventListener('mouseenter', () => {
    select(`tab:${id}`, false);
    showPeek(chip, id);
  });
  chip.addEventListener('mouseleave', () => hidePeek());
  return chip;
}

function updateChip(chip: HTMLElement, tab: TabState): void {
  applyAccent(chip, tab.accent);
  chip.setAttribute('aria-label', tab.title);
  const icon = chip.querySelector('.chip-icon') as HTMLElement;
  const key = faviconKey(tab);
  if (icon.dataset.key !== key) {
    icon.dataset.key = key;
    icon.replaceChildren(tabIcon(tab));
  }
  (chip.querySelector('.chip-title') as HTMLElement).textContent = tab.title;
}

function suggestionChip(s: Suggestion): HTMLElement {
  const chip = el('button', 'chip suggestion');
  chip.dataset.sel = `sug:${s.url}`;
  chip.title = `${s.title}\n${s.url}`;
  applyAccent(chip, s.accent);
  chip.append(faviconEl(s.favicon, s.title), el('span', 'chip-title', s.title));
  chip.addEventListener('click', () => api.newTab(s.url));
  chip.addEventListener('mouseenter', () => select(`sug:${s.url}`, false));
  return chip;
}

function historyRow(h: HistoryEntry): HTMLElement {
  const row = el('button', 'hist-row');
  row.dataset.sel = `hist:${h.url}`;
  row.append(el('span', 'hist-title', h.title || h.url), el('span', 'hist-url', hostOf(h.url)));
  row.addEventListener('click', () => api.newTab(h.url));
  row.addEventListener('mouseenter', () => select(`hist:${h.url}`, false));
  return row;
}

// ----------------------------------------------------------------------
// 描画
// ----------------------------------------------------------------------

function matches(text: string): (t: { title: string; url: string }) => boolean {
  const q = text.trim().toLowerCase();
  return (t) => !q || t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q);
}

function tileFor(tab: TabState, inTray: boolean, live: Set<string>): HTMLElement {
  const key = `tab:${tab.id}`;
  let tile = nodes.get(key);
  if (!tile) {
    tile = createTile(tab.id);
    nodes.set(key, tile);
  }
  updateTile(tile, tab, inTray);
  live.add(key);
  return tile;
}

function place(parent: HTMLElement, children: HTMLElement[]): void {
  children.forEach((child, i) => {
    if (parent.children[i] !== child) parent.insertBefore(child, parent.children[i] ?? null);
  });
  while (parent.children.length > children.length) parent.lastElementChild!.remove();
}

function collect(): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  for (const [id, chip] of chips) if (chip.isConnected) map.set(`tab:${id}`, chip);
  for (const [key, node] of nodes) if (node.isConnected) map.set(key, node);
  for (const [url, node] of sugEls) map.set(`sug:${url}`, node);
  for (const [url, node] of histEls) map.set(`hist:${url}`, node);
  return map;
}

function mutate(): void {
  const { tabs, suggestions } = ctx.state;
  const match = matches(filter);
  const filtering = filter.trim() !== '';
  const { entries, compact } = arrange(tabs);
  const live = new Set<string>();
  const top: HTMLElement[] = [];

  if (filtering) {
    // 絞り込み中はまとまりを解いて、一致したページを直接並べる
    for (const entry of entries) {
      const list = entry.kind === 'tab' ? [entry.tab] : entry.tabs;
      for (const tab of list.filter(match)) top.push(tileFor(tab, false, live));
    }
  } else {
    for (const entry of entries) {
      if (entry.kind === 'tab') {
        top.push(tileFor(entry.tab, false, live));
        continue;
      }
      if (expandedGroups.has(entry.key)) {
        const key = `tray:${entry.key}`;
        let tray = nodes.get(key);
        if (!tray) {
          tray = createTray(entry.key);
          nodes.set(key, tray);
        }
        applyAccent(tray, entry.tabs[0].accent);
        const icon = tray.querySelector('.tray-icon') as HTMLElement;
        const iconKey = faviconKey(entry.tabs[0]);
        if (icon.dataset.key !== iconKey) {
          icon.dataset.key = iconKey;
          icon.replaceChildren(tabIcon(entry.tabs[0]));
        }
        (tray.querySelector('.tray-title') as HTMLElement).textContent = entry.label;
        (tray.querySelector('.group-count') as HTMLElement).textContent = String(entry.tabs.length);
        place(tray.querySelector('.tray-grid') as HTMLElement, entry.tabs.map((t) => tileFor(t, true, live)));
        live.add(key);
        top.push(tray);
      } else {
        const key = `group:${entry.key}`;
        let tile = nodes.get(key);
        if (!tile) {
          tile = createGroupTile(entry.key);
          nodes.set(key, tile);
        }
        updateGroupTile(tile, entry);
        live.add(key);
        top.push(tile);
      }
    }
  }
  place(gridEl, top);
  for (const [key, node] of nodes) {
    if (!live.has(key)) {
      node.remove();
      nodes.delete(key);
    }
  }

  // あまり見ないページ
  const pile = compact.filter(match);
  const liveChips = new Set<number>();
  place(
    pileChips,
    pile.map((tab) => {
      let chip = chips.get(tab.id);
      if (!chip) {
        chip = createChip(tab.id);
        chips.set(tab.id, chip);
      }
      updateChip(chip, tab);
      liveChips.add(tab.id);
      return chip;
    }),
  );
  for (const [id, chip] of chips) {
    if (!liveChips.has(id)) {
      chip.remove();
      chips.delete(id);
    }
  }
  pileSec.hidden = pile.length === 0;
  pileCount.textContent = String(pile.length);

  // 閉じたけれどよく戻っていたページ
  const sugs = suggestions.filter(match);
  syncList(suggestChips, sugEls, sugs, (s) => s.url, suggestionChip);
  suggestSec.hidden = sugs.length === 0;

  // 履歴 (検索中のみ)
  const openUrls = new Set(tabs.map((t) => t.url));
  const sugUrls = new Set(sugs.map((s) => s.url));
  const hist = filtering ? history.filter((h) => !openUrls.has(h.url) && !sugUrls.has(h.url)).slice(0, 6) : [];
  syncList(historyRows, histEls, hist, (h) => h.url, historyRow);
  historySec.hidden = hist.length === 0;

  gridEl.hidden = top.length === 0;
  const nothing = top.length + pile.length + sugs.length + hist.length === 0;
  emptyEl.hidden = !nothing;
  emptyEl.textContent = filtering
    ? `「${filter.trim()}」に一致するページはありません\nEnter で開くか検索します`
    : '開いているページはありません\n上の欄に URL か検索語を入力';
  emptyEl.style.whiteSpace = 'pre-line';

  layoutGrid();
}

function syncList<T>(
  parent: HTMLElement,
  map: Map<string, HTMLElement>,
  items: T[],
  keyOf: (item: T) => string,
  create: (item: T) => HTMLElement,
): void {
  const live = new Set<string>();
  place(
    parent,
    items.map((item) => {
      const key = keyOf(item);
      let node = map.get(key);
      if (!node) {
        node = create(item);
        map.set(key, node);
      }
      live.add(key);
      return node;
    }),
  );
  for (const [key, node] of map) {
    if (!live.has(key)) {
      node.remove();
      map.delete(key);
    }
  }
}

function render(animated: boolean): void {
  if (animated && !reducedMotion.matches) {
    flipGroup(collect, mutate, {
      ghostLayer: contentEl,
      enter: (node) => popIn(node),
      spring: 'reflow',
      // まとまりを開いたとき: 中のページは束の位置から広がる
      fallbackFrom: (key, before) => {
        if (!key.startsWith('tab:')) return undefined;
        const group = groupKeyOf(Number(key.slice(4)));
        return group ? before.get(`group:${group}`) : undefined;
      },
      // まとまりを閉じたとき: 中のページは束へ吸い込まれる
      ghostTarget: (key, after) => {
        if (!key.startsWith('tab:')) return undefined;
        const group = groupKeyOf(Number(key.slice(4)));
        return group ? after.get(`group:${group}`)?.getBoundingClientRect() : undefined;
      },
    });
  } else {
    mutate();
  }
  ensureSelection();
  markSelected();
  placeRing(animated);
  updateHint();
}

function groupKeyOf(id: number): string | null {
  for (const entry of arrange(ctx.state.tabs).entries) {
    if (entry.kind === 'group' && entry.tabs.some((t) => t.id === id)) return entry.key;
  }
  return null;
}

function toggleGroup(key: string, expand: boolean): void {
  if (expand) expandedGroups.add(key);
  else expandedGroups.delete(key);
  const group = arrange(ctx.state.tabs).entries.find((e) => e.kind === 'group' && e.key === key);
  selKey = expand && group?.kind === 'group' ? `tab:${group.tabs[0].id}` : `group:${key}`;
  render(true);
}

/** シェルフでまとまりを開閉したとき */
export function refresh(): void {
  if (open && !exiting) render(true);
}

// ----------------------------------------------------------------------
// 選択 (キーボード・マウス共通) と選択リング
// ----------------------------------------------------------------------

function selectables(): HTMLElement[] {
  return [...contentEl.querySelectorAll<HTMLElement>('[data-sel]')].filter(
    (node) => !node.hidden && node.offsetParent !== null && !node.classList.contains('ghost'),
  );
}

function nodeFor(key: string | null): HTMLElement | undefined {
  if (!key) return undefined;
  return selectables().find((n) => n.dataset.sel === key);
}

function ensureSelection(): void {
  if (selKey && nodeFor(selKey)) return;
  if (filter.trim()) {
    selKey = selectables()[0]?.dataset.sel ?? null;
  } else if (!launcher && ctx.state.activeTabId !== null) {
    const id = ctx.state.activeTabId;
    selKey = nodeFor(`tab:${id}`) ? `tab:${id}` : (() => {
      const g = groupKeyOf(id);
      return g && nodeFor(`group:${g}`) ? `group:${g}` : null;
    })();
  } else {
    selKey = null;
  }
}

function markSelected(): void {
  contentEl.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
  nodeFor(selKey)?.classList.add('is-selected');
}

function select(key: string | null, scroll: boolean): void {
  if (key === selKey) return;
  selKey = key;
  markSelected();
  placeRing(true);
  updateHint();
  if (scroll) nodeFor(key)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

function placeRing(animated: boolean): void {
  const node = nodeFor(selKey);
  if (!node) {
    ring.style.opacity = '0';
    ringPos = null;
    return;
  }
  const isTile = node.classList.contains('tile');
  const pad = isTile ? 5 : 3;
  const box = layoutBox(node, contentEl);
  const next = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  const prev = ringPos;
  ringPos = next;
  ring.classList.toggle('small', !isTile);
  const accent = node.style.getPropertyValue('--accent');
  if (accent) ring.style.setProperty('--accent', accent);
  else ring.style.removeProperty('--accent');
  ring.style.transform = `translate(${next.x}px, ${next.y}px)`;
  ring.style.width = `${next.w}px`;
  ring.style.height = `${next.h}px`;
  for (const a of ring.getAnimations()) a.cancel();
  if (!prev || ring.style.opacity !== '1') {
    ring.style.opacity = '1';
    if (animated) fade(ring, [{ opacity: 0, transform: `translate(${next.x}px, ${next.y}px) scale(1.03)` }, { opacity: 1 }], 180);
    return;
  }
  if (!animated) return;
  animate(
    ring,
    [
      { transform: `translate(${prev.x}px, ${prev.y}px)`, width: `${prev.w}px`, height: `${prev.h}px` },
      { transform: `translate(${next.x}px, ${next.y}px)`, width: `${next.w}px`, height: `${next.h}px` },
    ],
    'glide',
  );
}

/** 矢印キーの方向で、いちばん近い要素を選ぶ */
function moveSelection(dir: 'left' | 'right' | 'up' | 'down'): void {
  const items = selectables();
  if (items.length === 0) return;
  const current = nodeFor(selKey);
  if (!current) {
    select(items[0].dataset.sel ?? null, true);
    return;
  }
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const node of items) {
    if (node === current) continue;
    const r = node.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  if (best) select(best.dataset.sel ?? null, true);
}

function stepSelection(offset: number): void {
  const items = selectables();
  if (items.length === 0) return;
  const index = items.findIndex((n) => n.dataset.sel === selKey);
  select(items[(index + offset + items.length) % items.length].dataset.sel ?? null, true);
}

function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return !/\s/.test(t) && (/^[a-z]+:/i.test(t) || /^[^.]+\.[a-z]{2,}/i.test(t) || /^localhost/i.test(t));
}

function updateHint(): void {
  if (!open) return handlers.hint('');
  if (selKey?.startsWith('tab:')) handlers.hint('↵ 表示');
  else if (selKey?.startsWith('group:')) handlers.hint('↵ 広げる');
  else if (selKey) handlers.hint('↵ 開く');
  else if (filter.trim()) handlers.hint(looksLikeUrl(filter) ? '↵ 開く' : '↵ 検索');
  else handlers.hint('');
}

// ----------------------------------------------------------------------
// のぞき見 (あまり見ないページのチップ)
// ----------------------------------------------------------------------

function showPeek(chip: HTMLElement, id: number): void {
  const tab = tabById(id);
  if (!tab) return;
  const url = thumbUrl(id);
  peek.replaceChildren();
  applyAccent(peek, tab.accent);
  if (url && !tab.error) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    peek.append(img);
  } else {
    peek.append(placeholder(tab));
  }
  peek.append(el('div', 'peek-title', tab.title));
  peek.hidden = false;
  const box = layoutBox(chip, contentEl);
  const w = 248;
  const x = Math.max(0, Math.min(contentEl.clientWidth - w, box.x + box.w / 2 - w / 2));
  peek.style.left = `${x}px`;
  peek.style.top = `${box.y - 10}px`;
  for (const a of peek.getAnimations()) a.cancel();
  animate(peek, [{ opacity: 0, transform: 'translateY(-100%) translateY(8px) scale(0.96)' }, { opacity: 1, transform: 'translateY(-100%)' }], 'pop');
}

function hidePeek(): void {
  peek.hidden = true;
}

// ----------------------------------------------------------------------
// 開く・閉じる (ページ ⇄ カードの変形)
// ----------------------------------------------------------------------

function blobUrl(data: Uint8Array): string {
  return URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/jpeg' }));
}

/** ページ表示領域と同じ大きさの「変形用レイヤー」 */
function createMorph(rect: DOMRect, image: string | null, tab?: TabState): HTMLElement {
  const morph = el('div', 'morph');
  Object.assign(morph.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: 'var(--radius-page)',
  });
  if (image) {
    const img = el('img');
    img.src = image;
    img.alt = '';
    img.style.width = `${rect.width}px`;
    morph.append(img);
  } else if (tab) {
    applyAccent(morph, tab.accent);
    morph.append(placeholder(tab));
    morph.classList.add('placeholder-morph');
  }
  morphLayer.append(morph);
  return morph;
}

/** ページ (page) とカードのプレビュー (tile) の間の変形キーフレーム */
function morphFrames(page: DOMRect, tile: DOMRect, radius: number): [Keyframe, Keyframe] {
  const s = tile.width / page.width;
  const clipBottom = Math.max(0, page.height - tile.height / s);
  return [
    { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 12px)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
    {
      transform: `translate(${tile.left - page.left}px, ${tile.top - page.top}px) scale(${s})`,
      clipPath: `inset(0px 0px ${clipBottom}px 0px round ${radius / s}px)`,
      boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
    },
  ];
}

function waitFor(anim: Animation, timeout: number): Promise<void> {
  return Promise.race([anim.finished.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, timeout))]);
}

/** メインプロセスから「スペースへ」が届いた */
export async function handleEnter(enter: OverviewEnter): Promise<void> {
  if (open) {
    // 開いているときに Ctrl+E をもう一度押したら、元のページへ戻る
    if (!enter.launcher) {
      back();
      return;
    }
    // Ctrl+T を押し直した: 入力をやり直す
    launcher = true;
    filter = '';
    selKey = null;
    history = [];
    render(true);
    return;
  }
  launcher = enter.launcher;
  open = true;
  exiting = false;
  const seq = ++enterSeq;
  mainInSpace = false;
  const stale = () => seq !== enterSeq || !open;
  filter = '';
  history = [];
  selKey = null;

  const page = contentRect();
  let morph: HTMLElement | null = null;
  if (backdropUrl) URL.revokeObjectURL(backdropUrl);
  backdropUrl = enter.snapshot ? blobUrl(enter.snapshot) : null;
  backdropImg.hidden = !backdropUrl;
  if (backdropUrl) {
    backdropImg.src = backdropUrl;
    morph = createMorph(page, backdropUrl);
    await (morph.querySelector('img') as HTMLImageElement).decode().catch(() => undefined);
  }
  if (stale()) {
    morph?.remove();
    return;
  }
  // 同じ場所に同じ絵を出してから、本物のページを外してもらう (継ぎ目が見えない)
  api.overviewReady();

  document.body.dataset.mode = 'space';
  spaceEl.hidden = false;
  scrollEl.scrollTop = 0;
  render(false);

  const id = enter.tabId;
  const group = id !== null ? groupKeyOf(id) : null;
  const target =
    id !== null ? (nodeFor(`tab:${id}`) ?? (group ? nodeFor(`group:${group}`) : undefined) ?? chips.get(id)) : undefined;
  if (target && !target.hidden) target.scrollIntoView({ block: 'nearest' });
  placeRing(false);
  ring.style.opacity = '0';

  fade(spaceEl, [{ opacity: 0 }, { opacity: 1 }], 240);

  // ほかのカードは、元のページの位置から波紋のように順に現れる (Staggered entrance)
  const origin = target ? previewRectOf(target) : page;
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  for (const node of selectables()) {
    if (node === target) continue;
    const r = node.getBoundingClientRect();
    const dist = Math.hypot(r.left + r.width / 2 - ox, r.top + r.height / 2 - oy);
    popIn(node, Math.min(240, 30 + dist * 0.2));
  }

  if (morph && target) {
    target.classList.add('landing');
    const anim = animate(morph, morphFrames(page, previewRectOf(target), 16), 'morph', { fill: 'forwards' });
    await waitFor(anim, 1200);
    target.classList.remove('landing');
    if (!stale()) {
      const out = fade(morph, [{ opacity: 1 }, { opacity: 0 }], 120);
      await waitFor(out, 300);
    }
  }
  morph?.remove();
  if (stale()) return;
  placeRing(true);

  if (pendingPileFocus) {
    pendingPileFocus = false;
    revealPile();
  }
}

/** ページを選んで表示に戻る: カードがページの大きさまで広がる (Shared-element transition) */
export async function openTab(id: number): Promise<void> {
  if (!open) {
    api.activateTab(id);
    return;
  }
  if (exiting) return;
  exiting = true;
  hidePeek();
  const tab = tabById(id);
  const node = nodeFor(`tab:${id}`) ?? chips.get(id);
  const page = contentRect();
  let morph: HTMLElement | null = null;

  if (node && !node.hidden && tab) {
    const from = previewRectOf(node);
    morph = createMorph(page, tab.error ? null : thumbUrl(id), tab);
    node.classList.add('landing');
    const [pageFrame, tileFrame] = morphFrames(page, from, node.classList.contains('chip') ? 18 : 16);
    fade(contentEl, [{ opacity: 1 }, { opacity: 0 }], 200).onfinish = () => (contentEl.style.opacity = '0');
    const anim = animate(morph, [tileFrame, pageFrame], 'morph', { fill: 'forwards' });
    await waitFor(anim, 1000);
  }

  const shown = new Promise<void>((resolve) => {
    browseResolver = resolve;
    setTimeout(resolve, 500);
  });
  api.closeOverview(id);
  await shown;
  finishClose();
  morph?.remove();
}

/** Esc: 元のページへ戻る */
export function back(): void {
  const id = ctx.state.activeTabId;
  if (id !== null && tabById(id)) void openTab(id);
}

function finishClose(): void {
  enterSeq++;
  open = false;
  exiting = false;
  browseResolver = null;
  spaceEl.hidden = true;
  contentEl.style.opacity = '';
  document.body.dataset.mode = 'browse';
  contentEl.querySelectorAll('.landing').forEach((n) => n.classList.remove('landing'));
  hidePeek();
  handlers.hint('');
  handlers.closed();
}

/** 状態が更新されたとき */
export function onState(): void {
  if (ctx.state.mode === 'browse') {
    if (browseResolver) browseResolver();
    // メインプロセス側で閉じられた (新しいページを開いた など)。
    // 開く途中 (メインがまだ切り替わっていない間) に届いた状態では閉じない
    else if (open && !exiting && mainInSpace) finishClose();
    return;
  }
  mainInSpace = true;
  if (open && !exiting) render(true);
}

// ----------------------------------------------------------------------
// 入力欄 (絞り込み) とキーボード
// ----------------------------------------------------------------------

export function setFilter(text: string): void {
  if (!open) return;
  filter = text;
  selKey = null;
  render(true);
  clearTimeout(historyTimer);
  const q = text.trim();
  if (!q) return;
  historyTimer = window.setTimeout(async () => {
    const result = await api.searchHistory(q);
    if (filter.trim() !== q) return;
    history = result;
    render(true);
  }, 120);
}

function activateSelection(): void {
  if (!selKey) return;
  if (selKey.startsWith('tab:')) void openTab(Number(selKey.slice(4)));
  else if (selKey.startsWith('group:')) toggleGroup(selKey.slice(6), true);
  else if (selKey.startsWith('sug:')) api.newTab(selKey.slice(4));
  else if (selKey.startsWith('hist:')) api.newTab(selKey.slice(5));
}

/** 入力欄でのキー操作。処理したら true */
export function handleKey(e: KeyboardEvent, input: HTMLInputElement): boolean {
  if (!open || exiting) return false;
  const empty = input.value === '';
  switch (e.key) {
    case 'Escape':
      if (!empty) {
        input.value = '';
        setFilter('');
      } else {
        back();
      }
      return true;
    case 'ArrowDown':
    case 'ArrowUp':
      moveSelection(e.key === 'ArrowDown' ? 'down' : 'up');
      return true;
    case 'ArrowLeft':
    case 'ArrowRight':
      if (!empty) return false; // 文字入力中は通常のカーソル移動
      moveSelection(e.key === 'ArrowLeft' ? 'left' : 'right');
      return true;
    case 'Tab':
      stepSelection(e.shiftKey ? -1 : 1);
      return true;
    case 'Delete':
      if (!empty || !selKey?.startsWith('tab:')) return false;
      api.closeTab(Number(selKey.slice(4)));
      return true;
    case 'Enter': {
      const text = input.value.trim();
      // Shift/Alt+Enter は、開いているページがあっても入力どおりに開く
      if ((e.shiftKey || e.altKey) && text) api.newTab(text);
      else if (selKey) activateSelection();
      else if (text) api.newTab(text);
      return true;
    }
  }
  return false;
}

/** シェルフの項目にマウスが乗ったら、対応するカードを選ぶ */
export function highlight(id: number | null): void {
  if (!open || exiting || id === null) return;
  const group = groupKeyOf(id);
  select(nodeFor(`tab:${id}`) ? `tab:${id}` : group ? `group:${group}` : `tab:${id}`, true);
}

/** シェルフの「あまり見ない」から開いた */
export function focusPile(): void {
  if (open) revealPile();
  else pendingPileFocus = true;
}

function revealPile(): void {
  if (pileSec.hidden) return;
  pileSec.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  const first = pileChips.querySelector<HTMLElement>('[data-sel]');
  if (first) select(first.dataset.sel ?? null, false);
}
