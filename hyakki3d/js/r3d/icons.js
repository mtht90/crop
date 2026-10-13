// レベルアップカード・HUD 用のアイコンを、ゲーム内の 3D モデルとエフェクトから描き出す（起動時に 1 回）
import * as THREE from 'three';
import { sealMaterial } from '../fx.js';
import { Rig } from './models.js';
import { talismanTexture } from './render.js';
import { SKILLS, CHARACTERS } from '../config.js';

const SIZE = 128;

function glowSprite(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
}
const basic = (c, add = false) => new THREE.MeshBasicMaterial({ color: c, transparent: add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add, side: THREE.DoubleSide });
const std = (c, e = 0x000000, ei = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: 0.4, metalness: 0.1 });

function bolt() {
  const pts = [[0, 1.1], [-0.25, 0.35], [0.12, 0.3], [-0.2, -0.45], [0.3, 0.15], [0.02, 0.2], [0.25, 1.1]];
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), basic(0xfff6ff));
  m.position.y = -0.3;
  g.add(m, glowSprite('rgba(170,130,255,0.9)', 2.4));
  return g;
}
function arrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8), std(0xf2e2b0, 0x664400, 0.6));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 8), std(0xffffff, 0x886600, 1));
  tip.position.y = 1.05;
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.03), std(0xd22a3c, 0x400000, 0.5));
  fl.position.y = -0.75;
  g.add(shaft, tip, fl, glowSprite('rgba(255,200,120,0.7)', 2.2));
  g.rotation.z = -0.8;
  return g;
}
function gem(color, size = 0.6) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), std(color, color, 0.8));
  m.scale.y = 1.35;
  m.rotation.y = 0.6;
  g.add(m, glowSprite('rgba(255,255,255,0.35)', size * 3.6));
  return g;
}

