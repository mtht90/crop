import * as THREE from 'three';
import { assets } from './assets';
import { addOutline, part, toon } from './toon';

/**
 * Star's pistol: Kenney Blaster Kit "blaster-j" (CC0) with toon shading, or the
 * code-built blaster when the model isn't loaded. Barrel along +Z, grip at the origin.
 */
export function buildBlaster(scale = 1) {
  const src = assets.models.blaster?.scene;
  if (!src) return buildBlasterFallback(scale);
  const g = new THREE.Group();
  const m = toonClone(src);
  // The model is 0.61 m long with its grip (magazine) 8 cm behind center.
  m.scale.setScalar(0.62);
  m.position.set(0, 0.0, 0.08 * 0.62);
  g.add(m);
  g.scale.setScalar(scale);
  return g;
}

/** Clone of an external model with toon materials and thin outlines. */
function toonClone(src: THREE.Object3D, outline = 0.012) {
  const m = src.clone(true);
  const meshes: THREE.Mesh[] = [];
  m.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
  for (const mesh of meshes) {
    const srcMat = mesh.material as THREE.MeshStandardMaterial;
    const map = srcMat.map ?? undefined;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    // Untextured parts keep their own color (lacquer, gold fittings).
    mesh.material = toon(map ? 0xffffff : srcMat.color.getHex(), { map, rim: 0.3 });
    mesh.castShadow = true;
    addOutline(mesh, outline);
  }
  return m;
}

/**
 * Zip's hook launcher: Kenney "blaster-h" with a suction cup on the muzzle.
 * Barrel along +Z, grip at the origin. `claw` is hidden while the hook is out.
 */
export function buildHookGun(scale = 1) {
  const g = new THREE.Group();
  const src = assets.models.hookGun?.scene;
  if (src) {
    const m = toonClone(src);
    m.scale.setScalar(0.6);
    m.position.set(0, 0.0, 0.06);
    g.add(m);
  } else {
    const body = part(new THREE.BoxGeometry(0.11, 0.13, 0.36), 0xff8a1f, 0.012);
    body.position.z = 0.08;
    g.add(body);
    const grip = part(new THREE.BoxGeometry(0.07, 0.15, 0.08), 0x2b2b3d, 0.01);
    grip.position.set(0, -0.11, -0.02);
    g.add(grip);
  }
  const claw = buildHookHead(0.75);
  claw.position.set(0, 0.01, 0.34);
  g.add(claw);
  g.scale.setScalar(scale);
  return { group: g, claw };
}

/**
 * Grappling head: a big rubber suction cup on a short stem, cup mouth facing +Z
 * (the direction of travel), so it reads clearly as "it sticks".
 */
export function buildHookHead(scale = 1) {
  const g = new THREE.Group();
  const cupPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    cupPts.push(new THREE.Vector2(0.03 + 0.1 * Math.sin((t * Math.PI) / 2), -0.075 * Math.cos((t * Math.PI) / 2)));
  }
  const cupGeo = new THREE.LatheGeometry(cupPts, 18);
  cupGeo.rotateX(-Math.PI / 2);
  const cup = new THREE.Mesh(cupGeo, toon(0xff3b5c, { rim: 0.5 }).clone());
  (cup.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  addOutline(cup, 0.008);
  cup.position.z = 0.05;
  g.add(cup);
  const lip = part(new THREE.TorusGeometry(0.13, 0.014, 6, 20), 0xff7a90, 0.004);
  lip.position.z = 0.05;
  g.add(lip);
  const stem = part(new THREE.CylinderGeometry(0.022, 0.026, 0.14, 10), 0xffd23a, 0.006);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = -0.06;
  g.add(stem);
  const knob = part(new THREE.SphereGeometry(0.032, 10, 8), 0x2b2b3d, 0.004);
  knob.position.z = -0.13;
  g.add(knob);
  g.scale.setScalar(scale);
  return g;
}

/** Height of the katana tip above the grip (for trails). */
export const KATANA_TIP_Y = 0.86;

