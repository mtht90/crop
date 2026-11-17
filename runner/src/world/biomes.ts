import * as THREE from 'three';
import { Library, pbrMaterial, worldBox } from '../assets';
import { Builder } from './track';
import { BiomeAtmosphere, Ramp } from './types';

export interface PlatformSpec { x0: number; x1: number; zNear: number; zFar: number; y: number; kind: 'roof' | 'bridge' | 'start'; }
export interface ScenerySpec { zNear: number; zFar: number; y: number; nextY: number; cx: number; w: number; gapStart: number; gapEnd: number; dist: number; }

export interface BiomeKit {
  id: string;
  name: string;
  jp: string;
  atmo: BiomeAtmosphere;
  hasBridges: boolean;
  hasPillars: boolean;
  footstep: 'concrete' | 'metal' | 'dirt';
  platform(b: Builder, p: PlatformSpec): void;
  ramp(b: Builder, r: Ramp): void;
  vault(b: Builder, min: THREE.Vector3, max: THREE.Vector3): void;
  slide(b: Builder, min: THREE.Vector3, max: THREE.Vector3): void;
  blocker(b: Builder, min: THREE.Vector3, max: THREE.Vector3): void;
  wall(b: Builder, min: THREE.Vector3, max: THREE.Vector3, side: number): void;
  boostPad(b: Builder, min: THREE.Vector3, max: THREE.Vector3): void;
  scenery(b: Builder, s: ScenerySpec): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const C = (h: number) => new THREE.Color(h);

function slab(b: Builder, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, zNear: number, zFar: number, tile = 4, shadow = true) {
  const g = b.own(worldBox(x1 - x0, y1 - y0, zNear - zFar, tile));
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (zNear + zFar) / 2);
  m.receiveShadow = true; m.castShadow = shadow;
  return b.add(m);
}

/** chevron boost pad: emissive arrows from an external arrow model + glow plane */
function chevronPad(b: Builder, min: THREE.Vector3, max: THREE.Vector3, color: number) {
  const n = Math.max(2, Math.floor((max.z - min.z) / 1.8));
  const mat = b.shared.padMat.clone(); mat.color.setHex(color); b.own(mat);
  const plane = new THREE.Mesh(b.own(new THREE.PlaneGeometry(max.x - min.x, max.z - min.z)), mat);
  plane.rotation.x = -Math.PI / 2; plane.position.set((min.x + max.x) / 2, min.y + 0.03, (min.z + max.z) / 2);
  mat.opacity = 0.25;
  b.add(plane);
  const arrows: THREE.Object3D[] = [];
  const amat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  b.own(amat);
  for (let i = 0; i < n; i++) {
    const a = b.models.fit('arrow', V(min.x + 0.4, min.y + 0.02, 0), V(max.x - 0.4, min.y + 0.06, 1.4), { rotY: -Math.PI / 2 });
    a.traverse((o: any) => { if (o.isMesh) { o.material = amat; o.castShadow = false; } });
    a.position.z = max.z - 0.8 - i * 1.8;
    arrows.push(b.add(a));
  }
  b.animate((t) => { arrows.forEach((a, i) => { const k = (Math.sin(t * 12 + i * 1.2) + 1) / 2; a.scale.y = 1; (a as any).visible = k > 0.15; }); });
}

