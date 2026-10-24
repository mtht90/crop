type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  style?: string;
  title?: string;
  disabled?: boolean;
  onclick?: (e: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.style) el.setAttribute('style', props.style);
    if (props.title) el.title = props.title;
    if (props.disabled && 'disabled' in el) (el as HTMLButtonElement).disabled = true;
    if (props.onclick) el.addEventListener('click', props.onclick as EventListener);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

export function bar(frac: number, color?: string, marks: number[] = [], cls = ''): HTMLDivElement {
  const el = h('div', { class: `bar ${cls}` });
  const fill = h('i');
  fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  if (color) fill.style.background = color;
  el.append(fill);
  for (const m of marks) {
    const mk = h('span', { class: 'mark' });
    mk.style.left = `${Math.max(0, Math.min(1, m)) * 100}%`;
    el.append(mk);
  }
  return el;
}
