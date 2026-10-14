// 上部のタブストリップ
// - よく戻るページ (hero) は幅が広く、小さなプレビュー付き
// - あまり見ないページ (compact) は 1 つの「束」にまとめる
// - 現在のタブの下地 (glider) はバネで滑って移動する
import type { TabState } from '../shared/types';
import { api, applyAccent, ctx, el, faviconEl } from './ctx.js';
import { setIcon } from './icons.js';
import { animate, flipGroup, popIn, reducedMotion } from './motion.js';

type Key = number | 'stack';

const stripEl = document.getElementById('strip')!;
const pillsEl = document.getElementById('pills')!;
const glider = document.getElementById('glider')!;
const pills = new Map<Key, HTMLElement>();
let gliderPos: { x: number; w: number } | null = null;
let draggingId: number | null = null;
/** 前回の描画で束にまとめられていたタブ */
let stackedIds = new Set<number>();

export interface StripHandlers {
  /** タブのピルが押された */
  select(id: number): void;
  /** 「あまり見ないページ」の束が押された */
  openStack(): void;
  /** ピルにマウスが乗った (オーバービューで対応するタイルを強調するため) */
  hover(id: number | null): void;
}

let handlers: StripHandlers;

export function initStrip(h: StripHandlers): void {
  handlers = h;
  stripEl.addEventListener('dblclick', (e) => {
    if (e.target === stripEl || e.target === pillsEl) api.openOverview(true);
  });
  window.addEventListener('resize', () => {
    updateNarrow();
    moveGlider(false);
  });
}

function createPill(id: number): HTMLElement {
  const pill = el('div', 'pill');
  pill.dataset.id = String(id);
  pill.draggable = true;
  const inner = el('div', 'pill-inner');
  const icon = el('span', 'pill-icon');
  const title = el('span', 'pill-title');
  const close = el('button', 'pill-close');
  close.title = 'タブを閉じる';
  setIcon(close, 'close');
  inner.append(icon, title, close);
  pill.append(inner, el('span', 'pill-accent'));

  pill.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button')) handlers.select(id);
  });
  pill.addEventListener('auxclick', (e) => {
    if (e.button === 1) api.closeTab(id);
  });
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    api.closeTab(id);
  });
  pill.addEventListener('mouseenter', () => handlers.hover(id));
  pill.addEventListener('mouseleave', () => handlers.hover(null));

  pill.addEventListener('dragstart', (e) => {
    draggingId = id;
    e.dataTransfer?.setData('text/plain', String(id));
  });
  pill.addEventListener('dragend', () => {
    draggingId = null;
    pills.forEach((p) => p.classList.remove('drop-target'));
  });
  pill.addEventListener('dragover', (e) => {
    if (draggingId === null || draggingId === id) return;
    e.preventDefault();
    pill.classList.add('drop-target');
  });
  pill.addEventListener('dragleave', () => pill.classList.remove('drop-target'));
  pill.addEventListener('drop', (e) => {
    e.preventDefault();
    pill.classList.remove('drop-target');
    if (draggingId === null || draggingId === id) return;
    api.moveTab(draggingId, ctx.state.tabs.findIndex((t) => t.id === id));
  });
  return pill;
}

function updatePill(pill: HTMLElement, tab: TabState): void {
  const active = tab.id === ctx.state.activeTabId;
  pill.classList.toggle('active', active);
  pill.classList.toggle('pinned', tab.pinned);
  pill.dataset.tier = tab.tier;
  pill.title = `${tab.title}\n${tab.url}`;
  applyAccent(pill, tab.accent);

  const icon = pill.querySelector('.pill-icon') as HTMLElement;
  const iconKey = tab.loading ? 'loading' : `${tab.favicon}|${tab.title[0] ?? ''}`;
  if (icon.dataset.key !== iconKey) {
    icon.dataset.key = iconKey;
    icon.replaceChildren(tab.loading ? el('span', 'spinner') : faviconEl(tab.favicon, tab.title));
  }
  (pill.querySelector('.pill-title') as HTMLElement).textContent = tab.title;
}