// ===========================================================================
// 1. SKYLINE – rooftops of a daytime city (Kenney City Kit + PolyHaven concrete)
// ===========================================================================
function skyline(lib: Library): BiomeKit {
  const roofMat = pbrMaterial(lib.pbr['concrete_floor_worn_001'], { color: 0xd8d4cc });
  const edgeMat = pbrMaterial(lib.pbr['concrete_floor_worn_001'], { color: 0xb8b2a8 });
  const padMat = pbrMaterial(lib.pbr['anti_slip_concrete'], { color: 0xc8c4bc });
  const towers = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
  const mids = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n'];
  const lows = ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f', 'low-detail-building-g', 'low-detail-building-h', 'low-detail-building-wide-a', 'low-detail-building-wide-b'];
  const roofProps = ['box-large', 'box-wide', 'machine', 'hopper-high-round', 'box-long'];

  /** fill a footprint with stacked buildings beneath a roof */
  const buildingColumn = (b: Builder, x0: number, x1: number, zNear: number, zFar: number, top: number) => {
    const w = x1 - x0;
    let z = zNear;
    while (z > zFar + 0.5) {
      const d = Math.min(z - zFar, Math.max(10, w * b.rng.range(0.8, 1.4)));
      const name = b.rng.pick(towers);
      // building body from (top - 70) up to (top - 0.4) – stretched slightly vertically
      b.fit(name, V(x0 + 0.3, top - 75, z - d + 0.3), V(x1 - 0.3, top - 0.35, z - 0.3), { shadow: false });
      z -= d;
    }
  };

  return {
    id: 'skyline', name: 'SKYLINE', jp: '屋上都市', footstep: 'concrete', hasBridges: true, hasPillars: false,
    atmo: {
      sky: 'kloofendal_48d_partly_cloudy_puresky', fog: C(0xb7c9dc), fogDensity: 0.0042, sunColor: C(0xfff1dc), sunIntensity: 3.2,
      sunDir: V(0.5, 0.8, 0.35).normalize(), envIntensity: 0.9, exposure: 1.0, bloom: 0.25, bloomThreshold: 0.92, skyIntensity: 1.0, speedTint: C(0xffffff),
    },
    platform(b, p) {
      if (p.kind === 'bridge') {
        // steel plank bridge: catwalk models
        const n = Math.ceil((p.zNear - p.zFar) / 2.5);
        const len = (p.zNear - p.zFar) / n;
        for (let i = 0; i < n; i++) b.fit('catwalk-straight', V(p.x0 - 0.2, p.y - 0.6, p.zNear - (i + 1) * len), V(p.x1 + 0.2, p.y + 0.02, p.zNear - i * len), { rotY: Math.PI / 2 });
        return;
      }
      slab(b, roofMat, p.x0, p.x1, p.y - 0.6, p.y, p.zNear, p.zFar, 5);
      // parapet edges (thin curb, purely visual, just below walk height)
      slab(b, edgeMat, p.x0 - 0.35, p.x0, p.y - 1.2, p.y + 0.25, p.zNear, p.zFar, 2);
      slab(b, edgeMat, p.x1, p.x1 + 0.35, p.y - 1.2, p.y + 0.25, p.zNear, p.zFar, 2);
      buildingColumn(b, p.x0 - 0.4, p.x1 + 0.4, p.zNear, p.zFar, p.y - 0.5);
    },
    ramp(b, r) {
      const len = r.zNear - r.zFar, rise = r.yFar - r.yNear;
      const g = b.own(worldBox(r.x1 - r.x0, 0.4, Math.hypot(len, rise), 3));
      const m = new THREE.Mesh(g, edgeMat);
      m.position.set((r.x0 + r.x1) / 2, (r.yNear + r.yFar) / 2 - 0.2, (r.zNear + r.zFar) / 2);
      m.rotation.x = Math.atan2(rise, len);
      m.castShadow = m.receiveShadow = true;
      b.add(m);
      b.fit('structure-yellow-tall', V(r.x0, r.yNear - 0.5, r.zFar), V(r.x1, r.yFar - 0.3, r.zFar + 1.2));
    },
    vault(b, min, max) {
      // rooftop AC units / boxes laid in a row
      const w = max.x - min.x;
      const n = Math.max(1, Math.round(w / 2.5));
      for (let i = 0; i < n; i++) b.fit(b.rng.pick(['box-wide', 'box-large', 'box-long']), V(min.x + (i * w) / n, min.y, min.z), V(min.x + ((i + 1) * w) / n - 0.05, max.y, max.z));
    },
    slide(b, min, max) {
      // billboard / pipe overhead with supports
      b.fit('pipe-large-long', V(min.x, min.y, min.z), V(max.x, min.y + Math.min(1.2, max.y - min.y), max.z), { rotY: 0 });
      if (max.y - min.y > 1.3) b.fit('screen-hanging-wide', V(min.x + 1, min.y + 1.2, (min.z + max.z) / 2 - 0.2), V(max.x - 1, max.y, (min.z + max.z) / 2 + 0.2));
      b.fit('structure-tall', V(min.x - 0.6, min.y - 1.2, min.z), V(min.x, max.y, max.z));
      b.fit('structure-tall', V(max.x, min.y - 1.2, min.z), V(max.x + 0.6, max.y, max.z));
    },
    blocker(b, min, max) {
      b.fit(b.rng.pick(['hopper-high-round', 'machine', 'hopper-high-square', 'machine-fortified']), min, max);
    },
    wall(b, min, max) {
      // the wall is the side of an adjacent taller building
      b.fit(b.rng.pick(towers), V(min.x - 0.2, min.y - 50, min.z), V(max.x + 0.2, max.y, max.z), { shadow: false });
      slab(b, edgeMat, min.x, max.x, max.y - 0.4, max.y + 0.2, max.z, min.z, 2);
    },
    boostPad(b, min, max) { chevronPad(b, min, max, 0x36f1ff); },
    scenery(b, s) {
      const rng = b.rng;
      // street canyon: skyscrapers on both sides, many towering above the running line
      for (const side of [-1, 1]) {
        let z = s.zNear;
        while (z > s.zFar) {
          const d = rng.range(12, 22);
          const near = rng.range(5, 12);
          const xa = s.cx + side * (s.w / 2 + near);
          const w = rng.range(12, 20);
          const tall = rng.chance(0.55);
          const top = s.y + (tall ? rng.range(15, 60) : rng.range(-12, 3));
          const name = tall || rng.chance(0.6) ? rng.pick(towers) : rng.pick(mids);
          b.fit(name, V(Math.min(xa, xa + side * w), top - 110, z - d), V(Math.max(xa, xa + side * w), top, z), { shadow: false });
          if (!tall && rng.chance(0.6)) {
            // rooftop clutter on the lower neighbours
            const px = xa + side * rng.range(2, w - 3);
            b.put(rng.pick(['hopper-high-round', 'box-large', 'machine', 'hopper-high-square']), px, top, z - d / 2, rng.range(2.2, 3.5), rng.range(0, 6));
          }
          z -= d + rng.range(3, 9);
        }
        // far skyline
        for (let z2 = s.zNear; z2 > s.zFar; z2 -= rng.range(16, 30)) {
          const x = s.cx + side * rng.range(70, 240);
          const sc = rng.range(20, 38);
          b.put(rng.pick(lows), x, s.y - 90 + rng.range(-10, 50), z2, sc, rng.range(0, 6), false);
        }
        // construction cranes on the skyline
        if (rng.chance(0.25)) b.put('crane', s.cx + side * rng.range(50, 120), s.y + rng.range(-5, 25), (s.zNear + s.zFar) / 2, rng.range(10, 16), rng.range(0, 6), false);
      }
      // rhythmic roof-edge poles & billboards close to the path: strongest parallax cue
      let k = 0;
      for (let z = s.zNear - 4; z > s.gapStart + 3; z -= 9) {
        const side = k++ % 2 === 0 ? -1 : 1;
        const x = s.cx + side * (s.w / 2 + 0.7);
        if (rng.chance(0.18)) {
          b.fit('structure-tall', V(x - 0.15, s.y - 0.5, z - 0.3), V(x + 0.15, s.y + 5.5, z));
          b.fit('screen-hanging-wide', V(x + (side > 0 ? 0 : -6), s.y + 4.5, z - 0.4), V(x + (side > 0 ? 6 : 0), s.y + 7.5, z), { rotY: 0 });
        } else b.fit('structure-tall', V(x - 0.12, s.y - 0.5, z - 0.4), V(x + 0.12, s.y + rng.range(2.5, 4.5), z));
      }
    },
  };
}

