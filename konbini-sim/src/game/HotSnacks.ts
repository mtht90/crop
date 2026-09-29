import * as THREE from 'three';
import type { Game } from './Game';
import { PRODUCTS, product } from '../data/products';
import { productMesh } from '../world/ProductVisuals';
import { HOT_HOLD_MIN } from './State';
import type { PromptInfo } from '../ui/UI';
import { h, yen } from '../ui/dom';

interface Basket {
  productId: string | null;
  count: number;
  elapsed: number;
  fryTime: number;
  state: 'idle' | 'frying' | 'done' | 'burnt';
  obj: THREE.Object3D;
  items: THREE.Group;
}

const BURN_AFTER = 25;

/** Fryer, frozen stocker and the heated display case on the counter. */
export class HotSnacks {
  private baskets: Basket[] = [];
  private caseItems = new THREE.Group();
  private sizzle: { stop: () => void; setVolume: (v: number) => void } | null = null;
  private displayTimer = 0;

  constructor(private g: Game) {
    const fr = g.store.anchors.fryer;
    const bs = fr.userData.baskets as THREE.Object3D[];
    this.baskets = bs.map((obj) => {
      const items = new THREE.Group();
      obj.add(items);
      return { productId: null, count: 0, elapsed: 0, fryTime: 1, state: 'idle', obj, items };
    });
    g.store.anchors.hotCase.add(this.caseItems);
  }

  reset(): void {
    for (const b of this.baskets) this.clearBasket(b);
    this.caseItems.clear();
  }

  private clearBasket(b: Basket) {
    b.productId = null;
    b.count = 0;
    b.state = 'idle';
    b.elapsed = 0;
    b.items.clear();
  }

  readyBaskets(): number {
    return this.baskets.filter((b) => b.state === 'done' || b.state === 'burnt').length;
  }

  staleCount(): number {
    const now = this.g.state.abs;
    return this.g.state.hotCase.filter((i) => now - i.madeAt > HOT_HOLD_MIN).length;
  }

  fresh(id?: string): number {
    const now = this.g.state.abs;
    return this.g.state.hotCase.filter((i) => (!id || i.id === id) && now - i.madeAt <= HOT_HOLD_MIN).length;
  }

  /** Remove one fresh item for a sale. */
  takeFor(id: string): boolean {
    const now = this.g.state.abs;
    const list = this.g.state.hotCase;
    const idx = list.findIndex((i) => i.id === id && now - i.madeAt <= HOT_HOLD_MIN);
    if (idx < 0) return false;
    list.splice(idx, 1);
    this.refreshCase();
    return true;
  }

  refreshCase(): void {
    this.caseItems.clear();
    const list = this.g.state.hotCase;
    const perRow = 5;
    list.slice(0, 20).forEach((it, i) => {
      const m = productMesh(product(it.id));
      const tray = i < 10 ? 0.11 : 0.28;
      const k = i % 10;
      m.position.set(-0.22 + (k % perRow) * 0.11, tray, -0.14 + Math.floor(k / perRow) * 0.2);
      m.rotation.y = 0.3 * ((i * 7) % 3);
      if (product(it.id).shape === 'karaage' || product(it.id).shape === 'americandog') {
        m.rotation.z = Math.PI / 2 - 0.2;
        m.position.y += 0.02;
      }
      this.caseItems.add(m);
    });
  }

  endOfDay(): number {
    // everything in the hot case is discarded at close
    const s = this.g.state;
    let loss = 0;
    for (const it of s.hotCase) loss += product(it.id).cost;
    s.stats.wasteItems += s.hotCase.length;
    s.hotCase = [];
    for (const b of this.baskets) {
      if (b.productId) loss += product(b.productId).cost * b.count;
      this.clearBasket(b);
    }
    this.refreshCase();
    return loss;
  }

  // ------------------------------------------------------------------ prompts

  fryerPrompt(): PromptInfo {
    const inp = this.g.input;
    const ready = this.baskets.find((b) => b.state === 'done' || b.state === 'burnt');
    if (ready) {
      const info: PromptInfo = { title: 'フライヤー', sub: ready.state === 'burnt' ? '焦げてしまった…' : `${product(ready.productId!).name} ×${ready.count} 揚げ上がり`, keys: [['E', ready.state === 'burnt' ? '廃棄する' : 'ホットケースへ移す']] };
      if (inp.pressed('KeyE')) this.takeOut(ready);
      return info;
    }
    const free = this.baskets.find((b) => b.state === 'idle');
    const frying = this.baskets.filter((b) => b.state === 'frying');
    const sub = frying.map((b) => `${product(b.productId!).name} 残り${Math.ceil(b.fryTime - b.elapsed)}秒`).join(' / ') || '油温 175℃';
    if (!free) return { title: 'フライヤー', sub };
    if (this.g.player.held) return { title: 'フライヤー', sub: '手がふさがっています' };
    if (inp.pressed('KeyE')) this.openFryMenu(free);
    return { title: 'フライヤー', sub, keys: [['E', '揚げる']] };
  }

