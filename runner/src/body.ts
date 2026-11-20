import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * First-person full body: Quaternius "Universal Animation Library" mannequin (CC0).
 * Slide/Ninja-jump clips come from "UAL 2", which uses a different (UE-style) rig, so
 * they are retargeted at load time via world-space rotation deltas against the
 * shared A/T-pose clip that both packs include.
 */

const UAL2_TO_UAL1_RAW: Record<string, string> = {
  'DEF-hips': 'pelvis', 'DEF-spine.001': 'spine_01', 'DEF-spine.002': 'spine_02', 'DEF-spine.003': 'spine_03', 'DEF-neck': 'neck_01', 'DEF-head': 'Head',
  'DEF-shoulder.L': 'clavicle_l', 'DEF-upper_arm.L': 'upperarm_l', 'DEF-forearm.L': 'lowerarm_l', 'DEF-hand.L': 'hand_l',
  'DEF-shoulder.R': 'clavicle_r', 'DEF-upper_arm.R': 'upperarm_r', 'DEF-forearm.R': 'lowerarm_r', 'DEF-hand.R': 'hand_r',
  'DEF-thigh.L': 'thigh_l', 'DEF-shin.L': 'calf_l', 'DEF-foot.L': 'foot_l', 'DEF-toe.L': 'ball_l',
  'DEF-thigh.R': 'thigh_r', 'DEF-shin.R': 'calf_r', 'DEF-foot.R': 'foot_r', 'DEF-toe.R': 'ball_r',
};

// three.js strips '.' from node names when loading
const S = (n: string) => THREE.PropertyBinding.sanitizeNodeName(n);
const UAL2_TO_UAL1: Record<string, string> = Object.fromEntries(Object.entries(UAL2_TO_UAL1_RAW).map(([k, v]) => [S(k), v]));

function bonesByName(root: THREE.Object3D) {
  const m = new Map<string, THREE.Bone>();
  root.traverse((o: any) => { if (o.isBone) m.set(o.name, o); });
  return m;
}

function poseAt(root: THREE.Object3D, clip: THREE.AnimationClip, t: number) {
  const mixer = new THREE.AnimationMixer(root);
  const a = mixer.clipAction(clip);
  a.play(); a.time = t; mixer.update(0);
  root.updateMatrixWorld(true);
  mixer.stopAllAction(); mixer.uncacheRoot(root);
}