/**
 * Katana: "Katana" by pfunked (OpenGameArt, CC0) - red-wrapped tsuka, open-work
 * tsuba and a curved blade. Grip at the origin, blade along +Y, edge toward +Z.
 */
export function buildKatana(scale = 1) {
  const g = new THREE.Group();
  const src = assets.models.katana?.scene;
  if (src) {
    const m = toonClone(src, 0.006);
    // Source: tsuba 0.24 below the center, tsuka down to -0.54; hold it just under the guard.
    m.position.y = 0.33;
    g.add(m);
  } else {
    const blade = part(new THREE.BoxGeometry(0.012, 0.9, 0.04), 0xe9eef7, 0.006);
    blade.position.y = 0.55;
    g.add(blade);
    const grip = part(new THREE.CylinderGeometry(0.022, 0.024, 0.26, 8), 0x1d1d2b, 0.006);
    g.add(grip);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Lacquered sheath (from "Katana" by Clint Bellanger, CC0) scaled to `length`, lying along +X. */
export function buildSaya(length: number) {
  const src = assets.models.saya?.scene;
  if (!src) return null;
  const m = toonClone(src, 0.005);
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const k = length / size.x;
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  m.position.copy(c).multiplyScalar(-k);
  m.scale.multiplyScalar(k);
  g.add(m);
  return g;
}

/** Boxing glove around a fist: padded mitt along +Z with a thumb on +X and a laced cuff. */
export function buildBoxingGlove(color: number, cuffColor: number, scale = 1) {
  const g = new THREE.Group();
  const mitt = part(new THREE.SphereGeometry(1, 18, 14), color, 0.01, { rim: 0.45 });
  mitt.scale.set(0.072, 0.068, 0.095);
  mitt.position.z = 0.055;
  g.add(mitt);
  const knuckle = part(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), color, 0.006, { rim: 0.45 });
  knuckle.scale.set(0.068, 0.03, 0.07);
  knuckle.position.set(0, 0.045, 0.07);
  g.add(knuckle);
  const thumb = part(new THREE.CapsuleGeometry(0.022, 0.05, 4, 10), color, 0.006, { rim: 0.45 });
  thumb.rotation.x = Math.PI / 2 - 0.35;
  thumb.position.set(0.058, -0.01, 0.04);
  g.add(thumb);
  const cuff = part(new THREE.CylinderGeometry(0.055, 0.06, 0.075, 16), cuffColor, 0.006);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.03;
  g.add(cuff);
  const lace = part(new THREE.BoxGeometry(0.012, 0.004, 0.07), color, 0);
  lace.position.set(0, 0.058, -0.03);
  g.add(lace);
  g.scale.setScalar(scale);
  return g;
}

/** Yo-yo: two discs on an axle, axle along X. */
export function buildYoyo(color: number, accent: number, scale = 1) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const disc = part(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), color, 0.008);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = s * 0.035;
    g.add(disc);
    const cap = part(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16), accent, 0);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s * 0.065;
    g.add(cap);
    const star = part(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 5), 0xffffff, 0);
    star.rotation.z = Math.PI / 2;
    star.position.x = s * 0.07;
    g.add(star);
  }
  g.scale.setScalar(scale);
  return g;
}

/**
 * Umbrella: OpenGameArt "Cute umbrella" (CC0) tinted with the character color.
 * Handle at the origin, shaft along +Y. `setOpen(k)` spreads the canopy from a
 * furled roll (0) to a full dome (1) that doubles as a shield; the tip is a
 * small barrel that fires shots.
 */
