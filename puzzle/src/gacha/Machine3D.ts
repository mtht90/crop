import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type CapRarity = 'N' | 'R' | 'SR' | 'SSR';

/**
 * Real-time 3D gacha machine drawn with three.js on its own canvas laid over the Pixi stage.
 * Model: "gumball machine" by myles_683 (CC BY 4.0), split into parts and normalized so the
 * dome center is the origin and the dome radius is 1. Capsules are physically simulated
 * spheres tumbling inside the glass.
 */
const CAP_TOP: Record<CapRarity, number> = { N: 0x8fd8ff, R: 0x3f8cff, SR: 0xffc21f, SSR: 0xff6fd0 };
const CAP_R = 0.18;
const DOME_IN = 1 - 0.05 - CAP_R;
const CHUTE = new THREE.Vector3(0, -2.35, 1.45);

interface Cap {
  obj: THREE.Group;
  top: THREE.Mesh;
  p: THREE.Vector3;
  prev: THREE.Vector3;
  rarity: CapRarity;
  free: boolean;
}

/**
 * The model ships as glTF JSON with the binary embedded as base64 (the artifact host doesn't
 * serve .glb). GLTFLoader would fetch() that data: URI, which strict CSPs block, so the JSON is
 * repacked into a GLB in memory and parsed directly.
 */
async function fetchGlb(url: string): Promise<ArrayBuffer> {
  const json = await (await fetch(url)).json();
  const uri: string = json.buffers[0].uri;
  const bin = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  delete json.buffers[0].uri;
  json.buffers[0].byteLength = bin.length;
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (n: number) => (4 - (n % 4)) % 4;
  const jsPadded = new Uint8Array(js.length + pad(js.length)).fill(0x20);
  jsPadded.set(js);
  js = jsPadded;
  const binLen = bin.length + pad(bin.length);
  const out = new ArrayBuffer(12 + 8 + js.length + 8 + binLen);
  const v = new DataView(out);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.byteLength, true);
  v.setUint32(12, js.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, js.length).set(js);
  const o = 20 + js.length;
  v.setUint32(o, binLen, true);
  v.setUint32(o + 4, 0x004e4942, true);
  new Uint8Array(out, o + 8, bin.length).set(bin);
  return out;
}

