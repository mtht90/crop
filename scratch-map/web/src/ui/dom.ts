/** 小さな DOM ヘルパー（フレームワークなし） */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k in el && k !== 'style' && k !== 'list') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let sheetStack: HTMLElement[] = [];

/** 下から出るシート。閉じる関数を返す */
export function openSheet(title: string, body: Node, opts: { onClose?: () => void } = {}) {
  const close = () => {
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 200);
    sheetStack = sheetStack.filter((s) => s !== backdrop);
    opts.onClose?.();
  };
  const backdrop = h(
    'div',
    { class: 'sheet-backdrop', onclick: (e: Event) => e.target === backdrop && close() },
    h(
      'section',
      { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('header', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': '閉じる', onclick: close }, '✕')),
      h('div', { class: 'sheet-body' }, body),
    ),
  );
  document.body.append(backdrop);
  sheetStack.push(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  return close;
}

export function closeAllSheets() {
  for (const s of [...sheetStack]) (s.querySelector('.sheet-head .icon-btn') as HTMLButtonElement)?.click();
}

export function toast(msg: string, kind: 'info' | 'error' | 'good' = 'info', ms = 2800) {
  let wrap = document.getElementById('toasts');
  if (!wrap) document.body.append((wrap = h('div', { id: 'toasts' })));
  const t = h('div', { class: `toast ${kind}` }, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました', 'good');
  } catch {
    prompt('コピーしてください', text);
  }
}

export function fmtNum(n: number) {
  return n.toLocaleString('ja-JP');
}

/** 解像度10のセル1つの面積（約 0.0150 km²） */
export const CELL_AREA_KM2 = 0.015047;

export function fmtArea(cells: number) {
  const km2 = cells * CELL_AREA_KM2;
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`;
}
