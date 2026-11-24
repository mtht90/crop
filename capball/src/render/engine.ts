import * as THREE from 'three';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  private clock = new THREE.Clock();
  private updaters = new Set<(dt: number) => void>();
  paused = false;
  /** 確認用の早送り（?ts=3 など） */
  timeScale = Number(new URLSearchParams(location.search).get('ts')) || 1;
  fixedVFov: number | null = null;
  /** 本塁上で見せたい横幅の半分（縦長画面で視野を合わせる） */
  plateHalfWidth = 1.2;
  plateDist = 4.2;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = 'game';
    parent.prepend(this.renderer.domElement);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitFov();
  }

  fitFov() {
    if (this.fixedVFov) this.camera.fov = this.fixedVFov;
    else {
      const hf = Math.atan(this.plateHalfWidth / this.plateDist);
      const vf = 2 * Math.atan(Math.tan(hf) / this.camera.aspect);
      this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vf), 12, 72);
    }
    this.camera.updateProjectionMatrix();
  }

  onUpdate(f: (dt: number) => void) {
    this.updaters.add(f);
    return () => this.updaters.delete(f);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(1 / 20, this.clock.getDelta()) * this.timeScale;
      if (!this.paused) for (const f of this.updaters) f(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }
}
