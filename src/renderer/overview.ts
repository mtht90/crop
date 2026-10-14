// オーバービュー: 開いているページを「見た目」で見つける画面
// - よく戻るページは大きなタイル、通常のページは標準のタイル
// - あまり見ないページは小さなチップにまとめる
// - 表示中のページはタイルへ縮み、選んだタイルはページへ広がる (同じ画像が連続して動く)
import type { HistoryEntry, OverviewEnter, Suggestion, TabState } from '../shared/types';
import { api, applyAccent, ctx, el, faviconEl, hostOf, tabById, thumbUrl } from './ctx.js';
import { setIcon } from './icons.js';
import { animate, fade, flipGroup, popIn, reducedMotion } from './motion.js';

const overviewEl = document.getElementById('overview')!;
const scrollEl = document.getElementById('ov-scroll')!;
const contentEl = document.getElementById('ov-content')!;
const summaryEl = document.getElementById('ov-summary')!;
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
const chromeEl = document.getElementById('chrome')!;

const META_H = 52;
const GAP = 18;

const tiles = new Map<number, HTMLElement>();
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

export interface OverviewHandlers {
  /** Enter キーで何が起きるかのヒントを表示する */
  hint(text: string): void;
  /** オーバービューが閉じた (アドレス欄を URL 表示に戻す) */
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
  const top = chromeEl.getBoundingClientRect().bottom;
  const panel = document.getElementById('panel')!;
  const right = panel.hidden ? 0 : panel.getBoundingClientRect().width;
  return new DOMRect(0, top, window.innerWidth - right, window.innerHeight - top);
}

/** タイル内のプレビュー部分 (チップならチップ全体) */
function previewRectOf(node: HTMLElement): DOMRect {
  const thumb = node.querySelector('.thumb');
  return (thumb ?? node).getBoundingClientRect();
}

/** ウィンドウの縦横比に合わせてグリッドを組む (プレビューがページの形そのままになる) */
function layoutGrid(): void {
  const width = gridEl.clientWidth;
  if (width === 0) return;
  const cols = Math.max(2, Math.min(6, Math.floor((width + GAP) / (250 + GAP))));
  const cellW = (width - GAP * (cols - 1)) / cols;
  const page = contentRect();
  const aspect = Math.max(1.2, Math.min(2.1, page.width / Math.max(1, page.height)));
  const rowH = cellW / aspect + META_H;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  gridEl.style.gridAutoRows = `${rowH}px`;
  gridEl.style.gap = `${GAP}px`;
  gridEl.dataset.cols = String(cols);
}

// ----------------------------------------------------------------------
// タイル・チップの生成と更新
// ----------------------------------------------------------------------

