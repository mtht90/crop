import * as THREE from 'three';
import { product, type ProductDef, type Shape } from '../data/products';
import { cardboard } from '../world/Textures';
import type { Item } from './Slot';

let nextBoxId = 1;

/** Outer dimensions of a shipping case per product shape. */
function caseSize(shape: Shape): [number, number, number] {
  switch (shape) {
    case 'pet': return [0.42, 0.24, 0.3];
    case 'can': case 'slimcan': return [0.4, 0.14, 0.27];
    case 'carton': return [0.34, 0.22, 0.26];
    case 'onigiri': case 'sandwich': return [0.46, 0.14, 0.34];
    case 'bento': case 'salad': return [0.5, 0.16, 0.36];
    case 'magazine': return [0.3, 0.12, 0.24];
    case 'karaage': case 'chicken': case 'croquette': case 'americandog': return [0.36, 0.2, 0.26];
    case 'bag': return [0.44, 0.3, 0.34];
    default: return [0.36, 0.22, 0.28];
  }
}

const texCache = new Map<string, THREE.Texture>();

/** A shipping case holding N units of one product. */
export class Box {
  readonly id = nextBoxId++;
  readonly mesh: THREE.Mesh;
  items: Item[];
  opened = false;
  readonly size: THREE.Vector3;

  constructor(readonly productId: string, count: number, expiry: number) {
    const p = product(productId);
    this.items = Array.from({ length: count }, () => ({ expiry }));
    const [w, h, d] = caseSize(p.shape);
    this.size = new THREE.Vector3(w, h, d);
    let tex = texCache.get(productId);
    if (!tex) {
      const frozen = p.zone === 'hot';
      tex = cardboard(p.name, frozen ? '冷凍 ホットスナック' : `${p.caseSize}個入 / ${p.brand}`, frozen ? '#0277bd' : p.colors[1] === '#ffffff' ? '#444' : p.colors[1]);
      texCache.set(productId, tex);
    }
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const plain = new THREE.MeshStandardMaterial({ color: '#b98d5a', roughness: 0.9 });
    const top = new THREE.MeshStandardMaterial({ color: '#c49a66', roughness: 0.9 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, plain, side, side]);
    this.mesh.geometry.translate(0, h / 2, 0);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.box = this;
  }

  get product(): ProductDef {
    return product(this.productId);
  }

  get count(): number {
    return this.items.length;
  }

  /** Open flaps when the box is first used. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    const mats = this.mesh.material as THREE.MeshStandardMaterial[];
    mats[2] = new THREE.MeshStandardMaterial({ color: '#3a2a18', roughness: 1 });
    // flaps
    const flapMat = new THREE.MeshStandardMaterial({ color: '#c49a66', roughness: 0.9, side: THREE.DoubleSide });
    const { x: w, y: h, z: d } = this.size;
    for (const s of [1, -1]) {
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(w, d / 2), flapMat);
      flap.geometry.translate(0, d / 4, 0);
      flap.position.set(0, h, (s * d) / 2);
      flap.rotation.x = s > 0 ? -0.4 : Math.PI + 0.4;
      this.mesh.add(flap);
    }
  }
}