export function buildUmbrella(color: number, accent: number, scale = 1) {
  const g = new THREE.Group();
  const src = assets.models.umbrella?.scene;
  const canopy = new THREE.Group();
  if (src) {
    // Source units: stick y -0.245..1.0 (hook at the bottom), canopy apex at y 1.186.
    const k = 0.78;
    const APEX = 1.186;
    src.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const map = (m.material as THREE.MeshStandardMaterial).map ?? undefined;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const isCanopy = m.name === 'canopy';
      const mesh = new THREE.Mesh(m.geometry, isCanopy ? stripedCanopy(color, accent, map) : toon(0x8a5a3c, { map, rim: 0.4 }).clone());
      (mesh.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      mesh.castShadow = true;
      addOutline(mesh, 0.01);
      if (isCanopy) {
        // Pivot at the apex so furling pulls the cloth in around the shaft.
        mesh.position.y = -APEX;
        canopy.add(mesh);
      } else {
        mesh.position.y = 0.05;
        mesh.scale.setScalar(1);
        const stick = new THREE.Group();
        stick.add(mesh);
        stick.scale.setScalar(k);
        g.add(stick);
      }
    });
    canopy.position.y = (APEX + 0.05) * k;
    canopy.scale.setScalar(k);
  } else {
    const shaft = part(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 8), accent, 0.004);
    shaft.position.y = 0.44;
    g.add(shaft);
    const cone = part(new THREE.ConeGeometry(0.7, 0.3, 8, 1, true), color, 0.006);
    (cone.material as THREE.Material).side = THREE.DoubleSide;
    cone.position.y = -0.15;
    canopy.add(cone);
    canopy.position.y = 0.98;
  }
  const inner = new THREE.Group();
  inner.add(...canopy.children);
  canopy.add(inner);
  g.add(canopy);
  // Gold fittings: a collar above the grip, the top notch and a ferrule that doubles as the barrel.
  const gold = 0xe0b84a;
  const collar = part(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 12), gold, 0.004, { rim: 0.7 });
  collar.position.y = 0.06;
  g.add(collar);
  const notch = part(new THREE.SphereGeometry(0.026, 10, 8), gold, 0.004, { rim: 0.7 });
  notch.position.y = canopy.position.y - 0.005;
  g.add(notch);
  const barrel = part(new THREE.ConeGeometry(0.02, 0.12, 10), gold, 0.004, { rim: 0.7 });
  barrel.position.y = canopy.position.y + 0.06;
  g.add(barrel);
  const tipY = barrel.position.y + 0.06;
  const setOpen = (k: number) => {
    const o = Math.max(0, Math.min(1, k));
    // Furled: thin and long along the shaft; open: the full dome with a little overshoot
    // and a quarter turn, like a canopy snapping open.
    const pop = o < 1 ? o + Math.sin(o * Math.PI) * 0.12 : 1;
    inner.scale.set(0.09 + 0.91 * pop, 2.6 - 1.6 * o, 0.09 + 0.91 * pop);
    inner.rotation.y = (1 - o) * 0.8;
  };
  setOpen(0);
  g.scale.setScalar(scale);
  return { group: g, setOpen, tipY: tipY * scale };
}

/** Chunky toy-like blaster built from primitives (white/blue/orange with a star). */
function buildBlasterFallback(scale = 1) {
  const g = new THREE.Group();
  const body = part(new THREE.BoxGeometry(0.1, 0.12, 0.3), 0xf4f6fb, 0.012);
  body.position.z = 0.08;
  g.add(body);
  const top = part(new THREE.BoxGeometry(0.11, 0.05, 0.24), 0x3f6fe0, 0.01);
  top.position.set(0, 0.075, 0.08);
  g.add(top);
  const side = part(new THREE.BoxGeometry(0.12, 0.08, 0.12), 0xf2a516, 0.01);
  side.position.set(0, 0.0, -0.02);
  g.add(side);
  const barrel = part(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10), 0x2b2b3d, 0.01);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.27;
  g.add(barrel);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: 0x6fe8ff }));
  lens.position.set(0, 0.105, 0.0);
  g.add(lens);
  const grip = part(new THREE.BoxGeometry(0.07, 0.15, 0.08), 0x2b2b3d, 0.01);
  grip.position.set(0, -0.11, -0.02);
  grip.rotation.x = -0.25;
  g.add(grip);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.045 : 0.02;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (const s of [-1, 1]) {
    const emblem = new THREE.Mesh(new THREE.ShapeGeometry(starShape), toon(0xffd22e, { rim: 0, emissive: 0x442200 }));
    emblem.position.set(s * 0.062, 0.0, 0.1);
    emblem.rotation.y = (s * Math.PI) / 2;
    emblem.rotation.z = Math.PI;
    g.add(emblem);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Squeaky toy hammer: striped handle along +Y from the grip, bellows head (axis +Z) at the top. */
export function buildToyHammer(accent: number) {
  const g = new THREE.Group();
  const handle = part(new THREE.CylinderGeometry(0.028, 0.032, 0.78, 10), 0xffe14a, 0.008);
  handle.position.y = 0.3;
  g.add(handle);
  for (let i = 0; i < 4; i++) {
    const band = part(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 10), accent, 0.004);
    band.position.y = 0.02 + i * 0.16;
    g.add(band);
  }
  const head = new THREE.Group();
  head.position.y = 0.78;
  // Head axis along the swing direction (hand forward = +Z).
  head.rotation.x = Math.PI / 2;
  g.add(head);
  const body = part(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 18), 0xff4f8b, 0.012);
  head.add(body);
  for (let i = -2; i <= 2; i++) {
    const fold = part(new THREE.TorusGeometry(0.155, 0.018, 6, 20), 0xff7aa8, 0);
    fold.rotation.x = Math.PI / 2;
    fold.position.y = i * 0.055;
    head.add(fold);
  }
  for (const sgn of [-1, 1]) {
    const cap = part(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 18), 0xffe14a, 0.012);
    cap.position.y = sgn * 0.185;
    head.add(cap);
    const face = part(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 18), 0xffffff, 0);
    face.position.y = sgn * 0.225;
    head.add(face);
  }
  return g;
}