function createTile(id: number): HTMLElement {
  const tile = el('div', 'tile');
  tile.dataset.sel = `tab:${id}`;
  const card = el('div', 'card');
  const thumb = el('div', 'thumb');
  const meta = el('div', 'meta');
  const text = el('div', 'text');
  text.append(el('div', 'title'), el('div', 'sub'));
  meta.append(el('span', 'meta-icon'), text, el('span', 'badge'));
  const tools = el('div', 'tools');
  const pin = el('button', 'tool pin');
  const close = el('button', 'tool close');
  close.title = 'タブを閉じる';
  setIcon(close, 'close');
  tools.append(pin, close);
  card.append(thumb, meta, tools);
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

function updateTile(tile: HTMLElement, tab: TabState): void {
  tile.dataset.tier = tab.tier;
  tile.classList.toggle('active', tab.id === ctx.state.activeTabId);
  tile.classList.toggle('pinned', tab.pinned);
  applyAccent(tile, tab.accent);

  const thumb = tile.querySelector('.thumb') as HTMLElement;
  const url = thumbUrl(tab.id);
  const thumbKey = url ? 'img' : `ph|${tab.favicon}|${tab.title}`;
  if (thumb.dataset.key !== thumbKey) {
    thumb.dataset.key = thumbKey;
    if (url) {
      const img = el('img');
      img.dataset.thumb = String(tab.id);
      img.alt = '';
      img.draggable = false;
      img.src = url;
      thumb.replaceChildren(img);
    } else {
      thumb.replaceChildren(placeholder(tab));
    }
  }

  const icon = tile.querySelector('.meta-icon') as HTMLElement;
  const iconKey = tab.loading ? 'loading' : `${tab.favicon}|${tab.title[0] ?? ''}`;
  if (icon.dataset.key !== iconKey) {
    icon.dataset.key = iconKey;
    icon.replaceChildren(tab.loading ? el('span', 'spinner') : faviconEl(tab.favicon, tab.title));
  }
  (tile.querySelector('.title') as HTMLElement).textContent = tab.title;
  const sub = tile.querySelector('.sub') as HTMLElement;
  sub.replaceChildren(el('span', undefined, hostOf(tab.url) || '新しいタブ'));
  if (tab.returns > 0) {
    const r = el('span', 'returns');
    r.title = `このセッションで ${tab.returns} 回戻ってきました`;
    setIcon(r, 'returns');
    r.append(document.createTextNode(String(tab.returns)));
    sub.append(r);
  }

  const pin = tile.querySelector('.pin') as HTMLElement;
  setIcon(pin, tab.pinned ? 'pinFilled' : 'pin');
  pin.title = tab.pinned ? '固定を解除' : '固定する (常に大きく表示)';
  const badge = tile.querySelector('.badge') as HTMLElement;
  badge.textContent = tab.pinned ? '固定' : tab.tier === 'hero' ? 'よく戻る' : '';
  badge.hidden = !badge.textContent;
}

/** プレビューがまだ無いページの代わりの絵: アクセントカラーと大きなファビコン */
function placeholder(tab: { favicon: string | null; title: string; url: string }): HTMLElement {
  const ph = el('div', 'placeholder');
  ph.append(faviconEl(tab.favicon, tab.title, 'ph-icon'), el('span', 'ph-host', hostOf(tab.url)));
  return ph;
}

function createChip(id: number): HTMLElement {
  const chip = el('button', 'chip');
  chip.dataset.sel = `tab:${id}`;
  chip.append(el('span', 'dot'), el('span', 'chip-icon'), el('span', 'chip-title'));
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
  const icon = chip.querySelector('.chip-icon') as HTMLElement;
  const iconKey = `${tab.favicon}|${tab.title[0] ?? ''}`;
  if (icon.dataset.key !== iconKey) {
    icon.dataset.key = iconKey;
    icon.replaceChildren(faviconEl(tab.favicon, tab.title));
  }
  (chip.querySelector('.chip-title') as HTMLElement).textContent = tab.title;
}

function suggestionChip(s: Suggestion): HTMLElement {
  const chip = el('button', 'chip suggestion');
  chip.dataset.sel = `sug:${s.url}`;
  chip.title = `${s.title}\n${s.url}`;
  applyAccent(chip, s.accent);
  chip.append(el('span', 'dot'), faviconEl(s.favicon, s.title, 'chip-icon'), el('span', 'chip-title', s.title));
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

/** 並び: 固定 → よく戻る → 通常 (同じ段ではタブの並び順を保ち、位置を覚えやすくする) */
function gridOrder(tabs: TabState[]): TabState[] {
  const rank = (t: TabState) => (t.pinned ? 0 : t.tier === 'hero' ? 1 : 2);
  return tabs
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t);
}

function collect(): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  for (const [id, chip] of chips) map.set(`tab:${id}`, chip);
  for (const [id, tile] of tiles) map.set(`tab:${id}`, tile);
  for (const [url, node] of sugEls) map.set(`sug:${url}`, node);
  for (const [url, node] of histEls) map.set(`hist:${url}`, node);
  return map;
}

