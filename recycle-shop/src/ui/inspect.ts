import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { assets } from '../core/assets';
import { Rng, clamp } from '../core/util';
import { itemDef } from '../data/items';
import { buildItemModel } from '../entities/itemView';
import type { Defect, ItemState } from '../game/state';

function spotTexture(kind: 'dirt' | 'scratch' | 'dent' | 'crack' | 'fade' | 'ring'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const r = new Rng(kind.length * 997);
  if (kind === 'dirt') {
    for (let i = 0; i < 26; i++) {
      const g = x.createRadialGradient(64 + r.range(-30, 30), 64 + r.range(-30, 30), 0, 64, 64, r.range(20, 60));
      g.addColorStop(0, `rgba(${70 + r.int(0, 30)},${50 + r.int(0, 20)},${25},${r.range(0.25, 0.5)})`);
      g.addColorStop(1, 'rgba(60,45,20,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
  } else if (kind === 'scratch' || kind === 'crack') {
    x.strokeStyle = kind === 'crack' ? 'rgba(20,15,10,0.95)' : 'rgba(235,235,235,0.95)';
    x.lineWidth = kind === 'crack' ? 5 : 4;
    x.lineCap = 'round';
    for (let k = 0; k < (kind === 'crack' ? 1 : 3); k++) {
      x.beginPath();
      let px = 20 + r.range(0, 10), py = 30 + k * 25 + r.range(-8, 8);
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) { px += r.range(12, 20); py += r.range(-10, 10); x.lineTo(px, py); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1.5; x.stroke();
  } else if (kind === 'dent') {
    const g = x.createRadialGradient(58, 58, 4, 64, 64, 44);
    g.addColorStop(0, 'rgba(10,10,10,0.8)'); g.addColorStop(0.6, 'rgba(40,40,40,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 3; x.beginPath(); x.arc(70, 70, 36, -0.5, 1.4); x.stroke();
  } else if (kind === 'fade') {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 58);
    g.addColorStop(0, 'rgba(255,250,230,0.85)'); g.addColorStop(1, 'rgba(255,250,230,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  } else {
    x.strokeStyle = '#ff3b3b'; x.lineWidth = 10; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX: Partial<Record<string, THREE.Texture>> = {};
const tex = (k: Parameters<typeof spotTexture>[0]) => (TEX[k] ??= spotTexture(k));

interface Marker { mesh: THREE.Mesh; hit: THREE.Mesh; defect?: Defect; dirt?: { hp: number } }

/** 査定・清掃用の 3D ビュー (独立したレンダラー) */
export class InspectStage {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  private pivot = new THREE.Group();
  private model: THREE.Group | null = null;
  private markers: Marker[] = [];
  private radius = 1;
  private centerY = 0.5;
  private yaw = 0.6;
  private pitch = 0.35;
  private zoom = 1;
  private dragging = false;
  private scrubbing = false;
  private last = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  mode: 'appraise' | 'clean' = 'appraise';
  item: ItemState | null = null;
  onDefectFound: ((d: Defect) => void) | null = null;
  onScrub: ((remaining: number) => void) | null = null;
  scrubPower = 1;
  private hoverRing: THREE.Mesh;
  private disposed = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'inspect-canvas';
    host.appendChild(this.canvas);
    assets.loadHdr('hdri/studio_small_03_1k.hdr').then((t) => { this.scene.environment = t; }, () => {});
    this.scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight('#fff', 2.2);
    key.position.set(2, 3, 2);
    const rim = new THREE.DirectionalLight('#9fc6ff', 1.2);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.4));
    this.scene.add(this.pivot);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 0.04, 64), new THREE.MeshStandardMaterial({ color: '#30343c', roughness: 0.5, metalness: 0.4 }));
    ring.position.y = -0.02;
    ring.name = 'plate';
    this.scene.add(ring);
    this.hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.8, depthTest: false }));
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 10;
    this.scene.add(this.hoverRing);
    this.bindEvents();
  }

  private bindEvents() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      this.last.set(e.clientX, e.clientY);
      this.updatePointer(e);
      if (this.mode === 'clean' && e.button === 0) {
        this.scrubbing = true;
        c.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button === 0 && this.tryFind()) return;
      this.dragging = true;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      this.updatePointer(e);
      if (this.dragging) {
        this.yaw -= (e.clientX - this.last.x) * 0.008;
        this.pitch = clamp(this.pitch + (e.clientY - this.last.y) * 0.006, -1.2, 1.3);
      }
      this.last.set(e.clientX, e.clientY);
    });
    const up = () => { this.dragging = false; this.scrubbing = false; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { this.zoom = clamp(this.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.35, 1.6); e.preventDefault(); }, { passive: false });
  }

  private updatePointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** 表示する商品を設定 */
  setItem(it: ItemState, mode: 'appraise' | 'clean') {
    this.mode = mode;
    this.item = it;
    if (this.model) { this.pivot.remove(this.model); }
    for (const m of this.markers) { m.mesh.removeFromParent(); m.hit.removeFromParent(); }
    this.markers = [];
    const def = itemDef(it.defId);
    this.model = buildItemModel(def, it.variant);
    this.pivot.add(this.model);
    const size: THREE.Vector3 = this.model.userData.size;
    this.radius = Math.max(size.x, size.y, size.z) * 0.5;
    this.centerY = size.y / 2;
    this.model.position.y = 0;
    const plate = this.scene.getObjectByName('plate')!;
    plate.scale.set(Math.max(size.x, size.z) * 0.75, 1, Math.max(size.x, size.z) * 0.75);
    this.pivot.position.y = 0;
    this.buildMarkers(it);
    this.zoom = 1;
  }

  private sampler(rng: Rng) {
    const meshes: { mesh: THREE.Mesh; s: MeshSurfaceSampler; w: number }[] = [];
    this.model!.updateMatrixWorld(true);
    this.model!.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as any).isSkinnedMesh || !m.visible) return;
      const mat = m.material as THREE.MeshPhysicalMaterial;
      if (mat && (mat.transmission > 0.5 || mat.opacity < 0.5)) return;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      const sz = b.getSize(new THREE.Vector3());
      const w = sz.x * sz.y + sz.y * sz.z + sz.x * sz.z;
      try {
        const s = (new MeshSurfaceSampler(m) as any).setRandomGenerator(() => rng.next()).build() as MeshSurfaceSampler;
        meshes.push({ mesh: m, s, w });
      } catch { /* 頂点のないメッシュ */ }
    });
    return meshes;
  }

  private buildMarkers(it: ItemState) {
    const rng = new Rng(it.dirtSeed);
    const list = this.sampler(rng);
    if (!list.length) return;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const place = (seed: number, textureKey: Parameters<typeof spotTexture>[0], scale: number): { mesh: THREE.Mesh; hit: THREE.Mesh } => {
      const r = new Rng(seed);
      const pick = r.weighted(list, (x) => x.w);
      (pick.s as any).setRandomGenerator(() => r.next());
      pick.s.sample(p, n);
      p.applyMatrix4(pick.mesh.matrixWorld);
      n.transformDirection(pick.mesh.matrixWorld);
      const local = this.model!.worldToLocal(p.clone());
      const mat = new THREE.MeshBasicMaterial({ map: tex(textureKey), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), mat);
      mesh.position.copy(local).addScaledVector(n, this.radius * 0.004);
      mesh.lookAt(this.model!.localToWorld(local.clone().add(n)));
      mesh.rotateZ(r.range(0, Math.PI * 2));
      this.model!.add(mesh);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.8, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(mesh.position);
      this.model!.add(hit);
      return { mesh, hit };
    };
    const base = this.radius * 2;
    for (const d of it.defects) {
      const kind = d.kind;
      const m = place(d.seed, kind, base * (0.05 + d.severity * 0.002));
      const marker: Marker = { ...m, defect: d };
      if (d.found) this.markFound(marker, false);
      this.markers.push(marker);
    }
    const dirtCount = Math.round(it.dirt * 14);
    for (let i = 0; i < dirtCount; i++) {
      const m = place(it.dirtSeed + i * 131, 'dirt', base * rng.range(0.12, 0.22));
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
      this.markers.push({ ...m, dirt: { hp: 1 } });
    }
  }

  private markFound(m: Marker, notify = true) {
    if (!m.defect) return;
    m.defect.found = true;
    if (!m.mesh.userData.ring) {
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex('ring'), transparent: true, depthTest: false }));
      ring.scale.setScalar((m.mesh.geometry as THREE.PlaneGeometry).parameters.width * 1.8);
      ring.renderOrder = 5;
      m.mesh.add(ring);
      m.mesh.userData.ring = ring;
    }
    if (notify) this.onDefectFound?.(m.defect);
  }

  private tryFind(): boolean {
    if (this.mode !== 'appraise') return false;
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.markers.filter((m) => m.defect && !m.defect.found).map((m) => m.hit), false);
    if (hits.length) {
      const m = this.markers.find((x) => x.hit === hits[0].object)!;
      // 手前に本体があれば見えていない
      const body = this.ray.intersectObject(this.model!, true).filter((h) => !this.markers.some((mm) => mm.hit === h.object || mm.mesh === h.object));
      if (body.length && body[0].distance < hits[0].distance - this.radius * 0.08) return false;
      this.markFound(m);
      return true;
    }
    return false;
  }

  /** 全ての傷をマーク (ルーペ Pro や自動確認で使用) */
  revealAll() { for (const m of this.markers) if (m.defect && !m.defect.found) this.markFound(m); }

  dirtRemaining() {
    const d = this.markers.filter((m) => m.dirt);
    if (!d.length) return 0;
    return d.reduce((s, m) => s + m.dirt!.hp, 0) / d.length;
  }

  private scrub(dt: number) {
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.markers.filter((m) => m.dirt && m.dirt.hp > 0).map((m) => m.hit), false);
    if (!hits.length) return;
    const m = this.markers.find((x) => x.hit === hits[0].object)!;
    m.dirt!.hp = Math.max(0, m.dirt!.hp - dt * 1.6 * this.scrubPower);
    (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * m.dirt!.hp;
    this.onScrub?.(this.dirtRemaining());
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const c = this.renderer.getSize(new THREE.Vector2());
    if (c.x !== w || c.y !== h) {
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  render(dt: number) {
    if (this.disposed) return;
    this.resize();
    if (this.scrubbing) this.scrub(dt);
    if (!this.dragging && !this.scrubbing) this.yaw += dt * 0.12;
    const r = this.radius * 4.2 * this.zoom;
    const target = new THREE.Vector3(0, this.centerY, 0);
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * r, target.y + Math.sin(this.pitch) * r, Math.cos(this.yaw) * Math.cos(this.pitch) * r);
    this.camera.lookAt(target);
    this.camera.near = this.radius * 0.02;
    this.camera.far = this.radius * 40;
    this.camera.updateProjectionMatrix();
    // ホバー中の未発見の傷を少し強調 (近づいたときのみ)
    this.hoverRing.visible = false;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
