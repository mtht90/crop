import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { toast } from '../core/events';
import { nicePrice } from '../core/util';
import { itemDef } from '../data/items';
import { knownValue } from '../game/valuation';
import type { Game } from '../game/game';

/** 品出しスタッフ: 営業中、一定間隔で在庫を空き棚へ並べる */
export class Stocker {
  private acc = 0;
  constructor(private g: Game) {}

  update(gameMinutes: number) {
    const m = this.g.model;
    if (!m.has('stocker') || m.state.phase === 'summary') return;
    this.acc += gameMinutes;
    if (this.acc < 12) return;
    this.acc = 0;
    // 汚れ・故障・偽物判定の品は並べない
    const candidates = m.stockItems().filter((it) => {
      const def = itemDef(it.defId);
      return it.dirt < 0.25 && it.verdict !== 'fake' && (!def.electronic || (it.tested && it.working));
    });
    for (const it of candidates) {
      const def = itemDef(it.defId);
      const slot = this.g.world.fixtures.filter((f) => f.def.kind === 'display').flatMap((f) => [...f.slots.values()]).find((s) => s.fixture.canAccept(s.def.id, def.sizeClass));
      if (!slot) continue;
      it.price ??= nicePrice(knownValue(it, m.trend(def.category)).value);
      this.g.world.attachItem(it, slot);
      toast(`スタッフが「${def.name}」を品出ししました`, 'info', 'cardboard-box');
      return;
    }
  }
}

/** 現在の目標の場所を示すマーカー */
export class GuideMarker {
  private obj: CSS2DObject;
  private el: HTMLDivElement;
  enabled = true;

  constructor(private g: Game) {
    this.el = document.createElement('div');
    this.el.className = 'guide-marker';
    this.el.innerHTML = '<span>▼</span>';
    this.obj = new CSS2DObject(this.el);
    this.obj.visible = false;
    g.engine.scene.add(this.obj);
  }

  private target(): THREE.Vector3 | null {
    const g = this.g;
    const m = g.model;
    const obj = m.currentObjectives(1)[0];
    if (!obj) return null;
    const w = g.world;
    const at = (o: THREE.Object3D | undefined, dy: number) => (o ? o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0)) : null);
    switch (obj.id) {
      case 'stock_out': return g.interaction.held ? at(w.fixturesOf('display')[0]?.root, 2.1) : at(w.first('stock')?.root, 1.9);
      case 'price': {
        const it = m.displayed().find((i) => !i.price);
        return it ? at(w.view(it.uid)?.root, 0.7) : null;
      }
      case 'open': return at(w.building.openSign, 1.5);
      case 'sell': return g.customers.buyQueue.length ? at(w.first('register')?.root, 1.6) : null;
      case 'buy': return g.customers.sellQueue.length ? at(w.first('appraisal')?.root, 1.7) : null;
      case 'clean': return at(w.first('workbench')?.root, 1.7);
      case 'fixture': return at(w.first('register')?.extra.laptop, 0.6);
      default: return null;
    }
  }

  update() {
    const t = this.enabled && !this.g.ui.modalOpen ? this.target() : null;
    this.obj.visible = !!t;
    if (t) this.obj.position.copy(t);
  }

  dispose() { this.obj.removeFromParent(); this.el.remove(); }
}

/** FPS が低い状態が続いたら画質を自動で下げる */
export class AutoQuality {
  private low = 0;
  /** 自動テスト (webdriver) 中は無効 */
  private done = !!navigator.webdriver;
  constructor(private g: Game) {}

  update(dt: number) {
    if (this.done || this.g.ui.modalOpen) return;
    const e = this.g.engine;
    if (e.fps < 26) this.low += dt; else this.low = Math.max(0, this.low - dt * 0.5);
    if (this.low > 8) {
      this.low = 0;
      const s = this.g.settings;
      if (s.quality === 'low') { this.done = true; return; }
      s.quality = s.quality === 'high' ? 'medium' : 'low';
      this.g.applySettings(true);
      toast(`動作が重いため画質を「${s.quality === 'medium' ? '標準' : '軽量'}」に下げました (設定で変更できます)`, 'warn');
    }
  }
}