// ===========================================================================
// 2. NEON – night sci-fi elevated district (Quaternius Sci-Fi MegaKit)
// ===========================================================================
function neon(lib: Library): BiomeKit {
  const neonCols = [0x36f1ff, 0xff3d8b, 0xa46bff, 0x3dff9e];
  const floorMat = pbrMaterial(lib.pbr['metal_plate'], { color: 0x6a7082, metalness: 1 });
  const glowMats = neonCols.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), toneMapped: true }));
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0d16, roughness: 0.6, metalness: 0.6 });
  const towers = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
  const strip = (b: Builder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(b.own(new THREE.BoxGeometry(x1 - x0, y1 - y0, Math.abs(z1 - z0))), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = false; return b.add(m);
  };
  /** Tint emissive/light materials of a scifi model */
  const tint = (o: THREE.Object3D, col: number) => {
    o.traverse((m: any) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      m.material = mats.map((mm: any) => {
        if (mm.name === 'M_Light' || (mm.emissive && mm.emissive.getHex() !== 0)) {
          const c = mm.clone(); c.emissive = new THREE.Color(col); c.emissiveIntensity = 6; c.color = new THREE.Color(0x000000); return c;
        }
        return mm;
      });
      if (m.material.length === 1) m.material = m.material[0];
    });
    return o;
  };

  return {
    id: 'neon', name: 'NEON DISTRICT', jp: 'ネオン街', footstep: 'metal', hasBridges: true, hasPillars: true,
    atmo: {
      sky: 'rogland_clear_night', fog: C(0x140a26), fogDensity: 0.0075, sunColor: C(0x8aa0ff), sunIntensity: 0.9,
      sunDir: V(-0.3, 0.9, 0.2).normalize(), envIntensity: 0.35, exposure: 1.15, bloom: 0.8, bloomThreshold: 0.65, skyIntensity: 1.4, speedTint: C(0x36f1ff),
    },
    platform(b, p) {
      const rng = b.rng;
      const tiles = ['Platform_Metal', 'Platform_DarkPlates', 'Platform_Squares', 'Platform_CenterPlate', 'Platform_3Plates'];
      if (p.kind === 'bridge') {
        slab(b, darkMat, p.x0, p.x1, p.y - 0.4, p.y, p.zNear, p.zFar, 2);
        strip(b, p.x0 - 0.05, p.x0 + 0.05, p.y, p.y + 0.06, p.zNear, p.zFar, glowMats[0]);
        strip(b, p.x1 - 0.05, p.x1 + 0.05, p.y, p.y + 0.06, p.zNear, p.zFar, glowMats[0]);
        return;
      }
      slab(b, floorMat, p.x0, p.x1, p.y - 1.4, p.y - 0.02, p.zNear, p.zFar, 4);
      // tiled sci-fi floor plates on top
      const tw = 4;
      const nx = Math.max(1, Math.round((p.x1 - p.x0) / tw));
      const nz = Math.max(1, Math.round((p.zNear - p.zFar) / tw));
      const sx = (p.x1 - p.x0) / nx, sz = (p.zNear - p.zFar) / nz;
      const tileName = rng.pick(tiles);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const t = b.fit(j % 5 === 2 ? 'Platform_X' : tileName, V(p.x0 + i * sx, p.y - 0.02, p.zNear - (j + 1) * sz), V(p.x0 + (i + 1) * sx, p.y, p.zNear - j * sz), { shadow: false });
        t.scale.y = 1;
      }
      // glowing side rails
      const col = rng.pick(glowMats);
      strip(b, p.x0 - 0.12, p.x0, p.y - 1.4, p.y + 0.05, p.zNear, p.zFar, col);
      strip(b, p.x1, p.x1 + 0.12, p.y - 1.4, p.y + 0.05, p.zNear, p.zFar, col);
      // support columns going down into the dark
      for (let z = p.zNear - 3; z > p.zFar + 2; z -= 12) {
        for (const x of [p.x0 + 1.5, p.x1 - 1.5]) b.fit('Column_Large_Straight', V(x - 1, p.y - 60, z - 2), V(x + 1, p.y - 1.4, z), { shadow: false });
      }
    },
    ramp(b, r) {
      const len = r.zNear - r.zFar, rise = r.yFar - r.yNear;
      const g = b.own(worldBox(r.x1 - r.x0, 0.3, Math.hypot(len, rise), 3));
      const m = new THREE.Mesh(g, floorMat);
      m.position.set((r.x0 + r.x1) / 2, (r.yNear + r.yFar) / 2 - 0.15, (r.zNear + r.zFar) / 2);
      m.rotation.x = Math.atan2(rise, len);
      b.add(m);
      for (const x of [r.x0, r.x1]) {
        const s = new THREE.Mesh(b.own(new THREE.BoxGeometry(0.15, 0.15, Math.hypot(len, rise))), glowMats[1]);
        s.position.set(x, (r.yNear + r.yFar) / 2 + 0.05, (r.zNear + r.zFar) / 2); s.rotation.x = m.rotation.x; b.add(s);
      }
    },
    vault(b, min, max) {
      const w = max.x - min.x; const n = Math.max(1, Math.round(w / 2));
      for (let i = 0; i < n; i++) b.fit(b.rng.pick(['Prop_Crate3', 'Prop_Crate4', 'Prop_Barrel_Large']), V(min.x + (i * w) / n, min.y, min.z), V(min.x + ((i + 1) * w) / n - 0.05, max.y, max.z));
      strip(b, min.x, max.x, max.y, max.y + 0.05, max.z - 0.05, max.z, b.rng.pick(glowMats));
    },
    slide(b, min, max) {
      // hanging cable/light bar gate
      b.fit('TopCables_Straight_Hanging', V(min.x, min.y, min.z), V(max.x, max.y, max.z), { rotY: Math.PI / 2, shadow: false });
      strip(b, min.x, max.x, min.y, min.y + 0.12, max.z - 0.12, max.z, b.rng.pick(glowMats));
      b.fit('Column_Astra', V(min.x - 1.2, min.y - 1.2, min.z), V(min.x, max.y + 1, max.z));
      b.fit('Column_Astra', V(max.x, min.y - 1.2, min.z), V(max.x + 1.2, max.y + 1, max.z), { rotY: Math.PI });
    },
    blocker(b, min, max) {
      const o = b.fit(b.rng.pick(['Column_Pipes', 'Column_Hollow', 'Prop_Computer', 'Column_MetalSupport']), min, max);
      tint(o, b.rng.pick(neonCols));
      strip(b, min.x, max.x, min.y + 0.1, min.y + 0.2, max.z - 0.02, max.z + 0.02, b.rng.pick(glowMats));
    },
    wall(b, min, max, side) {
      const len = max.z - min.z;
      const n = Math.max(1, Math.round(len / 4));
      const seg = len / n;
      for (let i = 0; i < n; i++) {
        b.fit(i % 3 === 1 ? 'WallAstra_Straight_Window' : 'WallAstra_Straight', V(min.x, max.y - 7, max.z - (i + 1) * seg), V(max.x, max.y, max.z - i * seg), { rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2, shadow: false });
      }
      slab(b, darkMat, min.x, max.x, min.y, max.y - 7, max.z, min.z, 3, false);
      const face = side < 0 ? max.x : min.x;
      strip(b, face - 0.04, face + 0.04, max.y - 7.2, max.y - 7.0, max.z, min.z, glowMats[(Math.random() * 4) | 0]);
      strip(b, face - 0.04, face + 0.04, max.y - 0.3, max.y - 0.2, max.z, min.z, glowMats[(Math.random() * 4) | 0]);
    },
    boostPad(b, min, max) { chevronPad(b, min, max, 0xff3d8b); },
    scenery(b, s) {
      const rng = b.rng;
      // rhythmic light arches over the track – the core of the speed feeling here
      const archCol = rng.pick(glowMats);
      for (let z = s.zNear - 4; z > s.gapStart; z -= 14) {
        const xa = s.cx - s.w / 2 - 1.6, xb = s.cx + s.w / 2 + 1.6;
        b.fit('Column_Astra', V(xa - 1, s.y - 1, z - 1.2), V(xa, s.y + 7, z));
        b.fit('Column_Astra', V(xb, s.y - 1, z - 1.2), V(xb + 1, s.y + 7, z), { rotY: Math.PI });
        strip(b, xa, xb, s.y + 7, s.y + 7.25, z - 0.6, z - 0.3, archCol);
        const l = b.fit('Prop_Light_Wide', V(s.cx - 2, s.y + 6.6, z - 1), V(s.cx + 2, s.y + 7, z), { shadow: false });
        tint(l, 0xffffff);
      }
      // dark towers with neon bands in the distance
      for (const side of [-1, 1]) {
        for (let z = s.zNear; z > s.zFar; z -= rng.range(14, 30)) {
          const x = s.cx + side * rng.range(26, 140);
          const w = rng.range(10, 24);
          const top = s.y + rng.range(-10, 60);
          const o = b.fit(rng.pick(towers), V(x - w / 2, top - 120, z - w), V(x + w / 2, top, z), { shadow: false });
          o.traverse((m: any) => { if (m.isMesh) m.material = darkMat; });
          const band = rng.pick(glowMats);
          for (let k = 0; k < rng.int(1, 4); k++) {
            const yy = top - rng.range(2, 60);
            strip(b, x - w / 2 - 0.1, x + w / 2 + 0.1, yy, yy + rng.range(0.3, 1.2), z - w - 0.1, z + 0.1, band);
          }
        }
      }
      // floating holo panels near the track
      for (let z = s.zNear; z > s.zFar; z -= rng.range(30, 60)) {
        const side = rng.chance(0.5) ? -1 : 1;
        const x = s.cx + side * rng.range(9, 16);
        const p = new THREE.Mesh(b.own(new THREE.PlaneGeometry(rng.range(4, 9), rng.range(2, 5))), new THREE.MeshBasicMaterial({ color: new THREE.Color(rng.pick(neonCols)).multiplyScalar(1.6), transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        b.own(p.material as THREE.Material);
        p.position.set(x, s.y + rng.range(4, 12), z); p.rotation.y = side * rng.range(0.6, 1.2);
        b.add(p);
      }
    },
  };
}

// ===========================================================================
// 3. FOUNDRY – industrial complex at sunset (Kenney Factory Kit + rusty metal)
// ===========================================================================
function foundry(lib: Library): BiomeKit {
  const floorMat = pbrMaterial(lib.pbr['metal_plate'], { color: 0x9a8f86 });
  const rustMat = pbrMaterial(lib.pbr['rusty_metal_02'], { color: 0xb09080 });
  return {
    id: 'foundry', name: 'FOUNDRY', jp: '工業地帯', footstep: 'metal', hasBridges: true, hasPillars: true,
    atmo: {
      sky: 'industrial_sunset_puresky', fog: C(0xd59a6a), fogDensity: 0.0055, sunColor: C(0xffa860), sunIntensity: 3.0,
      sunDir: V(-0.2, 0.25, -0.95).normalize(), envIntensity: 0.8, exposure: 1.05, bloom: 0.45, bloomThreshold: 0.85, skyIntensity: 1.0, speedTint: C(0xffc58a),
    },
    platform(b, p) {
      if (p.kind === 'bridge') {
        const n = Math.ceil((p.zNear - p.zFar) / 2.5); const len = (p.zNear - p.zFar) / n;
        for (let i = 0; i < n; i++) b.fit('conveyor-long-stripe-sides', V(p.x0 - 0.4, p.y - 0.5, p.zNear - (i + 1) * len), V(p.x1 + 0.4, p.y + 0.01, p.zNear - i * len), { rotY: Math.PI / 2 });
        return;
      }
      slab(b, floorMat, p.x0, p.x1, p.y - 0.5, p.y, p.zNear, p.zFar, 3);
      slab(b, rustMat, p.x0, p.x1, p.y - 6, p.y - 0.5, p.zNear, p.zFar, 4, false);
      // trusses below
      for (let z = p.zNear - 2; z > p.zFar + 1; z -= 8) {
        for (const x of [p.x0 + 0.6, p.x1 - 0.6]) b.fit('structure-yellow-tall', V(x - 0.3, p.y - 60, z - 1.2), V(x + 0.3, p.y - 6, z), { shadow: false });
      }
      // side hazard railing posts
      for (let z = p.zNear - 4; z > p.zFar + 2; z -= 7) {
        b.fit('warning-orange', V(p.x0 - 0.6, p.y, z - 0.5), V(p.x0 - 0.1, p.y + 1.1, z));
        b.fit('warning-orange', V(p.x1 + 0.1, p.y, z - 0.5), V(p.x1 + 0.6, p.y + 1.1, z));
      }
    },
    ramp(b, r) {
      const len = r.zNear - r.zFar, rise = r.yFar - r.yNear;
      const o = b.fit('conveyor-long', V(r.x0, 0, -len / 2), V(r.x1, 0.3, len / 2), { rotY: Math.PI / 2 });
      o.position.set((r.x0 + r.x1) / 2, (r.yNear + r.yFar) / 2 - 0.25, (r.zNear + r.zFar) / 2);
      o.rotation.x = Math.atan2(rise, len);
      o.scale.z *= Math.hypot(len, rise) / len;
      b.fit('structure-high', V(r.x0, r.yNear - 0.5, r.zFar), V(r.x1, r.yFar - 0.2, r.zFar + 1));
    },
    vault(b, min, max) {
      const w = max.x - min.x; const n = Math.max(1, Math.round(w / 2.2));
      for (let i = 0; i < n; i++) b.fit(b.rng.pick(['warning-traffic', 'box-large', 'box-wide', 'machine']), V(min.x + (i * w) / n, min.y, min.z), V(min.x + ((i + 1) * w) / n - 0.05, max.y, max.z));
    },
    slide(b, min, max) {
      const h = max.y - min.y;
      b.fit('pipe-large-long', V(min.x, min.y, min.z), V(max.x, min.y + Math.min(h, 1.4), max.z));
      if (h > 1.5) b.fit('conveyor-long-stripe-sides', V(min.x, min.y + 1.4, min.z), V(max.x, max.y, max.z));
      b.fit('structure-tall', V(min.x - 0.4, min.y - 1.2, min.z), V(min.x, max.y, max.z));
      b.fit('structure-tall', V(max.x, min.y - 1.2, min.z), V(max.x + 0.4, max.y, max.z));
    },
    blocker(b, min, max) {
      b.fit(b.rng.pick(['hopper-high-square', 'machine-fortified', 'hopper-high-round', 'scanner-high', 'robot-arm-a']), min, max);
    },
    wall(b, min, max) {
      slab(b, rustMat, min.x, max.x, min.y, max.y, max.z, min.z, 4, false);
      const len = max.z - min.z; const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) b.fit('structure-window-wide', V(min.x - 0.05, max.y - 4, max.z - (i + 1) * (len / n)), V(max.x + 0.05, max.y, max.z - i * (len / n)), { shadow: false });
    },
    boostPad(b, min, max) { chevronPad(b, min, max, 0xffb13d); },
    scenery(b, s) {
      const rng = b.rng;
      // overhead pipes running beside the track
      for (const side of [-1, 1]) {
        const x = s.cx + side * (s.w / 2 + rng.range(2.5, 4));
        const yy = s.y + rng.range(1, 5);
        for (let z = s.zNear; z > s.zFar; z -= 6) b.fit('pipe-large-long', V(x - 0.6, yy, z - 6), V(x + 0.6, yy + 1.2, z), { rotY: Math.PI / 2, shadow: false });
        for (let z = s.zNear - 3; z > s.zFar; z -= 12) b.fit('structure-tall', V(x - 0.2, s.y - 30, z - 0.6), V(x + 0.2, yy, z), { shadow: false });
      }
      // gantry cranes & hoppers
      for (let z = s.zNear; z > s.zFar; z -= rng.range(25, 50)) {
        const side = rng.chance(0.5) ? -1 : 1;
        const x = s.cx + side * rng.range(18, 45);
        b.put(rng.pick(['crane', 'hopper-high-round', 'hopper-high-square', 'robot-arm-b', 'machine-fortified']), x, s.y - rng.range(5, 20), z, rng.range(8, 16), rng.range(0, 6), false);
      }
      // giant cogs turning in the distance
      if (rng.chance(0.5)) {
        const side = rng.chance(0.5) ? -1 : 1;
        const cog = b.put(rng.pick(['cog-a', 'cog-b']), s.cx + side * rng.range(30, 60), s.y + rng.range(-10, 20), (s.zNear + s.zFar) / 2, rng.range(15, 30), 0, false);
        cog.rotation.z = Math.PI / 2;
        const spd = rng.range(0.3, 0.8) * side;
        b.animate((t) => { cog.rotation.x = t * spd; });
      }
      // smoke stacks far
      for (let z = s.zNear; z > s.zFar; z -= rng.range(40, 80)) {
        const side = rng.chance(0.5) ? -1 : 1;
        const x = s.cx + side * rng.range(70, 200);
        b.fit('pipe-large', V(x - 5, s.y - 80, z - 10), V(x + 5, s.y + rng.range(20, 70), z), { shadow: false });
      }
    },
  };
}