function retarget(dstScene: THREE.Object3D, dstRest: THREE.AnimationClip, srcScene: THREE.Object3D, srcRest: THREE.AnimationClip, clip: THREE.AnimationClip, fps = 30): THREE.AnimationClip {
  const src = SkeletonUtils.clone(srcScene);
  const dst = SkeletonUtils.clone(dstScene);
  const sb = bonesByName(src), db = bonesByName(dst);
  const pairs = Object.entries(UAL2_TO_UAL1).map(([d, s]) => [db.get(d)!, sb.get(s)!] as const).filter(([d, s]) => d && s);
  // rest poses
  poseAt(src, srcRest, 0); poseAt(dst, dstRest, 0);
  const srcRestQ = new Map<THREE.Bone, THREE.Quaternion>();
  const dstRestQ = new Map<THREE.Bone, THREE.Quaternion>();
  const dstRestLocal = new Map<THREE.Bone, THREE.Quaternion>();
  db.forEach((b) => dstRestLocal.set(b, b.quaternion.clone()));
  for (const [d, s] of pairs) { srcRestQ.set(s, s.getWorldQuaternion(new THREE.Quaternion())); dstRestQ.set(d, d.getWorldQuaternion(new THREE.Quaternion())); }
  const sHip = sb.get('pelvis')!, dHip = db.get('DEF-hips')!;
  const sHipRest = sHip.getWorldPosition(new THREE.Vector3());
  const dHipRest = dHip.getWorldPosition(new THREE.Vector3());
  const ratio = dHipRest.y / Math.max(0.01, sHipRest.y);
  // facing frames of both rigs (they may face different world directions)
  const frame = (bones: Map<string, THREE.Bone>, hip: string, head: string, tl: string, tr: string) => {
    const p = (n: string) => bones.get(n)!.getWorldPosition(new THREE.Vector3());
    const up = p(head).sub(p(hip)).normalize();
    const right = p(tr).sub(p(tl)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
    right.crossVectors(up, fwd).normalize();
    return new THREE.Matrix4().makeBasis(right, up, fwd);
  };
  const fs = frame(sb, 'pelvis', 'Head', 'thigh_l', 'thigh_r');
  const fd = frame(db, 'DEF-hips', 'DEF-head', S('DEF-thigh.L'), S('DEF-thigh.R'));
  const F = new THREE.Quaternion().setFromRotationMatrix(fd.clone().multiply(fs.clone().invert()));
  const Finv = F.clone().invert();

  const n = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(n);
  const qTracks = new Map<THREE.Bone, Float32Array>();
  for (const [d] of pairs) qTracks.set(d, new Float32Array(n * 4));
  const hipPos = new Float32Array(n * 3);

  const mixer = new THREE.AnimationMixer(src);
  const act = mixer.clipAction(clip); act.play();
  const q = new THREE.Quaternion(), pq = new THREE.Quaternion(), tmp = new THREE.Quaternion();
  const order: THREE.Bone[] = [];
  dst.traverse((o: any) => { if (o.isBone) order.push(o); });
  const pairMap = new Map(pairs.map(([d, s]) => [d, s]));

  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / fps);
    times[i] = t;
    act.time = t; mixer.update(0); src.updateMatrixWorld(true);
    // reset dst to rest locals
    db.forEach((b) => b.quaternion.copy(dstRestLocal.get(b)!));
    dst.updateMatrixWorld(true);
    for (const d of order) {
      const s = pairMap.get(d);
      if (!s) { d.updateMatrixWorld(true); continue; }
      s.getWorldQuaternion(q);
      // world delta from rest, applied to dst rest world rotation
      tmp.copy(srcRestQ.get(s)!).invert();
      q.multiply(tmp); // q = srcWorld * inv(srcRest)  (world delta in src frame)
      q.premultiply(F).multiply(Finv); // express delta in dst frame
      q.multiply(dstRestQ.get(d)!);
      (d.parent as THREE.Object3D).getWorldQuaternion(pq);
      d.quaternion.copy(pq.invert().multiply(q));
      d.updateMatrixWorld(true);
      q.copy(d.quaternion);
      qTracks.get(d)!.set([q.x, q.y, q.z, q.w], i * 4);
    }
    const sp = sHip.getWorldPosition(new THREE.Vector3()).sub(sHipRest).multiplyScalar(ratio).applyQuaternion(F).add(dHipRest);
    const lp = (dHip.parent as THREE.Object3D).worldToLocal(sp);
    hipPos.set([lp.x, lp.y, lp.z], i * 3);
  }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [d, arr] of qTracks) tracks.push(new THREE.QuaternionKeyframeTrack(`${d.name}.quaternion`, times as any, arr as any));
  tracks.push(new THREE.VectorKeyframeTrack(`${dHip.name}.position`, times as any, hipPos as any));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export type BodyAnim = 'idle' | 'run' | 'jumpStart' | 'air' | 'land' | 'slide' | 'roll' | 'wallrun' | 'vault' | 'dead' | 'fallDead' | 'dance';

export class Body {
  root = new THREE.Group();   // placed at player feet; faces -Z
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  head!: THREE.Bone;
  neck!: THREE.Bone;
  current: THREE.AnimationAction | null = null;
  currentName: BodyAnim | '' = '';
  private headHidden = true;
  onFootstep: () => void = () => {};
  private lastRunPhase = 0;
  private lean = 0;
  private roll = 0;
  materials: THREE.MeshStandardMaterial[] = [];
  private eyePos = new THREE.Vector3();

