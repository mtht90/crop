import * as THREE from 'three';
import { VIEW } from '../config/city';

/**
 * アイソメ風の正投影カメラ操作。
 * - 1本指／左ドラッグ：移動
 * - ピンチ／ホイール：拡大縮小
 * - 2本指のひねり／右ドラッグ：回転（基準から ±rotateLimitDeg）
 * - タップ：onTap(clientX, clientY)
 */
export class CityControls {
  readonly target = new THREE.Vector3();
  /** 基準方位からのずれ（ラジアン） */
  rotation = 0;
  viewHeight: number = VIEW.zoomInitial;
  bounds = { x: 30, z: 30 };
  onChange: () => void = () => {};
  onTap: (x: number, y: number) => void = () => {};

  private readonly baseAzimuth = Math.PI / 4;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private tapStart: { x: number; y: number; t: number; id: number } | null = null;
  private moved = false;
  private gesture: { dist: number; angle: number; cx: number; cy: number } | null = null;
  private rightDrag = false;

  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly el: HTMLElement,
  ) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.apply();
  }

  /** カメラの位置・向き・見える範囲を反映 */
  apply() {
    const limit = THREE.MathUtils.degToRad(VIEW.rotateLimitDeg);
    this.rotation = THREE.MathUtils.clamp(this.rotation, -limit, limit);
    this.viewHeight = THREE.MathUtils.clamp(this.viewHeight, VIEW.zoomMin, VIEW.zoomMax);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -this.bounds.x, this.bounds.x);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -this.bounds.z, this.bounds.z);
    const az = this.baseAzimuth + this.rotation;
    const el = THREE.MathUtils.degToRad(VIEW.elevationDeg);
    const r = 200;
    this.camera.position.set(
      this.target.x + r * Math.cos(el) * Math.sin(az),
      this.target.y + r * Math.sin(el),
      this.target.z + r * Math.cos(el) * Math.cos(az),
    );
    this.camera.lookAt(this.target);
    this.resize();
  }

  resize() {
    const w = this.el.clientWidth || 1;
    const h = this.el.clientHeight || 1;
    const aspect = w / h;
    const vh = this.viewHeight;
    this.camera.left = (-vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    this.camera.near = 1;
    this.camera.far = 1000;
    this.camera.updateProjectionMatrix();
  }

  private changed() {
    this.apply();
    this.onChange();
  }

  /** 画面上の移動量(px) → 地面上の移動 */
  private pan(dx: number, dy: number) {
    const perPx = this.viewHeight / (this.el.clientHeight || 1);
    const az = this.baseAzimuth + this.rotation;
    // 画面右方向・画面上方向を地面に投影したベクトル
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const up = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    const el = THREE.MathUtils.degToRad(VIEW.elevationDeg);
    this.target.addScaledVector(right, -dx * perPx);
    this.target.addScaledVector(up, (dy * perPx) / Math.sin(el));
  }

  private zoomBy(factor: number) {
    this.viewHeight *= factor;
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      this.moved = false;
      this.rightDrag = e.button === 2 || e.shiftKey;
    } else {
      this.tapStart = null;
      this.gesture = this.measure();
    }
  };

  private measure() {
    const [a, b] = [...this.pointers.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.tapStart && Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y) > VIEW.tapSlopPx) {
      this.moved = true;
    }
    if (this.pointers.size === 1) {
      if (!this.moved) return;
      if (this.rightDrag) this.rotation += dx * 0.005;
      else this.pan(dx, dy);
      this.changed();
    } else if (this.pointers.size === 2 && this.gesture) {
      const g = this.measure();
      this.zoomBy(this.gesture.dist / g.dist);
      let da = g.angle - this.gesture.angle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      this.rotation -= da;
      this.pan(g.cx - this.gesture.cx, g.cy - this.gesture.cy);
      this.gesture = g;
      this.changed();
    }
  };

  private up = (e: PointerEvent) => {
    const t = this.tapStart;
    this.pointers.delete(e.pointerId);
    if (t && t.id === e.pointerId && !this.moved && performance.now() - t.t < VIEW.tapMaxMs && e.type === 'pointerup') {
      this.onTap(e.clientX, e.clientY);
    }
    this.tapStart = null;
    this.gesture = this.pointers.size === 2 ? this.measure() : null;
    if (this.pointers.size === 1) {
      // 2本指→1本指に戻ったら、そのまま移動を続ける
      this.moved = true;
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.001));
    this.changed();
  };
}
