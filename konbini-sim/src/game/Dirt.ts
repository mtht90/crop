import * as THREE from 'three';
import type { Game } from './Game';
import { dirtDecal } from '../world/Textures';

type Kind = 'mud' | 'spill' | 'vomit';

interface Spot {
  kind: Kind;
  mesh: THREE.Mesh;
  amount: number;
}

const textures: Partial<Record<Kind, THREE.Texture[]>> = {};

/** Floor dirt decals: muddy footprints on rainy days, spilled drinks, drunk accidents. */
export class Dirt {
  private spots: Spot[] = [];
  private group = new THREE.Group();
  private mopSound = 0;

  constructor(private g: Game) {
    g.store.root.add(this.group);
  }

  private tex(kind: Kind): THREE.Texture {
    const list = (textures[kind] ??= [0, 1, 2].map(() => dirtDecal(kind)));
    return list[Math.floor(Math.random() * list.length)];
  }

  spawn(kind: Kind, x: number, z: number, amount = 1): void {
    if (this.spots.length > 24) return;
    const size = kind === 'mud' ? 1.1 : kind === 'vomit' ? 0.8 : 0.6;
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex(kind), transparent: true, depthWrite: false, roughness: kind === 'mud' ? 0.9 : 0.15,
      polygonOffset: true, polygonOffsetFactor: -2, opacity: amount,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    mesh.position.set(x, 0.005 + this.spots.length * 0.0003, z);
    mesh.userData.dirt = true;
    this.group.add(mesh);
    this.spots.push({ kind, mesh, amount });
  }

  meshes(): THREE.Object3D[] {
    return this.spots.map((s) => s.mesh);
  }

  count(): number {
    return this.spots.length;
  }

  clean(obj: THREE.Object3D, amt: number): void {
    const s = this.spots.find((x) => x.mesh === obj);
    if (!s) return;
    s.amount -= amt * (s.kind === 'vomit' ? 0.6 : 1);
    (s.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, s.amount);
    this.mopSound -= amt;
    if (this.mopSound <= 0) {
      this.mopSound = 0.12;
      this.g.audio.noise(0.25, 900, 'bandpass', 0.08, obj.getWorldPosition(new THREE.Vector3()));
    }
    if (s.amount <= 0) {
      s.mesh.removeFromParent();
      this.spots.splice(this.spots.indexOf(s), 1);
      this.g.ui.notify('きれいになりました ✨', 'good', 1800);
      this.g.state.tutorial |= 64;
    }
  }

  clear(): void {
    this.group.clear();
    this.spots = [];
  }

  /** Night crew cleans half of the mess. */
  overnight(): void {
    for (const s of [...this.spots]) {
      if (Math.random() < 0.6) {
        s.mesh.removeFromParent();
        this.spots.splice(this.spots.indexOf(s), 1);
      }
    }
  }

  tickMinute(): void {
    const s = this.g.state;
    // random spills in the aisles
    const rate = (s.has('wax') ? 0.5 : 1) * 0.004;
    if (Math.random() < rate) {
      const x = -5 + Math.random() * 7.5;
      const z = -3.8 + Math.random() * 7.8;
      if (!this.g.store.col.pointBlocked(x, z, 0.3)) this.spawn('spill', x, z);
    }
    // reputation drain for a dirty shop
    if (this.spots.length >= 4 && Math.random() < 0.08) s.addRep(-0.3);
  }

  /** Called when a customer walks in; rainy days bring mud. */
  onEnter(): void {
    const s = this.g.state;
    const p = s.weather === 'rain' ? 0.35 : 0.03;
    if (Math.random() < p * (s.has('wax') ? 0.5 : 1)) {
      this.spawn('mud', -5.2 + Math.random() * 1.8, 2.6 + Math.random() * 1.8);
    }
  }

  serialize(): { k: Kind; x: number; z: number; a: number }[] {
    return this.spots.map((s) => ({ k: s.kind, x: s.mesh.position.x, z: s.mesh.position.z, a: s.amount }));
  }

  update(_dt: number): void {
    /* decals are static */
  }
}
