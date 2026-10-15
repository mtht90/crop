// シェルフ: 左側に縦に並ぶ、開いているページの一覧
// - よく戻るページ・固定したページは、プレビュー付きのカード
// - 通常のページは 1 行。同じサイトは開閉できるまとまりに
// - あまり見ないページは下の「束」に
// - 表示中のページの下地 (ガラス) がバネで滑る
import type { TabState } from '../shared/types';
import { api, applyAccent, ctx, el, faviconKey, layoutBox, tabIcon, thumbUrl } from './ctx.js';
import { iconSvg, setIcon } from './icons.js';
import { arrange } from './model.js';
import type { Entry } from './model.js';
import { animate, flipGroup, popIn, reducedMotion } from './motion.js';

const listEl = document.getElementById('shelf-list')!;
const scrollEl = document.getElementById('shelf-scroll')!;
const glider = document.getElementById('shelf-glider')!;

/** キー: tab:ID / group:サイト / stack */
const nodes = new Map<string, HTMLElement>();
/** シェルフで開いているまとまり */
const expandedGroups = new Set<string>();
let stackOpen = false;
let gliderBox: { x: number; y: number; w: number; h: number } | null = null;
let lastActive: number | null = null;
let draggingId: number | null = null;
/** タブ → それを含むまとまり (group:サイト / stack) */
const holderOf = new Map<number, string>();

export interface ShelfHandlers {
  select(id: number): void;
  hover(id: number | null): void;
}
let handlers: ShelfHandlers;

export function initShelf(h: ShelfHandlers): void {
  handlers = h;
  listEl.addEventListener('keydown', onKey);
  new ResizeObserver(() => moveGlider(false)).observe(listEl);
}

// ----------------------------------------------------------------------
// 要素
// ----------------------------------------------------------------------

function tabKind(tab: TabState): 'card' | 'row' {
  return tab.pinned || tab.tier === 'hero' ? 'card' : 'row';
}

function bindTab(node: HTMLElement, id: number): void {
  node.setAttribute('role', 'tab');
  node.tabIndex = -1;
  node.draggable = true;
  node.dataset.id = String(id);
  node.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button')) handlers.select(id);
  });
  node.addEventListener('auxclick', (e) => {
    if (e.button === 1) api.closeTab(id);
  });
  node.addEventListener('mouseenter', () => handlers.hover(id));
  node.addEventListener('mouseleave', () => handlers.hover(null));
  node.addEventListener('dragstart', (e) => {
    draggingId = id;
    e.dataTransfer?.setData('text/plain', String(id));
  });
  node.addEventListener('dragend', () => {
    draggingId = null;
    listEl.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  });
  node.addEventListener('dragover', (e) => {
    if (draggingId === null || draggingId === id) return;
    e.preventDefault();
    node.classList.add('drop-target');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
  node.addEventListener('drop', (e) => {
    e.preventDefault();
    node.classList.remove('drop-target');
    if (draggingId === null || draggingId === id) return;
    api.moveTab(draggingId, ctx.state.tabs.findIndex((t) => t.id === id));
  });
}

function closeButton(id: number): HTMLButtonElement {
  const close = el('button', 's-close');
  close.title = 'タブを閉じる (Ctrl+W)';
  close.setAttribute('aria-label', 'タブを閉じる');
  close.tabIndex = -1;
  setIcon(close, 'close');
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    api.closeTab(id);
  });
  return close;
}

function createRow(id: number): HTMLElement {
  const row = el('div', 's-item s-row');
  row.dataset.kind = 'row';
  row.append(el('span', 's-icon'), el('span', 's-title'), el('span', 's-audio'), closeButton(id));
  bindTab(row, id);
  return row;
}

function createCard(id: number): HTMLElement {
  const card = el('div', 's-item s-card');
  card.dataset.kind = 'card';
  const meta = el('div', 's-meta');
  meta.append(el('span', 's-icon'), el('span', 's-title'), el('span', 's-pin'), closeButton(id));
  card.append(el('div', 's-thumb'), meta);
  bindTab(card, id);
  return card;
}

function updateTabNode(node: HTMLElement, tab: TabState): void {
  const active = tab.id === ctx.state.activeTabId;
  node.classList.toggle('active', active);
  node.setAttribute('aria-selected', String(active));
  node.setAttribute('aria-label', tab.title);
  node.title = `${tab.title}\n${tab.url}`;
  applyAccent(node, tab.accent);

  const icon = node.querySelector('.s-icon') as HTMLElement;
  const key = faviconKey(tab);
  if (icon.dataset.key !== key) {
    icon.dataset.key = key;
    icon.replaceChildren(tabIcon(tab));
  }
  (node.querySelector('.s-title') as HTMLElement).textContent = tab.title;

  const audio = node.querySelector('.s-audio') as HTMLElement | null;
  if (audio) {
    audio.hidden = !tab.audible && !tab.muted;
    setIcon(audio, tab.muted ? 'muted' : 'volume');
  }
  const pin = node.querySelector('.s-pin') as HTMLElement | null;
  if (pin) {
    pin.hidden = !tab.pinned;
    setIcon(pin, 'pinFilled');
  }

  const thumb = node.querySelector('.s-thumb') as HTMLElement | null;
  if (thumb) {
    const url = thumbUrl(tab.id);
    const tkey = url ? 'img' : `ph|${key}`;
    if (thumb.dataset.key !== tkey) {
      thumb.dataset.key = tkey;
      if (url) {
        const img = el('img');
        img.dataset.thumb = String(tab.id);
        img.alt = '';
        img.draggable = false;
        img.src = url;
        thumb.replaceChildren(img);
      } else {
        thumb.replaceChildren(tabIcon(tab));
      }
    }
  }
}

