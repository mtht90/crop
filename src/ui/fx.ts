import { h, button } from './dom';

let toastRoot: HTMLElement;
let modalRoot: HTMLElement;
let floatRoot: HTMLElement;

export function initFx(root: HTMLElement): void {
  toastRoot = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });
  modalRoot = h('div', { class: 'modal-backdrop hidden' });
  floatRoot = h('div', { class: 'float-layer' });
  root.append(floatRoot, toastRoot, modalRoot);
}

export type ToastKind = 'info' | 'good' | 'warn' | 'ach';

export function toast(text: string, kind: ToastKind = 'info', ms = 4000): void {
  const el = h('div', { class: `toast toast-${kind}`, text });
  el.addEventListener('click', () => el.remove());
  toastRoot.prepend(el);
  while (toastRoot.children.length > 6) toastRoot.lastElementChild?.remove();
  window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 400);
  }, ms);
}

export function floatText(x: number, y: number, text: string, cls = ''): void {
  if (floatRoot.childElementCount > 40) floatRoot.firstElementChild?.remove();
  const el = h('div', { class: `float-text ${cls}`, text });
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
  floatRoot.append(el);
  window.setTimeout(() => el.remove(), 1100);
}

interface ModalOptions {
  title: string;
  body: string | HTMLElement;
  ok?: string;
  cancel?: string | null;
  danger?: boolean;
}

export function modal(opts: ModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    modalRoot.innerHTML = '';
    const close = (v: boolean) => {
      modalRoot.classList.add('hidden');
      modalRoot.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    const body = typeof opts.body === 'string' ? h('div', { class: 'modal-body', text: opts.body }) : h('div', { class: 'modal-body' }, opts.body);
    const actions = h('div', { class: 'modal-actions' });
    if (opts.cancel !== null) actions.append(button(opts.cancel ?? 'キャンセル', () => close(false), 'btn btn-ghost'));
    const okBtn = button(opts.ok ?? 'OK', () => close(true), opts.danger ? 'btn btn-danger' : 'btn btn-primary');
    actions.append(okBtn);
    const box = h('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } }, h('h2', { text: opts.title }), body, actions);
    modalRoot.append(box);
    modalRoot.classList.remove('hidden');
    modalRoot.onclick = (e) => {
      if (e.target === modalRoot) close(false);
    };
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}

/** 画面を横切る彗星。クリックされたら onCatch を呼ぶ */
export function spawnComet(lifetimeSec: number, onCatch: (x: number, y: number) => void): void {
  const el = h('button', { class: 'comet', attrs: { 'aria-label': '彗星をつかまえる', type: 'button' } }, h('span', { class: 'comet-core', text: '☄️' }));
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  const fromLeft = Math.random() < 0.5;
  const y0 = hgt * (0.15 + Math.random() * 0.6);
  const y1 = y0 + (Math.random() - 0.5) * hgt * 0.4;
  const x0 = fromLeft ? -60 : w + 60;
  const x1 = fromLeft ? w + 60 : -60;
  el.style.setProperty('--x0', `${x0}px`);
  el.style.setProperty('--y0', `${y0}px`);
  el.style.setProperty('--x1', `${x1}px`);
  el.style.setProperty('--y1', `${y1}px`);
  el.style.setProperty('--flip', fromLeft ? '1' : '-1');
  el.style.animationDuration = `${lifetimeSec}s`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onCatch(e.clientX, e.clientY);
    el.remove();
  });
  document.body.append(el);
  window.setTimeout(() => el.remove(), lifetimeSec * 1000);
}
