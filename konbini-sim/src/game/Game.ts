import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Assets } from '../core/Assets';
import type { Audio } from '../core/Audio';
import { Input } from '../core/Input';
import type { UI, PromptInfo, BubbleSource } from '../ui/UI';
import { Store } from '../world/Store';
import { Environment } from '../world/Environment';
import { P } from '../world/Layout';
import { Player } from '../player/Player';
import { GameState, DAY_END, DAY_START, emptyStats, HOT_HOLD_MIN, NEVER, expiryFor, type Weather } from './State';
import { ProductInstancer, TagAtlas, type Slot } from './Slot';
import { Box } from './Boxes';
import { Dialog } from './Dialog';
import { HotSnacks } from './HotSnacks';
import { Dirt } from './Dirt';
import { Deliveries } from './Deliveries';
import { Checkout } from './Checkout';
import { Customers } from '../npc/Customers';
import { PCMenu } from '../ui/PCMenu';
import { Menus } from '../ui/Menus';
import { PRODUCTS, product, type ProductDef } from '../data/products';
import { h, yen } from '../ui/dom';

const SAVE_KEY = 'konbini-sim-save-v1';

type Mode = 'play' | 'register' | 'menu' | 'pc' | 'dialog' | 'report' | 'title';

interface Target {
  kind: 'slot' | 'box' | 'anchor' | 'dirt' | 'npc';
  slot?: Slot;
  box?: Box;
  anchor?: string;
  object?: THREE.Object3D;
  point: THREE.Vector3;
  distance: number;
}

/** Orchestrates every game system and routes player interaction. */
export class Game {
  readonly input: Input;
  readonly store: Store;
  readonly env: Environment;
  readonly player: Player;
  state = new GameState();
  readonly instancer: ProductInstancer;
  readonly boxes: Box[] = [];
  readonly dialog: Dialog;
  readonly hot: HotSnacks;
  readonly dirt: Dirt;
  readonly deliveries: Deliveries;
  readonly checkout: Checkout;
  readonly customers: Customers;
  readonly pc: PCMenu;
  readonly menus: Menus;
  mode: Mode = 'title';
  time = 0;
  private minuteAcc = 0;
  private pickables: THREE.Object3D[] = [];
  private ambience: { stop: () => void; setVolume: (v: number) => void } | null = null;
  private rainLoop: { stop: () => void; setVolume: (v: number) => void } | null = null;
  private saveTimer = 0;
  private dayEnding = false;
  private lastAlertCheck = 0;
  settings = { sensitivity: 1, volume: 0.8, music: 0.6, quality: 'high' as 'low' | 'medium' | 'high', speed: 1 };

