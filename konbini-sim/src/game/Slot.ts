import * as THREE from 'three';
import { product, SHAPE_SIZE, STACKABLE, type ProductDef, type Zone } from '../data/products';
import { productVisual } from '../world/ProductVisuals';
import { fitText } from '../world/Textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Item {
  /** Absolute game minute at which this item expires (1e9 = never). */
  expiry: number;
}

let nextSlotId = 0;

const CELL_W = 256;
const CELL_H = 64;
const COLS = 8;

/**
 * All shelf price tags share one canvas atlas and one merged mesh, which saves
 * hundreds of draw calls. Slots draw into their own cell.
 */
export class TagAtlas {
  static canvas: HTMLCanvasElement | null = null;
  static texture: THREE.CanvasTexture | null = null;
  static material: THREE.MeshStandardMaterial | null = null;
  static count = 0;
  static dirty = false;
  private static pending: THREE.BufferGeometry[] = [];

  static alloc(): number {
    return TagAtlas.count++;
  }

  /** Create the canvas once the number of cells is known. */
  static ensure(): void {
    if (TagAtlas.canvas) return;
    const rows = Math.ceil(Math.max(1, TagAtlas.count) / COLS);
    const c = document.createElement('canvas');
    c.width = CELL_W * COLS;
    c.height = CELL_H * rows;
    TagAtlas.canvas = c;
    TagAtlas.texture = new THREE.CanvasTexture(c);
    TagAtlas.texture.colorSpace = THREE.SRGBColorSpace;
    TagAtlas.texture.anisotropy = 8;
    TagAtlas.texture.generateMipmaps = true;
    TagAtlas.material = new THREE.MeshStandardMaterial({ map: TagAtlas.texture, roughness: 0.4 });
  }

  static add(geo: THREE.BufferGeometry): void {
    TagAtlas.pending.push(geo);
  }

  /** Merge every tag quad (already in world space) into one mesh. */
  static build(parent: THREE.Object3D): THREE.Mesh | null {
    TagAtlas.ensure();
    if (!TagAtlas.pending.length) return null;
    const merged = mergeGeometries(TagAtlas.pending, false);
    TagAtlas.pending = [];
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, TagAtlas.material!);
    mesh.receiveShadow = true;
    mesh.name = 'priceTags';
    parent.add(mesh);
    return mesh;
  }

  static cellUV(i: number): [number, number, number, number] {
    const rows = TagAtlas.canvas ? TagAtlas.canvas.height / CELL_H : Math.ceil(TagAtlas.count / COLS);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const u0 = col / COLS;
    const u1 = (col + 1) / COLS;
    const v1 = 1 - row / rows;
    const v0 = 1 - (row + 1) / rows;
    return [u0, v0, u1, v1];
  }

  static flush(): void {
    if (TagAtlas.dirty && TagAtlas.texture) {
      TagAtlas.texture.needsUpdate = true;
      TagAtlas.dirty = false;
    }
  }
}

/**
 * One product facing on a shelf / fridge shelf / rack. Items are packed front
 * to back, left to right, then stacked. Items are always kept "faced up"
 * (compacted towards the front) and sold oldest-first.
 */
export class Slot {
  readonly id = nextSlotId++;
  productId: string | null = null;
  items: Item[] = [];
  /** World transform of the slot's front-centre on the shelf surface; local -z goes into the shelf. */
  readonly frame = new THREE.Object3D();
  private tagCell = -1;
  private tagGeo: THREE.BufferGeometry | null = null;
  private lastTagKey = '';
  /** Invisible volume used for ray picking. */
  readonly pick: THREE.Mesh;
  /** Where a customer stands to take from this slot. */
  readonly access = new THREE.Vector3();
  /** Called when a customer/player touches the slot (e.g. fridge door opening). */
  onTouch: (() => void) | null = null;
  fixtureName = '';

