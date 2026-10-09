// =====================================================================
//  液晶内の 3D 舞台 (別シーンを RenderTarget に描画して液晶面に貼る)
//   夜の街 (Kenney City Kit) / 兵器・侵蝕体のシルエット (Quaternius)
// =====================================================================
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const MOODS = {
  night:   { top: '#05061a', mid: '#252c66', low: '#7a4a8a', rim: 0x7f9cff, fog: 0x2a2450, win: 1.0 },
  command: { top: '#02100f', mid: '#0a3a3a', low: '#2a8a7a', rim: 0x5fffe0, fog: 0x0a2a28, win: 0.8 },
  alert:   { top: '#120205', mid: '#6a0a18', low: '#ff4a2a', rim: 0xff4a3a, fog: 0x4a0810, win: 0.5 },
  battle:  { top: '#140406', mid: '#8a2a10', low: '#ffa040', rim: 0xffa050, fog: 0x5a1a08, win: 0.3 },
  final:   { top: '#120c02', mid: '#8a6a18', low: '#fff2b0', rim: 0xffe0a0, fog: 0x6a5010, win: 0.2 },
  white:   { top: '#c8d8ff', mid: '#ffffff', low: '#ffffff', rim: 0xffffff, fog: 0xe8eeff, win: 0.0 },
};

export class LcdStage {
  constructor(renderer, cfg, story) {
    this.renderer = renderer;
    this.cfg = cfg;
    // スマホはメモリ節約 (MSAA なし・8bit)
    this.rt = cfg.render.mobile
      ? new THREE.WebGLRenderTarget(768, 384)
      : new THREE.WebGLRenderTarget(1024, 512, { samples: 4, type: THREE.HalfFloatType });
    this.texture = this.rt.texture;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 2, 0.5, 400);
    this.t = 0;
    this.shotT = 0;
    this.shotName = 'city';
    this.shake = 0;
    this.mixers = [];
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 4; this.skyCanvas.height = 256;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    this.scene.fog = new THREE.Fog(0x2a2450, 25, 190);
    this.rim = new THREE.DirectionalLight(0x7f9cff, 5);
    this.rim.position.set(0, 30, -80);
    this.fill = new THREE.HemisphereLight(0x4050a0, 0x050208, 0.5);
    this.scene.add(this.rim, this.fill);

