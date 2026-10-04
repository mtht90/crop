import * as THREE from 'three';
import { part, toon } from './toon';

/** Chunky toy-like blaster matching the reference image (white/blue/orange with a star). */
export function buildBlaster(scale = 1) {
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
