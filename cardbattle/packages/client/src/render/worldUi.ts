import type * as THREE from 'three/webgpu';
import type { Stage } from './stage';

/**
 * 3D空間に重ねる DOM 表示（HPバー・ダメージ数字）。
 * 要素は使い回し、毎フレーム transform だけを書き換える。
 */
export class WorldUi {
  private readonly tmp = { x: 0, y: 0, visible: false };
  private readonly popupPool: HTMLDivElement[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly stage: Stage,
  ) {}

  createBar(team: 'ally' | 'enemy', kind: 'tower' | 'unit'): HpBar {
    const el = document.createElement('div');
    el.className = `hpbar ${team} ${kind}`;
    el.innerHTML = '<div class="hpbar-fill"></div><div class="hpbar-text"></div>';
    this.root.appendChild(el);
    return new HpBar(el, this, kind === 'tower');
  }

  place(el: HTMLElement, world: THREE.Vector3): boolean {
    this.stage.projectToScreen(world, this.tmp);
    if (!this.tmp.visible) return false;
    el.style.transform = `translate3d(${this.tmp.x.toFixed(1)}px, ${this.tmp.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    return true;
  }

  /** ダメージ数字のポップアップ */
  popup(world: THREE.Vector3, text: string, cls = ''): void {
    const el = this.popupPool.pop() ?? document.createElement('div');
    el.className = `dmg-popup ${cls}`;
    el.textContent = text;
    if (!el.isConnected) this.root.appendChild(el);
    this.stage.projectToScreen(world, this.tmp);
    const jitter = (Math.random() - 0.5) * 18;
    el.style.left = `${(this.tmp.x + jitter).toFixed(1)}px`;
    el.style.top = `${this.tmp.y.toFixed(1)}px`;
    el.style.animation = 'none';
    void el.offsetWidth; // アニメーションを最初から再生させる
    el.style.animation = '';
    window.setTimeout(() => {
      el.remove();
      this.popupPool.push(el);
    }, 750);
  }

  clear(): void {
    this.root.innerHTML = '';
    this.popupPool.length = 0;
  }
}

export class HpBar {
  private readonly fill: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private lastHp = -1;

  constructor(
    readonly el: HTMLDivElement,
    private readonly ui: WorldUi,
    private readonly showNumber: boolean,
  ) {
    this.fill = el.querySelector('.hpbar-fill')!;
    this.text = el.querySelector('.hpbar-text')!;
  }

  update(world: THREE.Vector3, hp: number, maxHp: number, visible: boolean): void {
    if (!visible) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';
    this.ui.place(this.el, world);
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.fill.style.width = `${Math.max(0, (hp / maxHp) * 100).toFixed(1)}%`;
      if (this.showNumber) this.text.textContent = String(Math.max(0, hp));
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