function createGroup(key: string, kind: 'group' | 'stack'): HTMLElement {
  const group = el('div', `s-item s-group${kind === 'stack' ? ' s-stack' : ''}`);
  group.dataset.kind = kind;
  group.dataset.key = key;
  const head = el('div', 's-group-head');
  head.tabIndex = -1;
  head.setAttribute('role', 'button');
  head.dataset.focusable = '1';
  const chevron = el('span', 's-chevron');
  chevron.innerHTML = iconSvg('chevron');
  head.append(el('span', kind === 'stack' ? 'fav-pile' : 'fav-stack'), el('span', 's-title'), el('span', 's-count'), chevron);
  group.append(head, el('div', 's-group-body'));
  head.addEventListener('click', () => toggleGroup(key));
  return group;
}

function toggleGroup(key: string): void {
  if (key === 'stack') stackOpen = !stackOpen;
  else if (expandedGroups.has(key)) expandedGroups.delete(key);
  else expandedGroups.add(key);
  renderShelf();
}

function updateGroupHead(group: HTMLElement, label: string, tabs: TabState[], open: boolean): void {
  const head = group.querySelector('.s-group-head') as HTMLElement;
  group.classList.toggle('open', open);
  head.setAttribute('aria-expanded', String(open));
  head.setAttribute('aria-label', `${label} (${tabs.length})`);
  head.title = `${label}\n${tabs.map((t) => `・${t.title}`).join('\n')}`;
  applyAccent(group, tabs[0]?.accent ?? null);
  (head.querySelector('.s-title') as HTMLElement).textContent = label;
  (head.querySelector('.s-count') as HTMLElement).textContent = String(tabs.length);
  const icons = head.querySelector('.fav-stack, .fav-pile') as HTMLElement;
  const max = group.dataset.kind === 'stack' ? 4 : 2;
  const key = tabs.slice(0, max).map(faviconKey).join(',');
  if (icons.dataset.key !== key) {
    icons.dataset.key = key;
    icons.replaceChildren(
      ...tabs.slice(0, max).map((t) => {
        const f = tabIcon(t);
        applyAccent(f, t.accent);
        return f;
      }),
    );
  }
}

// ----------------------------------------------------------------------
// 描画
// ----------------------------------------------------------------------

function tabNode(tab: TabState): HTMLElement {
  const key = `tab:${tab.id}`;
  const kind = tabKind(tab);
  let node = nodes.get(key);
  if (!node || node.dataset.kind !== kind) {
    node?.remove();
    node = kind === 'card' ? createCard(tab.id) : createRow(tab.id);
    nodes.set(key, node);
  }
  updateTabNode(node, tab);
  return node;
}

function place(parent: HTMLElement, children: HTMLElement[], offset = 0): void {
  children.forEach((child, i) => {
    const at = parent.children[i + offset];
    if (at !== child) parent.insertBefore(child, at ?? null);
  });
  // 余った要素 (別の場所へ移った・消えた) を取り除く
  while (parent.children.length > children.length + offset) {
    const last = parent.lastElementChild as HTMLElement;
    if (children.includes(last)) break;
    last.remove();
  }
}

export function renderShelf(): void {
  const { tabs, activeTabId } = ctx.state;
  const { entries, compact } = arrange(tabs);
  holderOf.clear();

  // 表示中のページが入っているまとまりは、自動で開く
  if (activeTabId !== lastActive) {
    lastActive = activeTabId;
    for (const entry of entries) {
      if (entry.kind === 'group' && entry.tabs.some((t) => t.id === activeTabId)) expandedGroups.add(entry.key);
    }
    if (compact.some((t) => t.id === activeTabId)) stackOpen = true;
  }

  flipGroup<string>(
    () => new Map([...nodes].filter(([, n]) => n.isConnected)),
    () => {
      const top: HTMLElement[] = [];
      const live = new Set<string>();
      for (const entry of entries) top.push(entryNode(entry, live));
      if (compact.length > 0) {
        let stack = nodes.get('stack');
        if (!stack) {
          stack = createGroup('stack', 'stack');
          nodes.set('stack', stack);
        }
        updateGroupHead(stack, 'あまり見ない', compact, stackOpen);
        const body = stack.querySelector('.s-group-body') as HTMLElement;
        place(body, stackOpen ? compact.map((t) => tabNode(t)) : []);
        compact.forEach((t) => {
          live.add(`tab:${t.id}`);
          holderOf.set(t.id, 'stack');
        });
        live.add('stack');
        top.push(stack);
      }
      for (const [key, node] of nodes) {
        if (!live.has(key)) {
          node.remove();
          nodes.delete(key);
        }
      }
      // 先頭の glider の後ろに並べる
      place(listEl, top, 1);
      updateRoving();
    },
    {
      ghostLayer: listEl,
      spring: 'reflow',
      enter: (node) => popIn(node),
      fallbackFrom: (key, before) => {
        // まとまりから出てきたタブは、まとまりの位置から広がる
        const id = Number(key.slice(4));
        const tab = tabs.find((t) => t.id === id);
        if (!tab) return undefined;
        if (tab.tier === 'compact') return before.get('stack');
        return undefined;
      },
    },
  );
  moveGlider(true);
}

