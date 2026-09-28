type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  html?: string;
  onclick?: (e: MouseEvent) => void;
  attrs?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.title) el.title = props.title;
  if (props.onclick) el.addEventListener('click', props.onclick as EventListener);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** 変化があるときだけ DOM を書き換える (毎フレーム呼んでも安い) */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function setDisabled(el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

export function setShown(el: HTMLElement, shown: boolean): void {
  const v = shown ? '' : 'none';
  if (el.style.display !== v) el.style.display = v;
}

export function setWidth(el: HTMLElement, frac: number): void {
  const v = `${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%`;
  if (el.style.width !== v) el.style.width = v;
}

export function button(label: string, onclick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', { class: cls, text: label });
  b.type = 'button';
  b.addEventListener('click', onclick);
  return b;
}
