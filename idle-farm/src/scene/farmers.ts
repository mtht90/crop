import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EFFECT } from '../game/data';
import { harvest, type HarvestResult, isFull, isRipe, plant } from '../game/logic';
import type { GameState } from '../game/state';
import { loadGltf } from './assets';
import type { World } from './world';

const MODEL = 'chars/farmer.glb';
/** 農夫らしく見せるため、武器やマントは隠して体だけ残す */
const KEEP_MESH = /^Rogue_(Body|Head|ArmLeft|ArmRight|LegLeft|LegRight)$/;
const HEIGHT = 0.62;
const WALK_SPEED = 1.5;
const WORK_SEC = 1.3;

type Mode = 'idle' | 'walk' | 'work';

interface Farmer {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<'idle' | 'walk' | 'work', THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  mode: Mode;
  target: number | null;
  dest: THREE.Vector3;
  timer: number;
}

export class Farmers {
  private template?: THREE.Object3D;
  private clips: THREE.AnimationClip[] = [];
  private list: Farmer[] = [];
  private reserved = new Set<number>();

  constructor(
    private world: World,
    private onHarvest: (index: number, result: Extract<HarvestResult, { ok: true }>) => void,
  ) {}

  async load() {
    const gltf = await loadGltf(MODEL);
    this.template = gltf.scene;
    this.clips = gltf.animations;
    this.template.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.visible = KEEP_MESH.test(o.name);
        o.castShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(this.template);
    this.template.scale.setScalar(HEIGHT / (box.max.y - box.min.y));
  }

  private spawn(): Farmer {
    const root = SkeletonUtils.clone(this.template!);
    const home = this.world.homePosition;
    root.position.set(home.x + (Math.random() - 0.5), 0, home.z + Math.random() * 0.5);
    this.world.scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const clip = (name: string) => mixer.clipAction(THREE.AnimationClip.findByName(this.clips, name)!);
    const f: Farmer = {
      root,
      mixer,
      actions: { idle: clip('Idle'), walk: clip('Walking_A'), work: clip('Interact') },
      current: null,
      mode: 'idle',
      target: null,
      dest: new THREE.Vector3(),
      timer: Math.random(),
    };
    this.play(f, 'idle');
    return f;
  }

  private play(f: Farmer, name: keyof Farmer['actions']) {
    const next = f.actions[name];
    if (f.current === next) return;
    next.reset().fadeIn(0.2).play();
    f.current?.fadeOut(0.2);
    f.current = next;
  }

  /** 収穫できる区画を優先し、次に空いている区画を探す（近い順） */
  private chooseTarget(f: Farmer, s: GameState): number | null {
    const full = isFull(s);
    let best: number | null = null;
    let bestScore = Infinity;
    s.plots.forEach((p, i) => {
      if (this.reserved.has(i)) return;
      const ripe = isRipe(p) && !full;
      const empty = !p.crop && s.unlocked[p.lastCrop ?? s.selectedCrop];
      if (!ripe && !empty) return;
      const d = f.root.position.distanceTo(this.world.plotPosition(i)) + (ripe ? 0 : 4);
      if (d < bestScore) {
        bestScore = d;
        best = i;
      }
    });
    return best;
  }

  private act(index: number, s: GameState) {
    const p = s.plots[index];
    if (!p) return;
    if (isRipe(p)) {
      const r = harvest(s, index, false);
      if (!r.ok) return;
      this.onHarvest(index, r);
    }
    if (!p.crop) plant(s, index, p.lastCrop && s.unlocked[p.lastCrop] ? p.lastCrop : s.selectedCrop);
  }

  update(dt: number, s: GameState) {
    if (!this.template) return;
    while (this.list.length < s.farmers) this.list.push(this.spawn());

    const speed = EFFECT.farmerSpeed(s.farmerLv);
    for (const f of this.list) {
      f.mixer.update(dt * Math.min(speed, 2.5));
      switch (f.mode) {
        case 'idle': {
          f.timer -= dt;
          if (f.timer > 0) break;
          f.timer = 0.4;
          const t = this.chooseTarget(f, s);
          if (t === null) break;
          const center = this.world.plotPosition(t);
          const from = f.root.position.clone().sub(center).setY(0).normalize();
          f.dest.copy(center).addScaledVector(from, 0.75);
          f.target = t;
          this.reserved.add(t);
          f.mode = 'walk';
          this.play(f, 'walk');
          break;
        }
        case 'walk': {
          const to = f.dest.clone().sub(f.root.position).setY(0);
          const dist = to.length();
          const step = WALK_SPEED * speed * dt;
          if (dist <= step) {
            f.root.position.copy(f.dest);
            f.mode = 'work';
            f.timer = WORK_SEC / speed;
            const c = this.world.plotPosition(f.target!);
            f.root.lookAt(c.x, 0, c.z);
            this.play(f, 'work');
          } else {
            f.root.position.addScaledVector(to.normalize(), step);
            f.root.rotation.y = Math.atan2(to.x, to.z);
          }
          break;
        }
        case 'work': {
          f.timer -= dt;
          if (f.timer > 0) break;
          this.act(f.target!, s);
          this.reserved.delete(f.target!);
          f.target = null;
          f.mode = 'idle';
          f.timer = 0;
          this.play(f, 'idle');
          break;
        }
      }
    }
  }
}
