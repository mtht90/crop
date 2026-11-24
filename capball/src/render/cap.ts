import * as THREE from 'three';

/** ペットボトルのキャップ（ギザギザの側面・天面のラベル）。実物より大きめにして見やすくする */
export const CAP_VIS_R = 0.062;

function labelTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(128, 110, 10, 128, 128, 128);
  g.addColorStop(0, '#fffdf6');
  g.addColorStop(1, '#e9edf2');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#d23a2f';
  c.lineWidth = 14;
  c.beginPath(); c.arc(128, 128, 104, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#d23a2f';
  c.font = 'bold 84px "Dela Gothic One", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('CAP', 128, 132);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function haloTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,250,220,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function makeCapBall() {
  const g = new THREE.Group();
  const R = CAP_VIS_R, H = R * 0.62;
  // ギザギザの側面（溝を半径方向に刻む）
  const seg = 72;
  const side = new THREE.CylinderGeometry(R, R * 0.98, H, seg, 1, true);
  const pos = side.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + (Math.round(((a + Math.PI) / (Math.PI * 2)) * seg) % 2 === 0 ? 0.045 : 0);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  side.computeVertexNormals();
  const plastic = new THREE.MeshStandardMaterial({ color: '#f6f7f8', roughness: 0.35, metalness: 0, envMapIntensity: 1.1 });
  const sideMesh = new THREE.Mesh(side, plastic);
  const top = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.3, envMapIntensity: 1.1 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = H / 2;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(R * 0.96, 32), new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.6, side: THREE.DoubleSide }));
  inner.rotation.x = Math.PI / 2;
  inner.position.y = -H / 2 + 0.002;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.985, R * 0.06, 6, 48), plastic);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -H / 2;
  // スマホの小さな画面でも見失わないよう、うっすら光る輪を添える
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(R * 5.5);
  halo.name = 'halo';
  g.add(sideMesh, top, inner, lip, halo);
  for (const m of [sideMesh, top, lip]) m.castShadow = true;
  return g;
}

/** キャップの軌跡（フェードする帯） */
export class Trail {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  life = 0.28;
  private geo: THREE.BufferGeometry;
  private max: number;
  constructor(max = 22, color = '#ffffff') {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    const n = max * 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor=vec4(color, vA*0.55); }',
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }
  clear() {
    this.pts = [];
    this.ages = [];
    this.update(new THREE.Vector3(0, 0, 1), 0.05, 0);
  }
  push(p: THREE.Vector3) {
    this.pts.unshift(p.clone());
    this.ages.unshift(0);
    if (this.pts.length > this.max) {
      this.pts.pop();
      this.ages.pop();
    }
  }
  update(camDir: THREE.Vector3, width = 0.05, dt = 0) {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    while (this.ages.length && this.ages[this.ages.length - 1] > this.life) {
      this.ages.pop();
      this.pts.pop();
    }
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const al = this.geo.getAttribute('alpha') as THREE.BufferAttribute;
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const p = this.pts[Math.min(i, n - 1)] ?? new THREE.Vector3();
      const q = this.pts[Math.min(i + 1, n - 1)] ?? p;
      const d = p.clone().sub(q);
      const side = d.cross(camDir).normalize().multiplyScalar(width * (1 - i / this.max));
      if (!isFinite(side.x)) side.set(0, 0, 0);
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const a = i < n ? Math.max(0, 1 - this.ages[i] / this.life) : 0;
      al.setX(i * 2, a);
      al.setX(i * 2 + 1, a);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }
}
