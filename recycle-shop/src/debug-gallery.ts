import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Engine } from './core/engine';
import { assets, preloadAll } from './core/assets';
import { ITEMS } from './data/items';

/** ?gallery で開くデバッグ用: 全商品モデルを正規化して並べる */
export async function runGallery(app: HTMLElement, which: string) {
  const engine = new Engine(app);
  engine.setQuality('medium');
  const env = await assets.loadHdr('hdri/st_fagans_interior_1k.hdr');
  engine.scene.environment = env;
  engine.scene.background = new THREE.Color('#223');
  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.position.set(5, 10, 5);
  engine.scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#556' }));
  floor.rotation.x = -Math.PI / 2;
  engine.scene.add(floor);
  let list: { path: string; label: string; size?: number; fit?: 'y' | 'max' | 'xz'; scale?: number }[];
  const custom = new URLSearchParams(location.search).get('list');
  if (custom) {
    list = custom.split(',').map((n) => ({ path: n, label: n.split('/')[1], scale: 0.75 }));
  } else if (which === 'chars') {
    list = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'].map((n) => ({ path: `chars/${n}.glb`, label: n, scale: 0.7 }));
  } else if (which === 'env') {
    list = ['wall', 'wall_doorway', 'wall_window_open', 'door_A', 'floor_kitchen', 'kitchencounter_straight_A', 'kitchentable_A_large', 'crate', 'shelf_B_large', 'shelf_A_big', 'table_medium_long', 'rug_rectangle_stripes_A', 'cabinet_medium', 'couch', 'pillar_A', 'Pallet_Small', 'Box_A', 'menu', 'khr_CommercialRefrigerator', 'streetlight', 'building_B', 'car_sedan', 'road_straight', 'base'].map((n) => ({ path: n === 'cabinet_medium' ? 'items/cabinet_medium.glb' : `env/${n}.glb`, label: n, scale: 0.75 }));
  } else {
    list = ITEMS.map((d) => ({ path: d.model, label: d.name, size: d.size, fit: d.fit }));
  }
  const q = new URLSearchParams(location.search);
  const from = Number(q.get('from') ?? 0);
  list = list.slice(from, from + Number(q.get('n') ?? 999));
  await preloadAll([...new Set(list.map((l) => l.path)), 'chars/anims.glb'], [], () => {});
  const cols = Math.ceil(Math.sqrt(list.length));
  const spacing = which === 'env' || custom ? 3.5 : 1.6;
  list.forEach((l, i) => {
    const o = assets.instance(l.path, { size: l.size, fit: l.fit, scale: l.scale });
    o.position.set((i % cols) * spacing - (cols * spacing) / 2, 0, Math.floor(i / cols) * spacing - (cols * spacing) / 2);
    engine.scene.add(o);
    const d = document.createElement('div');
    d.textContent = l.label;
    d.style.cssText = 'color:#fff;font:12px sans-serif;background:#0008;padding:2px 4px;border-radius:3px';
    const lab = new CSS2DObject(d);
    lab.position.set(0, -0.05, 0.5);
    o.add(lab);
    const custom = new URLSearchParams(location.search).get('list');
  if (custom) {
    list = custom.split(',').map((n) => ({ path: n, label: n.split('/')[1], scale: 0.75 }));
  } else if (which === 'chars') {
      const mixer = new THREE.AnimationMixer(o);
      const clip = assets.animations('chars/anims.glb').find((c) => c.name === 'Walking_A')!;
      mixer.clipAction(clip).play();
      mixer.update(0.3);
      const box = new THREE.Box3().setFromObject(o, true);
      d.textContent += ` h=${box.max.y.toFixed(2)}`;
      (window as any).mixers = [...((window as any).mixers ?? []), mixer];
    }
  });
  const ctrl = new OrbitControls(engine.camera, engine.renderer.domElement);
  const dist = cols * spacing;
  engine.camera.position.set(0, dist * 0.45, dist * 0.8);
  ctrl.target.set(0, 0, 0);
  ctrl.update();
  engine.onUpdate((dt) => { ctrl.update(); for (const m of (window as any).mixers ?? []) m.update(dt); });
  engine.start();
  (window as any).__ready = true;
}
