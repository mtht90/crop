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

/** Clone of a Kenney model with toon materials and thin outlines. */
function toonClone(src: THREE.Object3D) {
  const m = src.clone(true);
  const meshes: THREE.Mesh[] = [];
  m.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
  for (const mesh of meshes) {
    const map = (mesh.material as THREE.MeshStandardMaterial).map ?? undefined;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    mesh.material = toon(0xffffff, { map, rim: 0.3 });
    mesh.castShadow = true;
    addOutline(mesh, 0.012);
  }
  return m;
}

/**
 * Zip's hook launcher: Kenney "blaster-h" with a three-prong hook on the muzzle.
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
  const claw = buildHookHead(0.7);
  claw.position.set(0, 0.01, 0.27);
  g.add(claw);
  g.scale.setScalar(scale);
  return { group: g, claw };
}

/** Grappling hook head pointing along +Z: a cone with three curved prongs. */
export function buildHookHead(scale = 1) {
  const g = new THREE.Group();
  const tip = part(new THREE.ConeGeometry(0.05, 0.14, 8), 0xdfe6f2, 0.008);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.06;
  g.add(tip);
  for (let i = 0; i < 3; i++) {
    const prong = part(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI * 0.8), 0xdfe6f2, 0.006);
    const a = (i / 3) * Math.PI * 2;
    prong.rotation.set(0, Math.PI / 2, 0);
    const holder = new THREE.Group();
    holder.rotation.z = a;
    prong.position.set(0, 0.05, -0.02);
    holder.add(prong);
    g.add(holder);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Katana: grip at the origin, blade along +Y with a slight curve, edge toward +Z. */
export function buildKatana(scale = 1) {
  const g = new THREE.Group();
  const grip = part(new THREE.CylinderGeometry(0.022, 0.024, 0.26, 8), 0x1d1d2b, 0.006);
  grip.position.y = -0.02;
  g.add(grip);
  for (let i = 0; i < 4; i++) {
    const wrap = part(new THREE.BoxGeometry(0.05, 0.012, 0.05), 0xf2f4ff, 0);
    wrap.position.y = -0.12 + i * 0.065;
    wrap.rotation.y = i % 2 ? 0.8 : -0.8;
    g.add(wrap);
  }
  const tsuba = part(new THREE.CylinderGeometry(0.06, 0.06, 0.018, 16), 0xc9a24a, 0.006);
  tsuba.position.y = 0.12;
  g.add(tsuba);
  // Curved blade: bend a thin box along an arc.
  const len = 0.95;
  const geo = new THREE.BoxGeometry(0.012, len, 0.042, 1, 16, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + len / 2;
    const taper = 1 - Math.max(0, y - len * 0.82) / (len * 0.18);
    pos.setZ(i, pos.getZ(i) * Math.max(0.05, taper) - 0.04 * (y / len) ** 2);
    pos.setY(i, y + 0.13);
  }
  geo.computeVertexNormals();
  const blade = part(geo, 0xe9eef7, 0.006, { rim: 0.6 });
  g.add(blade);
  const hamon = new THREE.Mesh(new THREE.BoxGeometry(0.014, len * 0.8, 0.006), new THREE.MeshBasicMaterial({ color: 0xbcd0ff }));
  hamon.position.set(0, 0.13 + len * 0.42, 0.012);
  g.add(hamon);
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
 * Umbrella: handle at the origin, shaft along +Y. `setOpen(k)` spreads the
 * canopy (0 = furled point, 1 = fully open).
 */
export function buildUmbrella(color: number, accent: number, scale = 1) {
  const g = new THREE.Group();
  const hook = part(new THREE.TorusGeometry(0.05, 0.016, 6, 14, Math.PI), 0x6b4a2e, 0.006);
  hook.rotation.z = Math.PI;
  hook.position.set(0.05, -0.06, 0);
  g.add(hook);
  const shaft = part(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 8), 0xf2f2f2, 0.004);
  shaft.position.y = 0.44;
  g.add(shaft);
  const ferrule = part(new THREE.ConeGeometry(0.018, 0.1, 8), 0xc9a24a, 0.004);
  ferrule.position.y = 0.98;
  g.add(ferrule);
  // Canopy: 8 alternating-color panels around the shaft, apex near the tip.
  const canopy = new THREE.Group();
  canopy.position.y = 0.92;
  g.add(canopy);
  const panels: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.ConeGeometry(0.62, 0.32, 3, 1, true, 0, (Math.PI * 2) / 8);
    geo.translate(0, -0.16, 0);
    const m = part(geo, i % 2 ? color : accent, 0);
    (m.material as THREE.Material).side = THREE.DoubleSide;
    m.rotation.y = (i / 8) * Math.PI * 2;
    canopy.add(m);
    panels.push(m);
  }
  const setOpen = (k: number) => {
    const o = Math.max(0, Math.min(1, k));
    // Furled: thin and long along the shaft; open: wide and shallow.
    canopy.scale.set(0.09 + 0.91 * o, 2.4 - 1.4 * o, 0.09 + 0.91 * o);
  };
  setOpen(0);
  g.scale.setScalar(scale);
  return { group: g, setOpen };
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
