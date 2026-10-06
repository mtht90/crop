import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef, OutfitPart } from '../combat/types';
import { assets, type ModelKey } from './assets';
import { leadHand } from './clipInfo';
import { buildArmCannon, buildBlaster, buildCardFan, buildRifle, buildBowMesh, buildBoxingGlove, buildHookGun, buildKatana, buildSaya, buildToyHammer, buildUmbrella, buildYoyo, KATANA_TIP_Y } from './weapons';
import { eyeTexture, faceTexture, skinTint } from './face';
import { keepTriangles, rebindToBones } from './skinUtil';
import { addOutline, part, toon } from './toon';

const OUTLINE = new THREE.Color(0x1d1b2e);

/** Back-face hull outline that follows skinning. */
export function skinnedOutline(mesh: THREE.SkinnedMesh, thickness: number) {
  const mat = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>\n transformed += normalize(objectNormal) * ${thickness.toFixed(4)};`);
  };
  mat.customProgramCacheKey = () => `skin-outline-${thickness}`;
  const o = new THREE.SkinnedMesh(mesh.geometry, mat);
  o.name = 'outline';
  o.bind(mesh.skeleton, mesh.bindMatrix);
  o.position.copy(mesh.position);
  o.quaternion.copy(mesh.quaternion);
  o.scale.copy(mesh.scale);
  o.frustumCulled = false;
  mesh.parent!.add(o);
  return o;
}

export type BoneName =
  | 'root'
  | 'pelvis'
  | 'spine_01'
  | 'spine_02'
  | 'spine_03'
  | 'neck_01'
  | 'Head'
  | 'clavicle_l'
  | 'upperarm_l'
  | 'lowerarm_l'
  | 'hand_l'
  | 'clavicle_r'
  | 'upperarm_r'
  | 'lowerarm_r'
  | 'hand_r'
  | 'thigh_l'
  | 'calf_l'
  | 'foot_l'
  | 'ball_l'
  | 'thigh_r'
  | 'calf_r'
  | 'foot_r'
  | 'ball_r'
  | 'middle_01_l'
  | 'middle_01_r'
  | 'thumb_01_l'
  | 'thumb_01_r';

/**
 * Skinned character built from the CC0 base body, toon-shaded, with a
 * stylized outfit made of rigid parts attached to bones (jacket, baggy pants,
 * gauntlets or blasters, sneakers) plus a spring-driven ponytail.
 */
export class ModelRig {
  readonly root = new THREE.Group();
  /** Squash/flip/afterimage pivot. */
  readonly body = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly bones = {} as Record<BoneName, THREE.Bone>;
  readonly tipL = new THREE.Object3D();
  readonly tipR = new THREE.Object3D();
  readonly ponytail: THREE.Group[] = [];
  readonly coatTails: THREE.Group[] = [];
  /** Scalable weapon (giant hammer ult). */
  readonly weaponRoot = new THREE.Group();
  private bow: ReturnType<typeof buildBowMesh> | null = null;
  private bowHolder: THREE.Group | null = null;
  readonly bowHand: 'l' | 'r';
  /** Yo-yo body and its string (world-positioned by the animator). */
  yoyo: THREE.Group | null = null;
  yoyoString: THREE.Line | null = null;
  /** Spreads the umbrella canopy (0..1). */
  setUmbrellaOpen: ((k: number) => void) | null = null;
  /** Hook head on the launcher (hidden while the hook is out). */
  hookClaw: THREE.Object3D | null = null;
  private skinMat: THREE.Material | null = null;
  private hairScene: THREE.Object3D | null = null;

  constructor(readonly def: CharacterDef) {
    const L = def.look;
    this.model = clone(assets.models[L.body as ModelKey].scene);
    this.root.add(this.body);
    this.body.add(this.model);
    this.model.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) this.bones[b.name as BoneName] = b;
    });
    this.model.updateMatrixWorld(true);

    // Toon materials and outlines on the skinned meshes.
    const skinned: THREE.SkinnedMesh[] = [];
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) skinned.push(m);
    });
    for (const m of skinned) {
      const src = m.material as THREE.MeshStandardMaterial;
      const isEyes = /eye/i.test(m.name) && !/brow/i.test(m.name);
      const isBrows = /brow/i.test(m.name);
      const color = isBrows ? L.hair : 0xffffff;
      // Per-character skin: painted face details on a copy of the texture, tinted to the skin tone.
      const map = isBrows || !src.map ? undefined : isEyes ? eyeTexture(def, src.map) : faceTexture(def, src.map);
      const mat = toon(color, { map, rim: isEyes ? 0 : 0.3, soft: !isBrows }).clone();
      if (!isEyes && !isBrows) mat.color.copy(skinTint(L.skin));
      m.material = mat;
      m.castShadow = true;
      m.frustumCulled = false;
      if (!isEyes && !isBrows) {
        // Dressed in a modular outfit: only the head, neck and hands of the body show.
        if (L.outfit) keepTriangles(m, (n) => /^(Head|neck_01|hand_|index_|middle_|ring_|pinky_|thumb_)/.test(n));
        this.skinMat ??= mat;
        skinnedOutline(m, 0.008);
      }
    }

    this.bowHand = def.weapon === 'bow' ? leadHand('Spell_Simple_Idle_Loop', 0) : 'l';
    this.buildHair();
    this.buildOutfit();
  }

  /** Bow: back toward the hand's forward, limbs along the thumb axis. */
  private buildBow(holder: THREE.Group) {
    const bow = buildBowMesh();
    // Map bow X -> hand forward (Z), Y -> thumb (Y).
    bow.group.rotation.y = -Math.PI / 2;
    holder.add(bow.group);
    this.bow = bow;
    this.bowHolder = holder;
  }

  /** Keeps the bow upright and facing forward regardless of the wrist pose. */
  alignBow() {
    const h = this.bowHolder;
    if (!h?.parent) return;
    const parentQ = h.parent.getWorldQuaternion(new THREE.Quaternion());
    const want = this.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.15)));
    h.quaternion.copy(parentQ.invert().multiply(want));
  }

  /** Pulls the string toward the other hand while drawing (0 = rest, 1 = fully drawn). */
  setBowDraw(k: number) {
    const bow = this.bow;
    if (!bow) return;
    if (k <= 0.01) return bow.setNock(null);
    const other = this.bones[this.bowHand === 'l' ? 'hand_r' : 'hand_l'].getWorldPosition(new THREE.Vector3());
    bow.group.worldToLocal(other);
    bow.setNock(bow.rest.clone().lerp(other, Math.min(1, k)));
  }


  /** Squeaky toy hammer (shared builder) on a scalable root for the giant-hammer ult. */
  private buildHammer(holder: THREE.Group) {
    holder.add(this.weaponRoot);
    this.weaponRoot.add(buildToyHammer(this.def.look.topAccent));
  }


  private wp(n: BoneName) {
    return this.bones[n].getWorldPosition(new THREE.Vector3());
  }

  /** Adds a mesh oriented along a world-space segment and parents it to a bone. */
  private seg(bone: BoneName, a: THREE.Vector3, b: THREE.Vector3, geo: (len: number) => THREE.BufferGeometry, color: number, outline = 0.012) {
    const len = a.distanceTo(b);
    const m = part(geo(len), color, outline);
    m.position.lerpVectors(a, b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.model.add(m);
    this.bones[bone].attach(m);
    return m;
  }

  private at(bone: BoneName, obj: THREE.Object3D, pos: THREE.Vector3) {
    obj.position.copy(pos);
    this.model.add(obj);
    this.bones[bone].attach(obj);
    return obj;
  }

  private buildHair() {
    const L = this.def.look;
    const hairScene = clone(assets.models[L.hairModel as ModelKey].scene);
    const hairMeshes: THREE.Mesh[] = [];
    hairScene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) hairMeshes.push(o as THREE.Mesh);
    });
    for (const m of hairMeshes) {
      m.material = toon(L.hair, { rim: 0.35 });
      m.castShadow = true;
      // Normal-extruded hull (a uniform scale would grow from the model origin at the feet
      // and float a dark copy of the hair above the head).
      addOutline(m, 0.006);
    }
    // "Origin at 0" hair is authored in bind-pose space; keep that while parenting to the head.
    this.model.add(hairScene);
    this.bones.Head.attach(hairScene);
    this.hairScene = hairScene;

    if (L.beard && assets.models.hairBeard) {
      const beard = clone(assets.models.hairBeard.scene);
      const ms: THREE.Mesh[] = [];
      beard.traverse((o) => (o as THREE.Mesh).isMesh && ms.push(o as THREE.Mesh));
      for (const m of ms) {
        m.material = toon(L.hair, { rim: 0.3 });
        addOutline(m, 0.004);
      }
      this.model.add(beard);
      this.bones.Head.attach(beard);
    }
    this.buildAccessories();

    if (L.hairStyle === 'ponytail') {
      const head = this.wp('Head');
      let parent: THREE.Object3D = this.bones.Head;
      const start = new THREE.Vector3(head.x, head.y + 0.16, head.z - 0.1);
      const sizes = [0.075, 0.068, 0.055, 0.04];
      const base = new THREE.Group();
      this.at('Head', base, start);
      parent = base;
      sizes.forEach((r, i) => {
        const g = new THREE.Group();
        if (i > 0) g.position.set(0, -0.15, 0);
        const cone = part(new THREE.ConeGeometry(r, 0.2, 7), L.hair, 0.01);
        cone.rotation.x = Math.PI;
        cone.position.y = -0.08;
        g.add(cone);
        parent.add(g);
        this.ponytail.push(g);
        parent = g;
      });
      const tie = part(new THREE.TorusGeometry(0.04, 0.016, 6, 12), 0xffc93c, 0.006);
      tie.rotation.x = Math.PI / 2;
      base.add(tie);
    }
  }

  /** Quaternius modular outfit pieces, re-bound to this rig's skeleton and tinted per piece. */
  private attachOutfit() {
    const o = this.def.look.outfit!;
    const ok = this.attachOutfitSet(o.set, o.parts);
    if (ok && o.mix) this.attachOutfitSet(o.mix.set, o.mix.parts);
    return ok;
  }

  private attachOutfitSet(set: 'ranger' | 'peasant', parts: OutfitPart[]) {
    const L = this.def.look;
    const o = { set, parts };
    const key = `outfit${L.body === 'male' ? 'Male' : 'Female'}${o.set === 'ranger' ? 'Ranger' : 'Peasant'}` as ModelKey;
    const src = assets.models[key]?.scene;
    if (!src) return false;
    const scene = clone(src);
    const bones = new Map<string, THREE.Bone>();
    this.model.traverse((b) => (b as THREE.Bone).isBone && bones.set(b.name, b as THREE.Bone));
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((m) => (m as THREE.SkinnedMesh).isSkinnedMesh && meshes.push(m as THREE.SkinnedMesh));
    const host = (() => {
      let h: THREE.Object3D | null = null;
      this.model.traverse((m) => {
        if (!h && (m as THREE.SkinnedMesh).isSkinnedMesh) h = m.parent;
      });
      return h ?? this.model;
    })();
    const partOf = (n: string): OutfitPart => (/Pauldron/.test(n) ? 'pauldron' : /Hood/.test(n) ? 'hood' : /Bracer/.test(n) ? 'bracer' : /Belt/.test(n) ? 'belt' : /Arms/.test(n) ? 'arms' : /Body/.test(n) ? 'body' : /Legs/.test(n) ? 'legs' : 'feet');
    const tint: Record<OutfitPart, number> = { body: L.top, arms: L.top, legs: L.pants, feet: L.shoes, hood: L.topAccent, pauldron: L.topAccent, bracer: L.glove, belt: L.glove };
    for (const m of meshes) {
      const part = partOf(m.name);
      if (!o.parts.includes(part)) continue;
      const srcMat = m.material as THREE.MeshStandardMaterial;
      const skin = /Regular/.test(srcMat.name);
      if (skin) m.material = this.skinMat ?? srcMat;
      else {
        const map = srcMat.map ?? undefined;
        if (map) map.colorSpace = THREE.SRGBColorSpace;
        m.material = toon(tint[part], { map, rim: 0.3 });
      }
      rebindToBones(m, bones);
      m.castShadow = true;
      m.frustumCulled = false;
      host.add(m);
      skinnedOutline(m, 0.008);
    }
    if (o.parts.includes('hood') && this.hairScene) this.hairScene.visible = false;
    return true;
  }

  /** Swaying head pieces (twin tails, headband tails), animated by the ModelAnimator. */
  readonly swayers: { obj: THREE.Object3D; base: THREE.Euler; amp: number }[] = [];

  /** Code-built accessories: headbands, twin tails, a cap, a ribbon, an obi sash. */
  private buildAccessories() {
    const L = this.def.look;
    if (!L.accessories?.length) return;
    const head = this.wp('Head');
    const female = L.body === 'female';
    const hr = female ? 0.1 : 0.106;
    for (const a of L.accessories) {
      switch (a.kind) {
        case 'headband':
        case 'hachimaki': {
          const band = part(new THREE.TorusGeometry(hr + 0.02, 0.017, 6, 24), a.color, 0.005);
          band.scale.set(1, 1.15, 1);
          band.rotation.x = Math.PI / 2 - 0.25;
          this.at('Head', band, head.clone().add(new THREE.Vector3(0, 0.175, -0.02)));
          if (a.kind === 'hachimaki') {
            // Knot at the back with two trailing ends.
            const knot = part(new THREE.SphereGeometry(0.022, 8, 6), a.color, 0.004);
            this.at('Head', knot, head.clone().add(new THREE.Vector3(0, 0.2, -hr - 0.02)));
            for (const sx of [-1, 1]) {
              const pivot = new THREE.Group();
              const tail = part(new THREE.BoxGeometry(0.035, 0.2, 0.008), a.color, 0.004);
              tail.position.y = -0.1;
              pivot.add(tail);
              pivot.rotation.set(0.5, 0, sx * 0.25);
              this.at('Head', pivot, head.clone().add(new THREE.Vector3(sx * 0.02, 0.19, -hr - 0.03)));
              this.swayers.push({ obj: pivot, base: pivot.rotation.clone(), amp: 0.25 });
            }
          }
          break;
        }
        case 'twinTails': {
          for (const sx of [-1, 1]) {
            const pivot = new THREE.Group();
            for (let i = 0; i < 3; i++) {
              const r = [0.055, 0.05, 0.035][i];
              const seg = part(new THREE.ConeGeometry(r, 0.17, 8), L.hair, 0.006);
              seg.rotation.x = Math.PI;
              seg.position.y = -0.07 - i * 0.12;
              pivot.add(seg);
            }
            const tie = part(new THREE.TorusGeometry(0.03, 0.012, 6, 12), a.color, 0.004);
            tie.rotation.x = Math.PI / 2;
            pivot.add(tie);
            pivot.rotation.set(0.15, 0, sx * 0.35);
            this.at('Head', pivot, head.clone().add(new THREE.Vector3(sx * (hr + 0.01), 0.22, -0.035)));
            this.swayers.push({ obj: pivot, base: pivot.rotation.clone(), amp: 0.18 });
          }
          break;
        }
        case 'cap': {
          // Backwards cap: dome + brim at the back.
          const dome = part(new THREE.SphereGeometry(hr + 0.018, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), a.color, 0.006);
          dome.scale.set(1, 0.85, 1.05);
          this.at('Head', dome, head.clone().add(new THREE.Vector3(0, 0.17, -0.015)));
          const brim = part(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), a.color, 0.004);
          brim.scale.set(1, 1, 1.2);
          this.at('Head', brim, head.clone().add(new THREE.Vector3(0, 0.18, -hr - 0.03)));
          const button = part(new THREE.SphereGeometry(0.014, 6, 6), 0xffffff, 0);
          this.at('Head', button, head.clone().add(new THREE.Vector3(0, 0.17 + (hr + 0.018) * 0.85, -0.015)));
          break;
        }
        case 'topHat': {
          // Magician's top hat with a coloured band, tipped slightly back.
          const g = new THREE.Group();
          const brim = part(new THREE.CylinderGeometry(hr + 0.06, hr + 0.06, 0.012, 24), a.color, 0.005);
          g.add(brim);
          const crown = part(new THREE.CylinderGeometry(hr - 0.005, hr - 0.015, 0.2, 20), a.color, 0.006);
          crown.position.y = 0.1;
          g.add(crown);
          const band = part(new THREE.CylinderGeometry(hr - 0.008, hr - 0.004, 0.035, 20), this.def.element.color, 0.003);
          band.position.y = 0.025;
          g.add(band);
          g.rotation.x = -0.12;
          this.at('Head', g, head.clone().add(new THREE.Vector3(0, 0.205, -0.02)));
          break;
        }
        case 'beret': {
          const b = part(new THREE.SphereGeometry(hr + 0.03, 16, 10), a.color, 0.005);
          b.scale.set(1.05, 0.35, 1.05);
          b.rotation.z = 0.25;
          this.at('Head', b, head.clone().add(new THREE.Vector3(0.02, 0.2, -0.01)));
          break;
        }
        case 'ribbon': {
          const g = new THREE.Group();
          for (const sx of [-1, 1]) {
            const loop = part(new THREE.ConeGeometry(0.045, 0.09, 4), a.color, 0.004);
            loop.rotation.z = (sx * Math.PI) / 2;
            loop.position.x = sx * 0.045;
            g.add(loop);
          }
          g.add(part(new THREE.SphereGeometry(0.02, 8, 6), a.color, 0.004));
          this.at('Head', g, head.clone().add(new THREE.Vector3(0.07, 0.24, -0.07)));
          break;
        }
        case 'obi': {
          // Wide sash with a knot at the back (worn over the outfit).
          const pelvis = this.wp('pelvis');
          const s1 = this.wp('spine_01');
          const obi = part(new THREE.CylinderGeometry(0.17, 0.175, 0.13, 20, 1, true), a.color, 0.006);
          (obi.material as THREE.Material).side = THREE.DoubleSide;
          obi.scale.z = 0.8;
          this.at('spine_01', obi, pelvis.clone().lerp(s1, 0.75).add(new THREE.Vector3(0, 0, 0.005)));
          const knot = part(new THREE.BoxGeometry(0.12, 0.07, 0.05), a.color, 0.005);
          this.at('spine_01', knot, pelvis.clone().lerp(s1, 0.75).add(new THREE.Vector3(0, 0, -0.15)));
          break;
        }
      }
    }
  }

  private buildOutfit() {
    const L = this.def.look;
    const dressed = !!L.outfit && this.attachOutfit();
    const cap = (r: number, k = 1) => (len: number) => new THREE.CapsuleGeometry(r, Math.max(0.01, len * k), 6, 12);
    const P = (n: BoneName) => this.wp(n);
    const female = L.body === 'female';
    const s = female ? 0.92 : 1;

    // --- Torso: dark tank top + open jacket --------------------------------
    const pelvis = P('pelvis');
    const sp1 = P('spine_01');
    const sp3 = P('spine_03');
    const neck = P('neck_01');
    if (!dressed) {
    const tank = this.seg('spine_02', sp1.clone().lerp(pelvis, female ? 0 : 0.6), neck.clone().lerp(sp3, 0.35), cap(female ? 0.13 : 0.155, 0.75), 0x26263a, 0.01);
    tank.scale.set(1.05, 1, 0.72);
    const jacketLow = this.seg('spine_01', sp1.clone().lerp(pelvis, 0.3), sp3, (len) => openShell(0.165 * s, 0.17 * s, len), L.top, 0.012);
    jacketLow.scale.z = 0.78;
    const jacketHigh = this.seg('spine_03', sp3.clone().lerp(sp1, 0.25), neck.clone().lerp(sp3, 0.2), (len) => openShell(0.17 * s, 0.155 * s, len), L.top, 0.012);
    jacketHigh.scale.z = 0.8;
    for (const j of [jacketLow, jacketHigh]) {
      const m = (j.material as THREE.MeshToonMaterial).clone();
      m.side = THREE.DoubleSide;
      j.material = m;
    }
    // Hood / collar like the reference.
    const collar = part(new THREE.TorusGeometry(0.12 * s, 0.045, 8, 18), L.topAccent, 0.01);
    collar.rotation.x = Math.PI / 2 - 0.35;
    this.at('spine_03', collar, neck.clone().add(new THREE.Vector3(0, -0.04, -0.02)));
    for (const side of [-1, 1]) {
      const stripe = part(new THREE.BoxGeometry(0.025, 0.36, 0.025), L.topAccent, 0.006);
      this.at('spine_03', stripe, new THREE.Vector3(sp3.x + side * 0.06, (sp3.y + sp1.y) / 2 + 0.05, sp3.z + 0.13 * s));
    }
    // Coat tails (spring driven).
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const tail = part(new THREE.BoxGeometry(0.12, 0.2, 0.025), L.top, 0.01);
      tail.position.y = -0.1;
      pivot.add(tail);
      this.at('pelvis', pivot, new THREE.Vector3(pelvis.x + side * 0.1, pelvis.y + 0.02, pelvis.z - 0.1));
      this.coatTails.push(pivot);
    }
    }

    // --- Arms -----------------------------------------------------------------
    for (const side of ['l', 'r'] as const) {
      const ua = P(`upperarm_${side}`);
      const la = P(`lowerarm_${side}`);
      const ha = P(`hand_${side}`);
      if (!dressed) {
        const pad = part(new THREE.SphereGeometry(0.085 * s, 12, 10), L.top, 0.01);
        this.at(`upperarm_${side}`, pad, ua.clone().lerp(la, 0.08));
        this.seg(`upperarm_${side}`, ua, la, cap(0.068 * s, 0.85), L.top, 0.01);
        this.seg(`lowerarm_${side}`, la, la.clone().lerp(ha, 0.15), (len) => new THREE.CylinderGeometry(0.072 * s, 0.07 * s, len, 12), L.topAccent, 0.008);
      }
      const tip = side === 'l' ? this.tipL : this.tipR;
      const mid = P(`middle_01_${side}`);
      if (this.def.weapon === 'fists') {
        // Boxing glove: padded mitt with a thumb and a laced cuff.
        const glove = buildBoxingGlove(this.def.element.color, 0xffffff);
        const fwd = mid.clone().sub(ha).normalize();
        glove.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
        this.at(`hand_${side}`, glove, ha.clone().lerp(mid, 0.25));
        if (side === 'l') glove.scale.x = -1;
        this.at(`hand_${side}`, tip, ha.clone().lerp(mid, 1.6));
      } else {
        // Hand frame: forward along the metacarpals, up toward the thumb.
        const fwd = mid.clone().sub(ha).normalize();
        const th = P(`thumb_01_${side}`).sub(ha);
        const up = th.sub(fwd.clone().multiplyScalar(th.dot(fwd))).normalize();
        const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
        const holder = new THREE.Group();
        holder.quaternion.setFromRotationMatrix(basis);
        const grip = ha.clone().lerp(mid, 0.55);
        if (this.def.weapon === 'guns') {
          const gun = buildBlaster(0.85);
          holder.add(gun);
          gun.position.set(0, 0.035, 0.0);
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0.04, 0.3);
          holder.add(tip);
        } else if (this.def.weapon === 'bow' && side === this.bowHand) {
          this.buildBow(holder);
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0, 0.1);
          holder.add(tip);
        } else if (this.def.weapon === 'hammer' && side === 'r') {
          this.buildHammer(holder);
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0.78, 0);
          this.weaponRoot.add(tip);
        } else if (this.def.weapon === 'katana' && side === 'r') {
          holder.add(this.weaponRoot);
          this.weaponRoot.add(buildKatana());
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, KATANA_TIP_Y, -0.03);
          this.weaponRoot.add(tip);
        } else if (this.def.weapon === 'umbrella' && side === 'r') {
          holder.add(this.weaponRoot);
          const u = buildUmbrella(this.def.look.top, this.def.look.topAccent);
          this.weaponRoot.add(u.group);
          this.setUmbrellaOpen = u.setOpen;
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, u.tipY, 0);
          this.weaponRoot.add(tip);
        } else if (this.def.weapon === 'rifle' && side === 'r') {
          const r = buildRifle(1);
          holder.add(r.group);
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0.06, r.muzzleZ);
          holder.add(tip);
        } else if (this.def.weapon === 'cards' && side === 'r') {
          const fan = buildCardFan(this.def.element.color, 1.1);
          fan.position.set(0, 0.02, 0.04);
          holder.add(fan);
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0.04, 0.12);
          holder.add(tip);
        } else if (this.def.weapon === 'cannon' && side === 'r') {
          // Arm cannon strapped over the right forearm, muzzle past the knuckles.
          const cannon = buildArmCannon(0.9);
          holder.add(cannon);
          cannon.position.set(0, 0.05, -0.08);
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0.05, 0.42);
          holder.add(tip);
        } else if (this.def.weapon === 'grapple' && side === 'r') {
          const gun = buildHookGun(0.85);
          holder.add(gun.group);
          gun.group.position.set(0, 0.035, 0);
          this.hookClaw = gun.claw;
          this.at(`hand_${side}`, holder, grip);
          tip.position.set(0, 0.04, 0.3);
          holder.add(tip);
        } else if (this.def.weapon === 'grapple') {
          this.at(`hand_${side}`, tip, ha.clone().lerp(mid, 1.2));
        } else if (this.def.weapon === 'yoyo' && side === 'r') {
          this.at(`hand_${side}`, tip, grip);
          this.yoyo = buildYoyo(this.def.element.color, this.def.element.color2);
          this.root.add(this.yoyo);
          this.yoyoString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
          this.yoyoString.frustumCulled = false;
          this.root.add(this.yoyoString);
        } else {
          this.at(`hand_${side}`, tip, grip);
        }
      }
    }
    if (this.def.weapon === 'katana') {
      // Scabbard on the left hip.
      const pl = P('pelvis');
      const a = pl.clone().add(new THREE.Vector3(0.18, 0.05, 0.12));
      const b = pl.clone().add(new THREE.Vector3(0.22, -0.42, -0.3));
      const saya = buildSaya(a.distanceTo(b) * 1.25);
      if (saya) {
        saya.position.lerpVectors(a, b, 0.5);
        saya.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
        this.model.add(saya);
        this.bones.pelvis.attach(saya);
      } else this.seg('pelvis', a, b, (len) => new THREE.CylinderGeometry(0.03, 0.026, len, 8), 0x1d1d2b, 0.008);
    }
    if (this.def.weapon === 'bow') {
      // Quiver on the back.
      const sp3 = P('spine_03');
      const q = this.seg('spine_03', sp3.clone().add(new THREE.Vector3(0.12, -0.25, -0.2)), sp3.clone().add(new THREE.Vector3(-0.08, 0.2, -0.2)), (len) => new THREE.CylinderGeometry(0.07, 0.06, len, 12), 0x6b4a2e, 0.01);
      for (let i = 0; i < 3; i++) {
        const fl = part(new THREE.ConeGeometry(0.035, 0.1, 4), this.def.element.color2, 0.006);
        fl.position.set((i - 1) * 0.03, 0.27, 0);
        q.add(fl);
      }
    }

    // --- Legs -----------------------------------------------------------------
    if (dressed) return;
    const shorts = this.seg('pelvis', pelvis.clone().add(new THREE.Vector3(0, 0.09, 0)), pelvis.clone().add(new THREE.Vector3(0, -0.12, 0)), (len) => new THREE.CylinderGeometry(0.185, 0.2, len, 16), L.pants, 0.012);
    shorts.scale.z = 0.78;
    const belt = part(new THREE.TorusGeometry(0.168 * s, 0.025, 6, 20), 0x2b2b3d, 0.006);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.78, 1);
    this.at('pelvis', belt, pelvis.clone().add(new THREE.Vector3(0, 0.08, 0)));
    const buckle = part(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), 0xffc93c, 0.005);
    buckle.rotation.x = Math.PI / 2;
    this.at('pelvis', buckle, pelvis.clone().add(new THREE.Vector3(0, 0.08, 0.135 * s)));
    for (const side of ['l', 'r'] as const) {
      const th = P(`thigh_${side}`);
      const ca = P(`calf_${side}`);
      const ft = P(`foot_${side}`);
      const ba = P(`ball_${side}`);
      this.seg(`thigh_${side}`, th, ca, cap(0.125, 0.95), L.pants, 0.012);
      this.seg(`calf_${side}`, ca, ft.clone().lerp(ca, 0.12), cap(female ? 0.098 : 0.11, 0.9), L.pants, 0.012);
      const sock = this.seg(`calf_${side}`, ft.clone().lerp(ca, 0.18), ft, (len) => new THREE.CylinderGeometry(0.06, 0.06, len, 10), 0x2b2b3d, 0.006);
      void sock;
      // Sneaker: from heel to past the toes.
      const heel = ft.clone().add(new THREE.Vector3(0, -0.03, -0.05));
      const toe = ba.clone().add(new THREE.Vector3(0, -0.01, 0.07));
      const shoe = this.seg(`foot_${side}`, heel, toe, (len) => new THREE.BoxGeometry(0.12, len, 0.1), L.shoes, 0.012);
      void shoe;
      const sole = this.seg(`foot_${side}`, heel.clone().add(new THREE.Vector3(0, -0.055, 0)), toe.clone().add(new THREE.Vector3(0, -0.055, 0)), (len) => new THREE.BoxGeometry(0.13, len * 1.02, 0.03), 0xd8473c, 0.006);
      void sole;
    }
  }
}

/** Jacket shell: a cylinder with an opening at the front. */
function openShell(rTop: number, rBottom: number, len: number) {
  const gap = 0.55;
  // Cylinder axis is Y; theta 0 is +Z (front) in three's CylinderGeometry.
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, 18, 1, true, gap / 2, Math.PI * 2 - gap);
  g.computeVertexNormals();
  return g;
}

export { toon };
