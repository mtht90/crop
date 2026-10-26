import { h } from './dom';

export interface ModalHandle {
  el: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLElement;
  header: HTMLElement;
  close(): void;
}

/** モーダルは同時に1つだけ開く */
export class Modals {
  private current: { handle: ModalHandle; onClose?: () => void; closeKey?: string } | null = null;
  /** 最後に閉じた時刻（閉じたキーで同じ画面を開き直さないため） */
  lastClosed = 0;
  onChange: (open: boolean) => void = () => {};

  constructor(private parent: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (this.current && (e.code === 'Escape' || e.code === this.current.closeKey)) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !!this.current;
  }

  open(
    title: string,
    opts: {
      small?: boolean;
      onClose?: () => void;
      headerExtra?: Node[];
      closeKey?: string;
      /** 全画面のメニュー：見出しの代わりにタブを並べる */
      tabs?: { id: string; label: string }[];
      tab?: string;
      onTab?: (id: string) => void;
    } = {},
  ): ModalHandle {
    this.close(true);
    const body = h('div', { class: 'body' });
    const footer = h('footer');
    const close = h('button', { class: 'ghost esc', text: 'Esc', title: '閉じる', onclick: () => this.close() });
    const tabs = opts.tabs
      ? h(
          'nav',
          { class: 'menu-tabs' },
          ...opts.tabs.map((t) =>
            h('button', {
              class: `mt${t.id === opts.tab ? ' on' : ''}`,
              text: t.label,
              onclick: (e) => {
                const nav = (e.currentTarget as HTMLElement).parentElement!;
                nav.querySelectorAll('.mt').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
                opts.onTab?.(t.id);
              },
            }),
          ),
        )
      : h('h2', { text: title });
    const header = h('header', null, tabs, ...(opts.headerExtra ?? []), opts.tabs ? close : h('button', { class: 'ghost', text: '閉じる (Esc)', onclick: () => this.close() }));
    const modal = h('div', { class: `modal${opts.small ? ' small' : ''}${opts.tabs ? ' full' : ''}` }, header, body, footer);
    const back = h('div', { class: 'modal-back' }, modal);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) this.close();
    });
    this.parent.append(back);
    const handle: ModalHandle = { el: back, body, footer, header, close: () => this.close() };
    this.current = { handle, onClose: opts.onClose, closeKey: opts.closeKey };
    this.onChange(true);
    return handle;
  }

  close(silent = false): void {
    if (!this.current) return;
    const c = this.current;
    this.current = null;
    this.lastClosed = performance.now();
    c.handle.el.remove();
    c.onClose?.();
    if (!silent) this.onChange(false);
  }
}
