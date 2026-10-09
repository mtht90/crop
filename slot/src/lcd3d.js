// =====================================================================
//  液晶内の 3D 舞台: 海賊の宝探し
//   空 (Poly Haven) / 海 (シェーダー) / 船・宝箱・クルー・骸骨船・クラーケン (Quaternius / Kenney)
// =====================================================================
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

// Ship_Large の甲板 (実測): 長さ方向 x ±11 / 中央甲板 y≈3.7 / 船尾楼 y≈5.0 (x=8〜10)
const DECK = 3.72, AFT = 5.03;

const MOODS = {
  day:    { sky: 'day', fog: 0xbfd8ee, sun: 0xfff4e0, sunI: 2.6, hemi: 1.1, deep: 0x0a4a7a, shallow: 0x2aa6c8, exp: 1.0 },
  sunset: { sky: 'sunset', fog: 0xe8a070, sun: 0xffb070, sunI: 2.2, hemi: 0.8, deep: 0x1a2a5a, shallow: 0xd06a40, exp: 1.0 },
  night:  { sky: 'night', fog: 0x0a1428, sun: 0x8aa8ff, sunI: 0.9, hemi: 0.35, deep: 0x020814, shallow: 0x0a2a4a, exp: 1.0 },
  storm:  { sky: 'storm', fog: 0x2a3038, sun: 0xc0c8d8, sunI: 0.9, hemi: 0.5, deep: 0x0a1418, shallow: 0x2a4048, exp: 0.55 },
  gold:   { sky: 'sunset', fog: 0xffd890, sun: 0xffe0a0, sunI: 3.2, hemi: 1.2, deep: 0x3a3a10, shallow: 0xffc860, exp: 1.25 },
};

export class LcdStage {
  constructor(renderer, cfg, story) {
    this.renderer = renderer;
    this.cfg = cfg;
    this.A = story;
    // スマホはメモリ節約 (MSAA なし・8bit)
    this.rt = cfg.render.mobile
      ? new THREE.WebGLRenderTarget(768, 384)
      : new THREE.WebGLRenderTarget(1024, 512, { samples: 4, type: THREE.HalfFloatType });
    this.texture = this.rt.texture;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 2, 0.1, 600);
    this.t = 0;
    this.shotT = 0;
    this.shake = 0;
    this.mixers = [];
    this.skies = story.skies || {};
    for (const t of Object.values(this.skies)) { t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; }
    this.scene.fog = new THREE.Fog(0xbfd8ee, 60, 420);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x30404a, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    this.sun.position.set(-40, 60, 30);
    this.scene.add(this.hemi, this.sun);