/**
 * Bow in its own XY plane: grip at the origin, back of the bow bulging toward +X,
 * limbs along ±Y, with a 3-point string (top, nock, bottom) whose middle point can be drawn.
 */
export function buildBowMesh(scale = 1) {
  const R = 0.55 * scale;
  const arc = Math.PI * 0.75;
  const g = new THREE.TorusGeometry(R, 0.022 * scale, 8, 28, arc);
  g.rotateZ(-arc / 2);
  g.translate(-R, 0, 0);
  const group = new THREE.Group();
  group.add(part(g, 0x7a4a26, 0.008));
  group.add(part(new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, 0.14 * scale, 10), 0xf2e6c9, 0.006));
  const top = new THREE.Vector3(R * Math.cos(arc / 2) - R, R * Math.sin(arc / 2), 0);
  const bottom = new THREE.Vector3(top.x, -top.y, 0);
  const rest = new THREE.Vector3(top.x, 0, 0);
  const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, rest.clone(), bottom]), new THREE.LineBasicMaterial({ color: 0xf4efe0 }));
  group.add(string);
  /** Moves the nock point (bow-local coordinates); pass null to rest. */
  const setNock = (p: THREE.Vector3 | null) => {
    const pos = string.geometry.attributes.position as THREE.BufferAttribute;
    const n = p ?? rest;
    pos.setXYZ(1, n.x, n.y, n.z);
    pos.needsUpdate = true;
  };
  return { group, string, rest, setNock };
}

/**
 * Toon canopy with alternating panels (main / accent) and a lighter lining on the
 * inside, computed from the object-space angle around the shaft.
 */
function stripedCanopy(color: number, accent: number, map?: THREE.Texture) {
  const base = toon(0xffffff, { map, rim: 0.4 });
  const m = base.clone();
  m.side = THREE.DoubleSide;
  const baseCompile = base.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(base, shader, renderer);
    shader.uniforms.panelA = { value: new THREE.Color(color) };
    shader.uniforms.panelB = { value: new THREE.Color(accent) };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vCanopy;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vCanopy = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 panelA;\nuniform vec3 panelB;\nvarying vec3 vCanopy;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float ang = atan(vCanopy.z, vCanopy.x);
         float panel = floor((ang + 3.14159265) / 6.2831853 * 8.0 + 0.5);
         vec3 tint = mod(panel, 2.0) < 0.5 ? panelA : panelB;
         diffuseColor.rgb *= tint * (gl_FrontFacing ? 1.0 : 1.25);`,
      );
  };
  m.customProgramCacheKey = () => `canopy-${color}-${accent}`;
  return m;
}
