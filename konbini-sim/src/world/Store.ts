import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Assets, ExtId } from '../core/Assets';
import { Slot, TagAtlas } from '../game/Slot';
import type { Zone } from '../data/products';
import { Collision } from './Collision';
import { L, P, V } from './Layout';
import { Materials, box, plane } from './Materials';
import { Nav } from './Nav';
import { canvas, fitText } from './Textures';
import { batchStatic } from './Batch';

export interface FridgeUnit {
  root: THREE.Object3D;
  door: THREE.Object3D | null;
  openT: number;
  target: number;
  hold: number;
}

/**
 * Builds the whole convenience store: shell, fixtures, lighting and the
 * exterior lot. Exposes slots, colliders, nav grid and anchor objects that the
 * gameplay systems hook into.
 */
export class Store {
  readonly root = new THREE.Group();
  readonly m: Materials;
  readonly col = new Collision();
  readonly nav = new Nav();
  readonly slots: Slot[] = [];
  readonly fridges: FridgeUnit[] = [];
  readonly interior = new THREE.Group();
  readonly exterior = new THREE.Group();
  /** Pickable static objects (register, PC, fryer …) keyed by role. */
  readonly anchors: Record<string, THREE.Object3D> = {};
  /** Surfaces boxes can be put down on (floor, racks, counters). */
  readonly placeSurfaces: THREE.Object3D[] = [];
  doorPanels: THREE.Mesh[] = [];
  doorOpen = 0;
  interiorLights: THREE.Light[] = [];
  exteriorNightLights: THREE.Light[] = [];
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  windowSpill!: THREE.RectAreaLight;
  signMaterials: THREE.MeshStandardMaterial[] = [];
  vendingMaterials: THREE.MeshStandardMaterial[] = [];
  streetLampMats: THREE.MeshStandardMaterial[] = [];
  neighbourWindowMats: THREE.MeshStandardMaterial[] = [];
  registerScreen!: THREE.CanvasTexture;
  registerScreenCanvas!: HTMLCanvasElement;
  pcScreen!: THREE.CanvasTexture;
  pcScreenCanvas!: HTMLCanvasElement;
  batched = 0;

