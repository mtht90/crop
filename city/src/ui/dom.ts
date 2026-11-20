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
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
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