  casePrompt(): PromptInfo {
    const inp = this.g.input;
    const stale = this.staleCount();
    const counts = PRODUCTS.filter((p) => p.zone === 'hot').map((p) => `${p.name.slice(0, 6)} ${this.fresh(p.id)}`).join('  ');
    if (stale && inp.pressed('KeyR')) this.disposeStale();
    return { title: 'ホットケース', sub: counts, keys: stale ? [['R', `販売期限切れ ${stale}個を廃棄`]] : [] };
  }

  stockerPrompt(): PromptInfo {
    const g = this.g;
    const held = g.player.held;
    const stock = PRODUCTS.filter((p) => p.zone === 'hot').map((p) => `${p.name.slice(0, 6)} ${g.state.hotStock[p.id] ?? 0}`).join('  ');
    if (held?.kind === 'box') {
      const b = held.box;
      if (b.product.zone !== 'hot') return { title: '冷凍ストッカー', sub: 'ホットスナック用の冷凍食材だけ入れられます' };
      if (g.input.pressed('KeyE') || g.input.mouse(0)) {
        const n = g.input.mouse(0) ? 1 : b.count;
        for (let i = 0; i < n && b.count; i++) {
          b.items.pop();
          b.changed();
          g.state.hotStock[b.productId] = (g.state.hotStock[b.productId] ?? 0) + 1;
        }
        b.open();
        g.audio.play('metal', { volume: 0.4 });
      }
      return { title: '冷凍ストッカー', sub: stock, keys: [['E', `全部入れる (${b.count})`], ['左クリック', '1つ入れる']] };
    }
    return { title: '冷凍ストッカー', sub: stock };
  }

  private openFryMenu(b: Basket): void {
    const g = this.g;
    const opts = PRODUCTS.filter((p) => p.zone === 'hot' && p.rank <= g.state.rank);
    const qty = new Map<string, number>(opts.map((p) => [p.id, Math.min(4, g.state.hotStock[p.id] ?? 0)]));
    g.enterUIMode('menu');
    const rows = opts.map((p) => {
      const stock = g.state.hotStock[p.id] ?? 0;
      const span = h('span', {}, String(qty.get(p.id)));
      const set = (d: number) => {
        const v = Math.max(1, Math.min(Math.min(6, stock), (qty.get(p.id) ?? 1) + d));
        qty.set(p.id, v);
        span.textContent = String(v);
      };
      return h('tr', {},
        h('td', {}, p.name),
        h('td', { class: 'num' }, `${stock}`),
        h('td', { class: 'num' }, `${Math.round((p.fryTime ?? 20) * (g.state.has('fryer') ? 0.6 : 1))}秒`),
        h('td', {}, h('div', { class: 'stepper' }, h('button', { onclick: () => set(-1) }, '−'), span, h('button', { onclick: () => set(1) }, '＋'))),
        h('td', {}, h('button', {
          class: 'primary', disabled: stock <= 0,
          onclick: () => {
            close();
            this.startFry(b, p.id, qty.get(p.id) ?? 1);
          },
        }, '揚げる')),
      );
    });
    const close = g.ui.modal(h('div', { class: 'modal', style: 'width:560px' },
      h('header', {}, h('h2', {}, '🍗 フライヤー'), h('button', { onclick: () => close() }, '閉じる')),
      h('div', { class: 'body' },
        h('table', { class: 'grid' }, h('tr', {}, h('th', {}, '商品'), h('th', { class: 'num' }, '冷凍在庫'), h('th', { class: 'num' }, '揚げ時間'), h('th', {}, '個数'), h('th', {})), ...rows),
        h('p', { style: 'font-size:12px;color:var(--muted)' }, '揚げ上がったらすぐに取り出さないと焦げてしまいます。ホットケースでの販売期限は3時間です。冷凍在庫はPCから発注できます。'),
      ),
    ), { onClose: () => g.exitUIMode() });
  }

