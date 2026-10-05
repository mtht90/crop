import * as THREE from 'three';
import { characters } from '../characters';
import { assets } from '../render/assets';
import { ModelRig } from '../render/charModel';

/**
 * Renders each fighter's 3D model once into 2D canvases for the select screen:
 * a square face close-up for the roster tiles and a tall bust for the big
 * preview panels. Done with a small throwaway renderer after the assets load;
 * menus copy the cached canvases with drawImage (no data: URLs, CSP-friendly).
 */
export interface Portrait {
  face: HTMLCanvasElement;
  bust: HTMLCanvasElement;
  /** Wide eye-level strip for the ult cut-in. */
  eyes: HTMLCanvasElement;
}

const cache = new Map<string, Portrait>();

/** Stance clip per weapon so each portrait holds a characteristic pose. */
const POSE: Record<string, [string, number]> = {
  fists: ['Idle_Loop', 0.5],
  guns: ['Pistol_Idle_Loop', 0.3],
  bow: ['Spell_Simple_Idle_Loop', 0.4],
  hammer: ['Sword_Idle', 0.5],
  katana: ['Sword_Idle', 0.2],
  yoyo: ['Spell_Simple_Idle_Loop', 0.8],
  grapple: ['Pistol_Idle_Loop', 0.6],
  umbrella: ['Sword_Idle', 0.9],
};

export function portraitsReady() {
  return cache.size > 0;
}

export function getPortrait(id: string) {
  return cache.get(id) ?? null;
}

export function buildPortraits() {
  if (cache.size || !assets.ready) return;
  const W = 384;
  const H = 480;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6d6, 1.8));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
  key.position.set(1.2, 2, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd9ff, 1.6);
  rim.position.set(-2, 1.5, -1.5);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);

  for (const [id, def] of Object.entries(characters)) {
    const rig = new ModelRig(def);
    const mixer = new THREE.AnimationMixer(rig.model);
    const [clip, t] = POSE[def.weapon] ?? ['Idle_Loop', 0];
    const action = mixer.clipAction(assets.clips[clip] ?? assets.clips.Idle_Loop);
    action.play();
    mixer.setTime(t);
    rig.root.rotation.y = -0.35;
    rig.setUmbrellaOpen?.(0);
    scene.add(rig.root);
    rig.root.updateMatrixWorld(true);
    const head = rig.bones.Head.getWorldPosition(new THREE.Vector3());

    const shot = (w: number, h: number, dist: number, lookY: number, camY = 0.04, side = 0.28) => {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      cam.position.set(head.x + dist * side, head.y + camY, head.z + dist);
      cam.lookAt(head.x, head.y + lookY, head.z);
      renderer.clear();
      renderer.render(scene, cam);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      out.getContext('2d')!.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
      return out;
    };
    const face = shot(256, 256, 1.15, 0.06);
    const bust = shot(W, H, 3.0, -0.35);
    cam.fov = 14;
    const eyes = shot(640, 160, 0.85, 0.085, 0.09, 0.12);
    cam.fov = 24;
    cache.set(id, { face, bust, eyes });
    scene.remove(rig.root);
    mixer.stopAllAction();
  }
  renderer.dispose();
  renderer.forceContextLoss();
}

/** Copies a cached portrait canvas into a canvas element on the page. */
export function paint(target: HTMLCanvasElement, src: HTMLCanvasElement | undefined) {
  if (!src) return;
  target.width = src.width;
  target.height = src.height;
  target.getContext('2d')!.drawImage(src, 0, 0);
}
