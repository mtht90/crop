import type { Game } from '../../core/game';

export interface Tab {
  id: string;
  label: string;
  icon: string;
  visible: (g: Game) => boolean;
  mount: (root: HTMLElement, g: Game) => void;
  update: (g: Game) => void;
  /** 新要素があるときにタブへ印を付ける */
  badge?: (g: Game) => boolean;
}