function entryNode(entry: Entry, live: Set<string>): HTMLElement {
  if (entry.kind === 'tab') {
    live.add(`tab:${entry.tab.id}`);
    return tabNode(entry.tab);
  }
  const key = `group:${entry.key}`;
  let group = nodes.get(key);
  if (!group) {
    group = createGroup(entry.key, 'group');
    nodes.set(key, group);
  }
  const open = expandedGroups.has(entry.key);
  updateGroupHead(group, entry.label, entry.tabs, open);
  const body = group.querySelector('.s-group-body') as HTMLElement;
  place(body, open ? entry.tabs.map((t) => tabNode(t)) : []);
  entry.tabs.forEach((t) => {
    live.add(`tab:${t.id}`);
    holderOf.set(t.id, key);
  });
  live.add(key);
  return group;
}

/** 表示中のページの下地を、その位置へ滑らせる */
function moveGlider(animated: boolean): void {
  const id = ctx.state.activeTabId;
  let target = id !== null ? nodes.get(`tab:${id}`) : undefined;
  // 閉じたまとまりの中にあるときは、まとまりの見出しへ
  if (target && !target.isConnected && id !== null) {
    const holder = nodes.get(holderOf.get(id) ?? '');
    target = holder?.querySelector('.s-group-head') as HTMLElement | undefined;
  }
  if (!target) {
    glider.style.opacity = '0';
    gliderBox = null;
    return;
  }
  const next = layoutBox(target, listEl);
  const prev = gliderBox;
  gliderBox = next;
  glider.style.transform = `translate(${next.x}px, ${next.y}px)`;
  glider.style.width = `${next.w}px`;
  glider.style.height = `${next.h}px`;
  if (!prev) {
    glider.style.opacity = '1';
    return;
  }
  if (!animated || reducedMotion.matches || (prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h)) return;
  for (const a of glider.getAnimations()) a.cancel();
  animate(
    glider,
    [
      { transform: `translate(${prev.x}px, ${prev.y}px)`, width: `${prev.w}px`, height: `${prev.h}px` },
      { transform: `translate(${next.x}px, ${next.y}px)`, width: `${next.w}px`, height: `${next.h}px` },
    ],
    'glide',
  );
  // 表示中のページが見えるようにスクロール
  if (target.offsetTop < scrollEl.scrollTop || target.offsetTop + target.offsetHeight > scrollEl.scrollTop + scrollEl.clientHeight) {
    target.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }
}

// ----------------------------------------------------------------------
// キーボード (↑↓ で移動、Enter で開く、→← でまとまりを開閉、Delete で閉じる)
// ----------------------------------------------------------------------

function focusables(): HTMLElement[] {
  return [...listEl.querySelectorAll<HTMLElement>('[role="tab"], [data-focusable]')].filter((n) => n.offsetParent !== null);
}

/** Tab キーで入ったときに、表示中のページにフォーカスが来るようにする */
function updateRoving(): void {
  const items = focusables();
  const active = items.find((n) => n.getAttribute('aria-selected') === 'true') ?? items[0];
  for (const n of items) n.tabIndex = n === active ? 0 : -1;
}

function onKey(e: KeyboardEvent): void {
  const items = focusables();
  const current = document.activeElement as HTMLElement;
  const index = items.indexOf(current);
  if (index < 0) return;
  const isHead = current.dataset.focusable === '1';
  const groupNode = current.closest('.s-group') as HTMLElement | null;
  const groupKey = groupNode?.dataset.key ?? '';
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      const next = items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next.focus();
      break;
    }
    case 'Enter':
    case ' ':
      if (isHead) current.click();
      else handlers.select(Number(current.dataset.id));
      break;
    case 'ArrowRight':
    case 'ArrowLeft': {
      if (!isHead || !groupNode) return;
      const open = groupNode.classList.contains('open');
      if ((e.key === 'ArrowRight') !== open) toggleGroup(groupKey);
      break;
    }
    case 'Delete':
      if (!isHead) api.closeTab(Number(current.dataset.id));
      break;
    default:
      return;
  }
  e.preventDefault();
}