  constructor(private assets: Assets) {
    RectAreaLightUniformsLib.init();
    this.m = new Materials(assets.textures);
    this.root.add(this.interior, this.exterior);
    this.buildShell();
    this.buildLights();
    this.buildGondolas();
    this.buildOpenCase();
    this.buildFridges();
    this.buildIceChest();
    this.buildWallShelf();
    this.buildMagazineRack();
    this.buildCounter();
    this.buildBackroom();
    this.buildEntranceExtras();
    this.buildExterior();
    this.root.updateMatrixWorld(true);
    // Flatten placement surfaces to meshes before batching detaches them
    // (detached meshes keep a valid matrixWorld, so ray casts still work).
    const flat: THREE.Object3D[] = [];
    for (const s of this.placeSurfaces) {
      s.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !o.userData.slot && (mesh.material as THREE.Material).visible !== false) flat.push(o);
      });
    }
    this.placeSurfaces.length = 0;
    this.placeSurfaces.push(...flat);
    this.batched = batchStatic(this.interior, this.interior) + batchStatic(this.exterior, this.exterior);
    TagAtlas.ensure();
    for (const s of this.slots) s.finalizeTag();
    TagAtlas.build(this.interior);
    this.nav.build(this.col, [
      { minX: L.staffArea.minX - 0.05, maxX: 20, minZ: -5.2, maxZ: 5 },
      { minX: -20, maxX: 20, minZ: -20, maxZ: -5.05 },
    ]);
  }

  // ------------------------------------------------------------------ shell

  private buildShell() {
    const m = this.m;
    const g = this.interior;
    const { minX, maxX, minZ, maxZ } = L.floor;
    const W = maxX - minX;
    // sales floor
    const fl = plane(g, W, maxZ - minZ, m.floor, V(0, 0, (minZ + maxZ) / 2), new THREE.Euler(-Math.PI / 2, 0, 0), 1.2);
    fl.name = 'floor';
    this.placeSurfaces.push(fl);
    // back room floor
    const bf = plane(g, W, L.back.maxZ - L.back.minZ + 0.2, m.backFloor, V(0, 0.001, (L.back.minZ + L.back.maxZ) / 2 - 0.05), new THREE.Euler(-Math.PI / 2, 0, 0), 2);
    this.placeSurfaces.push(bf);
    // ceilings
    plane(g, W, maxZ - minZ, m.ceiling, V(0, L.ceiling, 0), new THREE.Euler(Math.PI / 2, 0, 0), 0.6);
    plane(g, W, L.back.maxZ - L.back.minZ, m.ceiling, V(0, L.backCeiling, (L.back.minZ + L.back.maxZ) / 2), new THREE.Euler(Math.PI / 2, 0, 0), 0.6);
    const t = L.wallT;
    // side walls (full depth incl. back room)
    for (const sx of [minX - t / 2, maxX + t / 2]) {
      box(g, t, L.ceiling, maxZ - L.back.minZ + t, m.wall, sx, 0, (maxZ + L.back.minZ) / 2, { uvScale: 1 });
      this.col.addBox(sx, (maxZ + L.back.minZ) / 2, t, maxZ - L.back.minZ + t, 'wall');
    }
    // back wall of back room
    box(g, W + 2 * t, L.ceiling, t, m.wallBack, 0, 0, L.back.minZ - t / 2, { uvScale: 1 });
    this.col.addBox(0, L.back.minZ - t / 2, W + 2 * t, t, 'wall');
    // partition between floor and back room, with staff door opening
    const pz = -5.08;
    const d = L.staffDoor;
    const leftW = d.minX - minX;
    box(g, leftW, L.ceiling, t, m.wall, minX + leftW / 2, 0, pz, { uvScale: 1 });
    this.col.addBox(minX + leftW / 2, pz, leftW, t, 'wall');
    const rightW = maxX - d.maxX;
    box(g, rightW, L.ceiling, t, m.wall, d.maxX + rightW / 2, 0, pz, { uvScale: 1 });
    this.col.addBox(d.maxX + rightW / 2, pz, rightW, t, 'wall');
    box(g, d.maxX - d.minX, L.ceiling - 2.1, t, m.wall, (d.minX + d.maxX) / 2, 2.1, pz);
    // staff door leaf (half open swing door with window) + sign
    const leaf = new THREE.Group();
    leaf.position.set(d.minX + 0.02, 0, pz - 0.02);
    leaf.rotation.y = -1.25;
    box(leaf, 0.96, 2.05, 0.04, m.steel, 0.48, 0, 0);
    box(leaf, 0.3, 0.3, 0.05, m.glass, 0.48, 1.45, 0, { cast: false });
    g.add(leaf);
    this.signPlate(g, '関係者以外立入禁止', V((d.minX + d.maxX) / 2, 2.3, pz + 0.09), 0, 0.9, 0.16, '#fff', '#c62828');
    // kick plates along walls
    box(g, W, 0.1, 0.01, m.steel, 0, 0, pz + 0.08, { cast: false });

    // front: glazing with mullions, entrance gap
    const fz = L.floor.maxZ;
    const e = L.entrance;
    const glassRun = (x0: number, x1: number) => {
      const w = x1 - x0;
      box(g, w, 2.35, 0.02, m.glass, (x0 + x1) / 2, 0.35, fz, { cast: false, receive: false });
      box(g, w, 0.35, 0.18, m.frame, (x0 + x1) / 2, 0, fz); // sill
      box(g, w, 0.1, 0.18, m.frame, (x0 + x1) / 2, 2.7, fz);
      for (let x = x0; x <= x1 + 0.01; x += w / Math.max(1, Math.round(w / 1.8))) box(g, 0.07, 2.35, 0.16, m.frame, x, 0.35, fz);
      this.col.addBox((x0 + x1) / 2, fz, w, 0.2, 'glass');
    };
    glassRun(minX, e.minX);
    glassRun(e.maxX, maxX);
    box(g, e.maxX - e.minX, 0.6, 0.2, m.frame, (e.minX + e.maxX) / 2, 2.2, fz);
    // automatic sliding door panels
    for (let i = 0; i < 2; i++) {
      const pw = (e.maxX - e.minX) / 2 + 0.03;
      const panel = new THREE.Group();
      const gl = box(panel, pw - 0.08, 2.08, 0.015, m.glass, 0, 0.06, 0, { cast: false, receive: false });
      box(panel, pw, 0.06, 0.05, m.frame, 0, 0, 0);
      box(panel, pw, 0.06, 0.05, m.frame, 0, 2.14, 0);
      box(panel, 0.05, 2.2, 0.05, m.frame, -pw / 2, 0, 0);
      box(panel, 0.05, 2.2, 0.05, m.frame, pw / 2, 0, 0);
      box(panel, 0.28, 0.12, 0.02, this.textMat('自動ドア', '#fff', '#128a5a', 256, 110), 0, 1.1, 0.02, { cast: false });
      panel.position.set(i === 0 ? e.minX + pw / 2 : e.maxX - pw / 2, 0, fz - 0.03 + i * 0.05);
      panel.userData.baseX = panel.position.x;
      panel.userData.noMerge = true;
      panel.userData.dir = i === 0 ? -1 : 1;
      g.add(panel);
      this.doorPanels.push(gl);
      gl.userData.panel = panel;
    }
    // door sensor
    box(g, 0.3, 0.08, 0.1, m.blackPlastic, (e.minX + e.maxX) / 2, 2.12, fz - 0.12);

    // bulkhead with posters over the windows inside
    this.poster(g, V(3.2, 1.9, fz - 0.03), Math.PI, 1.1, 0.8, 'からあげ棒', '揚げたてジューシー!', '#e53935', '¥150');
    this.poster(g, V(-6.2, 1.9, fz - 0.03), Math.PI, 0.9, 0.7, 'おにぎり100円引', '毎週金曜', '#1e88e5', 'SALE');
    // wall posters
    this.poster(g, V(minX + 0.08, 2.15, -4.3), Math.PI / 2, 0.8, 0.5, 'ドリンク', 'よく冷えてます', '#00897b', '');
    this.poster(g, V(maxX - 0.05, 2.25, 2.2), -Math.PI / 2, 1.3, 0.35, 'タバコは販売しておりません', '', '#455a64', '');
  }

  private textMat(text: string, fg: string, bg: string, W = 512, H = 128, font = '"Noto Sans JP"', weight = '900'): THREE.MeshStandardMaterial {
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, text, W / 2, H / 2, W * 0.92, H * 0.6, weight, `${font}, sans-serif`);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  }

  private signPlate(g: THREE.Object3D, text: string, pos: THREE.Vector3, rotY: number, w: number, h: number, fg: string, bg: string) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.textMat(text, fg, bg, 512, Math.round((512 * h) / w)));
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    g.add(mesh);
    return mesh;
  }

  private poster(g: THREE.Object3D, pos: THREE.Vector3, rotY: number, w: number, h: number, title: string, sub: string, col: string, badge: string) {
    const W = 512;
    const H = Math.round((512 * h) / w);
    const [c, ctx] = canvas(W, H);
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, col);
    grd.addColorStop(1, '#222');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, 20 + Math.random() * 80, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, title, W / 2, H * (sub ? 0.38 : 0.5), W * 0.9, H * 0.3, '900');
    if (sub) {
      ctx.fillStyle = '#ffeb3b';
      fitText(ctx, sub, W / 2, H * 0.7, W * 0.85, H * 0.14, '700');
    }
    if (badge) {
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(W - 70, 70, 56, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#c62828';
      fitText(ctx, badge, W - 70, 72, 96, 36, '900');
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 }));
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    g.add(mesh);
  }

  // ------------------------------------------------------------------ lights

  private buildLights() {
    const g = this.interior;
    // Fluorescent / LED troffers in rows
    const rows = [-3.4, -1.05, 1.3, 3.7];
    const panelGeo = new THREE.BoxGeometry(1.2, 0.03, 0.45);
    for (const z of rows) {
      for (let x = -5.6; x <= 5.7; x += 2.25) {
        const p = new THREE.Mesh(panelGeo, this.m.lightPanel);
        p.position.set(x, L.ceiling - 0.015, z);
        g.add(p);
      }
      const ra = new THREE.RectAreaLight('#fff6ea', 5.2, 12.5, 0.6);
      ra.position.set(0, L.ceiling - 0.05, z);
      ra.lookAt(0, 0, z);
      g.add(ra);
      this.interiorLights.push(ra);
    }
    // back room
    for (const x of [-3.5, 2.5]) {
      const p = new THREE.Mesh(panelGeo, this.m.lightPanel);
      p.position.set(x, L.backCeiling - 0.015, -6.9);
      g.add(p);
    }
    const bl = new THREE.RectAreaLight('#fff1dc', 4.0, 10, 0.5);
    bl.position.set(0, L.backCeiling - 0.05, -6.9);
    bl.lookAt(0, 0, -6.9);
    g.add(bl);
    this.interiorLights.push(bl);

    // soft fill so shadows never go black
    this.hemi = new THREE.HemisphereLight('#fdfbf6', '#8d8a82', 0.55);
    this.root.add(this.hemi);

    // A single shadow-casting key light from above the aisles adds contact
    // shadows under people and fixtures.
    const key = new THREE.SpotLight('#fff8ee', 5, 14, 1.4, 1.0, 1.2);
    key.position.set(-0.5, L.ceiling + 1.2, 0.8);
    key.target.position.set(-0.5, 0, 0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 8;
    g.add(key, key.target);
    this.interiorLights.push(key);

    // sun / moon
    this.sun = new THREE.DirectionalLight('#fff4e0', 3);
    this.sun.position.set(-18, 25, 20);
    this.sun.target.position.set(0, 0, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 18;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.root.add(this.sun, this.sun.target);

    // light spilling out of the shop windows at night
    this.windowSpill = new THREE.RectAreaLight('#fff3dd', 0, 14, 2.4);
    this.windowSpill.position.set(0, 1.4, 5.25);
    this.windowSpill.lookAt(0, 0.2, 12);
    this.exterior.add(this.windowSpill);
  }

  // ------------------------------------------------------------------ fixtures

  private addSlot(zone: Zone, parent: THREE.Object3D, w: number, d: number, h: number, pos: THREE.Vector3, rotY: number, level: number, name: string, tilt = 0, tag = true): Slot {
    parent.updateWorldMatrix(true, false);
    const s = new Slot(zone, w, d, h, parent, pos, rotY, level, tilt, tag);
    s.fixtureName = name;
    this.slots.push(s);
    return s;
  }

  /** Place an external model (static clone). Collision from its world bounds when `collide`. */
  private model(id: ExtId, parent: THREE.Object3D, pos: THREE.Vector3, rotY = 0, scale: number | THREE.Vector3 = 1, opts: { collide?: string; cast?: boolean; name?: string } = {}): THREE.Object3D {
    const gl = this.assets.ext.get(id);
    const o = gl ? gl.scene.clone(true) : new THREE.Group();
    o.position.copy(pos);
    o.rotation.y = rotY;
    if (typeof scale === 'number') o.scale.setScalar(scale);
    else o.scale.copy(scale);
    o.name = opts.name ?? id;
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = opts.cast ?? true;
        mesh.receiveShadow = true;
      }
    });
    parent.add(o);
    if (opts.collide) {
      o.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(o);
      this.col.add({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, tag: opts.collide });
    }
    return o;
  }

  /**
   * Island gondolas: SIGVerse wire-mesh gondola (2.7 m, three levels a side)
   * with an end-cap rack on each end.
   */
  private buildGondolas() {
    const levels = [0.08, 0.51, 0.94];
    const capLevels = [0.07, 0.5, 0.93];
    const half = 1.357;
    L.gondolas.forEach((gd, gi) => {
      const g = new THREE.Group();
      g.position.set(gd.cx, 0, gd.cz);
      this.interior.add(g);
      this.model('gondola', g, V(0, 0, 0));
      this.model('endcap', g, V(half + 0.03, 0, 0), Math.PI / 2);
      this.model('endcap', g, V(-half - 0.03, 0, 0), -Math.PI / 2);
      g.updateWorldMatrix(true, true);
      for (const side of [1, -1]) {
        levels.forEach((y, li) => {
          const slotH = (levels[li + 1] ?? 1.34) - y - 0.03;
          for (let b = 0; b < 4; b++) {
            const x = -half + 0.34 + b * 0.67;
            this.addSlot('shelf', g, 0.64, 0.4, slotH, V(x, y + 0.005, side * 0.445), side > 0 ? 0 : Math.PI, li, `ゴンドラ${gi + 1}`);
          }
        });
      }
      for (const ex of [1, -1]) {
        capLevels.forEach((y, li) => {
          const slotH = (capLevels[li + 1] ?? 1.3) - y - 0.03;
          this.addSlot('shelf', g, 0.84, 0.4, slotH, V(ex * (half + 0.03 + 0.445), y + 0.005, 0), ex > 0 ? Math.PI / 2 : -Math.PI / 2, li, `エンド${gi + 1}`);
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), this.textMat(['お菓子・パン', 'カップ麺・食品', '日用品・雑貨'][gi], '#fff', '#128a5a', 512, 128));
        sign.position.set(ex * (half + 0.49), 1.42, 0);
        sign.rotation.y = ex * Math.PI / 2;
        g.add(sign);
      }
      // hanging aisle sign
      const hs = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.26), this.textMat(['お菓子 / パン', 'カップ麺 / 食品', '日用品 / 雑貨'][gi], '#fff', '#128a5a', 512, 120));
      hs.position.set(gd.cx, 2.35, gd.cz);
      this.interior.add(hs);
      const hs2 = hs.clone();
      hs2.rotation.y = Math.PI;
      this.interior.add(hs2);
      box(this.interior, 0.01, 0.4, 0.01, this.m.frame, gd.cx - 0.4, 2.48, gd.cz, { cast: false });
      box(this.interior, 0.01, 0.4, 0.01, this.m.frame, gd.cx + 0.4, 2.48, gd.cz, { cast: false });
      this.col.addBox(gd.cx, gd.cz, 2 * (half + 0.5), 0.92, 'gondola');
      this.placeSurfaces.push(g);
    });
  }

  /** Multi-deck refrigerated open cases along the west wall (SIGVerse CVK series). */
  private buildOpenCase() {
    const units: { id: ExtId; w: number }[] = [
      { id: 'opencase_wide', w: 1.879 }, { id: 'opencase_wide', w: 1.879 }, { id: 'opencase_wide', w: 1.879 }, { id: 'opencase_narrow', w: 0.94 },
    ];
    // board heights, their front edge (local z) and usable depth
    const levels: [number, number, number][] = [
      [0.31, 0.55, 0.5], [0.63, 0.4, 0.36], [0.82, 0.38, 0.36], [1.0, 0.37, 0.36], [1.19, 0.35, 0.35], [1.37, 0.33, 0.35], [1.55, 0.31, 0.34],
    ];
    let z = -3.9;
    const cx = L.floor.minX + 0.19;
    units.forEach((u, ui) => {
      const g = new THREE.Group();
      g.position.set(cx, 0, z + u.w / 2);
      g.rotation.y = Math.PI / 2; // model front (+z) faces into the store (+x)
      this.interior.add(g);
      this.model(u.id, g, V(0, 0, 0));
      g.updateWorldMatrix(true, true);
      const perRow = u.w > 1 ? 2 : 1;
      levels.forEach(([y, front, depth], li) => {
        const slotH = (levels[li + 1]?.[0] ?? 1.76) - y - 0.02;
        for (let b = 0; b < perRow; b++) {
          const x = perRow === 2 ? (b - 0.5) * 0.89 : 0;
          this.addSlot('chilled', g, 0.84, depth - 0.02, slotH, V(x, y + 0.012, front), 0, li, '冷蔵オープンケース');
        }
      });
      if (ui === 0) this.anchors.openCase = g;
      z += u.w;
    });
    const total = z + 3.9;
    this.col.addBox(L.floor.minX + 0.4, -3.9 + total / 2, 0.8, total, 'opencase');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.22), this.textMat('おにぎり・お弁当・サンドイッチ・デザート', '#fff', '#e8423a', 1024, 76));
    sign.position.set(L.floor.minX + 0.02, 2.2, -3.9 + total / 2);
    sign.rotation.y = Math.PI / 2;
    this.interior.add(sign);
    // cold light spill from the case canopies
    const cl = new THREE.RectAreaLight('#e8f4ff', 3, total, 0.1);
    cl.position.set(L.floor.minX + 0.5, 1.75, -3.9 + total / 2);
    cl.lookAt(L.floor.minX + 0.5, 0, -3.9 + total / 2);
    this.interior.add(cl);
  }

  private buildFridges() {
    const gl = this.assets.props.get('fridge');
    const n = 7;
    const pitch = 0.86;
    const xStart = -6.05;
    const zc = -4.95 + 0.47;
    for (let i = 0; i < n; i++) {
      const x = xStart + i * pitch;
      const root = gl ? SkeletonUtils.clone(gl.scene) : new THREE.Group();
      root.userData.noMerge = true;
      root.position.set(x, 0, zc);
      this.interior.add(root);
      let door: THREE.Object3D | null = null;
      root.traverse((o) => {
        if (o.name === 'FridgeDoor') door = o;
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          const mat = mesh.material as THREE.MeshPhysicalMaterial;
          if (mat.name === 'FridgeGlass') mesh.material = this.m.glass;
          if (mat.name === 'FridgeInterior') {
            mat.emissiveIntensity = 1.6;
          }
        }
      });
      const unit: FridgeUnit = { root, door, openT: 0, target: 0, hold: 0 };
      this.fridges.push(unit);
      const levels = [0.46, 0.8, 1.14, 1.48, 1.82];
      levels.forEach((y, li) => {
        const s = this.addSlot('fridge', root, 0.72, 0.62, 0.3, V(-0.033, y, 0.33), 0, li, `ドリンク冷蔵庫${i + 1}`);
        s.onTouch = () => {
          unit.target = 1;
          unit.hold = 1.6;
        };
      });
      // fridge wire shelves
      for (const y of levels) box(root, 0.78, 0.012, 0.66, this.m.shelfMetal, -0.033, y - 0.012, 0.0, { cast: false });
      this.col.addBox(x - 0.033, zc, 0.86, 0.94, 'fridge');
    }
    // header sign over fridges
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.3), this.textMat('ソフトドリンク ・ お茶 ・ お酒', '#fff', '#1565c0', 1024, 52));
    sign.position.set(xStart + (n - 1) * pitch * 0.5, 2.45, -4.94);
    this.interior.add(sign);
    box(this.interior, 6.1, 0.4, 0.08, this.m.shelfDark, xStart + (n - 1) * pitch * 0.5, 2.25, -4.98, { cast: false });
  }

  /** Chest freezer for ice cream (SIGVerse IMC series). */
  private buildIceChest() {
    const g = new THREE.Group();
    g.position.set(1.55, 0, -4.45);
    this.interior.add(g);
    this.model('ice_chest', g, V(0, 0.515, 0));
    g.updateWorldMatrix(true, true);
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 0.43 : -0.43;
      const zf = i < 2 ? 0.38 : 0.0;
      this.addSlot('freezer', g, 0.8, 0.36, 0.28, V(x, 0.52, zf), 0, 0, 'アイスケース');
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), this.textMat('アイスクリーム', '#fff', '#0288d1', 512, 110));
    sign.position.set(0, 1.3, -0.44);
    g.add(sign);
    box(g, 0.03, 0.4, 0.03, this.m.frame, 0, 0.9, -0.44);
    this.col.addBox(1.55, -4.45, 1.84, 0.94, 'ice');
  }

  /** Daily-goods shelving against the staff partition: gondola + end cap, one side used. */
  private buildWallShelf() {
    const g = new THREE.Group();
    g.position.set(L.staffArea.minX - 0.48, 0, -3.0);
    g.rotation.y = -Math.PI / 2; // shoppable side (+z) faces -x
    this.interior.add(g);
    this.model('gondola', g, V(0, 0, 0));
    this.model('endcap', g, V(1.357 + 0.03, 0, 0), Math.PI / 2);
    g.updateWorldMatrix(true, true);
    const levels = [0.08, 0.51, 0.94];
    levels.forEach((y, li) => {
      const slotH = (levels[li + 1] ?? 1.34) - y - 0.03;
      for (let b = 0; b < 4; b++) this.addSlot('shelf', g, 0.64, 0.4, slotH, V(-1.357 + 0.34 + b * 0.67, y + 0.005, 0.445), 0, li, '壁面棚');
    });
    [0.07, 0.5, 0.93].forEach((y, li) => this.addSlot('shelf', g, 0.84, 0.4, 0.4, V(1.357 + 0.475, y + 0.005, 0), Math.PI / 2, li, '壁面棚'));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.24), this.textMat('日用品', '#fff', '#128a5a', 512, 90));
    sign.position.set(0, 1.62, 0.02);
    g.add(sign);
    this.col.addBox(L.staffArea.minX - 0.48, -2.78, 0.92, 3.3, 'wallshelf');
    this.placeSurfaces.push(g);
  }

  /** Wire magazine racks along the front window (SIGVerse CVS magazine rack). */
  private buildMagazineRack() {
    const n = 6;
    const w = 0.89;
    const x0 = -2.9 + w / 2;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.position.set(x0 + i * w, 0, L.floor.maxZ - 0.06);
      g.rotation.y = Math.PI; // faces -z (into the store)
      this.interior.add(g);
      this.model('magazine_rack', g, V(0, 0.338, 0));
      g.updateWorldMatrix(true, true);
      // magazines lean against the stepped, slanted tiers
      [[0.9, 0.4], [1.12, 0.33], [1.34, 0.26]].forEach(([y, z], li) => this.addSlot('magazine', g, 0.84, 0.28, 0.04, V(0, y, z), 0, li + 1, '雑誌ラック', 1.12));
      if (i === 0) this.anchors.magazineRack = g;
    }
    this.col.addBox(x0 - w / 2 + (n * w) / 2, L.floor.maxZ - 0.3, n * w, 0.48, 'magazine');
  }

  private buildCounter() {
    const m = this.m;
    const c = L.counter;
    const g = this.interior;
    const len = c.maxZ - c.minZ;
    const cz = (c.minZ + c.maxZ) / 2;
    const cx = (c.minX + c.maxX) / 2;
    const w = c.maxX - c.minX;
    // body with branded front panel
    box(g, w, c.h - 0.05, len, m.whitePlastic, cx, 0, cz);
    box(g, 0.02, 0.12, len, m.brandGreen, c.minX - 0.005, 0.72, cz, { cast: false });
    box(g, 0.02, 0.05, len, m.brandOrange, c.minX - 0.005, 0.66, cz, { cast: false });
    box(g, 0.02, 0.05, len, m.brandRed, c.minX - 0.005, 0.61, cz, { cast: false });
    box(g, 0.02, 0.1, len, m.steel, c.minX - 0.005, 0, cz, { cast: false });
    const top = box(g, w + 0.12, 0.05, len + 0.04, m.wood, cx - 0.04, c.h - 0.05, cz);
    top.name = 'counterTop';
    this.placeSurfaces.push(top);
    this.col.addBox(cx, cz, w, len, 'counter');
    // register A (active) and B (idle)
    const regA = this.buildRegister(V(c.maxX - 0.24, c.h, L.register.z), true);
    this.anchors.register = regA;
    this.buildRegister(V(c.maxX - 0.24, c.h, 1.7), false);
    // item drop zone marker (rubber mat) where customers put their shopping
    const mat = box(g, 0.46, 0.006, 0.62, m.rubber, c.minX + 0.3, c.h, L.register.z - 0.62, { cast: false });
    mat.name = 'counterMat';
    mat.userData.noMerge = true;
    this.anchors.counterMat = mat;
    // bagging area
    this.anchors.bagArea = new THREE.Object3D();
    this.anchors.bagArea.position.set(c.minX + 0.3, c.h, L.register.z + 0.55);
    g.add(this.anchors.bagArea);
    // hot snack case on the counter
    this.buildHotCase(V(cx - 0.03, c.h, 0.62));
    // tray of plastic bags & cash tray
    box(g, 0.22, 0.02, 0.16, m.blackPlastic, c.minX + 0.14, c.h, L.register.z + 0.35, { cast: false });
    // back counter: four stainless under-counter cabinets (SIGVerse YRC series)
    const bc = L.backCounter;
    const bcz = (bc.minZ + bc.maxZ) / 2;
    const cabX = L.floor.maxX - 0.34;
    const topY = 0.835;
    for (let i = 0; i < 4; i++) {
      const z = bc.minZ + 0.6025 + i * 1.205;
      const cab = new THREE.Group();
      cab.position.set(cabX, 0, z);
      cab.rotation.y = -Math.PI / 2; // doors face the staff aisle (-x)
      g.add(cab);
      this.model('back_cabinet', cab, V(0, 0, 0));
      if (i === 0) {
        // the first cabinet is the freezer stocker for hot-snack stock
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.09), this.textMat('冷凍ストッカー', '#fff', '#0277bd', 512, 100));
        lab.position.set(0, 0.62, 0.34);
        cab.add(lab);
        cab.userData.interact = 'stocker';
        cab.traverse((o) => (o.userData.interactRoot = cab));
        this.anchors.stocker = cab;
      }
    }
    const btop = box(g, 0.66, 0.004, bc.maxZ - bc.minZ, m.steel, cabX - 0.01, topY, bcz, { cast: false });
    this.placeSurfaces.push(btop);
    this.col.addBox(cabX, bcz, 0.66, bc.maxZ - bc.minZ, 'backcounter');
    this.buildFryer(V(cabX - 0.02, topY, 0.05));
    // coffee machine and microwave on the back counter
    this.model('coffee_machine', g, V(cabX + 0.05, topY, 2.2), -Math.PI / 2);
    this.model('coffee_machine', g, V(cabX + 0.05, topY, 2.5), -Math.PI / 2);
    this.model('microwave', g, V(cabX + 0.02, topY, 3.45), -Math.PI / 2);
    this.model('potted_plant', g, V(c.minX + 0.12, c.h, 3.72), 0.4);
    // cigarette-style display wall above back counter (decor: lottery/ gift cards)
    const rack = new THREE.Group();
    rack.position.set(L.floor.maxX - 0.12, 1.25, 2.4);
    rack.rotation.y = -Math.PI / 2;
    g.add(rack);
    box(rack, 2.6, 1.1, 0.2, m.shelfDark, 0, 0, 0);
    const cardCols = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#6d4c41'];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 14; i++) {
        const cmat = new THREE.MeshStandardMaterial({ color: cardCols[(r * 3 + i) % cardCols.length], roughness: 0.3 });
        box(rack, 0.14, 0.2, 0.01, cmat, -1.17 + i * 0.18, 0.06 + r * 0.26, 0.105, { cast: false });
      }
    }
    this.signPlate(rack, 'ギフトカード・プリペイド', V(0, 1.2, 0.1), 0, 1.6, 0.16, '#fff', '#37474f');
    // register-area overhead sign
    this.signPlate(g, 'レジ', V(3.85, 2.4, L.register.z), -Math.PI / 2, 0.6, 0.25, '#fff', '#e8423a');
    this.signPlate(g, 'レジ', V(3.85, 2.4, L.register.z), Math.PI / 2, 0.6, 0.25, '#fff', '#e8423a');
    box(g, 0.02, 0.3, 0.02, m.frame, 3.85, 2.52, L.register.z, { cast: false });
    // floor queue markers
    for (const q of P.queue.slice(0, 3)) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), new THREE.MeshStandardMaterial({ map: this.footprintTex(), transparent: true, roughness: 0.6, depthWrite: false }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(q.x, 0.003, q.z);
      g.add(f);
    }
    // swing gate at the counter end
    const gate = box(g, 0.05, 0.9, 0.78, m.whitePlastic, L.staffArea.minX - 0.25, 0, -0.28);
    gate.rotation.y = 1.1;
    gate.position.x += 0.3;
    gate.position.z -= 0.2;
  }

  private footprintTex(): THREE.CanvasTexture {
    const [c, ctx] = canvas(128);
    ctx.fillStyle = 'rgba(255,193,7,0.85)';
    ctx.strokeStyle = 'rgba(255,193,7,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 116, 116);
    for (const [x, y] of [[44, 60], [84, 68]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 26, 0, 0, 7);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildRegister(pos: THREE.Vector3, active: boolean): THREE.Object3D {
    const m = this.m;
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = -Math.PI / 2; // staff faces -x … screen faces +x (staff side)
    this.interior.add(g);
    // cash register body (SIGVerse / numiteg, CC-BY 4.0)
    this.model('cash_register', g, V(0, 0, 0.02), Math.PI, 0.9);
    // staff touchscreen
    const [sc, sctx] = canvas(512, 384);
    sctx.fillStyle = '#1b4f7a';
    sctx.fillRect(0, 0, 512, 384);
    const st = new THREE.CanvasTexture(sc);
    st.colorSpace = THREE.SRGBColorSpace;
    const scrMat = new THREE.MeshStandardMaterial({ map: st, emissiveMap: st, emissive: '#ffffff', emissiveIntensity: active ? 0.9 : 0.25, roughness: 0.2 });
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.17, 0.015), [m.blackPlastic, m.blackPlastic, m.blackPlastic, m.blackPlastic, m.blackPlastic, scrMat]);
    scr.position.set(0.3, 0.4, 0.12);
    scr.rotation.set(0.3, -0.35, 0);
    g.add(scr);
    box(g, 0.03, 0.3, 0.03, m.blackPlastic, 0.3, 0.12, 0.08);
    // hand scanner in its cradle, next to the item mat
    box(g, 0.07, 0.05, 0.1, m.blackPlastic, 0.34, 0, 0.05);
    const gun = box(g, 0.05, 0.14, 0.06, m.blackPlastic, 0.34, 0.03, 0.05);
    gun.rotation.z = 0.3;
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.012), new THREE.MeshBasicMaterial({ color: '#ff1a1a' }));
    beam.position.set(0.36, 0.17, 0.081);
    g.add(beam);
    g.userData.interact = active ? 'register' : 'register_idle';
    g.traverse((o) => (o.userData.interactRoot = g));
    if (active) {
      this.registerScreen = st;
      this.registerScreenCanvas = sc;
    }
    return g;
  }

  private buildHotCase(pos: THREE.Vector3) {
    const m = this.m;
    const g = new THREE.Group();
    g.position.copy(pos);
    this.interior.add(g);
    const W = 0.62;
    const D = 0.72;
    const H = 0.5;
    box(g, W, 0.08, D, m.steel, 0, 0, 0);
    // heated glass box
    box(g, W - 0.02, H - 0.08, D - 0.02, new THREE.MeshPhysicalMaterial({ color: '#fff4dd', transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false }), 0, 0.08, 0, { cast: false, receive: false });
    box(g, W, 0.04, D, m.steel, 0, H, 0);
    const warm = box(g, W - 0.08, 0.01, D - 0.08, new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: '#ff8a2a', emissiveIntensity: 1.2 }), 0, H - 0.01, 0, { cast: false });
    warm.name = 'warmLamp';
    // two trays
    for (const y of [0.1, 0.27]) box(g, W - 0.06, 0.01, D - 0.06, m.steel, 0, y, 0, { cast: false });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.1), this.textMat('ホットスナック', '#fff', '#e53935', 512, 80));
    label.position.set(-W / 2 - 0.001, H - 0.06, 0);
    label.rotation.y = -Math.PI / 2;
    g.add(label);
    const pl = new THREE.PointLight('#ffb66b', 0.6, 1.2, 2);
    pl.position.set(0, H - 0.06, 0);
    g.add(pl);
    g.userData.interact = 'hotcase';
    g.traverse((o) => (o.userData.interactRoot = g));
    this.anchors.hotCase = g;
  }

  private buildFryer(pos: THREE.Vector3) {
    const m = this.m;
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = -Math.PI / 2; // front faces -x (towards staff area)
    this.interior.add(g);
    box(g, 0.62, 0.34, 0.5, m.steel, 0, 0, 0);
    // oil wells
    const oil = new THREE.MeshPhysicalMaterial({ color: '#b98a24', roughness: 0.05, clearcoat: 1, metalness: 0.1 });
    for (const x of [-0.15, 0.15]) {
      box(g, 0.24, 0.01, 0.3, oil, x, 0.3, 0.02, { cast: false });
      box(g, 0.26, 0.02, 0.32, m.frame, x, 0.33, 0.02, { cast: false });
    }
    // baskets (animated by the Fryer system)
    const baskets: THREE.Object3D[] = [];
    for (const x of [-0.15, 0.15]) {
      const b = new THREE.Group();
      b.position.set(x, 0.42, 0.02);
      const wire = new THREE.MeshStandardMaterial({ color: '#d0d3d6', metalness: 1, roughness: 0.3, wireframe: true });
      box(b, 0.22, 0.1, 0.26, wire, 0, -0.05, 0, { cast: false });
      box(b, 0.02, 0.02, 0.22, m.blackPlastic, 0, 0.03, -0.24, { cast: false });
      g.add(b);
      baskets.push(b);
    }
    // control panel display
    const [dc, dctx] = canvas(256, 64);
    dctx.fillStyle = '#021';
    dctx.fillRect(0, 0, 256, 64);
    const dt = new THREE.CanvasTexture(dc);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ map: dt, emissiveMap: dt, emissive: '#fff', emissiveIntensity: 1 }));
    disp.position.set(0, 0.2, 0.252);
    g.add(disp);
    // back splash + hood
    box(g, 0.66, 0.5, 0.03, m.steel, 0, 0.34, -0.25);
    g.userData.interact = 'fryer';
    g.userData.baskets = baskets;
    g.userData.display = { canvas: dc, tex: dt };
    g.traverse((o) => (o.userData.interactRoot = g));
    this.anchors.fryer = g;
  }

  private buildBackroom() {
    const m = this.m;
    const g = this.interior;
    const zb = L.back.minZ;
    // office desk + PC
    const desk = new THREE.Group();
    desk.position.set(5.6, 0, zb + 0.45);
    g.add(desk);
    const top = box(desk, 1.6, 0.04, 0.8, m.wood, 0, 0.72, 0);
    this.placeSurfaces.push(top);
    for (const [x, z] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) box(desk, 0.04, 0.72, 0.04, m.frame, x, 0, z);
    this.col.addBox(5.6, zb + 0.45, 1.6, 0.8, 'desk');
    const pc = new THREE.Group();
    pc.position.set(0, 0.76, -0.15);
    desk.add(pc);
    const [pcC, pcCtx] = canvas(640, 400);
    pcCtx.fillStyle = '#123';
    pcCtx.fillRect(0, 0, 640, 400);
    this.pcScreenCanvas = pcC;
    this.pcScreen = new THREE.CanvasTexture(pcC);
    this.pcScreen.colorSpace = THREE.SRGBColorSpace;
    const scrMat = new THREE.MeshStandardMaterial({ map: this.pcScreen, emissiveMap: this.pcScreen, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.2 });
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.03), [m.blackPlastic, m.blackPlastic, m.blackPlastic, m.blackPlastic, scrMat, m.blackPlastic]);
    mon.position.set(0, 0.33, 0);
    pc.add(mon);
    box(pc, 0.06, 0.14, 0.06, m.blackPlastic, 0, 0, 0);
    box(pc, 0.44, 0.02, 0.15, m.blackPlastic, 0, 0, 0.28); // keyboard
    box(pc, 0.06, 0.02, 0.1, m.blackPlastic, 0.32, 0, 0.3); // mouse
    pc.userData.interact = 'pc';
    pc.traverse((o) => (o.userData.interactRoot = pc));
    this.anchors.pc = pc;
    // stool + security monitor on the desk (Poly Haven, CC0)
    this.model('stool', g, V(5.4, 0, zb + 1.15), 0.3);
    this.model('crt_monitor', desk, V(-0.55, 0.74, -0.12), 0.35);
    this.model('power_box', g, V(6.93, 1.6, zb + 1.6), -Math.PI / 2);
    // ceiling fixtures
    for (const x of [-4.5, -1.5, 1.5, 4.5]) {
      const fl = this.model('fluorescent', g, V(x, L.backCeiling, -6.9), 0, 1, { cast: false });
      fl.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mm && /glass/.test(mm.name)) {
          const lit = mm.clone();
          lit.emissive.set('#fffaf0');
          lit.emissiveIntensity = 2.5;
          (o as THREE.Mesh).material = lit;
        }
      });
    }
    // storage racks (boxes can be stored here)
    for (let i = 0; i < 3; i++) {
      const rack = new THREE.Group();
      rack.position.set(-5.9 + i * 1.6, 0, zb + 0.35);
      g.add(rack);
      for (const y of [0.1, 0.9, 1.7]) {
        const s = box(rack, 1.5, 0.03, 0.6, m.shelfMetal, 0, y, 0);
        this.placeSurfaces.push(s);
      }
      for (const [x, z] of [[-0.73, -0.28], [0.73, -0.28], [-0.73, 0.28], [0.73, 0.28]]) box(rack, 0.035, 2.1, 0.035, m.shelfDark, x, 0, z);
      this.col.addBox(-5.9 + i * 1.6, zb + 0.35, 1.5, 0.6, 'rack');
      // stacked food crates (番重) and spare boxes on the racks
      this.model('crate', rack, V(-0.4, 0.93, 0), 0.05);
      this.model('crate', rack, V(-0.4, 1.19, 0), -0.05);
      if (i !== 1) this.model('crate', rack, V(0.35, 1.73, 0), 0.1);
      this.model('cardboard_box', rack, V(0.4, 0.93, -0.02), Math.PI / 2 + 0.1, 0.9);
    }
    // waste + cardboard bins
    const bin = new THREE.Group();
    bin.position.set(3.3, 0, -5.65);
    g.add(bin);
    box(bin, 0.55, 0.8, 0.45, new THREE.MeshStandardMaterial({ color: '#546e7a', roughness: 0.5 }), 0, 0, 0);
    box(bin, 0.57, 0.05, 0.47, m.blackPlastic, 0, 0.8, 0);
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.16), this.textMat('廃棄', '#fff', '#c62828', 256, 90));
    bl.position.set(0, 0.6, 0.226);
    bin.add(bl);
    bin.userData.interact = 'wastebin';
    bin.traverse((o) => (o.userData.interactRoot = bin));
    this.anchors.wasteBin = bin;
    this.col.addBox(3.3, -5.65, 0.55, 0.45, 'bin');
    const cb = new THREE.Group();
    cb.position.set(2.45, 0, -5.7);
    g.add(cb);
    box(cb, 0.8, 0.9, 0.5, new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.8 }), 0, 0, 0, {});
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.16), this.textMat('段ボール回収', '#fff', '#5d4037', 512, 130));
    cl.position.set(0, 0.7, 0.251);
    cb.add(cl);
    cb.userData.interact = 'cardboard';
    cb.traverse((o) => (o.userData.interactRoot = cb));
    this.anchors.cardboardBin = cb;
    this.col.addBox(2.45, -5.7, 0.8, 0.5, 'bin');
    // mop & bucket stand
    const mop = new THREE.Group();
    mop.position.set(-6.5, 0, -5.6);
    g.add(mop);
    box(mop, 0.4, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: '#fbc02d', roughness: 0.5 }), 0, 0, 0);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 8), m.frame);
    handle.position.set(0.05, 0.9, 0);
    handle.rotation.z = 0.12;
    mop.add(handle);
    const head = box(mop, 0.3, 0.08, 0.1, new THREE.MeshStandardMaterial({ color: '#90caf9', roughness: 1 }), 0, 0.28, 0);
    head.name = 'mopHead';
    mop.userData.interact = 'mop';
    mop.userData.movable = [handle, head];
    mop.traverse((o) => (o.userData.interactRoot = mop));
    this.anchors.mop = mop;
    // decor: time clock + notice board + sink
    this.poster(g, V(3.8, 1.6, zb + 0.01), 0, 1.0, 0.7, '本日の目標', '笑顔・清潔・品揃え', '#6d4c41', '');
    this.poster(g, V(-2.2, 1.7, -5.25), Math.PI, 0.9, 0.6, '5S 徹底!', '整理・整頓・清掃・清潔・しつけ', '#1565c0', '');
    const sink = new THREE.Group();
    sink.position.set(-0.8, 0, zb + 0.3);
    g.add(sink);
    box(sink, 0.8, 0.85, 0.5, m.steel, 0, 0, 0);
    this.col.addBox(-0.8, zb + 0.3, 0.8, 0.5, 'sink');
    // delivery marker on the floor
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshStandardMaterial({ color: '#ffca28', transparent: true, opacity: 0.35, roughness: 0.7, depthWrite: false }));
    dm.rotation.x = -Math.PI / 2;
    dm.position.set(P.deliveryDrop.x, 0.004, P.deliveryDrop.z);
    g.add(dm);
    this.signPlate(g, '納品置場', V(P.deliveryDrop.x, 1.9, zb + 0.02), 0, 0.8, 0.2, '#000', '#ffca28');
    // rear exit door (decor)
    box(g, 0.95, 2.05, 0.05, m.steel, 0.4, 0, zb + 0.03);
    this.signPlate(g, '非常口', V(0.4, 2.2, zb + 0.06), 0, 0.4, 0.13, '#fff', '#2e7d32');
  }

  private buildEntranceExtras() {
    const m = this.m;
    const g = this.interior;
    // entrance mat
    const [c, ctx] = canvas(512, 256);
    ctx.fillStyle = '#2d3a34';
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    ctx.fillStyle = '#9fd3b5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, 'WELCOME  いらっしゃいませ', 256, 128, 460, 40, '900');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(-4.5, 0.004, 4.4);
    g.add(mat);
    // shopping baskets stacked by the door (SIGVerse / kowbassen, CC-BY 4.0)
    for (let i = 0; i < 5; i++) this.model('basket', g, V(-3.28, 0.02 + i * 0.075, 4.62), Math.PI / 2 + (i % 2) * 0.04, 0.1, { cast: i === 4 });
    this.col.addBox(-3.28, 4.62, 0.3, 0.44, 'basket');
    // ATM (kavabanga, CC0) and a multifunction copier (thethieme, CC-BY 4.0) in the front corner
    this.model('atm', g, V(-5.78, 0, 4.6), Math.PI / 2, 1, { collide: 'atm' });
    this.model('copy_machine', g, V(-6.6, 0, 4.1), Math.PI / 2, 0.75, { collide: 'copier' });
    // umbrella stand outside the door
    box(this.exterior, 0.5, 0.55, 0.3, m.frame, -3.2, 0, 5.45);
  }

  // ------------------------------------------------------------------ exterior

  private buildExterior() {
    const m = this.m;
    const g = this.exterior;
    // lot + road
    const lotMat = m.asphalt;
    if (lotMat.map) {
      lotMat.map.repeat.set(10, 5);
      lotMat.roughnessMap!.repeat.set(10, 5);
    }
    const lot = plane(g, 60, 11, lotMat, V(0, -0.005, 10.5), new THREE.Euler(-Math.PI / 2, 0, 0));
    lot.name = 'lot';
    const road = plane(g, 120, 9, new THREE.MeshStandardMaterial({ map: lotMat.map?.clone() ?? null, color: '#8a8a8a', roughness: 0.95 }), V(0, -0.01, 21.5), new THREE.Euler(-Math.PI / 2, 0, 0));
    road.name = 'road';
    // sidewalk + curb
    box(g, 120, 0.12, 2, m.concrete, 0, -0.1, 17, { cast: false });
    box(g, 120, 0.14, 0.15, m.concrete, 0, -0.1, 16.05, { cast: false });
    box(g, 120, 0.14, 0.15, m.concrete, 0, -0.1, 17.95, { cast: false });
    plane(g, 120, 40, new THREE.MeshStandardMaterial({ color: '#2a2c2a', roughness: 1 }), V(0, -0.03, 0), new THREE.Euler(-Math.PI / 2, 0, 0));
    // road markings
    const white = new THREE.MeshStandardMaterial({ color: '#e8e8e2', roughness: 0.8 });
    for (let x = -58; x < 58; x += 6) box(g, 3, 0.005, 0.15, white, x, -0.005, 21.5, { cast: false });
    box(g, 120, 0.005, 0.12, white, 0, -0.005, 18.2, { cast: false });
    box(g, 120, 0.005, 0.12, white, 0, -0.005, 25.8, { cast: false });
    // parking bays
    for (let i = 0; i <= 8; i++) {
      const x = -12 + i * 2.6;
      if (x > -6.5 && x < -2.5) continue; // keep door approach free
      box(g, 0.1, 0.005, 5, white, x, -0.004, 8.9, { cast: false });
      if (i < 8 && !(x + 1.3 > -6.5 && x + 1.3 < -2.5)) {
        box(g, 1.4, 0.1, 0.15, m.concrete, x + 1.3, 0, 6.8, {});
      }
    }
    // store exterior shell
    const { minX, maxX } = L.floor;
    const t = L.wallT;
    const bz0 = L.back.minZ - t;
    const bz1 = L.floor.maxZ;
    // roof + fascia
    box(g, maxX - minX + 0.5, 0.35, bz1 - bz0 + 1.3, m.exteriorWall, 0, 3.45, (bz0 + bz1) / 2 + 0.4);
    const fasciaH = 0.75;
    box(g, maxX - minX + 0.5, fasciaH, 0.3, m.exteriorWall, 0, 2.75, bz1 + 1.0);
    // brand stripes
    box(g, maxX - minX + 0.52, 0.1, 0.02, m.brandGreen, 0, 2.75, bz1 + 1.16, { cast: false });
    box(g, maxX - minX + 0.52, 0.06, 0.02, m.brandOrange, 0, 2.87, bz1 + 1.16, { cast: false });
    box(g, maxX - minX + 0.52, 0.06, 0.02, m.brandRed, 0, 2.95, bz1 + 1.16, { cast: false });
    // canopy soffit
    box(g, maxX - minX + 0.5, 0.05, 1.05, m.paint, 0, 2.7, bz1 + 0.52, { cast: false });
    // signboard
    const [sc, sctx] = canvas(2048, 256);
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, 2048, 256);
    sctx.fillStyle = '#128a5a';
    sctx.fillRect(0, 0, 2048, 36);
    sctx.fillStyle = '#f39a1e';
    sctx.fillRect(0, 36, 2048, 18);
    sctx.fillStyle = '#e8423a';
    sctx.fillRect(0, 54, 2048, 14);
    sctx.fillStyle = '#0b6b44';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    fitText(sctx, 'まいにちマート', 1024, 165, 1500, 170, '400', '"Dela Gothic One", "Noto Sans JP"');
    sctx.fillStyle = '#e8423a';
    sctx.font = '900 44px "Noto Sans JP", sans-serif';
    sctx.fillText('24H', 1880, 160);
    sctx.fillText('MAINICHI', 170, 160);
    const stex = new THREE.CanvasTexture(sc);
    stex.colorSpace = THREE.SRGBColorSpace;
    stex.anisotropy = 8;
    const signMat = new THREE.MeshStandardMaterial({ map: stex, emissiveMap: stex, emissive: '#ffffff', emissiveIntensity: 0.2, roughness: 0.4, color: '#c8c8c8' });
    this.signMaterials.push(signMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), signMat);
    sign.position.set(0.8, 3.1, bz1 + 1.17);
    g.add(sign);
    // side & back exterior walls
    for (const sx of [minX - t - 0.01, maxX + t + 0.01]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(bz1 - bz0, 3.6), m.exteriorWall);
      w.position.set(sx, 1.8, (bz0 + bz1) / 2);
      w.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
      w.receiveShadow = true;
      g.add(w);
      box(g, 0.02, 0.1, bz1 - bz0, m.brandGreen, sx + (sx < 0 ? -0.01 : 0.01), 2.8, (bz0 + bz1) / 2, { cast: false });
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + 0.4, 3.6), m.exteriorWall);
    back.position.set(0, 1.8, bz0 - 0.01);
    back.rotation.y = Math.PI;
    g.add(back);
    // pillars under canopy
    for (const x of [minX - 0.05, maxX + 0.05]) box(g, 0.3, 2.7, 0.3, m.exteriorWall, x, 0, bz1 + 0.9);
    // canopy downlights
    for (const x of [-5.5, -2, 1.5, 5]) {
      const dl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), this.m.lightPanel);
      dl.position.set(x, 2.67, bz1 + 0.5);
      g.add(dl);
    }
    const canopySpot = new THREE.SpotLight('#fff2dc', 0, 9, 1.3, 0.8, 1.5);
    canopySpot.position.set(-4.5, 2.6, bz1 + 0.6);
    canopySpot.target.position.set(-4.5, 0, bz1 + 2.5);
    g.add(canopySpot, canopySpot.target);
    this.exteriorNightLights.push(canopySpot);

    // vending machines next to the entrance (classic!)
    for (let i = 0; i < 2; i++) this.vendingMachine(V(-6.2 + i * 0.95, 0, 5.72), i);
    this.col.addBox(-5.72, 5.72, 1.95, 0.75, 'vending');
    // trash bins outside
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      b.position.set(-2.9 + i * 0.5, 0, 5.55);
      g.add(b);
      box(b, 0.44, 0.9, 0.4, m.shelfMetal, 0, 0, 0);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.1), this.textMat(['もえるゴミ', 'カン・ビン', 'ペットボトル'][i], '#fff', ['#e53935', '#1e88e5', '#43a047'][i], 256, 70));
      lab.position.set(0, 0.7, 0.201);
      b.add(lab);
    }
    this.col.addBox(-2.4, 5.55, 1.5, 0.45, 'trash');
    // parked car + cones
    const car = this.assets.props.get('car');
    if (car) {
      const c = car.scene.clone();
      c.position.set(7.8, 0, 9.4);
      c.rotation.y = Math.PI;
      c.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) {
          mm.castShadow = true;
          mm.receiveShadow = true;
          const mat = mm.material as THREE.MeshPhysicalMaterial;
          mat.envMapIntensity = 1.6;
          if (mat.transmission) {
            mat.transmission = 0;
            mat.transparent = true;
            mat.opacity = 0.35;
          }
        }
      });
      g.add(c);
      this.col.addBox(7.8, 9.4, 2.2, 4.8, 'car');
    }
    const cone = this.assets.props.get('cone');
    if (cone) {
      const src = cone.scene.getObjectByName('Cone Normal');
      for (const [x, z] of [[12.4, 7.2], [12.9, 8.3], [-11, 13]]) {
        if (!src) break;
        const cc = src.clone();
        cc.position.set(x, 0, z);
        cc.rotation.set(-Math.PI / 2, 0, Math.random() * 3);
        cc.traverse((o) => ((o as THREE.Mesh).castShadow = true));
        const holder = new THREE.Group();
        holder.add(cc);
        cc.position.set(0, 0, 0);
        const b = new THREE.Box3().setFromObject(cc);
        cc.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
        holder.position.set(x, 0, z);
        g.add(holder);
      }
    }
    // street lights & utility poles
    for (const x of [-16, 16]) this.streetLight(V(x, 0, 16.4));
    for (const x of [-24, 0, 24]) this.utilityPole(V(x, 0, 17.8));
    // neighbourhood across the road
    this.neighbours();
    // hedge planters along lot sides
    const green = new THREE.MeshStandardMaterial({ color: '#2f4f2a', roughness: 0.95 });
    for (const x of [-14.5, 14.5]) {
      box(g, 0.8, 0.35, 10, m.concrete, x, 0, 10.5);
      const hedge = box(g, 0.7, 0.6, 9.8, green, x, 0.35, 10.5);
      hedge.scale.y = 1;
      this.col.addBox(x, 10.5, 0.8, 10, 'hedge');
    }
    // CC0 street furniture (Poly Haven)
    this.model('covered_car', g, V(-10.9, 0, 9.6), 0.02, 1, { collide: 'car2' });
    this.model('road_barrier', g, V(13.2, 0, 15.2), Math.PI / 2, 1, { collide: 'barrier' });
    this.model('road_barrier', g, V(-13.4, 0, 15.2), Math.PI / 2, 1, { collide: 'barrier' });
    for (const [x, z] of [[3.5, 21.3], [-19, 21.8], [9.5, 17.1]]) this.model('manhole', g, V(x, z > 20 ? -0.005 : 0.02, z), Math.random() * 3, 1, { cast: false });
    this.model('utility_box', g, V(L.floor.maxX + 0.45, 0, -2.2), -Math.PI / 2, 1, { collide: 'ubox' });
    for (const z of [-6.5, -1.5, 3.2]) {
      this.model('wall_light', g, V(L.floor.maxX + 0.17, 2.7, z), Math.PI / 2, 0.8);
      this.model('wall_light', g, V(L.floor.minX - 0.17, 2.7, z), -Math.PI / 2, 0.8);
    }
    this.model('trashbag', this.interior, V(3.95, 0, -5.55), 0.4, 1, { collide: 'bag' });
    this.model('trashbag', this.interior, V(4.35, 0, -5.8), 1.9, 0.85);
    // security cameras (shown once the upgrade is bought)
    const cams = new THREE.Group();
    cams.visible = false;
    cams.userData.noMerge = true;
    this.interior.add(cams);
    this.model('security_camera', cams, V(-6.8, 2.62, 4.8), Math.PI * 0.75);
    this.model('security_camera', cams, V(6.8, 2.62, -4.8), -Math.PI * 0.25);
    this.model('security_camera', cams, V(-6.8, 2.62, -4.8), -Math.PI * 0.75);
    this.anchors.securityCams = cams;

    // lot boundary to keep the player around the shop
    this.col.addBox(0, 18.7, 60, 0.3, 'bound');
    this.col.addBox(-15.2, 5, 0.3, 30, 'bound');
    this.col.addBox(15.2, 5, 0.3, 30, 'bound');
    this.col.addBox(0, -9.2, 40, 0.3, 'bound');
  }

  private vendingMachine(pos: THREE.Vector3, i: number) {
    const g = new THREE.Group();
    g.position.copy(pos);
    this.exterior.add(g);
    const bodyCol = i === 0 ? '#c62828' : '#1565c0';
    box(g, 0.9, 1.83, 0.7, new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.35, metalness: 0.2 }), 0, 0, 0);
    // lit display window with bottles
    const [c, ctx] = canvas(512, 384);
    ctx.fillStyle = '#f6f8fb';
    ctx.fillRect(0, 0, 512, 384);
    const cols = ['#b9c24a', '#2a120a', '#caa47c', '#2d8fd5', '#e53935', '#23252b', '#f6e34a', '#ffffff'];
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 8; k++) {
        const x = 20 + k * 60;
        const y = 20 + r * 125;
        ctx.fillStyle = cols[(k + r * 3) % cols.length];
        ctx.fillRect(x + 12, y + 18, 34, 70);
        ctx.fillStyle = '#ddd';
        ctx.fillRect(x + 20, y + 6, 18, 14);
        ctx.fillStyle = '#111';
        ctx.fillRect(x + 6, y + 94, 46, 16);
        ctx.fillStyle = '#4caf50';
        ctx.font = '700 12px sans-serif';
        ctx.fillText(`${[110, 130, 150, 160][k % 4]}`, x + 14, y + 107);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.4, roughness: 0.1 });
    this.vendingMaterials.push(disp);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.75), disp);
    d.position.set(0, 1.35, 0.351);
    g.add(d);
    box(g, 0.6, 0.18, 0.05, this.m.blackPlastic, 0, 0.18, 0.34);
    box(g, 0.12, 0.3, 0.03, this.m.frame, 0.28, 0.7, 0.35);
  }

  private streetLight(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    this.exterior.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 7, 12), this.m.frame);
    pole.position.y = 3.5;
    pole.castShadow = true;
    g.add(pole);
    const arm = box(g, 0.08, 0.08, 1.6, this.m.frame, 0, 6.9, 0.7);
    arm.castShadow = true;
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a0', emissiveIntensity: 0.0 });
    this.streetLampMats.push(lampMat);
    box(g, 0.25, 0.08, 0.5, lampMat, 0, 6.82, 1.4, { cast: false });
    const l = new THREE.SpotLight('#ffcf8a', 0, 22, 1.1, 0.7, 1.6);
    l.position.set(pos.x, 6.75, pos.z + 1.4);
    l.target.position.set(pos.x, 0, pos.z + 0.4);
    this.exterior.add(l, l.target);
    this.exteriorNightLights.push(l);
    this.col.addBox(pos.x, pos.z, 0.25, 0.25, 'pole');
  }

  private utilityPole(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    this.exterior.add(g);
    const pm = new THREE.MeshStandardMaterial({ color: '#8e8e86', roughness: 0.9 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 10, 12), pm);
    pole.position.y = 5;
    pole.castShadow = true;
    g.add(pole);
    box(g, 1.6, 0.1, 0.1, pm, 0, 8.6, 0);
    box(g, 0.5, 0.6, 0.35, new THREE.MeshStandardMaterial({ color: '#6d6d68' }), 0.3, 7.2, 0);
    // wires to the next pole
    const wireMat = new THREE.LineBasicMaterial({ color: '#1a1a1a' });
    for (const dy of [8.65, 8.3, 7.9]) {
      for (const dx of [-0.7, 0.7]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 20; i++) {
          const tt = i / 20;
          pts.push(new THREE.Vector3(dx + tt * 24, dy - Math.sin(tt * Math.PI) * 0.8, 0));
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat);
        g.add(line);
      }
    }
    this.col.addBox(pos.x, pos.z, 0.3, 0.3, 'pole');
  }

  private neighbours() {
    const g = this.exterior;
    const cols = ['#b8b2a6', '#8f969c', '#c9c1b4', '#7f7a73', '#a59f95'];
    let x = -60;
    let k = 0;
    while (x < 60) {
      const w = 7 + ((k * 37) % 9);
      const h = 6 + ((k * 53) % 14);
      const d = 8;
      const col = cols[k % cols.length];
      const b = box(g, w - 0.6, h, d, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }), x + w / 2, 0, 31 + ((k * 13) % 3), { cast: false });
      // windows as an emissive texture
      const [c, ctx] = canvas(256, 256);
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, 256, 256);
      const floors = Math.max(2, Math.floor(h / 3));
      const cols2 = Math.max(2, Math.floor(w / 1.8));
      for (let f = 0; f < floors; f++) {
        for (let j = 0; j < cols2; j++) {
          const lit = Math.random() < 0.35;
          ctx.fillStyle = lit ? (Math.random() < 0.5 ? '#ffe7b0' : '#dfefff') : '#2c3238';
          ctx.fillRect((j + 0.2) * (256 / cols2), (f + 0.25) * (256 / floors), (256 / cols2) * 0.55, (256 / floors) * 0.45);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const wm = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.0, roughness: 0.8 });
      this.neighbourWindowMats.push(wm);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, h), wm);
      face.position.set(b.position.x, h / 2, b.position.z - d / 2 - 0.01);
      face.rotation.y = Math.PI;
      g.add(face);
      x += w;
      k++;
    }
  }

  // ------------------------------------------------------------------ runtime

  /** Animate the automatic door and fridge doors. */
  update(dt: number, peopleNearDoor: boolean): void {
    const target = peopleNearDoor ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * (target ? 5 : 2.5));
    for (const gl of this.doorPanels) {
      const panel = gl.userData.panel as THREE.Object3D;
      panel.position.x = panel.userData.baseX + panel.userData.dir * this.doorOpen * 0.78;
    }
    for (const f of this.fridges) {
      if (f.hold > 0) f.hold -= dt;
      else f.target = 0;
      f.openT += (f.target - f.openT) * Math.min(1, dt * 6);
      if (f.door) f.door.rotation.set(0, 0, -f.openT * 1.3);
    }
  }
}