  constructor(main: GLTF, extra: GLTF) {
    this.model = main.scene;
    this.model.rotation.y = Math.PI; // asset faces +Z, we run towards -Z
    this.root.add(this.model);
    this.model.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const m = o.material as THREE.MeshStandardMaterial;
        // athletic suit look: dark body, cyan joints
        if (m.name === 'M_Joints') { m.color.set(0x1a1d24); m.emissive = new THREE.Color(0x36f1ff); m.emissiveIntensity = 0.6; }
        else { m.color.set(0x2b3040); m.roughness = 0.55; m.metalness = 0.1; }
        m.side = THREE.FrontSide;
        this.materials.push(m);
      }
      if (o.isBone && o.name === 'DEF-head') this.head = o;
      if (o.isBone && o.name === 'DEF-neck') this.neck = o;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (n: string, g: GLTF = main) => g.animations?.find((a) => a.name === n)!;
    const add = (key: string, c: THREE.AnimationClip | undefined, loop = true) => {
      if (!c) { console.warn('missing clip', key); return; }
      const a = this.mixer.clipAction(c);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      this.actions.set(key, a);
    };
    add('idle', clip('Idle_Loop'));
    add('run', clip('Sprint_Loop'));
    add('jog', clip('Jog_Fwd_Loop'));
    add('jumpStart', clip('Jump_Start'), false);
    add('air', clip('Jump_Loop'));
    add('land', clip('Jump_Land'), false);
    add('roll', clip('Roll'), false);
    add('dead', clip('Death01'), false);
    add('fallDead', clip('Jump_Loop'));
    add('dance', clip('Dance_Loop'));
    // retarget UAL2 clips onto the UAL1 rig
    const dstRest = clip('A_TPose') ?? main.animations[0];
    const srcRest = clip('A_TPose', extra);
    const tryRetarget = (name: string) => {
      const c = clip(name, extra);
      if (!c || !srcRest || !dstRest) return undefined;
      try { return retarget(main.scene, dstRest, extra.scene, srcRest, c); } catch (e) { console.warn('retarget failed', name, e); return undefined; }
    };
    add('slideStart', tryRetarget('Slide_Start'), false);
    add('slide', tryRetarget('Slide_Loop'));
    add('vault', tryRetarget('NinjaJump_Start'), false);
    add('hit', tryRetarget('Hit_Knockback'), false);
    this.mixer.addEventListener('finished', (e: any) => this.onFinished(e.action));
  }

  private onFinished(a: THREE.AnimationAction) {
    if (a === this.actions.get('jumpStart') && this.currentName === 'jumpStart') this.play('air', 0.15);
    else if (a === this.actions.get('slideStart') && this.currentName === 'slide') this.fadeTo(this.actions.get('slide')!, 0.12);
    else if ((a === this.actions.get('land') && this.currentName === 'land') || (a === this.actions.get('roll') && this.currentName === 'roll')) this.play('run', 0.2);
    else if (a === this.actions.get('vault') && this.currentName === 'vault') this.play('air', 0.15);
  }

  private fadeTo(next: THREE.AnimationAction, fade: number) {
    if (this.current === next) return;
    next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(1);
    next.play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
  }

  play(name: BodyAnim, fade = 0.15) {
    if (this.currentName === name) return;
    this.currentName = name;
    let key: string = name;
    if (name === 'wallrun') key = 'run';
    if (name === 'slide') key = this.actions.has('slideStart') ? 'slideStart' : 'roll';
    if (name === 'vault' && !this.actions.has('vault')) key = 'jumpStart';
    const a = this.actions.get(key);
    if (a) this.fadeTo(a, fade);
  }

  setHeadVisible(v: boolean) { this.headHidden = !v; }

  update(dt: number, speed: number, lateral: number, wallSide: number) {
    // running cadence follows speed
    const run = this.actions.get('run')!;
    if (this.currentName === 'run' || this.currentName === 'wallrun') {
      run.timeScale = THREE.MathUtils.clamp(0.7 + speed / 34, 0.8, 2.0);
    }
    this.mixer.update(dt);
    // footsteps: two per sprint cycle
    if (this.currentName === 'run' || this.currentName === 'wallrun') {
      const d = run.getClip().duration;
      const ph = (run.time % d) / d;
      const a = this.lastRunPhase;
      if ((a < 0.25 && ph >= 0.25) || (a < 0.75 && ph >= 0.75)) this.onFootstep();
      this.lastRunPhase = ph;
    }
    // procedural lean (strafe) & wall-run tilt
    this.lean = THREE.MathUtils.damp(this.lean, -lateral * 0.025, 8, dt);
    this.roll = THREE.MathUtils.damp(this.roll, wallSide * 0.42, 10, dt);
    this.root.rotation.z = this.lean + this.roll;
    // cache the eye position with an intact skeleton, then collapse head+neck for first person
    if (this.head) { this.head.scale.setScalar(1); this.neck.scale.setScalar(1); }
    this.root.updateMatrixWorld(true);
    if (this.head) {
      this.head.getWorldPosition(this.eyePos);
      if (this.headHidden) { this.neck.scale.setScalar(0.001); this.root.updateMatrixWorld(true); }
    }
  }

  /** world position of the eyes */
  eye(target: THREE.Vector3) {
    if (!this.head) return target.copy(this.root.position).setY(this.root.position.y + 1.65);
    return target.copy(this.eyePos);
  }
}
