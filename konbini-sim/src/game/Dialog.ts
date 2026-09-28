import { h } from '../ui/dom';
import type { UI } from '../ui/UI';

export interface Choice {
  text: string;
  hint?: string;
}

/**
 * Conversation box with choices. Resolves with the chosen index.
 * Only one dialog is shown at a time.
 */
export class Dialog {
  active = false;
  private close: (() => void) | null = null;
  constructor(private ui: UI, private onOpen: () => void, private onClose: () => void) {}

  ask(who: string, text: string, choices: Choice[]): Promise<number> {
    this.dismiss();
    this.active = true;
    this.onOpen();
    return new Promise((resolve) => {
      const el = h('div', { class: 'dialog' },
        h('div', { class: 'who' }, who),
        h('div', { class: 'text' }, text),
        h('div', { class: 'choices' }, ...choices.map((c, i) => h('button', {
          onclick: () => {
            this.dismiss();
            resolve(i);
          },
        }, `${i + 1}. ${c.text}`, c.hint ? h('span', { style: 'color:var(--muted);font-size:12px;margin-left:8px' }, c.hint) : null))),
      );
      const keyHandler = (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= choices.length) {
          window.removeEventListener('keydown', keyHandler);
          this.dismiss();
          resolve(n - 1);
        }
      };
      window.addEventListener('keydown', keyHandler);
      const remove = this.ui.panel(el);
      this.close = () => {
        window.removeEventListener('keydown', keyHandler);
        remove();
      };
    });
  }

  /** Simple message with an OK button. */
  async say(who: string, text: string, ok = 'OK'): Promise<void> {
    await this.ask(who, text, [{ text: ok }]);
  }

  dismiss(): void {
    if (this.close) {
      this.close();
      this.close = null;
      this.active = false;
      this.onClose();
    }
  }
}
