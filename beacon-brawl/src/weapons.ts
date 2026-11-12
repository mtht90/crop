import * as THREE from 'three';

// 武器はすべてコードで組み立てる（外部モデルなし）。
// 形は「握りが原点・刃先が +Z」。色はヒーローの属性色で光る。
export type WeaponName = 'sword' | 'shield' | 'greatsword' | 'staff' | 'dagger' | 'daggerOff' | 'gun' | 'scythe';
export interface WeaponSpec { hand: 'left' | 'right'; build(color: number): THREE.Object3D }

const metal = new THREE.MeshStandardMaterial({ color: 0x2a3050, metalness: 0.85, roughness: 0.3 });
const light = new THREE.MeshStandardMaterial({ color: 0xe8ecf8, metalness: 0.6, roughness: 0.25 });
const glow = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1, toneMapped: false,
});
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o;
};

/** 平たい刃。XZ 平面の輪郭を薄く押し出す */
function blade(points: [number, number][], thickness: number, mat: THREE.Material) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.45, bevelSize: thickness * 0.45, bevelSegments: 1 });
  g.translate(0, 0, -thickness / 2);
  g.rotateX(Math.PI / 2); // 輪郭の Y を +Z へ
  g.rotateZ(Math.PI / 2); // 刃を縦向き（握ったとき上下に薄い面が来ないように）
  const o = new THREE.Mesh(g, mat); o.castShadow = true; return o;
}

function swordLike(len: number, width: number, color: number, gripLen = 0.2) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, gripLen, 8).rotateX(Math.PI / 2), metal, 0, 0, -gripLen * 0.25));
  g.add(mesh(new THREE.BoxGeometry(0.03, width * 2.6, 0.035), light, 0, 0, gripLen * 0.3));
  const z0 = gripLen * 0.3;
  g.add(blade([[-width * 0.5, z0], [width * 0.5, z0], [width * 0.62, z0 + len * 0.78], [0, z0 + len], [-width * 0.62, z0 + len * 0.78]], 0.018, light));
  // 刃の芯が光る
  g.add(blade([[-width * 0.16, z0 + 0.03], [width * 0.16, z0 + 0.03], [width * 0.12, z0 + len * 0.86], [-width * 0.12, z0 + len * 0.86]], 0.026, glow(color)));
  g.add(mesh(new THREE.OctahedronGeometry(0.028), glow(color), 0, 0, -gripLen * 0.8));
  return g;
}

export const WEAPONS: Record<WeaponName, WeaponSpec> = {
  sword: { hand: 'right', build: (c) => swordLike(0.72, 0.085, c) },
  greatsword: { hand: 'right', build: (c) => swordLike(1.25, 0.17, c, 0.34) },
  dagger: { hand: 'right', build: (c) => swordLike(0.32, 0.06, c, 0.13) },
  daggerOff: { hand: 'left', build: (c) => swordLike(0.32, 0.06, c, 0.13) },
  shield: {
    hand: 'left',
    build(c) {
      const g = new THREE.Group();
      const hex = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 6);
      const plate = mesh(hex, glow(c, 0.35)); plate.castShadow = false;
      const rim = new THREE.LineSegments(new THREE.EdgesGeometry(hex), new THREE.LineBasicMaterial({ color: c, toneMapped: false }));
      const core = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 6), light);
      g.add(plate, rim, core);
      g.position.set(0, 0.07, 0.02); // 手の甲側に浮かせる
      const wrap = new THREE.Group(); wrap.add(g); return wrap;
    },
  },
  staff: {
    hand: 'right',
    build(c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 8).rotateX(Math.PI / 2), metal, 0, 0, 0.3));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20).rotateY(Math.PI / 2), light, 0, 0, 1.12));
      g.add(mesh(new THREE.OctahedronGeometry(0.06), glow(c), 0, 0, 1.12));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 6).rotateX(-Math.PI / 2), light, 0, 0, -0.5));
      return g;
    },
  },
  scythe: {
    hand: 'right',
    build(c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.6, 8).rotateX(Math.PI / 2), metal, 0, 0, 0.3));
      const curve: [number, number][] = [];
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * 1.7; curve.push([Math.sin(a) * 0.5, 1.05 + (1 - Math.cos(a)) * 0.12]); }
      for (let i = 10; i >= 0; i--) { const a = (i / 10) * 1.7; curve.push([Math.sin(a) * 0.42, 0.98 - (1 - Math.cos(a)) * 0.02 + (i / 10) * 0.05]); }
      const b = blade(curve, 0.016, glow(c)); b.rotation.z = Math.PI / 2;
      g.add(b, mesh(new THREE.OctahedronGeometry(0.05), light, 0, 0, 1.08));
      return g;
    },
  },
  gun: {
    hand: 'right',
    build(c) {
      // 銃身は腕の延長方向（人差し指の向き）= 右手なら -X
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.05), metal, -0.2, 0.03, 0));
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.025, 0.056), glow(c), -0.24, 0.03, 0));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.04), metal, 0.0, -0.05, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10).rotateZ(Math.PI / 2), light, -0.47, 0.03, 0));
      return g;
    },
  },
};
