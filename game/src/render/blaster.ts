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
