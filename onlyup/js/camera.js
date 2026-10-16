import * as THREE from 'three';

/** 三人称オービットカメラ（Rapier レイキャストで壁抜け防止） */
export class CameraRig {
  constructor(camera, RAPIER, world, excludeCollider) {
    Object.assign(this, { camera, RAPIER, world, excludeCollider });
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 6.5;
    this.curDist = 6.5;
    this.baseFov = 62;
    this.focus = new THREE.Vector3();
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.invertY = false;
    this.shake = 0;
  }

  snap(target) {
    this.focus.copy(target).add(new THREE.Vector3(0, 1.0, 0));
    this.curDist = this.dist;
  }

  update(dt, look, target, { vy = 0, sprint = false, platformYaw = 0 } = {}) {
    this.yaw -= look.x;
    this.yaw += platformYaw;
    this.pitch += look.y * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.55, 1.25);
    this.dist = THREE.MathUtils.clamp(this.dist + look.zoom, 2.5, 14);

    // 水平は素早く、垂直は少し遅れて追従（着地のガタつき軽減）
    const fx = 1 - Math.exp(-18 * dt), fy = 1 - Math.exp(-(vy < -12 ? 30 : 9) * dt);
    this.focus.x += (target.x - this.focus.x) * fx;
    this.focus.z += (target.z - this.focus.z) * fx;
    this.focus.y += (target.y + 1.0 - this.focus.y) * fy;

    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // 衝突
    let want = this.dist;
    this.ray.origin = { x: this.focus.x, y: this.focus.y, z: this.focus.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRay(this.ray, this.dist + 0.3, true, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.excludeCollider);
    if (hit) want = Math.max(0.8, (hit.timeOfImpact ?? hit.toi) - 0.3);
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * (1 - Math.exp(-4 * dt));

    this.camera.position.copy(this.focus).addScaledVector(dir, this.curDist);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.focus);

    // 落下中・ダッシュ中は FOV を広げてスピード感
    const fall = THREE.MathUtils.clamp((-vy - 14) / 30, 0, 1);
    const fov = this.baseFov + fall * 22 + (sprint ? 4 : 0);
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-5 * dt));
    this.camera.updateProjectionMatrix();
    return fall;
  }
}