  constructor(
    readonly zone: Zone,
    readonly width: number,
    readonly depth: number,
    readonly height: number,
    parent: THREE.Object3D,
    pos: THREE.Vector3,
    rotY: number,
    /** Level index from bottom, used to choose crouch/reach animations. */
    readonly level: number,
    /** Tilt in radians (magazine racks lean back). */
    readonly tilt = 0,
    withTag = true,
  ) {
    this.frame.position.copy(pos);
    this.frame.rotation.y = rotY;
    if (tilt) this.frame.rotateX(tilt);
    parent.add(this.frame);
    const pickGeo = new THREE.BoxGeometry(width, Math.max(height, 0.05), depth);
    pickGeo.translate(0, Math.max(height, 0.05) / 2, -depth / 2);
    this.pick = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pick.userData.slot = this;
    this.frame.add(this.pick);
    if (withTag) this.makeTag();
    this.frame.updateWorldMatrix(true, true);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.access.copy(this.frame.getWorldPosition(new THREE.Vector3())).addScaledVector(fwd, 0.55).setY(0);
  }

  get product(): ProductDef | null {
    return this.productId ? product(this.productId) : null;
  }

  private makeTag() {
    this.tagCell = TagAtlas.alloc();
    const w = Math.min(0.12, this.width * 0.6);
    const g = new THREE.PlaneGeometry(w, w * 0.25);
    g.translate(-this.width / 2 + w / 2 + 0.01, -0.022, 0.012);
    this.tagGeo = g;
  }

  /** Bake the tag quad into world space and hand it to the shared atlas mesh. */
  finalizeTag(): void {
    if (!this.tagGeo) return;
    this.frame.updateWorldMatrix(true, false);
    const g = this.tagGeo.clone().applyMatrix4(this.frame.matrixWorld);
    const [u0, v0, u1, v1] = TagAtlas.cellUV(this.tagCell);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    TagAtlas.add(g.index ? g.toNonIndexed() : g);
  }

