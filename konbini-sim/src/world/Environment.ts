import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import type { Store } from './Store';

/**
 * Day/night lighting. Interior image-based lighting comes from a PMREM of a
 * synthetic "shop interior" (white room + bright ceiling troffers), so the
 * glossy floor and packaging reflect realistic strip lights. The sky seen
 * through the windows is a real HDRI blended by time of day.
 */
export class Environment {
  private pmrem: THREE.PMREMGenerator;
  interiorEnv: THREE.Texture;
  private skies: Record<'day' | 'dusk' | 'night', THREE.Texture | null>;
  private exteriorEnv: Record<'day' | 'dusk' | 'night', THREE.Texture | null> = { day: null, dusk: null, night: null };
  private current: 'day' | 'dusk' | 'night' | '' = '';
  rain = 0;
  private rainDrops: THREE.LineSegments;
  private rainVel: Float32Array;

  constructor(renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private store: Store, assets: Assets) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.interiorEnv = this.pmrem.fromScene(this.interiorScene(), 0.02).texture;
    this.skies = { ...assets.hdri };
    for (const k of ['day', 'dusk', 'night'] as const) {
      const t = assets.hdri[k];
      if (t) this.exteriorEnv[k] = this.pmrem.fromEquirectangular(t).texture;
    }
    scene.environment = this.interiorEnv;
    scene.environmentIntensity = 0.85;
    // Exterior materials use the outdoor HDRI for reflections.
    store.exterior.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMap' in m) m.userData.exterior = true;
    });
    // rain streaks outside
    const N = 3500;
    const pos = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) this.resetDrop(pos, i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainDrops = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#b8c4d0', transparent: true, opacity: 0.35 }));
    this.rainDrops.frustumCulled = false;
    this.rainDrops.visible = false;
    scene.add(this.rainDrops);
  }

  private resetDrop(pos: Float32Array, i: number, randomY: boolean) {
    const x = (Math.random() - 0.5) * 40;
    const z = 5.4 + Math.random() * 18;
    const y = randomY ? Math.random() * 12 : 12;
    pos.set([x, y, z, x - 0.02, y - 0.35, z + 0.03], i * 6);
    this.rainVel[i] = 11 + Math.random() * 4;
  }

  private interiorScene(): THREE.Scene {
    const s = new THREE.Scene();
    // Unlit surfaces so the captured environment matches a brightly lit white shop.
    const room = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#d9d6cf').multiplyScalar(0.9), side: THREE.BackSide }));
    room.position.y = 1.5;
    s.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e6e2da').multiplyScalar(0.85) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    s.add(floor);
    const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.94).multiplyScalar(9) });
    for (const z of [-3.4, -1.05, 1.3, 3.7]) {
      for (let x = -5.6; x <= 5.7; x += 2.25) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), panel);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, 2.98, z);
        s.add(p);
      }
    }
    // shelves as darker blocks to break up reflections
    const shelf = new THREE.MeshBasicMaterial({ color: '#8a867e' });
    for (const z of [-2.2, 0.15, 2.5]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.45, 0.9), shelf);
      b.position.set(-1.4, 0.72, z);
      s.add(b);
    }
    // bright windows on the front
    const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.85, 0.9).multiplyScalar(1.5) }));
    win.position.set(0, 1.5, 5.95);
    win.rotation.y = Math.PI;
    s.add(win);
    s.add(new THREE.AmbientLight('#ffffff', 0.4));
    return s;
  }

  /** hour: 0-24 (fractional). */
  update(hour: number, dt: number): void {
    const s = this.store;
    // daylight factor 0..1
    const sunUp = smooth(5.5, 7.5, hour) * (1 - smooth(17, 19.2, hour));
    const dusk = Math.max(0, 1 - Math.abs(hour - 18) / 1.6) + Math.max(0, 1 - Math.abs(hour - 6) / 1.2) * 0.6;
    const night = 1 - sunUp;
    const key: 'day' | 'dusk' | 'night' = sunUp > 0.6 ? 'day' : dusk > 0.45 ? 'dusk' : 'night';
    if (key !== this.current) {
      this.current = key;
      this.scene.background = this.skies[key];
      const env = this.exteriorEnv[key];
      s.exterior.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
        for (const m of mats) if (m && 'envMap' in m) m.envMap = env;
      });
    }
    const overcast = this.rain > 0 ? 0.45 : 1;
    this.scene.backgroundIntensity = (key === 'night' ? 0.25 : key === 'dusk' ? 0.7 : 1) * (0.5 + 0.5 * overcast);
    this.scene.backgroundBlurriness = 0.0;
    // sun path (east -> west)
    const t = (hour - 6) / 12;
    const ang = t * Math.PI;
    s.sun.position.set(Math.cos(ang) * -30, Math.max(3, Math.sin(ang) * 28), 18);
    s.sun.intensity = 3.2 * sunUp * overcast + 0.12 * night;
    s.sun.color.set(sunUp > 0.2 ? (dusk > 0.3 ? '#ffc58a' : '#fff4e0') : '#9fb4ff');
    s.hemi.intensity = 0.35 + 0.25 * sunUp;
    for (const l of s.exteriorNightLights) (l as THREE.SpotLight).intensity = night * (l.userData.base ?? ((l as THREE.SpotLight).distance > 15 ? 160 : 40));
    s.windowSpill.intensity = night * 2.2 + 0.3;
    for (const m of s.signMaterials) m.emissiveIntensity = 0.15 + night * 0.55;
    for (const m of s.vendingMaterials) m.emissiveIntensity = 0.4 + night * 1.4;
    for (const m of s.streetLampMats) m.emissiveIntensity = night * 6;
    for (const m of s.neighbourWindowMats) m.emissiveIntensity = night * 1.2;
    // rain
    this.rainDrops.visible = this.rain > 0.01;
    (this.rainDrops.material as THREE.LineBasicMaterial).opacity = 0.35 * this.rain;
    if (this.rainDrops.visible) {
      const pos = this.rainDrops.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < this.rainVel.length; i++) {
        const dy = this.rainVel[i] * dt;
        a[i * 6 + 1] -= dy;
        a[i * 6 + 4] -= dy;
        if (a[i * 6 + 4] < 0) this.resetDrop(a, i, false);
      }
      pos.needsUpdate = true;
    }
    const wet = this.rain;
    const asph = s.m.asphalt;
    asph.roughness = 1 - wet * 0.55;
    asph.color.setScalar(1 - wet * 0.35);
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
