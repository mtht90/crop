type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'innerHTML') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

export function toast(msg: string, kind: 'info' | 'error' | 'ok' = 'info', ms = 3200) {
  let host = document.querySelector<HTMLElement>('.toasts');
  if (!host) {
    host = h('div', { class: 'toasts' });
    document.body.append(host);
  }
  const t = h('div', { class: `toast ${kind}` }, msg);
  host.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export interface Modal {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

export function modal(title: string, opts: { wide?: boolean; onClose?: () => void } = {}): Modal {
  const body = h('div', { class: 'modal-body' });
  const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') }, h('div', { class: 'modal-title' }, title), body);
  const back = h('div', { class: 'modal-back' }, box);
  const close = () => {
    back.remove();
    window.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  document.body.append(back);
  return { el: box, body, close };
}

export function confirmDialog(message: string, okLabel = 'OK'): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const m = modal('確認', { onClose: () => resolve(result) });
    m.body.append(
      h('p', { class: 'confirm-text' }, message),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn', onclick: () => m.close() }, 'キャンセル'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              result = true;
              m.close();
            },
          },
          okLabel,
        ),
      ),
    );
  });
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'chart';
}

export function toggleFullscreen() {
  if (window.sekaiNative) window.sekaiNative.toggleFullscreen();
  else if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}
