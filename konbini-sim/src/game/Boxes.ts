import * as THREE from 'three';
import { product, type ProductDef, type Shape } from '../data/products';
import { canvas, fitText } from '../world/Textures';
import { productMesh } from '../world/ProductVisuals';
import type { Item } from './Slot';

let nextBoxId = 1;

/** Outer dimensions of a shipping case per product shape. */
function caseSize(shape: Shape): [number, number, number] {
  switch (shape) {
    case 'pet': return [0.42, 0.24, 0.3];
    case 'can': case 'slimcan': return [0.4, 0.15, 0.27];
    case 'carton': return [0.34, 0.22, 0.26];
    case 'onigiri': case 'sandwich': case 'bento': case 'salad': case 'pudding': return [0.5, 0.2, 0.4];
    case 'magazine': return [0.3, 0.12, 0.24];
    case 'karaage': case 'chicken': case 'croquette': case 'americandog': return [0.36, 0.2, 0.26];
    case 'bag': return [0.44, 0.3, 0.34];
    default: return [0.36, 0.22, 0.28];
  }
}

/** External box models, injected once at start-up (Poly Haven cardboard box / crate, CC0). */
export const BoxModels: { cardboard: THREE.Object3D | null; crate: THREE.Object3D | null } = { cardboard: null, crate: null };

const labelCache = new Map<string, THREE.MeshStandardMaterial>();

/** Printed shipping label stuck on the case. */
function labelMaterial(p: ProductDef): THREE.MeshStandardMaterial {
  let m = labelCache.get(p.id);
  if (m) return m;
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#fbfbf7';
  ctx.fillRect(0, 0, 512, 256);
  const frozen = p.zone === 'hot';
  ctx.fillStyle = frozen ? '#0277bd' : p.colors[1] === '#ffffff' ? '#444' : p.colors[1];
  ctx.fillRect(0, 0, 512, 70);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, frozen ? '冷凍 ホットスナック' : p.brand, 256, 36, 480, 44, '900');
  ctx.fillStyle = '#1b1b1b';
  fitText(ctx, p.name, 256, 124, 480, 56, '900');
  ctx.font = '700 26px "Noto Sans JP", sans-serif';
  ctx.fillText(`${p.caseSize}個入　まいにちマート物流センター`, 256, 180);
  for (let x = 120; x < 392; x += 3) if (Math.random() > 0.45) ctx.fillRect(x, 205, Math.random() < 0.3 ? 3 : 1.5, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  labelCache.set(p.id, m);
  return m;
}

/** A shipping case holding N units of one product. Chilled food ships in plastic crates. */
export class Box {
  readonly id = nextBoxId++;
  readonly mesh: THREE.Group;
  items: Item[];
  opened = false;
  readonly size: THREE.Vector3;
  private crateItems: THREE.Group | null = null;

  constructor(readonly productId: string, count: number, expiry: number) {
    const p = product(productId);
    this.items = Array.from({ length: count }, () => ({ expiry }));
    const [w, h, d] = caseSize(p.shape);
    this.size = new THREE.Vector3(w, h, d);
    this.mesh = new THREE.Group();
    this.mesh.userData.box = this;
    const crate = p.zone === 'chilled';
    const src = crate ? BoxModels.crate : BoxModels.cardboard;
    if (src) {
      const vis = src.clone(true);
      // source sizes: cardboard 0.387 x 0.342 x 0.516, crate 0.506 x 0.254 x 0.406
      if (crate) vis.scale.set(w / 0.506, h / 0.254, d / 0.406);
      else vis.scale.set(w / 0.387, h / 0.342, d / 0.516);
      vis.position.z = crate ? 0 : -0.033 * (d / 0.516);
      vis.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      this.mesh.add(vis);
    } else {
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: '#b98d5a', roughness: 0.9 }));
      fallback.position.y = h / 2;
      this.mesh.add(fallback);
    }
    // invisible pick volume so ray casts hit the whole case
    const pick = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = h / 2;
    this.mesh.add(pick);
    if (crate) {
      this.crateItems = new THREE.Group();
      this.mesh.add(this.crateItems);
      this.refreshCrate();
    }
    // shipping labels on both long sides
    const lw = Math.min(w * 0.8, 0.3);
    for (const s of [1, -1]) {
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw * 0.5), labelMaterial(p));
      lab.position.set(0, h * (crate ? 0.55 : 0.5), s * (d / 2 + 0.004));
      if (s < 0) lab.rotation.y = Math.PI;
      this.mesh.add(lab);
    }
  }

  get product(): ProductDef {
    return product(this.productId);
  }

  get count(): number {
    return this.items.length;
  }

  /** Show the remaining food inside an open crate. */
  private refreshCrate(): void {
    const g = this.crateItems;
    if (!g) return;
    g.clear();
    const n = Math.min(this.items.length, 8);
    for (let i = 0; i < n; i++) {
      const m = productMesh(this.product);
      m.castShadow = false;
      m.position.set(-this.size.x * 0.3 + (i % 4) * this.size.x * 0.2, 0.03, (Math.floor(i / 4) - 0.5) * this.size.z * 0.4);
      m.rotation.x = this.product.shape === 'onigiri' || this.product.shape === 'sandwich' ? -Math.PI / 2 : 0;
      g.add(m);
    }
  }

  /** Called when an item is taken out or put back. */
  changed(): void {
    this.refreshCrate();
  }

  open(): void {
    this.opened = true;
  }
}