export function makeIcons(R) {
  const renderer = R.r;
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x302040, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0x8fb8ff, 2.5);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const holder = new THREE.Group();
  scene.add(holder);

  // 対象の大きさに合わせてカメラを寄せる
  const fit = (obj, pad = 1.15, look = null) => {
    // 光の滲み（スプライト）は大きさの計算から外す
    const box = new THREE.Box3();
    obj.updateMatrixWorld(true);
    obj.traverse((o) => { if (o.isMesh && !o.isSprite) box.expandByObject(o); });
    if (box.isEmpty()) box.setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.5 * pad;
    const d = r / Math.tan(THREE.MathUtils.degToRad(15));
    const dir = look || new THREE.Vector3(0.35, 0.25, 1).normalize();
    cam.position.copy(c).addScaledVector(dir, d);
    cam.lookAt(c);
  };

  const ally = (k, atkFrame = 3) => {
    const u = R.allies[k];
    const set = u.atk || u.walk;
    const geo = set[Math.min(atkFrame, set.length - 1)].geometry;
    const im = new THREE.InstancedMesh(geo, u.mat, 1);
    im.setMatrixAt(0, new THREE.Matrix4().makeRotationY(0.5));
    im.frustumCulled = false;
    return im;
  };
  const seal = (color) => {
    const mat = sealMaterial(color);
    mat.uniforms.uColor.value.multiplyScalar(2.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
    m.rotation.x = -0.55;
    return m;
  };
  const player = () => {
    const rig = new Rig('player', 'player', 1.75, ['Spellbook', 'Spellbook_open', '1H_Wand']);
    rig.play('Running_A');
    rig.update(0.35);
    rig.root.rotation.y = 0.6;
    return rig.root;
  };

  const MAKERS = {
    ofuda: () => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshBasicMaterial({ map: talismanTexture(), side: THREE.DoubleSide }));
      t.rotation.set(0, 0.35, 0.25);
      const t2 = t.clone(); t2.position.set(-0.45, -0.1, -0.3); t2.rotation.z = -0.35;
      g.add(glowSprite('rgba(255,200,90,0.8)', 2.6), t2, t);
      return g;
    },
    kitsunebi: () => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), basic(0xe8fbff));
      g.add(glowSprite('rgba(90,190,255,1)', 2.6), core);
      for (let i = 0; i < 3; i++) {
        const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), basic(0x9fe6ff));
        const a = i * 2.1 + 0.4;
        o.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.55, 0.1);
        const gs = glowSprite('rgba(90,190,255,0.9)', 0.9);
        gs.position.copy(o.position);
        g.add(o, gs);
      }
      return g;
    },
    raifu: bolt,
    kekkai: () => { const g = new THREE.Group(); g.add(seal('#ffd77a'), glowSprite('rgba(255,210,120,0.35)', 2.6)); return g; },
    hamaya: arrow,
    kami: () => ally('kami'),
    byakko: () => ally('byakko'),
    zenki: () => ally('zenki'),
    karasu: () => ally('karasu', 2),
    reiryoku: () => gem(0xc77dff),
    shikiko: () => { const g = new THREE.Group(); g.add(seal('#8fe3ff'), glowSprite('rgba(120,220,255,0.35)', 2.6)); return g; },
    sokuei: () => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 10, 48), std(0x9fe6ff, 0x2288ff, 1.5));
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), std(0xffffff, 0x88ccff, 1.5));
      hand.position.y = 0.25; hand.rotation.z = -0.6;
      g.add(glowSprite('rgba(90,170,255,0.6)', 2.4), ring, hand);
      g.rotation.x = -0.25;
      return g;
    },
    idaten: player,
    kyukon: () => {
      const g = new THREE.Group();
      [[0, 0.1, 0.55], [-0.55, -0.35, 0.4], [0.55, -0.3, 0.42]].forEach(([x, y, s]) => { const m = gem(0x4ad8ff, s * 0.7); m.position.set(x, y, 0); g.add(m); });
      return g;
    },
    chomei: () => {
      const g = new THREE.Group();
      const mat = std(0xff3d5e, 0xaa0020, 1);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), mat); l.position.set(-0.3, 0.2, 0);
      const r = l.clone(); r.position.x = 0.3;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.85, 20), mat); tip.rotation.z = Math.PI; tip.position.y = -0.38;
      g.add(glowSprite('rgba(255,80,110,0.6)', 2.6), l, r, tip);
      return g;
    },
    _heal: () => {
      const g = new THREE.Group();
      const rice = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.1, 3), std(0xffffff, 0x333333, 0.3));
      rice.rotation.y = Math.PI / 6;
      const nori = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.4, 0.62), std(0x18241a));
      nori.position.y = -0.35;
      g.add(glowSprite('rgba(255,255,255,0.3)', 2.6), rice, nori);
      return g;
    },
    _purge: () => { const g = new THREE.Group(); g.add(seal('#fff0b0'), glowSprite('rgba(255,240,180,0.6)', 3)); return g; },
  };

  // 進化した術：元の術の絵に金の光輪をまとわせる
  for (const [id, def] of Object.entries(SKILLS)) {
    if (!def.base || !MAKERS[def.base]) continue;
    const baseMake = MAKERS[def.base];
    MAKERS[id] = () => {
      const g = new THREE.Group();
      const inner = baseMake();
      g.add(inner);
      const box = new THREE.Box3();
      inner.updateMatrixWorld(true);
      inner.traverse((o) => { if (o.isMesh && !o.isSprite) box.expandByObject(o); });
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const r = Math.max(sz.x, sz.y) * 0.62;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffd35a }));
      halo.position.copy(c); halo.position.z -= sz.z * 0.5;
      const glow = glowSprite('rgba(255,200,80,0.55)', r * 3.2);
      glow.position.copy(c); glow.position.z -= sz.z;
      g.add(glow, halo);
      return g;
    };
  }
  // 陰陽師の肖像
  for (const ch of CHARACTERS) {
    MAKERS['char_' + ch.id] = () => {
      const rig = new Rig(ch.model, 'player', 1.75, ch.model === 'player' ? ['Spellbook', 'Spellbook_open', '1H_Wand'] : []);
      rig.play('Idle');
      rig.update(0.5);
      rig.root.rotation.y = 0.35;
      if (ch.tint) for (const m of rig.materials()) { m.emissive = new THREE.Color(ch.tint); m.emissiveIntensity = 0.35; }
      return rig.root;
    };
  }

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g2 = canvas.getContext('2d');
  const out = {};
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  for (const [id, make] of Object.entries(MAKERS)) {
    try {
      holder.clear();
      const obj = make();
      holder.add(obj);
      holder.updateMatrixWorld(true);
      const isChar = id.startsWith('char_');
      fit(obj, id === 'idaten' || isChar ? 1.05 : 1.2, isChar ? new THREE.Vector3(0.15, 0.12, 1).normalize() : null);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels);
      const img = g2.createImageData(SIZE, SIZE);
      for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      g2.putImageData(img, 0, 0);
      out[id] = canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('icon failed', id, e);
    }
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(0x000000, prevClear);
  rt.dispose();
  return out;
}