  constructor(readonly engine: Engine, readonly assets: Assets, readonly audio: Audio, readonly ui: UI) {
    this.input = new Input(engine.renderer.domElement);
    this.store = new Store(assets);
    engine.scene.add(this.store.root);
    this.env = new Environment(engine.renderer, engine.scene, this.store, assets);
    this.player = new Player(engine.camera, this.input, audio, this.store.col);
    this.instancer = new ProductInstancer(this.store.root, () => this.store.slots);
    this.dialog = new Dialog(ui, () => this.enterUIMode('dialog'), () => this.exitUIMode());
    this.hot = new HotSnacks(this);
    this.dirt = new Dirt(this);
    this.deliveries = new Deliveries(this);
    this.checkout = new Checkout(this);
    this.customers = new Customers(this);
    this.pc = new PCMenu(this);
    this.menus = new Menus(this);
    this.loadSettings();
    for (const s of this.store.slots) this.pickables.push(s.pick);
    for (const key of ['register', 'pc', 'fryer', 'hotCase', 'stocker', 'wasteBin', 'cardboardBin', 'mop']) {
      const a = this.store.anchors[key];
      if (a) this.pickables.push(a);
    }
    engine.onUpdate((dt) => this.update(dt), 0);
    // Pointer lock lost (Esc) -> pause menu
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.mode === 'play' && !this.dayEnding) this.menus.pause();
    });
  }

  // ------------------------------------------------------------------ lifecycle

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  newGame(): void {
    this.state = new GameState();
    this.state.minuteLength = this.settings.speed;
    this.state.stats = emptyStats(1, this.state.reputation);
    this.resetWorld();
    this.stockStarterShelves();
    // a few boxes in the back room to learn stocking
    this.spawnDeliveryBoxes([
      { productId: 'onigiri_tuna', cases: 1 },
      { productId: 'greentea', cases: 1 },
      { productId: 'chips', cases: 1 },
    ]);
    this.startDay(true);
  }

  continueGame(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.state = GameState.from(data.state);
      this.resetWorld();
      for (const s of data.slots as { id: number; p: string | null; e: number[] }[]) {
        const slot = this.store.slots.find((x) => x.id === s.id);
        if (!slot || !s.p) continue;
        slot.productId = s.p;
        slot.items = s.e.map((expiry) => ({ expiry }));
      }
      for (const b of data.boxes as { p: string; e: number[]; x: number; y: number; z: number; r: number; o: boolean }[]) {
        const box = new Box(b.p, 0, 0);
        box.items = b.e.map((expiry) => ({ expiry }));
        if (b.o) box.open();
        this.addBox(box, new THREE.Vector3(b.x, b.y, b.z), b.r);
      }
      for (const d of data.dirt ?? []) this.dirt.spawn(d.k, d.x, d.z, d.a);
      this.instancer.markAll();
      this.refreshTags();
      this.startDay(false);
      return true;
    } catch (e) {
      console.warn('failed to load save', e);
      return false;
    }
  }

  save(): void {
    const data = {
      state: this.state.toJSON(),
      slots: this.store.slots.filter((s) => s.productId).map((s) => ({ id: s.id, p: s.productId, e: s.items.map((i) => i.expiry) })),
      boxes: this.boxes
        .filter((b) => b.mesh.parent === this.store.root)
        .map((b) => ({ p: b.productId, e: b.items.map((i) => i.expiry), x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z, r: b.mesh.rotation.y, o: b.opened })),
      dirt: this.dirt.serialize(),
    };
    // carried box goes back to the delivery area
    if (this.player.held?.kind === 'box') {
      const b = this.player.held.box;
      data.boxes.push({ p: b.productId, e: b.items.map((i) => i.expiry), x: P.deliveryDrop.x, y: 0, z: P.deliveryDrop.z, r: 0, o: b.opened });
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / private mode */
    }
  }

  private resetWorld(): void {
    for (const s of this.store.slots) {
      s.productId = null;
      s.items = [];
    }
    for (const b of [...this.boxes]) this.removeBox(b);
    this.player.setHeld(null);
    this.returnMop();
    this.dirt.clear();
    this.customers.clear();
    this.checkout.reset();
    this.hot.reset();
    this.deliveries.reset();
    this.instancer.markAll();
    this.player.position.set(5.6, 0, -6.6);
    this.player.yaw = 0.2;
    this.player.pitch = -0.1;
  }

  /** Initial shelf layout: every product placed where a real konbini would. */
  private stockStarterShelves(): void {
    const byZone = (zone: string) => this.store.slots.filter((s) => s.zone === zone);
    const place = (slots: Slot[], ids: string[], fill: number) => {
      const avail = ids.filter((id) => product(id).rank <= 1 || this.state.rank >= product(id).rank);
      slots.forEach((s, i) => {
        const id = avail[i % avail.length];
        if (!id) return;
        const p = product(id);
        const n = Math.floor(s.capacity(p) * fill * (0.7 + ((i * 37) % 10) / 30));
        s.productId = id;
        // starter stock arrived last night
        for (let k = 0; k < n; k++) s.add(p, { expiry: expiryFor(p.life, this.state.abs - 8 * 60) });
      });
    };
    const fridge = byZone('fridge');
    // column-major so each fridge door holds one kind of drink family
    const fridgeIds = ['greentea', 'water', 'sports', 'cola', 'cancoffee', 'beer', 'chuhai'];
    fridge.forEach((s, i) => {
      const unit = Math.floor(i / 5);
      const id = fridgeIds[unit];
      const p = product(id);
      s.productId = id;
      const n = Math.floor(s.capacity(p) * 0.75);
      for (let k = 0; k < n; k++) s.add(p, { expiry: NEVER });
    });
    place(byZone('chilled'), ['onigiri_salmon', 'onigiri_tuna', 'onigiri_ume', 'sandwich', 'bento_karaage', 'pudding', 'milk', 'onigiri_salmon', 'onigiri_tuna', 'sandwich'], 0.6);
    const shelf = byZone('shelf');
    const gondola = shelf.filter((s) => s.fixtureName.startsWith('ゴンドラ'));
    place(gondola.filter((s) => s.fixtureName === 'ゴンドラ1'), ['chips', 'chips_cons', 'choco', 'gummy', 'melonpan', 'anpan'], 0.55);
    place(gondola.filter((s) => s.fixtureName === 'ゴンドラ2'), ['cupnoodle', 'cupnoodle_sea', 'cupnoodle', 'chips', 'choco', 'gummy'], 0.55);
    place(gondola.filter((s) => s.fixtureName === 'ゴンドラ3'), ['gummy', 'choco', 'chips_cons', 'melonpan', 'anpan', 'cupnoodle_sea'], 0.4);
    place(byZone('magazine'), ['magazine', 'manga'], 0.8);
    this.instancer.markAll();
    this.refreshTags();
  }

  startDay(fresh: boolean): void {
    const s = this.state;
    if (fresh || s.minute < DAY_START || s.minute >= DAY_END) s.minute = DAY_START;
    if (fresh) {
      s.stats = emptyStats(s.day, s.reputation);
    }
    this.env.rain = s.weather === 'rain' ? 1 : 0;
    this.mode = 'play';
    this.dayEnding = false;
    this.ui.showHUD(true);
    this.ui.updateHUD(s);
    this.audio.resume();
    this.ambience ??= this.audio.ambience();
    this.audio.startMusic();
    this.rainLoop ??= this.audio.rainLoop();
    this.rainLoop.setVolume(this.env.rain);
    this.hot.refreshCase();
    this.refreshTags();
    this.requestLock();
    this.ui.notify(`${s.day}日目 開店です。${{ sunny: '天気は晴れ。', cloudy: '今日はくもり。', rain: '今日は雨。足元が汚れやすい日です。' }[s.weather]}`, 'good', 6000);
    if (s.day === 1 && fresh) {
      setTimeout(() => this.ui.notify('バックヤードに納品された段ボールがあります。E で持って売場へ運びましょう。', 'info', 8000), 1500);
    }
  }

  headless = false;
  private catcher: HTMLElement | null = null;

  requestLock(): void {
    if (this.mode !== 'play') return;
    this.input.lock();
    if (this.headless || this.catcher) return;
    // Browsers only grant pointer lock on a user gesture: show a click catcher
    // until we get it (or the game leaves play mode).
    setTimeout(() => {
      if (this.input.locked || this.mode !== 'play' || this.catcher) return;
      const el = h('div', { class: 'clickcatch interactive', onclick: () => { this.input.lock(); this.audio.resume(); } }, h('div', {}, 'クリックして再開'));
      this.catcher = el;
      this.ui.root.append(el);
      const t = setInterval(() => {
        if (this.input.locked || this.mode !== 'play') {
          el.remove();
          this.catcher = null;
          clearInterval(t);
        }
      }, 150);
    }, 250);
  }

  enterUIMode(m: Mode): void {
    if (this.mode === 'play' || this.mode === 'register') this.prevMode = this.mode;
    this.mode = m;
    this.input.unlock();
    this.ui.setPrompt(null);
  }
  private prevMode: Mode = 'play';

  exitUIMode(): void {
    this.input.clearPressed();
    this.mode = this.prevMode === 'register' && this.checkout.active ? 'register' : 'play';
    if (this.mode === 'play') this.requestLock();
  }

  // ------------------------------------------------------------------ world helpers

  addBox(b: Box, pos: THREE.Vector3, rotY = 0): void {
    if (!this.boxes.includes(b)) this.boxes.push(b);
    b.mesh.position.copy(pos);
    b.mesh.rotation.set(0, rotY, 0);
    this.store.root.add(b.mesh);
  }

  removeBox(b: Box): void {
    b.mesh.removeFromParent();
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  spawnDeliveryBoxes(list: { productId: string; cases: number }[]): void {
    let k = this.boxes.filter((b) => b.mesh.parent === this.store.root && b.mesh.position.distanceTo(P.deliveryDrop) < 1.8).length;
    for (const o of list) {
      const p = product(o.productId);
      for (let c = 0; c < o.cases; c++) {
        const b = new Box(p.id, p.caseSize, expiryFor(p.life, this.state.abs));
        const col = k % 4;
        const row = Math.floor(k / 4) % 3;
        const layer = Math.floor(k / 12);
        const pos = new THREE.Vector3(P.deliveryDrop.x - 0.8 + col * 0.52, layer * 0.32, P.deliveryDrop.z - 0.45 + row * 0.42);
        this.addBox(b, pos, (Math.random() - 0.5) * 0.15);
        k++;
      }
    }
  }

  refreshTags(): void {
    const today = this.state.abs;
    for (const s of this.store.slots) s.updateTag(s.productId ? this.state.price(s.productId) : null, s.expiredCount(today) > 0);
  }

  /** Units of a product on shelves (fresh only) and in boxes. */
  stockOf(id: string): { shelf: number; boxes: number } {
    let shelf = 0;
    let boxes = 0;
    const today = this.state.abs;
    for (const s of this.store.slots) if (s.productId === id) shelf += s.items.filter((i) => i.expiry > today).length;
    for (const b of this.boxes) if (b.productId === id) boxes += b.count;
    if (this.player.held?.kind === 'box' && this.player.held.box.productId === id && !this.boxes.includes(this.player.held.box)) boxes += this.player.held.box.count;
    return { shelf, boxes };
  }

  earn(amount: number): void {
    this.state.money += amount;
  }

  spend(amount: number): boolean {
    this.state.money -= amount;
    return true;
  }

  // ------------------------------------------------------------------ main loop

  private update(dt: number): void {
    this.time += dt;
    const s = this.state;
    const running = this.mode === 'play' || this.mode === 'register' || this.mode === 'dialog';
    if (running && !this.dayEnding) {
      this.minuteAcc += dt / s.minuteLength;
      while (this.minuteAcc >= 1) {
        this.minuteAcc -= 1;
        this.tickMinute();
      }
    }
    const hour = s.minute / 60;
    this.env.update(hour % 24, dt);

    if (this.mode === 'play') {
      this.player.update(dt);
      this.updateInteraction();
    } else if (this.mode === 'register') {
      this.player.update(dt);
      this.checkout.updateRegisterMode(dt);
    } else {
      this.player.update(0);
    }

    if (running) {
      this.customers.update(dt, this.time);
      this.deliveries.update(dt, this.time);
      this.hot.update(dt, this.time);
      this.checkout.update(dt, this.time);
      this.dirt.update(dt);
    }
    // door: open when someone is close
    const door = new THREE.Vector3(-4.5, 0, 5);
    let near = this.player.position.distanceTo(door) < 1.7;
    for (const c of this.customers.characters()) if (c.position.distanceTo(door) < 1.8) near = true;
    this.store.update(dt, near);
    this.instancer.update();
    TagAtlas.flush();
    this.audio.updateListener(this.engine.camera);

    // UI
    this.ui.updateHUD(s);
    const bubbles: BubbleSource[] = this.customers.bubbles();
    this.ui.updateBubbles(bubbles, this.engine.camera);
    if (this.time - this.lastAlertCheck > 0.5) {
      this.lastAlertCheck = this.time;
      this.updateAlerts();
      this.menus.updateTasks();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 30 && this.mode === 'play') {
      this.saveTimer = 0;
      this.save();
    }
    if (this.input.pressedRaw('Tab') && (this.mode === 'play')) this.menus.pause();
    this.input.endFrame();
  }

  private tickMinute(): void {
    const s = this.state;
    s.minute += 1;
    this.deliveries.tick();
    this.customers.tickMinute();
    this.dirt.tickMinute();
    if (s.minute % 10 === 0) this.refreshTags();
    // fixed costs are charged at day end
    if (s.minute === 9 * 60 && s.has('parttimer')) this.ui.notify('アルバイトが出勤しました（〜17時）', 'info');
    if (s.minute === 22 * 60) this.ui.notify('22時。深夜帯は困ったお客さんが増えます。', 'warn', 6000);
    if (s.minute >= DAY_END) this.endDay();
  }

  private updateAlerts(): void {
    const s = this.state;
    const alerts: { text: string; info?: boolean }[] = [];
    let expired = 0;
    let empty = 0;
    for (const sl of this.store.slots) {
      expired += sl.expiredCount(s.abs);
      if (sl.productId && sl.items.length === 0) empty++;
    }
    if (expired) alerts.push({ text: `⚠ 期限切れ商品 ${expired}点 が陳列中（R で撤去）` });
    const stale = this.hot.staleCount();
    if (stale) alerts.push({ text: `⚠ ホットケースに販売期限切れ ${stale}個` });
    if (this.hot.readyBaskets()) alerts.push({ text: '🍗 フライヤー: 揚げ上がり！' });
    const d = this.dirt.count();
    if (d >= 3) alerts.push({ text: `🧹 床の汚れ ${d}か所` });
    const q = this.customers.queueLength();
    if (q > 0 && !this.checkout.active && !(this.state.has('parttimer') && this.customers.partTimerOnDuty())) alerts.push({ text: `🧾 レジ待ち ${q}人` });
    if (empty >= 6) alerts.push({ text: `📦 空になった棚 ${empty}か所`, info: true });
    const next = this.deliveries.nextArrival();
    if (next) alerts.push({ text: `🚚 次の納品 ${next}`, info: true });
    this.ui.setAlerts(alerts);
    void HOT_HOLD_MIN;
  }

  // ------------------------------------------------------------------ interaction

  private raycastTarget(): Target | null {
    const ray = this.player.ray(false);
    ray.far = 2.7;
    const objs: THREE.Object3D[] = [...this.pickables, ...this.boxes.filter((b) => b.mesh.parent === this.store.root).map((b) => b.mesh), ...this.dirt.meshes(), ...this.customers.proxies()];
    const hits = ray.intersectObjects(objs, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const ud = o.userData;
        if (ud.slot) return { kind: 'slot', slot: ud.slot, point: hit.point, distance: hit.distance, object: o };
        if (ud.box) return { kind: 'box', box: ud.box, point: hit.point, distance: hit.distance, object: o };
        if (ud.dirt) return { kind: 'dirt', object: o, point: hit.point, distance: hit.distance };
        if (ud.npc) return { kind: 'npc', object: o, point: hit.point, distance: hit.distance };
        if (ud.interact) return { kind: 'anchor', anchor: ud.interact, object: o, point: hit.point, distance: hit.distance };
        o = o.parent;
      }
    }
    return null;
  }

  private updateInteraction(): void {
    const t = this.raycastTarget();
    const held = this.player.held;
    const inp = this.input;
    let prompt: PromptInfo | null = null;

    // held item HUD
    if (held?.kind === 'box') {
      const b = held.box;
      this.ui.setHeld(`📦 ${b.product.name}`, `残り ${b.count} / ${b.product.caseSize}　売価 ${yen(this.state.price(b.productId))}　［Q］置く`);
    } else if (held?.kind === 'mop') {
      this.ui.setHeld('🧹 モップ', '汚れを見て 左クリック長押しで掃除　［Q］戻す');
    } else this.ui.setHeld(null);

    if (inp.pressed('KeyQ') && held) {
      if (held.kind === 'box') this.putDownBox();
      else this.returnMop();
      return;
    }

    if (t?.kind === 'slot' && t.slot) {
      const sl = t.slot;
      const p = sl.product;
      const exp = sl.expiredCount(this.state.abs);
      const keys: [string, string][] = [];
      if (held?.kind === 'box') {
        const bp = held.box.product;
        if (bp.zone !== sl.zone) {
          prompt = { title: sl.fixtureName, sub: `この棚には「${bp.name}」は置けません（${zoneHint(bp)}）` };
        } else if (sl.productId && sl.productId !== bp.id && sl.items.length) {
          prompt = { title: `${p!.name}`, sub: '別の商品が陳列されています' };
        } else {
          keys.push(['左クリック', `陳列する (${sl.items.length}/${sl.capacity(bp)})`]);
          if (sl.productId === bp.id && sl.items.length) keys.push(['右クリック', '箱に戻す']);
          prompt = { title: p ? p.name : `空き棚 → ${bp.name}`, sub: sl.fixtureName, keys };
          if (inp.mouse(0)) this.stockOne(sl, held.box);
          else if (inp.mouse(2)) this.unstockOne(sl, held.box);
        }
      } else {
        if (p) {
          keys.push(['T', `売価変更 (${yen(this.state.price(p.id))})`]);
          if (exp) keys.push(['R', `期限切れ ${exp}点を撤去`]);
          prompt = {
            title: p.name,
            sub: `${sl.fixtureName}　在庫 ${sl.items.length}/${sl.capacity()}${exp ? `　⚠期限切れ ${exp}` : ''}`,
            keys,
          };
          if (inp.pressed('KeyR') && exp) this.removeExpired(sl);
          if (inp.pressed('KeyT')) this.menus.priceEditor(p.id);
        } else {
          prompt = { title: '空き棚', sub: `${sl.fixtureName}（${zoneName(sl.zone)}）　商品の箱を持って陳列` };
        }
      }
    } else if (t?.kind === 'box' && t.box) {
      const b = t.box;
      if (!held) {
        prompt = { title: `📦 ${b.product.name}`, sub: `${b.count}個入り　${b.product.zone === 'hot' ? '冷凍ストッカーへ' : zoneName(b.product.zone)}`, keys: [['E', '持つ']] };
        if (inp.pressed('KeyE')) this.pickUpBox(b);
      } else prompt = { title: `📦 ${b.product.name}`, sub: `${b.count}個入り` };
    } else if (t?.kind === 'dirt' && t.object) {
      if (held?.kind === 'mop') {
        prompt = { title: '汚れ', keys: [['左クリック長押し', '掃除する']] };
        if (inp.mouseHeld(0)) this.dirt.clean(t.object, this.engine.timeScale * 0.016 * 1.0 + 0.012);
      } else prompt = { title: '床の汚れ', sub: 'バックヤードのモップで掃除できます' };
    } else if (t?.kind === 'npc' && t.object) {
      const info = this.customers.promptFor(t.object);
      if (info) {
        prompt = info;
        if (inp.pressed('KeyE')) this.customers.interact(t.object);
      }
    } else if (t?.kind === 'anchor' && t.anchor) {
      prompt = this.anchorPrompt(t.anchor);
    }

    if (!prompt && held?.kind === 'box') prompt = null;
    this.ui.setPrompt(prompt);
  }

  private anchorPrompt(a: string): PromptInfo | null {
    const inp = this.input;
    const held = this.player.held;
    switch (a) {
      case 'register': {
        if (held?.kind === 'box') return { title: 'レジ', sub: '箱を置いてから接客しましょう（Q）' };
        const q = this.customers.queueLength();
        if (inp.pressed('KeyE')) this.checkout.enter();
        return { title: 'レジ', sub: q ? `お客さん ${q}人 待ち` : 'お客さんはいません', keys: [['E', 'レジに立つ']] };
      }
      case 'register_idle':
        return { title: 'レジ（休止中）', sub: '2台目のレジは使用していません' };
      case 'pc':
        if (inp.pressed('KeyE')) this.pc.open();
        return { title: 'ストアPC', sub: '発注・価格設定・売上確認・店舗強化', keys: [['E', '使う']] };
      case 'fryer':
        return this.hot.fryerPrompt();
      case 'hotCase':
        return this.hot.casePrompt();
      case 'stocker':
        return this.hot.stockerPrompt();
      case 'wastebin': {
        if (held?.kind === 'box') {
          if (inp.pressed('KeyE')) this.discardBox(true);
          return { title: '廃棄ボックス', sub: `箱の中身 ${held.box.count}個 を廃棄します`, keys: [['E', '中身ごと廃棄']] };
        }
        return { title: '廃棄ボックス', sub: '期限切れ商品は棚で R を押すと自動でここへ' };
      }
      case 'cardboard': {
        if (held?.kind === 'box') {
          if (held.box.count === 0) {
            if (inp.pressed('KeyE')) this.discardBox(false);
            return { title: '段ボール回収', keys: [['E', '空き箱を捨てる']] };
          }
          return { title: '段ボール回収', sub: 'まだ中身が入っています' };
        }
        return { title: '段ボール回収', sub: '空になった箱を捨てる場所' };
      }
      case 'mop': {
        if (held?.kind === 'mop') {
          if (inp.pressed('KeyE')) this.returnMop();
          return { title: 'モップ置き場', keys: [['E', 'モップを戻す']] };
        }
        if (held) return { title: 'モップ', sub: '手がふさがっています' };
        if (inp.pressed('KeyE')) this.takeMop();
        return { title: 'モップ', keys: [['E', '持つ']] };
      }
    }
    return null;
  }

  private pickUpBox(b: Box): void {
    b.mesh.removeFromParent();
    this.player.setHeld({ kind: 'box', box: b });
    this.audio.play('box_open', { volume: 0.4 });
    this.state.tutorial |= 1;
  }

  private putDownBox(): void {
    const held = this.player.held;
    if (held?.kind !== 'box') return;
    const b = held.box;
    const ray = this.player.ray(false);
    ray.far = 2.8;
    const surfaces = [...this.store.placeSurfaces, ...this.boxes.filter((x) => x !== b && x.mesh.parent === this.store.root).map((x) => x.mesh)];
    const hit = ray.intersectObjects(surfaces, true).find((hh) => hh.face && hh.face.normal.clone().transformDirection(hh.object.matrixWorld).y > 0.7);
    let pos: THREE.Vector3;
    if (hit) pos = hit.point.clone();
    else {
      const f = this.player.forward().setY(0).normalize();
      pos = this.player.position.clone().addScaledVector(f, 0.7);
      pos.y = 0;
    }
    this.player.setHeld(null);
    this.addBox(b, pos, this.player.yaw);
    this.audio.play(pos.y > 0.05 ? 'box_drop2' : 'box_drop', { pos, volume: 0.7 });
  }

  private discardBox(waste: boolean): void {
    const held = this.player.held;
    if (held?.kind !== 'box') return;
    const b = held.box;
    if (waste && b.count) {
      const loss = b.count * b.product.cost;
      this.state.stats.waste += loss;
      this.state.stats.wasteItems += b.count;
      this.ui.notify(`${b.product.name} ×${b.count} を廃棄しました（原価 ${yen(loss)}）`, 'warn');
    }
    this.player.setHeld(null);
    this.removeBox(b);
    this.audio.play('box_drop', { volume: 0.5 });
  }

  private stockOne(sl: Slot, b: Box): void {
    if (!b.count) {
      this.ui.notify('箱が空です。段ボール回収へ捨てましょう。', 'warn');
      this.audio.errorBuzz();
      return;
    }
    const p = b.product;
    if (!sl.canAccept(p)) {
      this.audio.errorBuzz();
      return;
    }
    b.open();
    const it = b.items.pop()!;
    const prev = sl.productId;
    sl.add(p, it);
    sl.onTouch?.();
    this.instancer.markDirty(p.id);
    if (prev && prev !== p.id) this.instancer.markDirty(prev);
    sl.updateTag(this.state.price(p.id), sl.expiredCount(this.state.abs) > 0);
    const snd = p.shape === 'can' || p.shape === 'slimcan' ? 'place_can' : p.shape === 'pet' ? 'place2' : 'place';
    this.audio.play(snd, { pos: sl.access.clone().setY(1), volume: 0.6 });
    this.state.tutorial |= 2;
  }

  private unstockOne(sl: Slot, b: Box): void {
    if (sl.productId !== b.productId || !sl.items.length || b.count >= b.product.caseSize) return;
    const it = sl.takeBack()!;
    b.items.push(it);
    this.instancer.markDirty(sl.productId);
    sl.onTouch?.();
    this.audio.play('place', { volume: 0.4, rate: 1.2 });
  }

  private removeExpired(sl: Slot): void {
    const p = sl.product!;
    const removed = sl.removeExpired(this.state.abs);
    if (!removed.length) return;
    const loss = removed.length * p.cost;
    this.state.stats.waste += loss;
    this.state.stats.wasteItems += removed.length;
    this.instancer.markDirty(p.id);
    sl.updateTag(this.state.price(p.id), false);
    this.audio.play('place', { volume: 0.5, rate: 0.8 });
    this.ui.notify(`${p.name} ×${removed.length} を廃棄（原価 ${yen(loss)}）`, 'warn');
    this.state.tutorial |= 32;
  }

  private takeMop(): void {
    const mop = this.store.anchors.mop;
    const parts = mop.userData.movable as THREE.Object3D[];
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8), this.store.m.frame);
    handle.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: '#90caf9', roughness: 1 }));
    head.position.y = -0.45;
    g.add(handle, head);
    g.scale.setScalar(0.8);
    for (const p of parts) p.visible = false;
    this.player.setHeld({ kind: 'mop', mesh: g });
    this.audio.play('wood', { volume: 0.4 });
  }

  returnMop(): void {
    const mop = this.store.anchors.mop;
    for (const p of (mop.userData.movable as THREE.Object3D[]) ?? []) p.visible = true;
    if (this.player.held?.kind === 'mop') this.player.setHeld(null);
  }

  // ------------------------------------------------------------------ day end

  endDay(): void {
    if (this.dayEnding) return;
    this.dayEnding = true;
    const s = this.state;
    s.minute = DAY_END;
    this.checkout.forceClose();
    this.dialog.dismiss();
    this.customers.clear();
    // remaining expired items count as waste automatically overnight
    let autoWaste = 0;
    for (const sl of this.store.slots) {
      const p = sl.product;
      if (!p) continue;
      const r = sl.removeExpired(s.abs);
      if (r.length) {
        autoWaste += r.length * p.cost;
        s.stats.wasteItems += r.length;
        this.instancer.markDirty(p.id);
      }
    }
    s.stats.waste += autoWaste;
    const hotWaste = this.hot.endOfDay();
    s.stats.waste += hotWaste;
    // fixed costs
    const rent = 3000;
    const power = s.has('led') ? 1000 : 1600;
    s.stats.fixed = rent + power;
    s.stats.wages = s.has('parttimer') ? 9000 : 0;
    s.money -= s.stats.fixed + s.stats.wages;
    s.stats.repEnd = s.reputation;
    const report = s.stats;
    s.history.push(report);
    if (s.history.length > 30) s.history.shift();
    this.menus.dayReport(report, () => this.nextDay());
  }

  private nextDay(): void {
    const s = this.state;
    s.day += 1;
    s.minute = DAY_START;
    s.weather = s.forecast;
    s.forecast = rollWeather();
    s.stats = emptyStats(s.day, s.reputation);
    this.dirt.overnight();
    this.save();
    if (s.money < -30000) {
      this.menus.gameOver();
      return;
    }
    this.startDay(false);
    s.stats = emptyStats(s.day, s.reputation);
  }

  // ------------------------------------------------------------------ settings

  loadSettings(): void {
    try {
      const raw = localStorage.getItem('konbini-sim-settings');
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch {
      /* ignore */
    }
    this.applySettings();
  }

  applySettings(): void {
    this.input.sensitivity = this.settings.sensitivity;
    this.audio.setVolumes(this.settings.volume, this.settings.music);
    if (this.engine.quality !== this.settings.quality) this.engine.setQuality(this.settings.quality);
    this.state.minuteLength = this.settings.speed;
    try {
      localStorage.setItem('konbini-sim-settings', JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  get products(): ProductDef[] {
    return PRODUCTS.filter((p) => p.rank <= this.state.rank);
  }
}

export function rollWeather(): Weather {
  const r = Math.random();
  return r < 0.5 ? 'sunny' : r < 0.78 ? 'cloudy' : 'rain';
}

function zoneName(z: string): string {
  return { fridge: 'ドリンク冷蔵庫', chilled: '冷蔵ケース', shelf: '常温棚', magazine: '雑誌ラック', freezer: 'アイスケース', hot: 'ホットスナック' }[z] ?? z;
}

function zoneHint(p: ProductDef): string {
  return `${zoneName(p.zone)}${p.zone === 'hot' ? '＝冷凍ストッカー' : ''}に陳列`;
}