function createStack(): HTMLElement {
  const stack = el('button', 'pill stack');
  stack.append(el('span', 'stack-icons'), el('span', 'stack-count'));
  stack.addEventListener('click', () => handlers.openStack());
  return stack;
}

function updateStack(stack: HTMLElement, tabs: TabState[]): void {
  stack.title = `あまり見ないページ (${tabs.length})\n${tabs.map((t) => `・${t.title}`).join('\n')}`;
  const icons = stack.querySelector('.stack-icons') as HTMLElement;
  const key = tabs.slice(0, 4).map((t) => `${t.id}:${t.favicon}`).join(',');
  if (icons.dataset.key !== key) {
    icons.dataset.key = key;
    icons.replaceChildren(
      ...tabs.slice(0, 4).map((t) => {
        const f = faviconEl(t.favicon, t.title, 'stack-icon');
        applyAccent(f, t.accent);
        return f;
      }),
    );
  }
  (stack.querySelector('.stack-count') as HTMLElement).textContent = String(tabs.length);
}

export function renderStrip(): void {
  const { tabs } = ctx.state;
  const visible = tabs.filter((t) => t.tier !== 'compact');
  const compact = tabs.filter((t) => t.tier === 'compact');
  const stackRect = pills.get('stack')?.getBoundingClientRect();
  const wasStacked = stackedIds;
  stackedIds = new Set(compact.map((t) => t.id));

  flipGroup<Key>(
    () => new Map(pills),
    () => {
      const order: HTMLElement[] = [];
      const live = new Set<Key>();
      for (const tab of visible) {
        let pill = pills.get(tab.id);
        if (!pill) {
          pill = createPill(tab.id);
          pills.set(tab.id, pill);
        }
        updatePill(pill, tab);
        order.push(pill);
        live.add(tab.id);
      }
      if (compact.length > 0) {
        let stack = pills.get('stack');
        if (!stack) {
          stack = createStack();
          pills.set('stack', stack);
        }
        updateStack(stack, compact);
        order.push(stack);
        live.add('stack');
      }
      for (const [key, pill] of pills) {
        if (!live.has(key)) {
          pill.remove();
          pills.delete(key);
        }
      }
      order.forEach((pill, i) => {
        // glider は常に先頭に置き、その後ろにピルを並べる
        const at = pillsEl.children[i + 1];
        if (at !== pill) pillsEl.insertBefore(pill, at ?? null);
      });
      updateNarrow();
    },
    {
      ghostLayer: pillsEl,
      spring: 'reflow',
      enter: (pill) => popIn(pill),
      // 束から出てきたタブは、束の位置から広がるように動く
      fallbackFrom: (key) => (typeof key === 'number' && wasStacked.has(key) ? stackRect : undefined),
    },
  );
  moveGlider(true);
}

/** 幅が足りないピルはタイトルを隠してアイコンだけにする */
function updateNarrow(): void {
  for (const pill of pills.values()) {
    pill.classList.toggle('narrow', pill.offsetWidth < 84);
  }
}

/** 現在のタブの下地をバネで滑らせる */
function moveGlider(animated: boolean): void {
  const active = ctx.state.activeTabId !== null ? pills.get(ctx.state.activeTabId) : undefined;
  if (!active) {
    if (gliderPos) fadeGlider(false);
    gliderPos = null;
    return;
  }
  const next = { x: active.offsetLeft, w: active.offsetWidth };
  const prev = gliderPos;
  gliderPos = next;
  glider.style.transform = `translateX(${next.x}px)`;
  glider.style.width = `${next.w}px`;
  if (!prev) {
    fadeGlider(true);
    return;
  }
  if (!animated || (prev.x === next.x && prev.w === next.w) || reducedMotion.matches) return;
  for (const a of glider.getAnimations()) a.cancel();
  animate(
    glider,
    [
      { transform: `translateX(${prev.x}px)`, width: `${prev.w}px` },
      { transform: `translateX(${next.x}px)`, width: `${next.w}px` },
    ],
    'glide',
  );
}

function fadeGlider(show: boolean): void {
  glider.style.opacity = show ? '1' : '0';
}