  updateTag(price: number | null, alert: boolean): void {
    if (this.tagCell < 0) return;
    TagAtlas.ensure();
    const p = this.product;
    const key = `${this.productId}|${price}|${alert}`;
    if (key === this.lastTagKey) return;
    this.lastTagKey = key;
    const ctx = TagAtlas.canvas!.getContext('2d')!;
    const ox = (this.tagCell % COLS) * CELL_W;
    const oy = Math.floor(this.tagCell / COLS) * CELL_H;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, CELL_W, CELL_H);
    ctx.clip();
    ctx.scale(1, CELL_H / 72);
    ctx.fillStyle = alert ? '#fff1a8' : '#ffffff';
    ctx.fillRect(0, 0, 256, 72);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(0, 0, 8, 72);
    ctx.textBaseline = 'middle';
    if (p && price != null) {
      ctx.fillStyle = '#222';
      ctx.textAlign = 'left';
      fitText(ctx, p.name, 16, 20, 230, 20, '700');
      ctx.fillStyle = '#c62828';
      ctx.textAlign = 'right';
      fitText(ctx, `¥${price}`, 246, 50, 150, 34, '900');
      ctx.fillStyle = '#555';
      ctx.textAlign = 'left';
      ctx.font = '400 13px "Noto Sans JP", sans-serif';
      ctx.fillText('税込', 16, 52);
    } else {
      ctx.fillStyle = '#9e9e9e';
      ctx.textAlign = 'center';
      ctx.font = '700 22px "Noto Sans JP", sans-serif';
      ctx.fillText('空き棚', 128, 36);
    }
    ctx.restore();
    TagAtlas.dirty = true;
  }

  /** Grid dimensions for a product in this slot. */
  grid(p: ProductDef): { cols: number; rows: number; layers: number; sx: number; sz: number; sy: number } {
    const [w, h, d] = SHAPE_SIZE[p.shape];
    const gap = 0.006;
    const cols = Math.max(1, Math.floor(this.width / (w + gap)));
    const rows = Math.max(1, Math.floor(this.depth / (d + gap)));
    const maxStack = STACKABLE[p.shape] ?? 1;
    const layers = Math.max(1, Math.min(maxStack, Math.floor(this.height / (h + 0.002))));
    return { cols, rows, layers, sx: w + gap, sz: d + gap, sy: h + 0.001 };
  }

  capacity(p: ProductDef | null = this.product): number {
    if (!p) return 0;
    const g = this.grid(p);
    return g.cols * g.rows * g.layers;
  }

  canAccept(p: ProductDef): boolean {
    if (p.zone !== this.zone) return false;
    if (this.productId && this.productId !== p.id && this.items.length > 0) return false;
    return this.items.length < this.capacity(p);
  }

  add(p: ProductDef, item: Item): boolean {
    if (!this.canAccept(p)) return false;
    this.productId = p.id;
    this.items.push(item);
    this.items.sort((a, b) => a.expiry - b.expiry);
    return true;
  }

  /** Remove the item a customer would pick (oldest first). */
  take(): Item | undefined {
    return this.items.shift();
  }

  /** Remove the freshest (last-placed) item, e.g. taken back into a box. */
  takeBack(): Item | undefined {
    return this.items.pop();
  }

  removeExpired(today: number): Item[] {
    const out = this.items.filter((i) => i.expiry <= today);
    this.items = this.items.filter((i) => i.expiry > today);
    return out;
  }

  expiredCount(today: number): number {
    let n = 0;
    for (const i of this.items) if (i.expiry <= today) n++;
    return n;
  }

  /** Write world matrices for each displayed item. */
  writeMatrices(out: THREE.Matrix4[], jitterSeed: number): void {
    const p = this.product;
    if (!p) return;
    const g = this.grid(p);
    const perLayer = g.cols * g.rows;
    const tmp = new THREE.Object3D();
    const vis = productVisual(p);
    void vis;
    for (let i = 0; i < this.items.length; i++) {
      const layer = Math.floor(i / perLayer);
      const r = Math.floor((i % perLayer) / g.cols);
      const c = i % g.cols;
      const x = (c - (g.cols - 1) / 2) * g.sx;
      const z = -(r * g.sz + g.sz / 2 + 0.01);
      const y = layer * g.sy + 0.002;
      tmp.position.set(x, y, z);
      // tiny deterministic jitter so rows don't look CG-perfect
      const h = Math.sin((this.id * 97 + i * 13 + jitterSeed) * 12.9898) * 43758.5453;
      const j = h - Math.floor(h);
      tmp.rotation.set(0, (j - 0.5) * 0.08, 0);
      tmp.updateMatrix();
      out.push(new THREE.Matrix4().multiplyMatrices(this.frame.matrixWorld, tmp.matrix));
    }
  }
}

/**
 * One InstancedMesh per product, rebuilt lazily whenever any slot holding that
 * product changes. Keeps draw calls to ~40 regardless of stock level.
 */
export class ProductInstancer {
  private meshes = new Map<string, THREE.InstancedMesh>();
  private dirty = new Set<string>();
  constructor(private root: THREE.Object3D, private slots: () => Slot[]) {}

  markDirty(id: string | null): void {
    if (id) this.dirty.add(id);
  }

  markAll(): void {
    for (const s of this.slots()) this.markDirty(s.productId);
    for (const id of this.meshes.keys()) this.dirty.add(id);
  }

  update(): void {
    if (!this.dirty.size) return;
    for (const id of this.dirty) {
      const mats: THREE.Matrix4[] = [];
      for (const s of this.slots()) if (s.productId === id) s.writeMatrices(mats, 0);
      let mesh = this.meshes.get(id);
      if (!mesh || mesh.instanceMatrix.count < mats.length) {
        if (mesh) {
          this.root.remove(mesh);
          mesh.dispose();
        }
        const v = productVisual(product(id));
        mesh = new THREE.InstancedMesh(v.geometry, v.materials.length === 1 ? v.materials[0] : v.materials, Math.max(64, Math.ceil(mats.length * 1.5)));
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.meshes.set(id, mesh);
        this.root.add(mesh);
      }
      mats.forEach((m, i) => mesh!.setMatrixAt(i, m));
      mesh.count = mats.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.dirty.clear();
  }
}