// ===========================================================================
// 4. CANYON – wild mesas and pine forests (Kenney Nature Kit + rocky terrain)
// ===========================================================================
function canyon(lib: Library): BiomeKit {
  const groundMat = pbrMaterial(lib.pbr['rocky_terrain_02'], { color: 0xc9b49a });
  const cliffMat = pbrMaterial(lib.pbr['rocky_terrain_02'], { color: 0xa0806a });
  const trees = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_tall', 'tree_default'];
  const rocks = ['rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallD', 'rock_tallE', 'rock_tallF', 'stone_tallA', 'stone_tallB'];
  return {
    id: 'canyon', name: 'CANYON', jp: '渓谷', footstep: 'dirt', hasBridges: true, hasPillars: false,
    atmo: {
      sky: 'qwantani_puresky', fog: C(0xd9c3a3), fogDensity: 0.0038, sunColor: C(0xfff0d0), sunIntensity: 3.6,
      sunDir: V(0.6, 0.7, -0.3).normalize(), envIntensity: 1.0, exposure: 1.0, bloom: 0.2, bloomThreshold: 0.95, skyIntensity: 1.0, speedTint: C(0xfff4e0),
    },
    platform(b, p) {
      if (p.kind === 'bridge') {
        const n = Math.ceil((p.zNear - p.zFar) / 2); const len = (p.zNear - p.zFar) / n;
        for (let i = 0; i < n; i++) b.fit('bridge_wood', V(p.x0 - 0.3, p.y - 0.4, p.zNear - (i + 1) * len), V(p.x1 + 0.3, p.y + 0.02, p.zNear - i * len));
        return;
      }
      slab(b, groundMat, p.x0, p.x1, p.y - 0.8, p.y, p.zNear, p.zFar, 6);
      // mesa body from cliff blocks
      const d = p.zNear - p.zFar;
      const n = Math.max(1, Math.round(d / 14));
      for (let i = 0; i < n; i++) {
        b.fit(b.rng.pick(['cliff_block_rock', 'cliff_block_stone', 'cliff_large_rock']), V(p.x0 - 1.5, p.y - 70, p.zNear - ((i + 1) * d) / n - 0.5), V(p.x1 + 1.5, p.y - 0.3, p.zNear - (i * d) / n + 0.5), { shadow: false });
      }
      // grass tufts and small rocks on edges
      for (let z = p.zNear - 2; z > p.zFar + 1; z -= b.rng.range(3, 6)) {
        const side = b.rng.chance(0.5) ? -1 : 1;
        b.put(b.rng.pick(['grass_large', 'plant_bush', 'rock_smallA', 'grass']), side < 0 ? p.x0 + 0.4 : p.x1 - 0.4, p.y, z, b.rng.range(1.5, 3), b.rng.range(0, 6), false);
      }
    },
    ramp(b, r) {
      const len = r.zNear - r.zFar, rise = r.yFar - r.yNear;
      b.fit('log_large', V(r.x0, r.yNear - 0.3, r.zFar), V(r.x1, r.yFar, r.zNear), { rotY: 0 });
      const g = b.own(worldBox(r.x1 - r.x0, 0.4, Math.hypot(len, rise), 4));
      const m = new THREE.Mesh(g, cliffMat);
      m.position.set((r.x0 + r.x1) / 2, (r.yNear + r.yFar) / 2 - 0.2, (r.zNear + r.zFar) / 2);
      m.rotation.x = Math.atan2(rise, len); m.receiveShadow = true;
      b.add(m);
    },
    vault(b, min, max) {
      const w = max.x - min.x; const n = Math.max(1, Math.round(w / 4));
      for (let i = 0; i < n; i++) b.fit(b.rng.chance(0.6) ? 'log_large' : b.rng.pick(['rock_largeA', 'rock_largeB', 'rock_largeC']), V(min.x + (i * w) / n, min.y, min.z), V(min.x + ((i + 1) * w) / n, max.y, max.z), { rotY: Math.PI / 2 });
    },
    slide(b, min, max) {
      // fallen tree trunk resting on two rocks
      b.fit('log_large', V(min.x, min.y, min.z), V(max.x, min.y + Math.min(1.2, max.y - min.y), max.z), { rotY: Math.PI / 2 });
      b.fit(b.rng.pick(rocks), V(min.x - 2.5, min.y - 1.2, min.z - 1), V(min.x + 0.2, max.y + 0.5, max.z + 1));
      b.fit(b.rng.pick(rocks), V(max.x - 0.2, min.y - 1.2, min.z - 1), V(max.x + 2.5, max.y + 0.5, max.z + 1));
      if (max.y - min.y > 1.5) b.fit('cliff_top_rock', V(min.x, min.y + 1.2, min.z), V(max.x, max.y, max.z));
    },
    blocker(b, min, max) {
      if (b.rng.chance(0.5)) b.fit(b.rng.pick(rocks), min, max);
      else b.fit(b.rng.pick(trees), V(min.x, min.y, min.z), V(max.x, max.y + 4, max.z));
    },
    wall(b, min, max) {
      const len = max.z - min.z; const n = Math.max(1, Math.round(len / 10));
      for (let i = 0; i < n; i++) b.fit('cliff_large_stone', V(min.x, min.y, max.z - ((i + 1) * len) / n - 0.3), V(max.x, max.y, max.z - (i * len) / n + 0.3), { rotY: min.x > 0 ? -Math.PI / 2 : Math.PI / 2, shadow: false });
      slab(b, cliffMat, min.x + 0.1, max.x - 0.1, min.y, max.y - 0.2, max.z, min.z, 6, false);
    },
    boostPad(b, min, max) { chevronPad(b, min, max, 0x7dff6a); },
    scenery(b, s) {
      const rng = b.rng;
      // pine forest on lower ground near the track: trees whipping past
      for (const side of [-1, 1]) {
        for (let z = s.zNear; z > s.zFar; z -= rng.range(3, 7)) {
          const x = s.cx + side * (s.w / 2 + rng.range(2.5, 22));
          const base = s.y - rng.range(2, 12);
          b.put(rng.pick(trees), x, base, z, rng.range(8, 14), rng.range(0, 6), rng.chance(0.3));
        }
        // canyon walls: huge rock spires
        for (let z = s.zNear; z > s.zFar; z -= rng.range(20, 45)) {
          const x = s.cx + side * rng.range(45, 130);
          b.put(rng.pick(rocks), x, s.y - 60, z, rng.range(40, 90), rng.range(0, 6), false);
        }
      }
      // rock arch over the track sometimes
      if (rng.chance(0.25) && s.gapStart < s.zNear - 20) {
        const z = s.zNear - 12;
        b.fit('cliff_top_rock', V(s.cx - s.w / 2 - 6, s.y + 9, z - 6), V(s.cx + s.w / 2 + 6, s.y + 12, z), { rotY: 0 });
        b.fit(rng.pick(rocks), V(s.cx - s.w / 2 - 7, s.y - 2, z - 6), V(s.cx - s.w / 2 - 1, s.y + 10, z));
        b.fit(rng.pick(rocks), V(s.cx + s.w / 2 + 1, s.y - 2, z - 6), V(s.cx + s.w / 2 + 7, s.y + 10, z));
      }
    },
  };
}

export const KIT_FACTORIES: ((lib: Library) => BiomeKit)[] = [skyline, neon, foundry, canyon];
