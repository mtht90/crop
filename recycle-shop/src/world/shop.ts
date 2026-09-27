import * as THREE from 'three';
import { assets } from '../core/assets';
import { Rng, clamp, lerp, smoothstep } from '../core/util';
import { CanvasTex, JP_FONT, fitText, roundRect, signMesh } from './canvasTex';
import { CITY, DOOR, EXPANSION, K, SHOP, STAFF_ZONES, rect, type Rect } from './layout';
import { NavGrid } from './navgrid';

export interface Collider extends Rect { tag?: string }

const HDRI_DAY = 'hdri/potsdamer_platz_1k.hdr';

/**
 * 店舗の建物・外の街並み・照明・時間帯表現。
 * 什器や商品は含まない (World が管理)。
 */
export class ShopBuilding {
  readonly root = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly nav = new NavGrid(-34, -9, 34, 26);
  door!: THREE.Group;
  private doorAngle = 0;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private interiorLights: THREE.PointLight[] = [];
  private lightPanels: THREE.Mesh[] = [];
  private streetLamps: THREE.PointLight[] = [];
  private lampGlass: THREE.MeshStandardMaterial;
  private windowGlow: THREE.MeshStandardMaterial;
  private cars: { obj: THREE.Object3D; speed: number; lane: number }[] = [];
  private signTex!: CanvasTex;
  private openSignTex!: CanvasTex;
  openSign!: THREE.Group;
  private expansionBlockers: THREE.Object3D[] = [];
  private expansionOpenings: THREE.Object3D[] = [];
  private expanded = false;
  private rng = new Rng(1234);

  constructor(private scene: THREE.Scene, public shopName: string) {
    this.lampGlass = new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.windowGlow = new THREE.MeshStandardMaterial({ color: '#2b3748', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.3 });
    scene.add(this.root);
  }

  async build() {
    const env = await assets.loadHdr(HDRI_DAY);
    this.scene.environment = env;
    this.scene.background = env;
    this.scene.backgroundBlurriness = 0.02;
    this.scene.environmentIntensity = 0.4;
    this.buildFloorAndWalls();
    this.buildCeilingAndLights();
    this.buildFacade();
    this.buildStreet();
    this.buildExpansionShell();
    this.buildStaffArea();
    this.buildSun();
    this.bakeNav();
  }

  // ───────── 建物 ─────────
  private addCollider(x0: number, z0: number, x1: number, z1: number, tag?: string) {
    this.colliders.push({ ...rect(x0, z0, x1, z1), tag });
  }

  private wallSeg(model: string, x: number, z: number, rotY: number) {
    const w = assets.instance(model, { scale: K, ground: false });
    w.position.set(x, 0, z);
    w.rotation.y = rotY;
    this.root.add(w);
    return w;
  }