export class Machine3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private rig = new THREE.Group();
  private crank: THREE.Object3D | null = null;
  private caps: Cap[] = [];
  private shake = 0;
  private stir = 0;
  private t = 0;
  private dolly = 0;
  private flash: THREE.PointLight;
  private rainbow = false;
  private disposed = false;
  private lastNow = performance.now();

  private constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.flash = new THREE.PointLight(0xffffff, 0, 6);
  }

  static async create(url: string): Promise<Machine3D | null> {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;pointer-events:none;z-index:2;opacity:0;transition:opacity .35s;';
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    const m = new Machine3D(canvas, renderer);
    try {
      await m.build(url);
    } catch (e) {
      console.warn('3D gacha unavailable', e);
      (window as unknown as { __gacha3dError?: string }).__gacha3dError = String(e);
      m.destroy();
      return null;
    }
    document.body.appendChild(canvas);
    return m;
  }

  private async build(url: string): Promise<void> {
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.scene.add(new THREE.HemisphereLight(0xfff4ff, 0x6a4a90, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe0f4, 1.2);
    rim.position.set(4, 2, -4);
    this.scene.add(rim);
    this.flash.position.set(0, -0.2, 1.6);
    this.scene.add(this.flash);

    const gltf = await new GLTFLoader().parseAsync(await fetchGlb(url), '');
    const mats: Record<string, THREE.Material> = {
      body: new THREE.MeshPhysicalMaterial({ color: 0xff3d86, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      lid: new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.22, metalness: 0.75 }),
      crank: new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.18, metalness: 0.8 }),
      chute: new THREE.MeshStandardMaterial({ color: 0xe6ecf5, roughness: 0.18, metalness: 0.85 }),
    };
    const parts: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh);
    });
    for (const mesh of parts) {
      if (mesh.name === 'glass') {
        // inside of the glass behind the capsules, outside in front of them
        const back = new THREE.Mesh(mesh.geometry, new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.15, transparent: true, opacity: 0.32, side: THREE.BackSide, depthWrite: false }));
        back.renderOrder = 0;
        const front = new THREE.Mesh(mesh.geometry, new THREE.MeshPhysicalMaterial({ color: 0xeaf8ff, roughness: 0.02, metalness: 0.15, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 3.2, side: THREE.FrontSide, depthWrite: false }));
        front.renderOrder = 2;
        // a soft rim so the glass edge reads as a solid dome
        const rimMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { color: { value: new THREE.Color(0xdff6ff) } },
          vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'uniform vec3 color; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(color, f * 0.75); }',
        });
        const rimMesh = new THREE.Mesh(mesh.geometry, rimMat);
        rimMesh.renderOrder = 3;
        this.rig.add(back, front, rimMesh);
        continue;
      }
      mesh.material = mats[mesh.name] ?? mats.body;
      this.rig.add(mesh);
      if (mesh.name === 'crank') this.crank = mesh;
    }
    // a slightly bigger knob so the crank reads as a handle
    if (this.crank) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), mats.crank);
      knob.position.set(0, 0.28, 0.05);
      this.crank.add(knob);
    }
    this.scene.add(this.rig);

    const rarities: CapRarity[] = ['N', 'N', 'N', 'N', 'R', 'R', 'R', 'SR', 'SR', 'SSR'];
    for (let i = 0; i < 30; i++) {
      const c = this.makeCap(rarities[i % rarities.length]);
      const a = Math.random() * Math.PI * 2;
      c.p.set(Math.cos(a) * 0.5 * Math.random(), -0.2 + Math.random() * 0.9, Math.sin(a) * 0.5 * Math.random());
      c.prev.copy(c.p);
      c.obj.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.caps.push(c);
      this.rig.add(c.obj);
    }
    // settle the pile before the first frame
    for (let i = 0; i < 240; i++) this.step(1 / 120);
  }

  private makeCap(rarity: CapRarity): Cap {
    const obj = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(CAP_R, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), this.capTopMat(rarity));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(CAP_R, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xfaf7ff, roughness: 0.2, clearcoat: 1 }));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(CAP_R, CAP_R * 0.07, 8, 32), new THREE.MeshStandardMaterial({ color: 0x5a4a7a, roughness: 0.5 }));
    seam.rotation.x = Math.PI / 2;
    obj.add(top, bot, seam);
    obj.renderOrder = 1;
    return { obj, top, p: new THREE.Vector3(), prev: new THREE.Vector3(), rarity, free: true };
  }

  private capTopMat(rarity: CapRarity): THREE.Material {
    if (rarity === 'SSR') return new THREE.MeshPhysicalMaterial({ color: CAP_TOP.SSR, roughness: 0.12, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, metalness: 0.2 });
    return new THREE.MeshPhysicalMaterial({ color: CAP_TOP[rarity], roughness: 0.14, clearcoat: 1, transparent: true, opacity: 0.93 });
  }

  /** Places the overlay canvas (CSS pixels). */
  setRect(x: number, y: number, w: number, h: number): void {
    Object.assign(this.canvas.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(on: boolean): void {
    this.canvas.style.opacity = on ? '1' : '0';
  }

  /** A still copy of the current frame (for 2D scenes that need the machine behind other art). */
  snapshot(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    c.getContext('2d')?.drawImage(this.canvas, 0, 0);
    return c;
  }

  /** Projects a machine-space point to CSS pixels inside the canvas. */
  project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().applyMatrix4(this.rig.matrixWorld).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  chutePoint(): { x: number; y: number } {
    return this.project(CHUTE.clone().add(new THREE.Vector3(0, 0.05, 0.25)));
  }

  /** Two turns of the crank while the machine rattles and the capsules churn. */
  turnCrank(dur = 1.1): Promise<void> {
    this.shake = dur;
    this.stir = dur;
    const start = this.t;
    return new Promise((res) => {
      this.crankAnim = { start, dur, res };
    });
  }
  private crankAnim: { start: number; dur: number; res: () => void } | null = null;

  /** One capsule drops through the neck and rolls out of the chute toward the camera. */
  dispense(rarity: CapRarity): Promise<void> {
    const c = this.caps.filter((q) => q.free).sort((a, b) => a.p.y - b.p.y)[0];
    if (!c) return Promise.resolve();
    c.free = false;
    c.rarity = rarity;
    c.top.material = this.capTopMat(rarity);
    this.rainbow = rarity === 'SSR';
    this.flash.color.set(CAP_TOP[rarity]);
    const from = c.p.clone();
    const path = [from, new THREE.Vector3(0, -1.0, 0.1), new THREE.Vector3(0, -1.9, 0.6), CHUTE.clone(), CHUTE.clone().add(new THREE.Vector3(0, 0.05, 0.55))];
    const curve = new THREE.CatmullRomCurve3(path);
    const dur = 0.9;
    const start = this.t;
    return new Promise((res) => {
      this.dispenseAnim = { c, curve, start, dur, res };
    });
  }
  private dispenseAnim: { c: Cap; curve: THREE.CatmullRomCurve3; start: number; dur: number; res: () => void } | null = null;

  /** Pull the camera toward the chute (0..1). */
  setDolly(k: number): void {
    this.dolly = k;
  }

  /** Hides the dispensed capsule once the 2D reveal takes over and returns it to the dome. */
  resetDispensed(): void {
    for (const c of this.caps) {
      if (c.free) continue;
      c.free = true;
      c.p.set((Math.random() - 0.5) * 0.4, 0.6, (Math.random() - 0.5) * 0.4);
      c.prev.copy(c.p);
      c.obj.visible = true;
    }
    this.flash.intensity = 0;
    this.rainbow = false;
  }

  private step(h: number): void {
    const g = -9.5;
    const caps = this.caps;
    for (const c of caps) {
      if (!c.free) continue;
      const vx = (c.p.x - c.prev.x) * 0.995;
      const vy = (c.p.y - c.prev.y) * 0.995;
      const vz = (c.p.z - c.prev.z) * 0.995;
      c.prev.copy(c.p);
      c.p.x += vx;
      c.p.y += vy + g * h * h;
      c.p.z += vz;
      if (this.stir > 0 && Math.random() < 0.08) {
        c.p.x += (Math.random() - 0.5) * 0.05;
        c.p.y += Math.random() * 0.06;
        c.p.z += (Math.random() - 0.5) * 0.05;
      }
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < caps.length; i++) {
        const a = caps[i];
        if (!a.free) continue;
        for (let j = i + 1; j < caps.length; j++) {
          const b = caps[j];
          if (!b.free) continue;
          const dx = b.p.x - a.p.x;
          const dy = b.p.y - a.p.y;
          const dz = b.p.z - a.p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const rr = CAP_R * 2;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const k = ((rr - d) / d) * 0.5;
          a.p.x -= dx * k;
          a.p.y -= dy * k;
          a.p.z -= dz * k;
          b.p.x += dx * k;
          b.p.y += dy * k;
          b.p.z += dz * k;
        }
        const l = a.p.length();
        if (l > DOME_IN) a.p.multiplyScalar(DOME_IN / l);
      }
    }
  }

  update(rawDt: number): void {
    if (this.disposed) return;
    // animations follow real time so they stay in step with the 2D presentation even on slow devices;
    // only the capsule physics uses a capped step
    const now = performance.now();
    this.t += Math.min((now - this.lastNow) / 1000 || rawDt, 0.25);
    this.lastNow = now;
    const dt = Math.min(rawDt, 1 / 30);
    this.shake = Math.max(0, this.shake - dt);
    this.stir = Math.max(0, this.stir - dt);
    this.step(dt / 2);
    this.step(dt / 2);
    for (const c of this.caps) {
      if (!c.free) continue;
      c.obj.position.copy(c.p);
      // roll with the motion
      c.obj.rotation.x += (c.p.z - c.prev.z) / CAP_R;
      c.obj.rotation.z -= (c.p.x - c.prev.x) / CAP_R;
    }
    if (this.crankAnim && this.crank) {
      const k = Math.min(1, (this.t - this.crankAnim.start) / this.crankAnim.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.crank.rotation.z = -e * Math.PI * 4;
      if (k >= 1) {
        this.crank.rotation.z = 0;
        const r = this.crankAnim.res;
        this.crankAnim = null;
        r();
      }
    }
    if (this.dispenseAnim) {
      const a = this.dispenseAnim;
      const k = Math.min(1, (this.t - a.start) / a.dur);
      const e = k * k * (3 - 2 * k);
      a.c.obj.position.copy(a.curve.getPoint(e));
      a.c.obj.rotation.x += dt * 12;
      this.flash.intensity = k > 0.6 ? (k - 0.6) * 18 : 0;
      if (k >= 1) {
        this.dispenseAnim = null;
        a.res();
      }
    }
    if (this.rainbow) this.flash.color.setHSL((this.t * 1.5) % 1, 1, 0.6);
    // gentle idle sway + rattle + dolly toward the chute
    const sh = this.shake > 0 ? 0.03 * Math.min(1, this.shake * 2) : 0;
    this.rig.rotation.y = Math.sin(this.t * 0.5) * 0.22 + 0.3 + (Math.random() - 0.5) * sh * 2;
    this.rig.position.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0);
    const d = this.dolly;
    this.camera.position.set(0, -0.3 - d * 0.7, 8.2 - d * 2.2);
    this.camera.lookAt(0, -0.85 - d * 0.75, 0);
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
