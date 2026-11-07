/**
 * カード絵の撮影ツール（開発用）。?card=<カードID> のユニット・建物を、ポートレート用のカメラとライトで撮る。
 * tools/assets/capture.cjs がこのページを開いて PNG に保存する。
 */
import * as THREE from 'three/webgpu';
import { assets, setAssetBase } from '../assets/assets';
import { UNIT_VISUALS } from '../assets/visuals';
import { createCannon, createUnitModel } from '../render/models';

const card = new URLSearchParams(location.search).get('card') ?? 'iron_knight';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: true });
renderer.setPixelRatio(1);
renderer.setSize(480, 600, false);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
await renderer.init();
setAssetBase('/assets/game/');
await assets.load(() => undefined);

const scene = new THREE.Scene();
// ポートレート用ライト：正面やや上のキーライト＋背後からのリムライト
scene.add(new THREE.HemisphereLight('#fff6e8', '#3a3550', 1.6));
const key = new THREE.DirectionalLight('#fff1dc', 3.2);
key.position.set(2, 4, 5);
scene.add(key);
const rim = new THREE.DirectionalLight('#9cc8ff', 2.4);
rim.position.set(-3, 3, -4);
scene.add(rim);

const model = card === 'guard_cannon' ? createCannon(null, 0.8) : createUnitModel(card, null);
if (!model) throw new Error(`no model for ${card}`);
const obj = model.root;
obj.rotation.y = UNIT_VISUALS[card]?.portrait?.yaw ?? 0.45;
scene.add(obj);
if (model.mixer && model.actions?.idle) {
  model.actions.idle.play();
  model.mixer.update(0.4);
}
// 撮影用には陣営色を混ぜない
for (const m of model.materials) m.emissive.setRGB(0, 0, 0);
obj.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(obj);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
const cam = new THREE.PerspectiveCamera(28, 480 / 600, 0.01, 100);
// 上半身寄り（頭が上 1/3 に来るくらい）で撮る
const zoom = UNIT_VISUALS[card]?.portrait?.zoom ?? 1;
const focus = new THREE.Vector3(center.x, box.min.y + size.y * 0.66, center.z);
const dist = (Math.max(size.y * 0.62, size.x * 0.8) / Math.tan(THREE.MathUtils.degToRad(14))) * 0.62 / zoom;
cam.position.set(focus.x, focus.y + size.y * 0.12, focus.z + dist);
cam.lookAt(focus);
renderer.render(scene, cam);
document.body.dataset.ready = '1';