  private buildFloorAndWalls() {
    const { x0, x1, z0, z1, wall } = SHOP;
    // 床 (KayKit Dungeon の木の床)
    for (let x = x0 + 1.5; x < EXPANSION.x1; x += 3) {
      for (let z = z0 + 1.5; z < z1; z += 3) {
        const staff = x < -1.5 && z < -2.5;
        const tile = assets.instance(staff ? 'env/kd_floor_wood_large_dark.glb' : 'env/kd_floor_wood_large.glb', { scale: K, ground: false, castShadow: false });
        tile.position.set(x, -0.04, z);
        if (x > x1) tile.userData.expansion = true;
        this.root.add(tile);
      }
    }
    // 前面: 窓・入口
    const front: [string, number][] = [['env/wall_window_open.glb', -6], ['env/wall_window_open.glb', -3], ['env/wall_doorway.glb', 0], ['env/wall_window_open.glb', 3], ['env/wall.glb', 6]];
    for (const [m, x] of front) this.wallSeg(m, x, z1, 0);
    this.addCollider(x0 - 0.2, z1 - wall / 2, DOOR.x - DOOR.half, z1 + wall / 2, 'wall');
    this.addCollider(DOOR.x + DOOR.half, z1 - wall / 2, x1 + 0.2, z1 + wall / 2, 'wall');
    // 背面
    for (const x of [-6, -3, 0, 3, 6]) this.wallSeg(x === 3 ? 'env/wall_decorated.glb' : 'env/wall.glb', x, z0, Math.PI);
    this.addCollider(x0 - 0.2, z0 - wall / 2, x1 + 0.2, z0 + wall / 2, 'wall');
    // 左側面
    for (const z of [-4.5, -1.5, 1.5, 4.5]) this.wallSeg('env/wall.glb', x0, z, Math.PI / 2);
    this.addCollider(x0 - wall / 2, z0, x0 + wall / 2, z1, 'wall');
    // 右側面 (拡張で開通する)
    for (const z of [-4.5, -1.5, 1.5, 4.5]) {
      const opening = z === -1.5 || z === 1.5;
      const w = this.wallSeg('env/wall.glb', x1, z, -Math.PI / 2);
      if (opening) {
        this.expansionBlockers.push(w);
        const d = this.wallSeg('env/wall_doorway.glb', x1, z, -Math.PI / 2);
        d.visible = false;
        this.expansionOpenings.push(d);
      }
    }
    // 入口のドア
    this.door = new THREE.Group();
    const d = assets.instance('env/door_A.glb', { scale: K * 0.78, ground: false });
    this.door.add(d);
    this.door.position.set(DOOR.x - DOOR.half + 0.02, 0, z1);
    this.root.add(this.door);
    // 屋根
    const roofMat = new THREE.MeshStandardMaterial({ color: '#5b5f66', roughness: 0.9 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(EXPANSION.x1 - x0 + 0.8, 0.35, z1 - z0 + 0.8), roofMat);
    roof.position.set((x0 + EXPANSION.x1) / 2, SHOP.h + 0.175, 0);
    roof.castShadow = true;
    this.root.add(roof);
  }

  private buildCeilingAndLights() {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(EXPANSION.x1 - SHOP.x0, SHOP.z1 - SHOP.z0), new THREE.MeshStandardMaterial({ color: '#d9d2c3', roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((SHOP.x0 + EXPANSION.x1) / 2, SHOP.h - 0.01, 0);
    ceil.receiveShadow = true;
    this.root.add(ceil);
    const panelMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e2', emissiveIntensity: 1.4 });
    const spots: [number, number][] = [[-4.5, -3.8], [-4.5, 2.4], [0, -3.8], [0, 1.2], [4.5, -3.8], [4.5, 1.8], [10.5, -3], [10.5, 3]];
    for (const [x, z] of spots) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.35), panelMat);
      p.position.set(x, SHOP.h - 0.03, z);
      if (x > SHOP.x1) p.userData.expansion = true;
      this.root.add(p);
      this.lightPanels.push(p);
      const l = new THREE.PointLight('#fff1dc', 4.2, 9, 1.7);
      l.position.set(x, SHOP.h - 0.25, z);
      if (x > SHOP.x1) { l.userData.expansion = true; l.visible = false; p.visible = false; }
      this.root.add(l);
      this.interiorLights.push(l);
    }
    this.hemi = new THREE.HemisphereLight('#dfe8ff', '#6b5a48', 0.35);
    this.root.add(this.hemi);
  }

