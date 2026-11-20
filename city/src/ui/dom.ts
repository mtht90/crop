import { ICON_DATA } from '../generated/icons';
import type { IconKey } from '../config/icons';

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; onclick?: (e: MouseEvent) => void };

/** 小さな DOM ヘルパー：h('div', { class: 'x' }, 'text', child) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') setHandler(el, k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** Game-icons.net のアイコン（SVG） */
export function icon(key: IconKey | string, cls = 'ic'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICON_DATA[key]?.d ?? '');
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** 押したときの処理は要素に持たせる（画面を差分で更新しても、新しい処理に入れ替えられるように） */
type Handlers = Record<string, EventListener>;
const HANDLERS = '__handlers';
function setHandler(el: Element, type: string, fn: EventListener) {
  const any = el as unknown as Record<string, Handlers>;
  if (!any[HANDLERS]) any[HANDLERS] = {};
  if (!any[HANDLERS][type]) el.addEventListener(type, (e) => any[HANDLERS][type]?.(e));
  any[HANDLERS][type] = fn;
}

/**
 * 古い子要素を、新しく作った子要素に合わせて最小限だけ書き換える。
 * 同じ種類の要素はそのまま使うので、押している途中のボタンが消えたり、スクロールが戻ったりしない。
 */
export function morph(parent: Element, next: Node[]) {
  const old = [...parent.childNodes];
  for (let i = 0; i < next.length; i++) {
    const n = next[i];
    const o = old[i];
    if (!o) { parent.append(n); continue; }
    if (!sameKind(o, n)) { parent.replaceChild(n, o); continue; }
    if (o.nodeType === Node.TEXT_NODE) {
      if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
      continue;
    }
    const oe = o as Element;
    const ne = n as Element;
    // 属性
    for (const a of [...oe.attributes]) if (!ne.hasAttribute(a.name) && a.name !== 'open') oe.removeAttribute(a.name);
    for (const a of [...ne.attributes]) if (oe.getAttribute(a.name) !== a.value) oe.setAttribute(a.name, a.value);
    if (oe instanceof HTMLElement && ne instanceof HTMLElement && oe.style.cssText !== ne.style.cssText) oe.style.cssText = ne.style.cssText;
    // 押したときの処理を新しいものに
    const nh = (ne as unknown as Record<string, Handlers>)[HANDLERS];
    if (nh) for (const [type, fn] of Object.entries(nh)) setHandler(oe, type, fn);
    morph(oe, [...ne.childNodes]);
  }
  for (let i = old.length - 1; i >= next.length; i--) old[i].remove();
}

function sameKind(a: Node, b: Node) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  const ae = a as Element;
  const be = b as Element;
  return ae.tagName === be.tagName && (ae.getAttribute('class') ?? '') === (be.getAttribute('class') ?? '');
}