function mutate(): void {
  const { tabs, suggestions } = ctx.state;
  const match = matches(filter);
  const gridTabs = gridOrder(tabs.filter((t) => t.tier !== 'compact'));
  const pileTabs = tabs.filter((t) => t.tier === 'compact');

  // タイル
  const liveTiles = new Set<number>();
  gridTabs.forEach((tab, i) => {
    let tile = tiles.get(tab.id);
    if (!tile) {
      tile = createTile(tab.id);
      tiles.set(tab.id, tile);
    }
    updateTile(tile, tab);
    tile.hidden = !match(tab);
    liveTiles.add(tab.id);
    if (gridEl.children[i] !== tile) gridEl.insertBefore(tile, gridEl.children[i] ?? null);
  });
  for (const [id, tile] of tiles) {
    if (!liveTiles.has(id)) {
      tile.remove();
      tiles.delete(id);
    }
  }

  // あまり見ないページ
  const liveChips = new Set<number>();
  pileTabs.forEach((tab, i) => {
    let chip = chips.get(tab.id);
    if (!chip) {
      chip = createChip(tab.id);
      chips.set(tab.id, chip);
    }
    updateChip(chip, tab);
    chip.hidden = !match(tab);
    liveChips.add(tab.id);
    if (pileChips.children[i] !== chip) pileChips.insertBefore(chip, pileChips.children[i] ?? null);
  });
  for (const [id, chip] of chips) {
    if (!liveChips.has(id)) {
      chip.remove();
      chips.delete(id);
    }
  }
  const visiblePile = pileTabs.filter(match).length;
  pileSec.hidden = visiblePile === 0;
  pileCount.textContent = String(visiblePile);

  // 閉じたけれどよく戻っていたページ
  const sugs = suggestions.filter(match);
  syncList(suggestChips, sugEls, sugs, (s) => s.url, suggestionChip);
  suggestSec.hidden = sugs.length === 0;

  // 履歴 (検索中のみ)
  const openUrls = new Set(tabs.map((t) => t.url));
  const sugUrls = new Set(sugs.map((s) => s.url));
  const hist = filter.trim() ? history.filter((h) => !openUrls.has(h.url) && !sugUrls.has(h.url)).slice(0, 6) : [];
  syncList(historyRows, histEls, hist, (h) => h.url, historyRow);
  historySec.hidden = hist.length === 0;

  const visibleTiles = gridTabs.filter(match).length;
  gridEl.hidden = visibleTiles === 0;
  const nothing = visibleTiles + visiblePile + sugs.length + hist.length === 0;
  emptyEl.hidden = !nothing;
  emptyEl.textContent = filter.trim()
    ? `「${filter.trim()}」に一致する開いたページはありません。Enter で開くか検索します。`
    : '開いているページはありません。上の欄に URL か検索語を入力してください。';

  const heroCount = gridTabs.filter((t) => t.tier === 'hero' || t.pinned).length;
  const parts = [`${tabs.length} ページ`];
  if (heroCount) parts.push(`よく戻る ${heroCount}`);
  if (pileTabs.length) parts.push(`あまり見ない ${pileTabs.length}`);
  summaryEl.textContent = parts.join(' · ');

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
  items.forEach((item, i) => {
    const key = keyOf(item);
    let node = map.get(key);
    if (!node) {
      node = create(item);
      map.set(key, node);
    }
    live.add(key);
    if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] ?? null);
  });
  for (const [key, node] of map) {
    if (!live.has(key)) {
      node.remove();
      map.delete(key);
    }
  }
}

function render(animated: boolean): void {
  if (animated && !reducedMotion.matches) {
    flipGroup(collect, mutate, { ghostLayer: contentEl, enter: (node) => popIn(node), spring: 'reflow' });
  } else {
    mutate();
  }
  ensureSelection();
  placeRing(animated);
  updateHint();
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
    selKey = `tab:${ctx.state.activeTabId}`;
    if (!nodeFor(selKey)) selKey = null;
  } else {
    selKey = null;
  }
}