  private buildFacade() {
    // 店名看板
    this.signTex = new CanvasTex(1024, 192);
    this.drawShopSign();
    const sign = signMesh(6.2, 1.16, this.signTex, 0.35);
    sign.position.set(0, SHOP.h + 0.75, SHOP.z1 + 0.22);
    this.root.add(sign);
    const back = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.35, 0.12), new THREE.MeshStandardMaterial({ color: '#2d3a2f', roughness: 0.6 }));
    back.position.set(0, SHOP.h + 0.75, SHOP.z1 + 0.14);
    this.root.add(back);
    // 入口脇のバナー
    for (const x of [-1.25, 1.25]) {
      const b = assets.instance('env/kd_banner_thin_yellow.glb', { scale: 0.55, ground: false });
      b.position.set(x, 0.1, SHOP.z1 + 0.05);
      this.root.add(b);
    }
    // 営業中/準備中 の立て看板 (店内・入口脇)
    this.openSign = new THREE.Group();
    const stand = assets.instance('env/menu.glb', { scale: 1.25 });
    this.openSign.add(stand);
    this.openSignTex = new CanvasTex(256, 320);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.575), new THREE.MeshStandardMaterial({ map: this.openSignTex.texture, emissive: '#fff', emissiveMap: this.openSignTex.texture, emissiveIntensity: 0.35 }));
    face.position.set(0, 0.62, 0.2);
    face.rotation.x = -0.18;
    this.openSign.add(face);
    const back2 = face.clone();
    back2.rotation.y = Math.PI;
    back2.rotation.x = 0.18;
    back2.position.z = -0.2;
    this.openSign.add(back2);
    this.openSign.position.set(1.45, 0, 5.1);
    this.openSign.rotation.y = -0.5;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.55;
    hit.userData.target = { type: 'openSign' };
    this.openSign.add(hit);
    this.root.add(this.openSign);
    this.setOpenSign(false);
    this.addCollider(1.2, 4.85, 1.7, 5.35, 'sign');
  }

  drawShopSign() {
    this.signTex.draw((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fdf6e3'); g.addColorStop(1, '#f1e2bd');
      roundRect(ctx, 6, 6, w - 12, h - 12, 22);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 10; ctx.strokeStyle = '#2f7d4f'; ctx.stroke();
      ctx.fillStyle = '#2f7d4f';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `900 40px ${JP_FONT}`;
      ctx.fillText('♻ RECYCLE SHOP', 34, 48);
      ctx.fillStyle = '#3a2410';
      ctx.textAlign = 'center';
      fitText(ctx, this.shopName, w - 80, 96, 900);
      ctx.fillText(this.shopName, w / 2, h / 2 + 26);
    });
  }

  setOpenSign(open: boolean) {
    this.openSignTex.draw((ctx, w, h) => {
      roundRect(ctx, 6, 6, w - 12, h - 12, 20);
      ctx.fillStyle = open ? '#1d6b3a' : '#5a1f1f'; ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = '#f6e7c0'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 64px ${JP_FONT}`;
      ctx.fillText(open ? '営業中' : '準備中', w / 2, h / 2 - 40);
      ctx.font = `800 44px ${JP_FONT}`;
      ctx.fillText(open ? 'OPEN' : 'CLOSED', w / 2, h / 2 + 40);
    });
  }

  private buildStreet() {
    // 地面
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#7d8a6a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.root.add(ground);
    // 歩道 (KayKit City の base タイル)
    for (let x = -40.5; x <= 40.5; x += 9) {
      const b = assets.instance('env/base.glb', { ground: false, castShadow: false });
      b.scale.set(CITY, 1, 1.6);
      b.position.set(x, -0.07, 7.6);
      this.root.add(b);
      const b2 = b.clone();
      b2.position.z = 19.9;
      this.root.add(b2);
    }
    // 車道
    for (let x = -40.5; x <= 40.5; x += 9) {
      const r = assets.instance(x === 0 + 4.5 ? 'env/road_straight_crossing.glb' : 'env/road_straight.glb', { ground: false, castShadow: false });
      r.scale.setScalar(CITY);
      r.rotation.y = Math.PI / 2;
      r.position.set(x, -0.07, 13.75);
      this.root.add(r);
    }
    // 向かいの建物
    const bld = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let x = -36; x <= 36; x += 9) {
      const b = assets.instance(`env/building_${this.rng.pick(bld)}.glb`, { scale: CITY, ground: false });
      b.position.set(x, -0.08, 26);
      b.rotation.y = Math.PI;
      this.root.add(b);
    }
    // 店の両隣
    for (const [x, name] of [[-12, 'D'], [-21, 'F'], [-30, 'B'], [18, 'G'], [27, 'C'], [36, 'E']] as [number, string][]) {
      const b = assets.instance(`env/building_${name}.glb`, { scale: CITY, ground: false });
      b.position.set(x, -0.08, 1.5);
      this.root.add(b);
      this.addCollider(x - 4.5, -3, x + 4.5, 6.2, 'building');
    }
    // 街灯・植栽・ゴミ箱など
    for (let x = -31.5; x <= 31.5; x += 9) {
      const l = assets.instance('env/streetlight.glb', { scale: CITY, ground: false });
      l.position.set(x + 2, -0.07, 9.2);
      l.rotation.y = Math.PI;
      this.root.add(l);
      l.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color?.getHSL({ h: 0, s: 0, l: 0 }).l > 0.8) m.material = this.lampGlass;
      });
      if (Math.abs(x) < 20) {
        const pl = new THREE.PointLight('#ffd58a', 0, 12, 1.8);
        pl.position.set(x + 2, 4.1, 8.5);
        this.root.add(pl);
        this.streetLamps.push(pl);
      }
      this.addCollider(x + 1.8, 9.0, x + 2.2, 9.4, 'lamp');
    }
    for (const [x, z] of [[-4.8, 7.3], [4.8, 7.3], [-10, 7.4], [9.5, 7.4]]) {
      const b = assets.instance('env/bush.glb', { scale: CITY * 0.9, ground: false });
      b.position.set(x, -0.07, z);
      this.root.add(b);
      this.addCollider(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 'bush');
    }
    const bench = assets.instance('env/bench.glb', { scale: CITY, ground: false });
    bench.position.set(-7, -0.07, 8.3);
    this.root.add(bench);
    this.addCollider(-7.9, 8.0, -6.1, 8.6, 'bench');
    const hydrant = assets.instance('env/firehydrant.glb', { scale: CITY, ground: false });
    hydrant.position.set(6.8, -0.07, 8.6);
    this.root.add(hydrant);
    const dumpster = assets.instance('env/dumpster.glb', { scale: CITY, ground: false });
    dumpster.position.set(-15.5, -0.07, 7.5);
    this.root.add(dumpster);
    // 走る車
    const carNames = ['car_hatchback', 'car_sedan', 'car_stationwagon', 'car_taxi', 'car_police'];
    for (let i = 0; i < 6; i++) {
      const c = assets.instance(`env/${carNames[i % carNames.length]}.glb`, { scale: CITY });
      const lane = i % 2;
      c.position.set(-45 + i * 17, 0.2, lane ? 11.6 : 15.9);
      c.rotation.y = lane ? Math.PI / 2 : -Math.PI / 2;
      this.root.add(c);
      this.cars.push({ obj: c, speed: 6 + this.rng.range(0, 5), lane });
    }
    // 道路は立入禁止
    this.addCollider(-60, 9.6, 60, 18, 'road');
  }

  private buildExpansionShell() {
    const { x1: ex1 } = EXPANSION;
    const { z0, z1, wall } = SHOP;
    for (const x of [9, 12]) {
      this.wallSeg(x === 9 ? 'env/wall_window_closed.glb' : 'env/wall.glb', x, z1, 0);
      this.wallSeg('env/wall.glb', x, z0, Math.PI);
    }
    for (const z of [-4.5, -1.5, 1.5, 4.5]) this.wallSeg('env/wall.glb', ex1, z, -Math.PI / 2);
    this.addCollider(SHOP.x1, z1 - wall / 2, ex1 + 0.2, z1 + wall / 2, 'wall');
    this.addCollider(SHOP.x1, z0 - wall / 2, ex1 + 0.2, z0 + wall / 2, 'wall');
    this.addCollider(ex1 - wall / 2, z0, ex1 + wall / 2, z1, 'wall');
    // 未拡張時の「テナント募集」
    const tex = new CanvasTex(512, 256);
    tex.draw((ctx, w, h) => {
      ctx.fillStyle = '#fbfbf5'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 14; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 84px ${JP_FONT}`; ctx.fillText('テナント募集', w / 2, h / 2 - 30);
      ctx.fillStyle = '#333'; ctx.font = `700 38px ${JP_FONT}`; ctx.fillText('お問い合わせは店舗PCから', w / 2, h / 2 + 60);
    });
    const s = signMesh(2.4, 1.2, tex, 0.2);
    s.position.set(10.5, 1.9, z1 + 0.23);
    this.root.add(s);
    this.expansionBlockers.push(s);
  }

  private buildStaffArea() {
    // バックヤードの仕切り (木の手すり)
    const rail = new THREE.MeshStandardMaterial({ color: '#8b5a36', roughness: 0.8 });
    const mk = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.08), rail);
      m.position.set((x0 + x1) / 2, 0.475, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      this.addCollider(Math.min(x0, x1) - 0.06, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.06, Math.max(z0, z1) + 0.06, 'rail');
    };
    mk(-7.3, -2.5, -3.6, -2.5);
    mk(-2.0, -2.5, -2.0, -5.8);
    const tex = new CanvasTex(256, 96);
    tex.draw((ctx, w, h) => {
      ctx.fillStyle = '#222'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd34d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 44px ${JP_FONT}`; ctx.fillText('STAFF ONLY', w / 2, h / 2);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshStandardMaterial({ map: tex.texture }));
    s.position.set(-5.4, 1.1, -2.44);
    this.root.add(s);
  }

  private buildSun() {
    this.sun = new THREE.DirectionalLight('#fff3e0', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -18; cam.right = 18; cam.top = 18; cam.bottom = -18; cam.near = 1; cam.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(2, 0, 3);
    this.root.add(this.sun, this.sun.target);
  }

  // ───────── ナビメッシュ ─────────
  private bakeNav() {
    const nav = this.nav;
    // 店の外周の建物・壁
    for (const c of this.colliders) nav.markRect(c.x0 - 0.2, c.z0 - 0.2, c.x1 + 0.2, c.z1 + 0.2, 1);
    // 店の裏側・両脇は通れない
    nav.markRect(-34, -9, 34, SHOP.z0 - 0.2, 1);
    for (const z of STAFF_ZONES) nav.markRect(z.x0, z.z0, z.x1, z.z1, 2);
    if (!this.expanded) nav.markRect(SHOP.x1 - 0.3, SHOP.z0, EXPANSION.x1 + 1, SHOP.z1, 1);
    nav.resetDynamic();
  }

  setExpanded(on: boolean) {
    this.expanded = on;
    for (const o of this.expansionBlockers) o.visible = !on;
    for (const o of this.expansionOpenings) o.visible = on;
    this.root.traverse((o) => { if (o.userData.expansion && (o as THREE.Light).isLight) o.visible = on; if (o.userData.expansion && (o as THREE.Mesh).isMesh) o.visible = true; });
    for (const p of this.lightPanels) if (p.userData.expansion) p.visible = on;
    // 右壁の当たり判定を開口部に合わせて作り直す
    const { x1, wall } = SHOP;
    for (let i = this.colliders.length - 1; i >= 0; i--) if (this.colliders[i].tag === 'rightwall') this.colliders.splice(i, 1);
    if (on) {
      this.colliders.push({ ...rect(x1 - wall / 2, SHOP.z0, x1 + wall / 2, -2.1), tag: 'rightwall' });
      this.colliders.push({ ...rect(x1 - wall / 2, -0.9, x1 + wall / 2, 0.9), tag: 'rightwall' });
      this.colliders.push({ ...rect(x1 - wall / 2, 2.1, x1 + wall / 2, SHOP.z1), tag: 'rightwall' });
    } else {
      this.colliders.push({ ...rect(x1 - wall / 2, SHOP.z0, x1 + wall / 2, SHOP.z1), tag: 'rightwall' });
    }
    // ナビメッシュを最初から焼き直す
    (this.nav as any).base.fill(0);
    this.bakeNav();
    if (on) {
      for (const c of this.colliders.filter((c) => c.tag === 'rightwall')) this.nav.markRect(c.x0 - 0.2, c.z0 - 0.2, c.x1 + 0.2, c.z1 + 0.2, 1);
      this.nav.resetDynamic();
    }
  }

  // ───────── 更新 ─────────
  /** minute: その日の経過分 (0..1440) */
  updateTime(minute: number) {
    const h = minute / 60;
    // 6:00 日の出 → 18:30 日没
    const dayT = clamp((h - 6) / 12.5, 0, 1);
    const elev = Math.sin(dayT * Math.PI);
    const az = lerp(-1.2, 1.2, dayT);
    this.sun.position.set(Math.sin(az) * 30 + 2, 6 + elev * 34, Math.cos(az) * 22 + 12);
    const dusk = smoothstep(16, 18.8, h);
    const night = smoothstep(18.2, 19.6, h) * (1 - smoothstep(5, 6.5, h));
    this.sun.intensity = lerp(3.2, 1.2, dusk) * (1 - night);
    this.sun.color.setHSL(lerp(0.11, 0.06, dusk), lerp(0.35, 0.8, dusk), lerp(0.93, 0.7, dusk));
    this.scene.backgroundIntensity = lerp(1, 0.08, night) * lerp(1, 0.75, dusk);
    this.scene.environmentIntensity = lerp(0.4, 0.15, night);
    this.hemi.intensity = lerp(0.35, 0.18, night);
    const lampOn = smoothstep(17.3, 18.5, h);
    this.lampGlass.emissiveIntensity = lampOn * 3;
    for (const l of this.streetLamps) l.intensity = lampOn * 30;
    this.windowGlow.emissiveIntensity = lampOn * 0.6;
  }

  update(dt: number, agentPositions: THREE.Vector3[]) {
    // ドアの自動開閉
    let near = false;
    for (const p of agentPositions) if (Math.abs(p.x - DOOR.x) < 1.3 && Math.abs(p.z - DOOR.z) < 1.9) near = true;
    const target = near ? -Math.PI * 0.55 : 0;
    const prev = this.doorAngle;
    this.doorAngle += (target - this.doorAngle) * Math.min(1, dt * 6);
    this.door.rotation.y = this.doorAngle;
    if (Math.abs(prev) < 0.05 && Math.abs(this.doorAngle) >= 0.05) this.onDoorOpen?.();
    // 車
    for (const c of this.cars) {
      const dir = c.lane ? 1 : -1;
      c.obj.position.x += dir * c.speed * dt;
      if (c.obj.position.x > 50) c.obj.position.x = -50;
      if (c.obj.position.x < -50) c.obj.position.x = 50;
    }
  }

  onDoorOpen: (() => void) | null = null;
}