    this.silhouette = new THREE.MeshBasicMaterial({ color: 0x000000 }); // 光を受けない完全な影絵
    this.buildGround();
    this.buildCity(story.city || []);
    this.mech = this.prepActor(story.mech, 15, 0x5fe8ff, 'Head', [0, 0.25, 0.55]);
    this.enemy = this.prepActor(story.enemy, 34, 0xff2a2a, 'Head', [0, 0.2, 0.5], 'Torso');
    this.flyers = [];
    if (story.flyer) {
      for (let i = 0; i < 5; i++) {
        const g = { scene: skClone(story.flyer.scene), animations: story.flyer.animations };
        this.flyers.push(this.prepActor(g, 6, 0xff3a3a, 'Head', [0, 0, 0.5]));
      }
    }
    this.buildParticles();
    this.setMood('night');
    this.shot('city');
  }

  // ------------------------------------------------------------
  buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.9 }));
    g.rotation.x = -Math.PI / 2;
    this.scene.add(g);
    // 地平線の街明かり
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const x = c.getContext('2d');
    for (let i = 0; i < 900; i++) {
      x.fillStyle = Math.random() < 0.7 ? 'rgba(255,200,120,0.9)' : 'rgba(140,200,255,0.9)';
      x.fillRect(Math.random() * 512, 30 + Math.random() * 34, 1 + Math.random() * 1.5, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(500, 30), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    strip.position.set(0, 4, -160);
    this.scene.add(strip);
  }

  buildCity(models) {
    if (!models.length) return;
    this.city = new THREE.Group();
    const winGeo = new THREE.PlaneGeometry(0.32, 0.46);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const wins = [];
    const rand = mulberry(7);
    const place = (x, z, s) => {
      const src = models[Math.floor(rand() * models.length)];
      const b = src.clone(true);
      b.traverse((o) => { if (o.isMesh) o.material = this.silhouette; });
      b.scale.setScalar(s);
      b.position.set(x, 0, z);
      b.rotation.y = Math.floor(rand() * 4) * Math.PI / 2;
      this.city.add(b);
      b.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(b);
      const w = box.max.x - box.min.x, h = box.max.y - box.min.y;
      const n = Math.floor(w * h * 0.5);
      for (let i = 0; i < n; i++) {
        if (rand() < 0.7) continue;
        wins.push({ x: box.min.x + 0.6 + rand() * (w - 1.2), y: 1.2 + rand() * (h - 2), z: box.max.z + 0.05, warm: rand() < 0.75 });
      }
    };
    for (let row = 0; row < 5; row++) {
      const z = -18 - row * 16;
      for (let x = -70; x <= 70; x += 7 + rand() * 6) {
        if (row < 4 && Math.abs(x) < 15) continue; // 中央の大通りは戦場として空ける
        place(x, z + rand() * 6, 3 + rand() * 2.2 + row * 0.5);
      }
    }
    this.scene.add(this.city);
    this.windows = new THREE.InstancedMesh(winGeo, winMat, wins.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    wins.forEach((w, i) => {
      m4.makeTranslation(w.x, w.y, w.z);
      this.windows.setMatrixAt(i, m4);
      this.windows.setColorAt(i, w.warm ? col.setRGB(1.6, 1.1, 0.55) : col.setRGB(0.6, 1.1, 1.8));
    });
    this.winBase = wins.map((w) => (w.warm ? [1.6, 1.1, 0.55] : [0.6, 1.1, 1.8]));
    this.scene.add(this.windows);
  }

  prepActor(gltf, height, eyeColor, headName, eyeOffset, coreName) {
    if (!gltf) return null;
    const root = gltf.scene, clips = gltf.animations;
    const box = new THREE.Box3().setFromObject(root);
    const s = height / (box.max.y - box.min.y);
    const holder = new THREE.Group();
    root.scale.setScalar(s);
    root.position.y = -box.min.y * s;
    holder.add(root);
    root.traverse((o) => { if (o.isMesh) { o.material = this.silhouette; o.frustumCulled = false; } });
    const glow = makeGlow(eyeColor);
    const attach = (name, size, off) => {
      let bone = null;
      root.traverse((o) => { if (!bone && o.name === name) bone = o; });
      const sp = new THREE.Sprite(glow);
      sp.scale.setScalar(size / s);
      sp.position.set(...off.map((v) => v / s * height * 0.08));
      (bone || root).add(sp);
      return sp;
    };
    const eye = attach(headName, height * 0.12, eyeOffset);
    const core = coreName ? attach(coreName, height * 0.35, [0, 0, 0.6]) : null;
    const mixer = new THREE.AnimationMixer(root);
    this.mixers.push(mixer);
    const actor = { holder, root, mixer, clips, eye, core, action: null, height };
    holder.visible = false;
    this.scene.add(holder);
    this.anim(actor, clips.find((c) => /idle/i.test(c.name))?.name);
    return actor;
  }

  anim(actor, name, { loop = true, fade = 0.25, speed = 1 } = {}) {
    if (!actor || !name) return;
    const clip = actor.clips.find((c) => c.name === name);
    if (!clip) return;
    const a = actor.mixer.clipAction(clip);
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.play();
    if (actor.action && actor.action !== a) actor.action.crossFadeTo(a, fade, false);
    actor.action = a;
  }

  buildParticles() {
    const max = 900;
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(max * 3);
    this.pCol = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, map: makeGlowTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.parts = [];
    this.pMax = max;
  }

  burst(pos, n, color, speed = 20, life = 1.2, gravity = -6) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.pMax) this.parts.shift();
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.parts.push({ p: pos.clone(), v: d, c, life: life * (0.5 + Math.random() * 0.5), max: life, g: gravity });
    }
  }

  setMood(name) {
    const m = MOODS[name] || MOODS.night;
    this.mood = name;
    const x = this.skyCanvas.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, m.top); g.addColorStop(0.55, m.mid); g.addColorStop(1, m.low);
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    this.skyTex.needsUpdate = true;
    this.scene.fog.color.set(m.fog);
    this.rim.color.set(m.rim);
    this.winLevel = m.win;
    if (this.windows) {
      const col = new THREE.Color();
      this.winBase.forEach((b, i) => this.windows.setColorAt(i, col.setRGB(b[0] * m.win, b[1] * m.win, b[2] * m.win)));
      this.windows.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------
  //  カメラワーク (ショット)
  // ------------------------------------------------------------
  shot(name, opts = {}) {
    this.shotName = name;
    this.shotT = 0;
    this.shotOpts = opts;
    const M = this.mech, E = this.enemy;
    const show = (a, v) => { if (a) a.holder.visible = v; };
    switch (name) {
      case 'city':
        show(M, false); show(E, false); this.flyers.forEach((f) => show(f, false));
        break;
      case 'approach':
        show(M, false); show(E, true);
        E.holder.position.set(0, 0, -120); E.holder.rotation.y = 0;
        this.anim(E, 'Walk', { speed: 0.6 });
        break;
      case 'launch':
        show(M, true);
        M.holder.position.set(-4, -18, -6); M.holder.rotation.y = Math.PI * 0.85;
        this.anim(M, 'Jump_Landing');
        break;
      case 'faceoff':
        show(M, true); show(E, true);
        M.holder.position.set(-6, 0, -4); M.holder.rotation.y = Math.PI * 0.92;
        E.holder.position.set(5, 0, -48); E.holder.rotation.y = -0.15;
        this.anim(M, 'Idle'); this.anim(E, 'Idle');
        break;
      case 'lock':
        show(M, true); show(E, true);
        this.anim(M, 'Shoot_Small');
        break;
      case 'strike':
        show(M, true); show(E, true);
        this.anim(M, 'Shoot_Big', { loop: false });
        break;
      case 'enemyDie':
        this.anim(E, 'Death', { loop: false, speed: 0.8 });
        this.burst(E.holder.position.clone().add(new THREE.Vector3(0, 20, 0)), 260, 0xffc060, 40, 1.8, -10);
        this.burst(E.holder.position.clone().add(new THREE.Vector3(0, 20, 0)), 160, 0xff3a2a, 25, 2.2, -4);
        break;
      case 'mechDown':
        this.anim(M, 'HitRecieve_2', { loop: false });
        this.anim(E, 'Punch', { loop: false });
        this.burst(M.holder.position.clone().add(new THREE.Vector3(0, 8, 0)), 120, 0x8090a0, 18, 1.4, -12);
        break;
      case 'final':
        show(M, true); show(E, true);
        M.holder.position.set(-6, 0, -2); M.holder.rotation.y = Math.PI;
        E.holder.position.set(4, 0, -60); E.holder.rotation.y = 0;
        this.anim(M, 'Idle'); this.anim(E, 'Idle');
        this.flyers.forEach((f, i) => { show(f, true); this.anim(f, f.clips.find((c) => /Flying_Idle/.test(c.name))?.name); f.phase = i * 1.3; });
        break;
      case 'victory':
        show(M, true); show(E, false); this.flyers.forEach((f) => show(f, false));
        M.holder.position.set(0, 0, -14); M.holder.rotation.y = 0;
        this.anim(M, 'Dance');
        break;
      default:
    }
  }

  update(dt) {
    this.t += dt;
    this.shotT += dt;
    const t = this.shotT, cam = this.camera;
    const M = this.mech, E = this.enemy;
    for (const m of this.mixers) m.update(dt);
    const look = new THREE.Vector3();
    switch (this.shotName) {
      case 'city': {
        const a = this.t * 0.05;
        cam.position.set(Math.sin(a) * 20, 6 + Math.sin(this.t * 0.2) * 1.5, 34 + Math.cos(a) * 6);
        look.set(0, 13, -40);
        break;
      }
      case 'approach': {
        E.holder.position.z = Math.min(-38, -120 + t * 10);
        const step = Math.abs(Math.sin(t * 3.2));
        if (step < 0.08) this.shake = Math.max(this.shake, 0.35);
        cam.position.set(-3, 1.2, 14);
        look.set(E.holder.position.x, 20, E.holder.position.z);
        cam.fov = 40 - Math.min(10, t * 2);
        break;
      }
      case 'launch': {
        M.holder.position.y = Math.min(0, -18 + t * 22);
        if (M.holder.position.y < 0) this.burst(M.holder.position.clone().add(new THREE.Vector3(0, 1, 0)), 6, 0x7fdfff, 8, 0.6, 4);
        cam.position.set(8, 1, 16);
        look.set(M.holder.position.x, M.holder.position.y + 9, M.holder.position.z);
        cam.fov = 46;
        break;
      }
      case 'faceoff': {
        cam.position.set(Math.sin(t * 0.15) * 2 + 1, 1.4, 16);
        look.set(1, 14, -30);
        cam.fov = 42;
        break;
      }
      case 'lock': {
        cam.position.set(9, 2.5, 6);
        look.set(E.holder.position.x, 22, E.holder.position.z);
        cam.fov = 30 - Math.min(8, t * 4);
        break;
      }
      case 'strike': {
        const k = Math.min(1, t / 0.6);
        cam.position.lerpVectors(new THREE.Vector3(-10, 2, 12), new THREE.Vector3(2, 6, -14), k * k);
        look.set(E.holder.position.x, 20, E.holder.position.z);
        cam.fov = 48;
        if (t > 0.25 && !this._beamed) {
          this._beamed = true;
          const from = M.holder.position.clone().add(new THREE.Vector3(0, 10, 0));
          const to = E.holder.position.clone().add(new THREE.Vector3(0, 22, 0));
          for (let i = 0; i <= 40; i++) this.burst(from.clone().lerp(to, i / 40), 4, 0x9ff8ff, 2, 0.5, 0);
        }
        break;
      }
      case 'enemyDie': {
        cam.position.set(12, 1.5, 4 + t * 1.5);
        look.set(E.holder.position.x, 18, E.holder.position.z);
        this.shake = Math.max(this.shake, Math.max(0, 1 - t));
        break;
      }
      case 'mechDown': {
        cam.position.set(M.holder.position.x + 7, 1.2, M.holder.position.z + 14);
        look.set(M.holder.position.x, 8, M.holder.position.z);
        this.shake = Math.max(this.shake, Math.max(0, 0.8 - t));
        break;
      }
      case 'final': {
        const a = t * 0.25;
        cam.position.set(-2 + Math.sin(a) * 3, 1, 12);
        look.set(2, 20, -50);
        this.flyers.forEach((f) => {
          const p = this.t * 0.6 + f.phase;
          f.holder.position.set(Math.cos(p) * 22 + 4, 30 + Math.sin(p * 2) * 5, -60 + Math.sin(p) * 10);
          f.holder.rotation.y = -p;
        });
        cam.fov = 44;
        break;
      }
      case 'victory': {
        cam.position.set(Math.sin(this.t * 0.4) * 10, 1.2, 12 + Math.cos(this.t * 0.4) * 3);
        look.set(0, 8, -14);
        cam.fov = 44;
        break;
      }
      default:
    }
    this._beamed = this.shotName === 'strike' ? this._beamed : false;
    // 揺れ
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const k = this.shake * this.shake;
    cam.position.x += (Math.random() - 0.5) * k * 1.2;
    cam.position.y += (Math.random() - 0.5) * k * 1.2;
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    // 発光の明滅
    const pulse = 0.8 + 0.2 * Math.sin(this.t * 6);
    for (const a of [M, E, ...this.flyers]) {
      if (!a) continue;
      a.eye.material.opacity = pulse;
      if (a.core) a.core.material.opacity = 0.6 + 0.4 * Math.sin(this.t * 3);
    }
    // フラッシュ
    // パーティクル
    let i = 0;
    for (const q of this.parts) { q.life -= dt; q.v.y += q.g * dt; q.p.addScaledVector(q.v, dt); }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const q of this.parts) {
      const a = q.life / q.max;
      this.pPos.set([q.p.x, q.p.y, q.p.z], i * 3);
      this.pCol.set([q.c.r * a * 2, q.c.g * a * 2, q.c.b * a * 2], i * 3);
      i++;
    }
    this.points.geometry.setDrawRange(0, i);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  render() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
  }
}

function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeGlow(color) {
  return new THREE.SpriteMaterial({ map: makeGlowTex(), color: new THREE.Color(color).multiplyScalar(3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
