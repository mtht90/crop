import * as THREE from 'three';
import * as T from './Textures';

/** Shared material library so identical surfaces batch well. */
export class Materials {
  floor: THREE.MeshStandardMaterial;
  backFloor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  wallBack: THREE.MeshStandardMaterial;
  shelfMetal: THREE.MeshStandardMaterial;
  shelfDark: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  whitePlastic: THREE.MeshStandardMaterial;
  blackPlastic: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  frame: THREE.MeshStandardMaterial;
  lightPanel: THREE.MeshStandardMaterial;
  brandGreen: THREE.MeshStandardMaterial;
  brandOrange: THREE.MeshStandardMaterial;
  brandRed: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  exteriorWall: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  shadow: THREE.MeshBasicMaterial;

  constructor(asphaltMap?: THREE.Texture, asphaltRough?: THREE.Texture) {
    const f = T.floorTiles();
    this.floor = new THREE.MeshStandardMaterial({ map: f.map, roughnessMap: f.roughnessMap, normalMap: f.normalMap, roughness: 1, metalness: 0, envMapIntensity: 1.1 });
    this.floor.normalScale.set(0.6, 0.6);
    const bf = T.plasticGrain('#9aa0a6');
    this.backFloor = new THREE.MeshStandardMaterial({ map: bf.map, normalMap: bf.normalMap, roughness: 0.6 });
    const c = T.ceilingTiles();
    this.ceiling = new THREE.MeshStandardMaterial({ map: c.map, normalMap: c.normalMap, roughness: 0.95, emissive: '#ffffff', emissiveMap: c.map, emissiveIntensity: 0.2 });
    const w = T.paintedWall();
    this.wall = new THREE.MeshStandardMaterial({ map: w.map, normalMap: w.normalMap, roughness: 0.85 });
    const wb = T.paintedWall('#e3e1da');
    this.wallBack = new THREE.MeshStandardMaterial({ map: wb.map, normalMap: wb.normalMap, roughness: 0.9 });
    this.shelfMetal = new THREE.MeshStandardMaterial({ color: '#ecebe7', roughness: 0.38, metalness: 0.25 });
    this.shelfDark = new THREE.MeshStandardMaterial({ color: '#3b3f45', roughness: 0.5, metalness: 0.3 });
    const s = T.brushedMetal();
    this.steel = new THREE.MeshStandardMaterial({ map: s.map, roughnessMap: s.roughnessMap, metalness: 0.95, roughness: 1 });
    const wd = T.woodLaminate();
    this.wood = new THREE.MeshStandardMaterial({ map: wd.map, normalMap: wd.normalMap, roughness: 0.45 });
    this.whitePlastic = new THREE.MeshStandardMaterial({ color: '#f6f6f3', roughness: 0.35 });
    const bp = T.plasticGrain('#1c1d20');
    this.blackPlastic = new THREE.MeshStandardMaterial({ map: bp.map, normalMap: bp.normalMap, roughness: 0.55 });
    this.glass = new THREE.MeshPhysicalMaterial({
      color: '#dfeff0', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, envMapIntensity: 1.6,
      clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: THREE.DoubleSide,
    });
    this.frame = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.9, roughness: 0.32 });
    this.lightPanel = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffaf0', emissiveIntensity: 3.2, roughness: 0.4 });
    this.brandGreen = new THREE.MeshStandardMaterial({ color: '#128a5a', roughness: 0.4 });
    this.brandOrange = new THREE.MeshStandardMaterial({ color: '#f39a1e', roughness: 0.4 });
    this.brandRed = new THREE.MeshStandardMaterial({ color: '#e8423a', roughness: 0.4 });
    this.rubber = new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.9 });
    const cr = T.plasticGrain('#a7a49c');
    this.concrete = new THREE.MeshStandardMaterial({ map: cr.map, normalMap: cr.normalMap, roughness: 0.92 });
    this.concrete.map!.repeat.set(8, 8);
    this.concrete.normalMap!.repeat.set(8, 8);
    this.asphalt = new THREE.MeshStandardMaterial({ map: asphaltMap ?? null, roughnessMap: asphaltRough ?? null, color: asphaltMap ? '#ffffff' : '#3a3a3a', roughness: 1 });
    this.paint = new THREE.MeshStandardMaterial({ color: '#f2f2ec', roughness: 0.7 });
    const ew = T.paintedWall('#f4f3ef');
    this.exteriorWall = new THREE.MeshStandardMaterial({ map: ew.map, normalMap: ew.normalMap, roughness: 0.8 });
    this.screen = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.2 });
    this.shadow = new THREE.MeshBasicMaterial({ map: T.blobShadow(), transparent: true, depthWrite: false });
  }
}

/** Utility: add a box mesh with its origin at the bottom centre. */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, opts: { cast?: boolean; receive?: boolean; uvScale?: number; name?: string } = {}): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  if (opts.uvScale) scaleBoxUV(g, w, h, d, opts.uvScale);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  if (opts.name) mesh.name = opts.name;
  parent.add(mesh);
  return mesh;
}

/** World-scale UVs for a box so tiled textures keep their physical size. */
export function scaleBoxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, tile: number): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z ; 4 verts each (1 segment)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
}

export function plane(parent: THREE.Object3D, w: number, h: number, m: THREE.Material, pos: THREE.Vector3, rot: THREE.Euler, tile?: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  if (tile) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  }
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(pos);
  mesh.rotation.copy(rot);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