function select(key: string | null, scroll: boolean): void {
  if (key === selKey) return;
  selKey = key;
  placeRing(true);
  updateHint();
  if (scroll) nodeFor(key)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

/** 要素の位置を ov-content 基準で求める (アニメーション中の transform を含まない最終位置) */
function layoutBox(node: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = node;
  while (cur && cur !== contentEl) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

function placeRing(animated: boolean): void {
  const node = nodeFor(selKey);
  if (!node) {
    ring.style.opacity = '0';
    ringPos = null;
    return;
  }
  const pad = node.classList.contains('tile') ? 5 : 3;
  const box = layoutBox(node);
  const next = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  const prev = ringPos;
  ringPos = next;
  ring.classList.toggle('small', !node.classList.contains('tile'));
  ring.style.setProperty('--accent', getComputedStyle(node).getPropertyValue('--accent') || '');
  ring.style.transform = `translate(${next.x}px, ${next.y}px)`;
  ring.style.width = `${next.w}px`;
  ring.style.height = `${next.h}px`;
  for (const a of ring.getAnimations()) a.cancel();
  if (!prev || ring.style.opacity !== '1') {
    ring.style.opacity = '1';
    if (animated) fade(ring, [{ opacity: 0, transform: `translate(${next.x}px, ${next.y}px) scale(1.04)` }, { opacity: 1 }], 180);
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
  const nodes = selectables();
  if (nodes.length === 0) return;
  const current = nodeFor(selKey);
  if (!current) {
    select(nodes[0].dataset.sel ?? null, true);
    return;
  }
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const node of nodes) {
    if (node === current) continue;
    const r = node.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
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
  const nodes = selectables();
  if (nodes.length === 0) return;
  const index = nodes.findIndex((n) => n.dataset.sel === selKey);
  const next = nodes[(index + offset + nodes.length) % nodes.length];
  select(next.dataset.sel ?? null, true);
}

function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return !/\s/.test(t) && (/^[a-z]+:/i.test(t) || /^[^.]+\.[a-z]{2,}/i.test(t) || /^localhost/i.test(t));
}

function updateHint(): void {
  if (!open) return handlers.hint('');
  if (selKey?.startsWith('tab:')) handlers.hint('↵ このページへ');
  else if (selKey) handlers.hint('↵ 開く');
  else if (filter.trim()) handlers.hint(looksLikeUrl(filter) ? '↵ 開く' : '↵ 検索');
  else handlers.hint('');
}

// ----------------------------------------------------------------------
// プレビューの「のぞき見」(あまり見ないページのチップ)
// ----------------------------------------------------------------------

function showPeek(chip: HTMLElement, id: number): void {
  const tab = tabById(id);
  if (!tab) return;
  const url = thumbUrl(id);
  peek.replaceChildren();
  applyAccent(peek, tab.accent);
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    peek.append(img);
  } else {
    peek.append(placeholder(tab));
  }
  peek.append(el('div', 'peek-title', tab.title));
  peek.hidden = false;
  const box = layoutBox(chip);
  const w = 240;
  const x = Math.max(0, Math.min(contentEl.clientWidth - w, box.x + box.w / 2 - w / 2));
  peek.style.left = `${x}px`;
  peek.style.top = `${box.y - 8}px`;
  for (const a of peek.getAnimations()) a.cancel();
  animate(peek, [{ opacity: 0, transform: 'translateY(-100%) translateY(6px) scale(0.96)' }, { opacity: 1, transform: 'translateY(-100%)' }], 'pop');
}

function hidePeek(): void {
  peek.hidden = true;
}

// ----------------------------------------------------------------------
// 開く・閉じる
// ----------------------------------------------------------------------

function blobUrl(data: Uint8Array): string {
  return URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/jpeg' }));
}

/** ページ全体の大きさの「変形用レイヤー」を作る */
function createMorph(rect: DOMRect, image: string | null, tab?: TabState): HTMLElement {
  const morph = el('div', 'morph');
  Object.assign(morph.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
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

/** ページ領域 (page) とタイルのプレビュー (tile) の間の変形キーフレーム */
function morphFrames(page: DOMRect, tile: DOMRect, radius: number): [Keyframe, Keyframe] {
  const s = tile.width / page.width;
  const clipBottom = Math.max(0, page.height - tile.height / s);
  return [
    { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 0px)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
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

/** メインプロセスから「オーバービューへ」が届いた */
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
  filter = '';
  history = [];
  selKey = null;

  const page = contentRect();
  let morph: HTMLElement | null = null;
  let snapshotUrl: string | null = null;
  if (enter.snapshot) {
    snapshotUrl = blobUrl(enter.snapshot);
    morph = createMorph(page, snapshotUrl);
    await (morph.querySelector('img') as HTMLImageElement).decode().catch(() => undefined);
  }
  // 同じ場所に同じ絵を出してから、本物のページを外してもらう (継ぎ目が見えない)
  api.overviewReady();

  document.body.dataset.mode = 'overview';
  overviewEl.hidden = false;
  scrollEl.scrollTop = 0;
  render(false);

  const target = enter.tabId !== null ? tiles.get(enter.tabId) ?? chips.get(enter.tabId) : undefined;
  if (target && !target.hidden) target.scrollIntoView({ block: 'nearest' });
  placeRing(false);
  ring.style.opacity = '0';

  fade(overviewEl, [{ opacity: 0 }, { opacity: 1 }], 220);

  // 他のタイルは、元のページの位置から波紋のように順に現れる
  const origin = target ? previewRectOf(target) : page;
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  for (const node of selectables()) {
    if (node === target) continue;
    const r = node.getBoundingClientRect();
    const dist = Math.hypot(r.left + r.width / 2 - ox, r.top + r.height / 2 - oy);
    popIn(node, Math.min(260, 40 + dist * 0.22));
  }

  if (morph && target) {
    target.classList.add('landing');
    const anim = animate(morph, morphFrames(page, previewRectOf(target), 12), 'morph', { fill: 'forwards' });
    await waitFor(anim, 1200);
    target.classList.remove('landing');
    const out = fade(morph, [{ opacity: 1 }, { opacity: 0 }], 120);
    await waitFor(out, 300);
  }
  morph?.remove();
  if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
  placeRing(true);

  if (pendingPileFocus) {
    pendingPileFocus = false;
    revealPile();
  }
}

/** タブを選んでページに戻る: タイルがページの大きさまで広がる */
export async function openTab(id: number): Promise<void> {
  if (!open) {
    api.activateTab(id);
    return;
  }
  if (exiting) return;
  exiting = true;
  hidePeek();
  const tab = tabById(id);
  const node = tiles.get(id) ?? chips.get(id);
  const page = contentRect();
  let morph: HTMLElement | null = null;

  if (node && !node.hidden && tab) {
    const from = previewRectOf(node);
    morph = createMorph(page, thumbUrl(id), tab);
    node.classList.add('landing');
    const [pageFrame, tileFrame] = morphFrames(page, from, node.classList.contains('chip') ? 8 : 12);
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
  open = false;
  exiting = false;
  browseResolver = null;
  overviewEl.hidden = true;
  contentEl.style.opacity = '';
  document.body.dataset.mode = 'browse';
  tiles.forEach((t) => t.classList.remove('landing'));
  chips.forEach((c) => c.classList.remove('landing'));
  hidePeek();
  handlers.hint('');
  handlers.closed();
}

/** 状態が更新されたとき */
export function onState(): void {
  if (ctx.state.mode === 'browse') {
    if (browseResolver) browseResolver();
    else if (open && !exiting) {
      // メインプロセス側で閉じられた (新しいページを開いた など)
      finishClose();
    }
    return;
  }
  if (open && !exiting) render(true);
}

// ----------------------------------------------------------------------
// 入力欄 (フィルター) とキーボード
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
      // 文字入力中は通常のカーソル移動
      if (!empty) return false;
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
      if ((e.shiftKey || e.altKey) && text) {
        api.newTab(text);
        return true;
      }
      if (selKey?.startsWith('tab:')) void openTab(Number(selKey.slice(4)));
      else if (selKey?.startsWith('sug:')) api.newTab(selKey.slice(4));
      else if (selKey?.startsWith('hist:')) api.newTab(selKey.slice(5));
      else if (text) api.newTab(text);
      return true;
    }
  }
  return false;
}

/** タブストリップのピルにマウスが乗ったら、対応するタイルを選択する */
export function highlight(id: number | null): void {
  if (!open || exiting || id === null) return;
  select(`tab:${id}`, true);
}

/** 「あまり見ないページ」の束から開いた */
export function focusPile(): void {
  if (open) revealPile();
  else pendingPileFocus = true;
}

function revealPile(): void {
  if (pileSec.hidden) return;
  pileSec.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  const first = pileChips.querySelector<HTMLElement>('[data-sel]');
  if (first) select(first.dataset.sel ?? null, false);
  animate(pileSec, [{ transform: 'scale(1.015)' }, { transform: 'none' }], 'pop');
}