    this.buildSea();
    this.ship = this.place(story.ship, 22, 'length');
    this.scene.add(this.ship);
    this.buildScenery();
    this.buildProps();
    this.crew = {};
    for (const k of ['captain', 'anne', 'henry']) if (story[k]) this.crew[k] = this.actor(story[k], 1.9);
    this.skeletons = story.skeleton ? [0, 1, 2].map(() => this.actor({ scene: skClone(story.skeleton.scene), animations: story.skeleton.animations }, 1.9)) : [];
    this.tentacles = story.tentacle ? [0, 1, 2, 3, 4].map(() => this.actor({ scene: skClone(story.tentacle.scene), animations: story.tentacle.animations }, 22)) : [];
    this.buildParticles();
    this.portraits = this.makePortraits();
    this.setMood('day');
    this.shot('sail');
  }

  // ------------------------------------------------------------
  //  モデル配置ヘルパ
  // ------------------------------------------------------------
  place(gltfOrScene, size, axis = 'height') {
    const src = gltfOrScene?.scene || gltfOrScene;
    if (!src) return new THREE.Group();
    const root = src.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const dim = box.getSize(new THREE.Vector3());
    const s = size / (axis === 'length' ? Math.max(dim.x, dim.z) : dim.y);
    root.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    const g = new THREE.Group();
    g.add(root);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return g;
  }

  actor(gltf, height) {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const s = height / (box.max.y - box.min.y);
    root.scale.setScalar(s);
    root.position.y = -box.min.y * s;
    const holder = new THREE.Group();
    holder.add(root);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const mixer = new THREE.AnimationMixer(root);
    this.mixers.push(mixer);
    const a = { holder, root, mixer, clips: gltf.animations, action: null };
    holder.visible = false;
    this.scene.add(holder);
    this.anim(a, a.clips.find((c) => /idle/i.test(c.name))?.name);
    return a;
  }

  anim(actor, name, { loop = true, fade = 0.2, speed = 1 } = {}) {
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

  // ------------------------------------------------------------
  //  海 (波打つ平面 + フレネル + 泡)
  // ------------------------------------------------------------
  buildSea() {
    const geo = new THREE.PlaneGeometry(900, 900, 160, 160);
    geo.rotateX(-Math.PI / 2);
    this.seaU = {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x0a4a7a) }, uShallow: { value: new THREE.Color(0x2aa6c8) },
      uFog: { value: new THREE.Color(0xbfd8ee) }, uSun: { value: new THREE.Color(0xfff4e0) }, uRough: { value: 1 },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.4).normalize() }, uCam: { value: new THREE.Vector3() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaU,
      vertexShader: `
        uniform float uTime; uniform float uRough;
        varying vec3 vPos; varying float vH;
        float wave(vec2 p, vec2 d, float f, float a, float s){ return a * sin(dot(p, d) * f + uTime * s); }
        void main(){
          vec3 p = position;
          float h = wave(p.xz, normalize(vec2(1.0,0.3)), 0.08, 0.55, 1.1)
                  + wave(p.xz, normalize(vec2(-0.4,1.0)), 0.13, 0.32, 1.6)
                  + wave(p.xz, normalize(vec2(0.7,-0.8)), 0.31, 0.12, 2.4);
          p.y += h * uRough;
          vH = h; vPos = (modelMatrix * vec4(p,1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFog; uniform vec3 uSun; uniform vec3 uSunDir; uniform vec3 uCam;
        varying vec3 vPos; varying float vH;
        void main(){
          vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
          if (n.y < 0.0) n = -n;
          vec3 v = normalize(uCam - vPos);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(uDeep, uShallow, clamp(vH * 0.6 + 0.45, 0.0, 1.0));
          col = mix(col, uFog, fres * 0.55);
          float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 60.0);
          col += uSun * spec * 1.4;
          col += vec3(smoothstep(0.62, 0.9, vH)) * 0.35;
          float d = length(vPos - uCam);
          col = mix(col, uFog, smoothstep(80.0, 420.0, d));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sea = new THREE.Mesh(geo, mat);
    this.scene.add(this.sea);
  }

  buildScenery() {
    const A = this.A;
    this.isles = new THREE.Group();
    const rand = mulberry(11);
    const isle = (x, z, s) => {
      const g = new THREE.Group();
      if (A.cliff) g.add(this.place(A.cliff, 14 * s));
      for (let i = 0; i < 3; i++) {
        const p = this.place([A.palm1, A.palm2][i % 2], 9 * s * (0.8 + rand() * 0.4));
        p.position.set((rand() - 0.5) * 14 * s, 6 * s, (rand() - 0.5) * 8 * s);
        g.add(p);
      }
      g.position.set(x, -1, z);
      g.rotation.y = rand() * Math.PI * 2;
      this.isles.add(g);
    };
    isle(-120, -220, 1.4); isle(160, -260, 1.1); isle(-260, -120, 0.9); isle(40, -330, 1.6);
    for (let i = 0; i < 10; i++) {
      const r = this.place([A.rock1, A.rock3][i % 2], 3 + rand() * 6);
      r.position.set((rand() - 0.5) * 300, -1, -60 - rand() * 200);
      this.isles.add(r);
    }
    this.scene.add(this.isles);
    // 宝島 (勝利時に出現)
    this.treasureIsle = new THREE.Group();
    if (A.cliff) { const c = this.place(A.cliff, 18); c.scale.multiplyScalar(1.6); this.treasureIsle.add(c); }
    for (let i = 0; i < 5; i++) {
      const p = this.place([A.palm1, A.palm2][i % 2], 11);
      p.position.set(-14 + i * 7, 10, -4 + (i % 2) * 6);
      this.treasureIsle.add(p);
    }
    const tc = this.place(A.chestGold, 5, 'length');
    tc.position.set(0, 10.5, 8);
    this.treasureIsle.add(tc);
    this.treasureIsle.position.set(0, -2, -110);
    this.treasureIsle.visible = false;
    this.scene.add(this.treasureIsle);
  }

  buildProps() {
    const A = this.A;
    // 宝箱 (甲板の上)。色を木→銀→金→虹に塗り替えて昇格させる
    this.chest = this.place(A.chestClosed, 2.4, 'length');
    this.chestOpen = this.place(A.chestGold, 2.4, 'length');
    this.chestMats = [];
    this.chest.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.chestMats.push({ m: o.material, base: o.material.color.clone() }); } });
    this.chest.visible = this.chestOpen.visible = false;
    this.scene.add(this.chest, this.chestOpen);
    this.skull = this.place(A.skull, 1.2);
    this.skull.visible = false;
    this.scene.add(this.skull);
    // 骸骨船
    this.ghost = this.place(A.ghostShip, 24, 'length');
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // 大砲と砲弾
    this.cannon = this.place(A.cannon, 2.2, 'length');
    this.cannon.visible = false;
    this.scene.add(this.cannon);
    this.ball = this.place(A.ball, 0.8);
    this.ball.visible = false;
    this.scene.add(this.ball);
    // 流れてくる樽
    this.barrels = [0, 1, 2, 3, 4, 5].map(() => { const b = this.place(A.barrel, 1.6); b.visible = false; this.scene.add(b); return b; });
    // 宝の地図 (プレミア)
    this.map = this.place(A.paper, 3, 'length');
    this.map.visible = false;
    this.map.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.mapMat = o.material; } });
    this.scene.add(this.map);
    // 宝石とコイン (宝箱が開いたとき噴き出す)
    this.gems = [A.gemBlue, A.gemPink, A.gemBlue, A.gemPink, A.coins, A.coins].map((g) => { const m = this.place(g, 0.9); m.visible = false; this.scene.add(m); return { m, v: new THREE.Vector3() }; });
  }

  // ------------------------------------------------------------
  //  カットイン用の顔アップを起動時に描き出す (透過 canvas)
  // ------------------------------------------------------------
  makePortraits() {
    const out = {};
    const r = this.renderer;
    const size = 512;
    const rt = new THREE.WebGLRenderTarget(size, size);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); scene.add(key);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    const buf = new Uint8Array(size * size * 4);
    const prevColor = new THREE.Color(); r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    for (const [k, a] of Object.entries(this.crew)) {
      const prevParent = a.holder.parent;
      scene.add(a.holder);
      a.holder.visible = true;
      a.holder.position.set(0, 0, 0);
      a.holder.rotation.y = 0.35;
      a.mixer.update(0.5);
      cam.position.set(0.55, 1.45, 3.1);
      cam.lookAt(0, 1.15, 0);
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      r.setRenderTarget(null);
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d');
      const img = x.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      x.putImageData(img, 0, 0);
      out[k] = c;
      prevParent.add(a.holder);
      a.holder.visible = false;
    }
    r.setClearColor(prevColor, prevAlpha);
    rt.dispose();
    return out;
  }

  buildParticles() {
    const max = 1200;
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(max * 3);
    this.pCol = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: glowTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.parts = [];
    this.pMax = max;
  }

  burst(pos, n, color, speed = 10, life = 1.2, gravity = -9) {
    const c = color === 'rainbow' ? null : new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.pMax) this.parts.shift();
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.parts.push({ p: pos.clone(), v: d, c: c || new THREE.Color().setHSL(Math.random(), 1, 0.6), life: life * (0.5 + Math.random() * 0.5), max: life, g: gravity });
    }
  }

  setMood(name) {
    const m = MOODS[name] || MOODS.day;
    this.mood = name;
    const sky = this.skies[m.sky];
    this.scene.background = sky || new THREE.Color(m.fog);
    this.scene.backgroundIntensity = m.exp;
    this.scene.fog.color.set(m.fog);
    this.sun.color.set(m.sun); this.sun.intensity = m.sunI;
    this.hemi.intensity = m.hemi;
    this.seaU.uDeep.value.set(m.deep); this.seaU.uShallow.value.set(m.shallow);
    this.seaU.uFog.value.set(m.fog); this.seaU.uSun.value.set(m.sun);
    this.seaU.uRough.value = name === 'storm' ? 2.4 : 1;
  }

  // ------------------------------------------------------------
  //  ショット
  // ------------------------------------------------------------
  hideAll() {
    for (const a of [...Object.values(this.crew), ...this.skeletons, ...this.tentacles]) a.holder.visible = false;
    for (const o of [this.chest, this.chestOpen, this.skull, this.ghost, this.cannon, this.ball, this.map, ...this.barrels]) o.visible = false;
    this.gems.forEach((g) => { g.m.visible = false; });
    this.treasureIsle.visible = false;
    this.ghost.rotation.set(0, Math.PI / 2, 0);
    this.ghost.position.y = 0;
    this.tentacles.forEach((a) => { a.sinking = false; });
  }

  shot(name, opts = {}) {
    this.shotName = name;
    this.shotT = 0;
    this.opts = opts;
    const C = this.crew;
    const keep = ['fire', 'sink', 'miss', 'krakenAttack', 'krakenWin', 'krakenLose', 'chestOpen', 'chestSkull'];
    if (!keep.includes(name)) this.hideAll();
    const deck = (a, x, z, ry, clip, y = DECK) => { if (!a) return; a.holder.visible = true; a.baseY = y; a.holder.position.set(x, y, z); a.holder.rotation.y = ry; this.anim(a, clip); };
    switch (name) {
      case 'sail':
        deck(C.captain, 8.6, 0.4, 0.3, 'Idle', AFT);
        deck(C.anne, 4.5, 1.2, 0.2, 'Idle');
        break;
      case 'deck':
        this.chest.visible = true;
        this.chest.position.set(5, DECK, 0.6);
        this.chestTint(opts.tint || 'wood');
        deck(C.anne, 3.3, -0.4, 0.5, 'Idle');
        deck(C.henry, 6.8, -0.3, -0.5, 'Idle');
        break;
      case 'chestOpen':
        this.chest.visible = false;
        this.chestOpen.visible = true;
        this.chestOpen.position.copy(this.chest.position);
        this.gems.forEach((g, i) => { g.m.visible = true; g.m.position.copy(this.chest.position).add(new THREE.Vector3(0, 0.6, 0)); g.v.set(Math.cos(i * 1.1) * 2.4, 6 + i * 0.6, 2.5); });
        this.burst(this.chest.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 260, opts.rainbow ? 'rainbow' : 0xffd84a, 9, 1.6, -7);
        this.anim(C.anne, 'Yes'); this.anim(C.henry, 'Jump');
        break;
      case 'chestSkull':
        this.skull.visible = true;
        this.skull.position.copy(this.chest.position).add(new THREE.Vector3(0, 0.6, 0.4));
        this.burst(this.chest.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 60, 0x8a8a8a, 4, 1.0, -6);
        this.anim(C.anne, 'No'); this.anim(C.henry, 'No');
        break;
      case 'barrels':
        this.barrels.forEach((b, i) => { b.visible = true; b.position.set(-14 - i * 4.5, 0, 10 + (i % 3) * 2.5); b.userData.ph = i; });
        break;
      case 'enemy':
        this.ghost.visible = true;
        this.ghost.position.set(18, 0, 130);
        this.ghost.rotation.y = Math.PI / 2;
        this.skeletons.forEach((s) => { s.holder.visible = true; this.anim(s, 'Idle'); });
        deck(C.captain, 4.2, 1.8, 0.2, 'Sword');
        break;
      case 'cannon':
        this.ghost.visible = true;
        this.cannon.visible = true;
        this.ghost.rotation.y = Math.PI / 2;
        this.cannon.position.set(5, DECK, 2.2);
        this.cannon.rotation.y = this.cannonYaw ?? 0;
        deck(C.henry, 6.4, 1.2, 0.3, 'Punch');
        this.skeletons.forEach((s) => { s.holder.visible = true; });
        break;
      case 'fire':
        this.ball.visible = true;
        this.ball.position.copy(this.cannon.position).add(new THREE.Vector3(0, 0.6, 1));
        this.burst(this.ball.position.clone(), 120, 0xffc060, 6, 0.8, 1);
        break;
      case 'sink':
        this.ball.visible = false;
        this.burst(this.ghost.position.clone().add(new THREE.Vector3(0, 6, 0)), 320, 0xffa040, 18, 1.8, -8);
        this.burst(this.ghost.position.clone().add(new THREE.Vector3(0, 6, 0)), 200, 0x404040, 8, 2.4, 2);
        this.skeletons.forEach((s) => this.anim(s, 'Death', { loop: false }));
        break;
      case 'miss':
        this.ball.visible = false;
        this.burst(this.ghost.position.clone().add(new THREE.Vector3(-8, 0, 10)), 200, 0xcfefff, 12, 1.4, -14);
        this.skeletons.forEach((s) => this.anim(s, 'Jump'));
        break;
      case 'kraken':
        this.tentacles.forEach((a, i) => {
          a.holder.visible = true;
          const ang = -Math.PI * 0.85 + i * (Math.PI * 0.42);
          a.holder.position.set(Math.cos(ang) * 15, -16, Math.sin(ang) * 9);
          a.holder.rotation.y = -ang + Math.PI / 2;
          this.anim(a, 'Tentacle_Idle', { speed: 0.8 + i * 0.1 });
        });
        deck(C.captain, 2, 1.5, 0, 'Sword');
        break;
      case 'krakenAttack':
        this.tentacles.forEach((a, i) => this.anim(a, i % 2 ? 'Tentacle_Attack' : 'Tentacle_Attack2'));
        break;
      case 'krakenWin':
        this.burst(new THREE.Vector3(0, 10, 0), 300, 0xfff0b0, 16, 1.6, -6);
        this.tentacles.forEach((a) => { a.sinking = true; });
        this.anim(this.crew.captain, 'Sword', { loop: false });
        break;
      case 'krakenLose':
        this.tentacles.forEach((a) => this.anim(a, 'Tentacle_Poke'));
        this.anim(this.crew.captain, 'HitReact', { loop: false });
        this.burst(new THREE.Vector3(0, 4, 5), 160, 0xcfefff, 10, 1.2, -12);
        break;
      case 'island':
        this.treasureIsle.visible = true;
        deck(C.captain, -2, -1, Math.PI, 'Wave');
        break;
      case 'map':
        this.map.visible = true;
        this.map.position.set(5, DECK + 1.8, 0.6);
        break;
      case 'party':
        this.treasureIsle.visible = true;
        deck(C.captain, 3.4, 0.6, 0.2, 'Yes');
        deck(C.anne, 5.2, 1.0, 0, 'Wave');
        deck(C.henry, 7.0, 0.6, -0.2, 'Jump');
        break;
      default:
    }
  }

  chestTint(tint) {
    this.tint = tint;
    const k = { wood: null, silver: new THREE.Color(0xd8e0ec), gold: new THREE.Color(0xffd040), rainbow: null }[tint];
    for (const { m, base } of this.chestMats) {
      m.color.copy(base);
      if (k) m.color.lerp(k, 0.75);
      if ('metalness' in m) { m.metalness = k ? 0.8 : 0; m.roughness = k ? 0.25 : 0.8; }
    }
  }

  update(dt) {
    this.t += dt;
    this.shotT += dt;
    const t = this.shotT, T = this.t, cam = this.camera;
    for (const m of this.mixers) m.update(dt);
    this.seaU.uTime.value = T;
    // 船の揺れ
    const roll = this.mood === 'storm' ? 0.09 : 0.03;
    this.ship.rotation.z = Math.sin(T * 0.9) * roll;
    this.ship.rotation.x = Math.sin(T * 0.7 + 1) * roll * 0.6;
    this.ship.position.y = Math.sin(T * 1.1) * (roll * 8);
    const shipY = this.ship.position.y;
    for (const a of Object.values(this.crew)) if (a.holder.visible) a.holder.position.y = (a.baseY ?? DECK) + shipY;
    if (this.chest.visible) this.chest.position.y = DECK + shipY;
    if (this.cannon.visible) this.cannon.position.y = DECK + shipY;
    const look = new THREE.Vector3();
    switch (this.shotName) {
      case 'sail': {
        const a = T * 0.06;
        cam.position.set(Math.sin(a) * 18, 6.5 + Math.sin(T * 0.3), 30 + Math.cos(a) * 4);
        look.set(0, 6, 0); cam.fov = 40;
        break;
      }
      case 'deck': case 'chestOpen': case 'chestSkull': {
        cam.position.set(5 + Math.sin(T * 0.3) * 0.5, DECK + 2.6 + shipY, 7.6);
        look.set(5, DECK + 1.0 + shipY, 0.4); cam.fov = 36;
        this.gems.forEach((g) => { if (!g.m.visible) return; g.v.y -= 12 * dt; g.m.position.addScaledVector(g.v, dt); g.m.rotation.y += dt * 6; if (g.m.position.y < DECK - 0.5 + shipY) g.m.visible = false; });
        if (this.tint === 'rainbow') for (const { m } of this.chestMats) m.color.setHSL((T * 0.8) % 1, 0.9, 0.6);
        if (this.skull.visible) this.skull.position.y = Math.min(this.skull.position.y + dt * 2, DECK + 1.6 + shipY);
        break;
      }
      case 'barrels': {
        this.barrels.forEach((b) => { b.position.x += dt * 13; b.position.y = Math.sin(T * 2 + b.userData.ph) * 0.4 - 0.3; b.rotation.z = Math.sin(T + b.userData.ph) * 0.3; });
        cam.position.set(0, 1.8, 24); look.set(0, 0.6, 10); cam.fov = 46;
        break;
      }
      case 'enemy': {
        this.ghost.position.z = Math.max(55, 130 - t * 30);
        this.placeSkeletons();
        cam.position.set(2, DECK + 2.4 + shipY, -2.5); look.set(this.ghost.position.x, 5, this.ghost.position.z); cam.fov = 38;
        break;
      }
      case 'cannon': case 'fire': case 'sink': case 'miss': {
        if (this.shotName !== 'sink') this.ghost.position.z = 55;
        this.placeSkeletons();
        cam.position.set(3.4, DECK + 2.3 + shipY, -1.2); look.set(this.ghost.position.x, 4, 55); cam.fov = 34;
        if (this.shotName === 'fire' && this.ball.visible) {
          const k = Math.min(1, t / 0.7);
          const from = this.cannon.position.clone().add(new THREE.Vector3(0, 0.6, 1));
          const to = this.ghost.position.clone().add(new THREE.Vector3(this.opts.hit === false ? -8 : 0, 5, this.opts.hit === false ? 10 : 0));
          this.ball.position.lerpVectors(from, to, k);
          this.ball.position.y += Math.sin(k * Math.PI) * 6;
          if (k < 1) this.burst(this.ball.position.clone(), 2, 0xc0c0c0, 1, 0.5, 1);
        }
        if (this.shotName === 'sink') {
          this.ghost.rotation.z = Math.min(0.5, t * 0.25);
          this.ghost.position.y = -Math.min(14, t * t * 3);
          this.shake = Math.max(this.shake, Math.max(0, 0.8 - t));
        }
        break;
      }
      case 'kraken': case 'krakenAttack': case 'krakenWin': case 'krakenLose': {
        this.tentacles.forEach((a, i) => {
          if (a.sinking) { a.holder.position.y -= dt * 14; if (a.holder.position.y < -18) a.holder.visible = false; }
          else a.holder.position.y = Math.min(-2 + Math.sin(T * 1.3 + i) * 0.6, a.holder.position.y + dt * 22);
        });
        cam.position.set(Math.sin(T * 0.2) * 3, 3.5 + shipY, 26); look.set(0, 10, 0); cam.fov = 50;
        if (this.shotName === 'krakenLose') this.shake = Math.max(this.shake, Math.max(0, 0.9 - t));
        break;
      }
      case 'island': {
        cam.position.set(22 - Math.min(8, t * 3), 9, 26); look.set(0, 7, -70); cam.fov = 42;
        break;
      }
      case 'map': {
        this.map.rotation.y = T * 1.2;
        this.map.position.y = DECK + 1.8 + Math.sin(T * 2) * 0.2 + shipY;
        if (this.mapMat?.emissive) { this.mapMat.emissive.setHSL((T * 0.7) % 1, 1, 0.35); }
        cam.position.set(5, DECK + 2.6 + shipY, 7); look.set(5, DECK + 1.8 + shipY, 0.6); cam.fov = 32;
        if (Math.random() < 0.5) this.burst(this.map.position.clone(), 3, 'rainbow', 3, 1, 0);
        break;
      }
      case 'party': {
        cam.position.set(5 + Math.sin(T * 0.35) * 3, DECK + 2.4 + shipY, 8 + Math.cos(T * 0.35));
        look.set(5, DECK + 1.2 + shipY, 0); cam.fov = 44;
        if (Math.random() < 0.6) this.burst(new THREE.Vector3(5 + (Math.random() - 0.5) * 12, DECK + 8, 0), 4, 'rainbow', 2, 2.5, -3);
        break;
      }
      default:
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const k = this.shake * this.shake;
    cam.position.x += (Math.random() - 0.5) * k;
    cam.position.y += (Math.random() - 0.5) * k;
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    this.seaU.uCam.value.copy(cam.position);
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

  placeSkeletons() {
    this.skeletons.forEach((s, i) => {
      s.holder.position.set(this.ghost.position.x - 4 + i * 4, 3.2 + this.ghost.position.y, this.ghost.position.z);
      s.holder.rotation.y = Math.PI + 0.1;
    });
  }

  render() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
  }
}

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