  private startFry(b: Basket, id: string, n: number): void {
    const g = this.g;
    const stock = g.state.hotStock[id] ?? 0;
    n = Math.min(n, stock);
    if (n <= 0) return;
    g.state.hotStock[id] = stock - n;
    const p = product(id);
    b.productId = id;
    b.count = n;
    b.elapsed = 0;
    b.fryTime = (p.fryTime ?? 20) * (g.state.has('fryer') ? 0.6 : 1);
    b.state = 'frying';
    b.items.clear();
    for (let i = 0; i < n; i++) {
      const m = productMesh(p);
      m.position.set(-0.06 + (i % 3) * 0.06, -0.08, -0.07 + Math.floor(i / 3) * 0.1);
      m.rotation.z = Math.PI / 2;
      m.scale.setScalar(0.9);
      b.items.add(m);
    }
    g.audio.play('metal', { pos: b.obj.getWorldPosition(new THREE.Vector3()), volume: 0.5 });
    g.state.tutorial |= 16;
  }

  private takeOut(b: Basket): void {
    const g = this.g;
    if (b.state === 'burnt') {
      const loss = product(b.productId!).cost * b.count;
      g.state.stats.waste += loss;
      g.state.stats.wasteItems += b.count;
      g.ui.notify(`焦げたホットスナックを廃棄（${yen(loss)}）`, 'bad');
    } else if (b.productId) {
      for (let i = 0; i < b.count; i++) g.state.hotCase.push({ id: b.productId, madeAt: g.state.abs });
      g.ui.notify(`${product(b.productId).name} ×${b.count} をホットケースに補充`, 'good');
      this.refreshCase();
    }
    this.clearBasket(b);
    g.audio.play('metal', { volume: 0.5 });
  }

  private disposeStale(): void {
    const g = this.g;
    const now = g.state.abs;
    const stale = g.state.hotCase.filter((i) => now - i.madeAt > HOT_HOLD_MIN);
    let loss = 0;
    for (const s of stale) loss += product(s.id).cost;
    g.state.hotCase = g.state.hotCase.filter((i) => now - i.madeAt <= HOT_HOLD_MIN);
    g.state.stats.waste += loss;
    g.state.stats.wasteItems += stale.length;
    this.refreshCase();
    g.ui.notify(`販売期限切れのホットスナック ${stale.length}個 を廃棄（${yen(loss)}）`, 'warn');
  }

  update(dt: number, time: number): void {
    const fr = this.g.store.anchors.fryer;
    let sizz = 0;
    for (const b of this.baskets) {
      const down = b.state === 'frying';
      const targetY = down ? 0.3 : 0.42;
      b.obj.position.y += (targetY - b.obj.position.y) * Math.min(1, dt * 5);
      if (b.state === 'frying') {
        sizz = 1;
        b.elapsed += dt;
        if (b.elapsed >= b.fryTime) {
          b.state = 'done';
          this.g.audio.uiConfirm();
          this.g.ui.notify(`🍗 ${product(b.productId!).name} が揚がりました！`, 'good');
        }
      } else if (b.state === 'done') {
        b.elapsed += dt;
        if (b.elapsed > b.fryTime + BURN_AFTER) {
          b.state = 'burnt';
          b.items.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: '#2a1608', roughness: 0.8 });
          });
          this.g.audio.errorBuzz();
        }
      }
    }
    if (sizz && !this.sizzle) this.sizzle = this.g.audio.fryerLoop(fr.getWorldPosition(new THREE.Vector3()));
    this.sizzle?.setVolume(sizz);
    // controller display
    this.displayTimer -= dt;
    if (this.displayTimer <= 0) {
      this.displayTimer = 0.25;
      const d = fr.userData.display as { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
      const ctx = d.canvas.getContext('2d')!;
      ctx.fillStyle = '#021';
      ctx.fillRect(0, 0, 256, 64);
      ctx.font = '700 22px monospace';
      this.baskets.forEach((b, i) => {
        const x = 10 + i * 128;
        let txt = '175°C';
        let col = '#39ff88';
        if (b.state === 'frying') txt = `${Math.ceil(b.fryTime - b.elapsed)}s`;
        if (b.state === 'done') {
          txt = Math.floor(time * 3) % 2 ? 'DONE' : '';
          col = '#ffd23f';
        }
        if (b.state === 'burnt') {
          txt = 'BURN';
          col = '#ff4b3a';
        }
        ctx.fillStyle = col;
        ctx.fillText(`${i + 1}:${txt}`, x, 40);
      });
      d.tex.needsUpdate = true;
    }
  }
}
