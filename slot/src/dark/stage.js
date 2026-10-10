// =====================================================================
//  DARKNIGHT の液晶内 3D 舞台
//   黒い騎士 (主人公) と 4 種の敵 (コウモリ < スライム < スケルトン < ドラゴン) が戦う。
//   別の Scene をレンダーターゲットに描き、筐体の大型液晶に貼る
//   キャラクター: Quaternius (CC0) の Knight Character / Animated Monster Pack を glTF に変換したもの
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ENEMIES = [
  { key: 'Bat', name: 'ナイトバット', color: '#3aa0ff', height: 1.3, y: 1.0, idle: 'Bat_Flying', attack: 'Bat_Attack', hit: 'Bat_Hit', death: 'Bat_Death' },
  { key: 'Slime', name: 'ポイズンスライム', color: '#4dff7a', height: 1.1, y: 0, idle: 'Slime_Idle', attack: 'Slime_Attack', hit: 'Slime_Walk', death: 'Slime_Death' },
  { key: 'Skeleton', name: 'スケルトンロード', color: '#ff3b4b', height: 2.3, y: 0, idle: 'Skeleton_Idle', attack: 'Skeleton_Attack', hit: 'Skeleton_Running', death: 'Skeleton_Death' },
  { key: 'Dragon', name: 'カオスドラゴン', color: '#ffd23f', height: 3.4, y: 0.3, idle: 'Dragon_Flying', attack: 'Dragon_Attack', hit: 'Dragon_Hit', death: 'Dragon_Death' },
];
// 通常時の背景 (モード示唆): 0 夜の城 / 1 赤い月 / 2 嵐 / 3 紫の霧
const SKIES = [
  { top: '#0a1030', mid: '#1a2a60', bottom: '#05060f', moon: '#dfe8ff', fog: 0x0a1028 },
  { top: '#2a0008', mid: '#7a1020', bottom: '#0a0204', moon: '#ff4a3a', fog: 0x2a0408 },
  { top: '#0a1410', mid: '#2a3a30', bottom: '#020404', moon: '#c0ffd0', fog: 0x0a1410 },
  { top: '#1a0430', mid: '#5a1a8a', bottom: '#08020f', moon: '#ff9aff', fog: 0x200838 },
];

export class DarkStage {
  constructor(assets) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    this.rt = new THREE.WebGLRenderTarget(960, 540, { samples: 4 });
    this.mixers = [];
    this.t = 0;
    this.ready = false;
    this.camTarget = { pos: new THREE.Vector3(0, 1.6, 6.5), look: new THREE.Vector3(0, 1.1, 0) };
    this.shake = 0;
    this.buildWorld();
  }

  buildWorld() {
    const s = this.scene;
    s.fog = new THREE.Fog(0x0a1028, 8, 30);
    s.add(new THREE.HemisphereLight(0x8a9cff, 0x100408, 0.7));
    this.key = new THREE.DirectionalLight(0xdfe8ff, 1.6);
    this.key.position.set(-3, 6, 4);
    s.add(this.key);
    this.rim = new THREE.PointLight(0xa040ff, 18, 14, 2);
    this.rim.position.set(2, 3, -2);
    s.add(this.rim);
    // キャラクターを正面から照らす補助光
    const fill = new THREE.DirectionalLight(0xc8b8ff, 1.1);
    fill.position.set(2, 3, 8);
    s.add(fill);
    this.flashLight = new THREE.PointLight(0xffffff, 0, 20, 2);
    this.flashLight.position.set(0, 3, 3);
    s.add(this.flashLight);
    // 空 (大きな板に描く)
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    this.skyCanvas = c;
    this.skyTex = new THREE.CanvasTexture(c); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: this.skyTex, fog: false }));
    sky.position.set(0, 8, -18);
    s.add(sky);
    // 地面 (石畳)
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    const g = gc.getContext('2d');
    g.fillStyle = '#1a1820'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { g.fillStyle = `rgb(${34 + (x * y) % 20},${30 + (x + y) % 16},${40 + (y % 24)})`; g.fillRect(x + 2, y + 2, 60, 28); }
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(10, 10); gt.colorSpace = THREE.SRGBColorSpace;
    this.groundTex = gt;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);
    // 柱と松明 (奥行き)
    this.torches = [];
    for (let i = 0; i < 6; i++) {
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), new THREE.MeshStandardMaterial({ color: 0x24202c, roughness: 0.8 }));
        p.position.set(sx * 4.2, 2.5, -i * 5);
        s.add(p);
        const fl = new THREE.PointLight(0xff7a2a, 3, 6, 2);
        fl.position.set(sx * 3.7, 3.2, -i * 5);
        s.add(fl);
        this.torches.push(fl);
      }
    }
    // 魔法陣 (エフェクト用)
    const mc = document.createElement('canvas'); mc.width = mc.height = 256;
    const m = mc.getContext('2d');
    m.strokeStyle = '#fff'; m.lineWidth = 6;
    for (const r of [120, 96, 60]) { m.beginPath(); m.arc(128, 128, r, 0, Math.PI * 2); m.stroke(); }
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; m.beginPath(); m.moveTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); m.lineTo(128 + Math.cos(a + 2.09) * 120, 128 + Math.sin(a + 2.09) * 120); m.stroke(); }
    const mt = new THREE.CanvasTexture(mc);
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: mt, color: 0xa040ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.circle.rotation.x = -Math.PI / 2;
    this.circle.position.y = 0.02;
    s.add(this.circle);
    // 斬撃の光
    this.slash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.slash.position.set(0, 1.4, 0.5);
    s.add(this.slash);
    this.setStage(0);
  }

  setStage(n) {
    this.stage = n;
    const k = SKIES[n] || SKIES[0];
    const x = this.skyCanvas.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, k.top); g.addColorStop(0.55, k.mid); g.addColorStop(1, k.bottom);
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    // 月
    const mg = x.createRadialGradient(760, 130, 10, 760, 130, 120);
    mg.addColorStop(0, k.moon); mg.addColorStop(0.35, k.moon); mg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = mg; x.fillRect(600, 0, 340, 300);
    // 城のシルエット
    x.fillStyle = '#05030a';
    const tw = [[120, 230, 60], [200, 180, 40], [300, 260, 90], [420, 150, 50], [520, 210, 80], [640, 280, 60], [880, 240, 70]];
    for (const [cx, h, w] of tw) {
      x.fillRect(cx - w / 2, 512 - h - 120, w, h + 120);
      x.beginPath(); x.moveTo(cx - w / 2 - 6, 512 - h - 120); x.lineTo(cx, 512 - h - 190); x.lineTo(cx + w / 2 + 6, 512 - h - 120); x.fill();
    }
    x.fillRect(0, 400, 1024, 112);
    // 星
    for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`; x.fillRect((i * 137) % 1024, (i * 71) % 300, 2, 2); }
    this.skyTex.needsUpdate = true;
    this.scene.fog.color.setHex(k.fog);
    this.rim.color.set(n === 1 ? 0xff3040 : n === 2 ? 0x60ffa0 : n === 3 ? 0xd060ff : 0x6080ff);
  }

  // ---------------- キャラクター読み込み ----------------
  async load(base) {
    const loader = new GLTFLoader();
    const get = (n) => loader.loadAsync(`${base}/${n}.gltf.json`);
    const [knight, sword, helmet, pads, ...mons] = await Promise.all([get('KnightCharacter'), get('Sword'), get('Helmet1'), get('ShoulderPads'), ...ENEMIES.map((e) => get(e.key))]);
    this.swordSrc = sword.scene.clone(true); // 筐体の役物にも使う
    this.knight = this.makeActor(knight, 2.0);
    // 黒い鎧に塗り替える
    this.knight.root.traverse((o) => {
      if (o.isMesh) {
        const m = o.material.clone();
        m.color = new THREE.Color(0x2a2633); m.metalness = 0.7; m.roughness = 0.35;
        m.emissive = new THREE.Color(0x20063a); m.emissiveIntensity = 0.6;
        o.material = m;
      }
    });
    this.knight.root.updateMatrixWorld(true);
    const attach = (gl, boneName, scale, rot, pos) => {
      let bone = null;
      this.knight.root.traverse((o) => { if (o.isBone && o.name.includes(boneName)) bone = bone || o; });
      if (!bone) return;
      const obj = gl.scene;
      obj.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0x3a3448, metalness: 0.6, roughness: 0.35, emissive: 0x1a0630, emissiveIntensity: 0.8 }); });
      // 装備は騎士本体と同じ単位 (FBX の cm) で作られているので、骨の拡大率を打ち消して本体と同じ縮尺にする
      const ws = new THREE.Vector3(); bone.getWorldScale(ws);
      obj.scale.setScalar(scale * this.knight.obj.scale.x / ws.x);
      obj.rotation.set(...rot);
      obj.position.set(...pos);
      bone.add(obj);
      return obj;
    };
    this.sword = attach(sword, 'MiddleHandR', 1, [0, 0, 0], [0, 0, 0]);
    if (this.sword) this.sword.traverse((o) => { if (o.isMesh) { o.material.emissive = new THREE.Color(0x8a2aff); o.material.emissiveIntensity = 0.8; } });
    attach(helmet, 'Head', 1, [0, 0, 0], [0, 0, 0]);
    attach(pads, 'Torso', 1, [0, 0, 0], [0, 0, 0]);
    this.scene.add(this.knight.root);
    this.knight.root.position.set(-1.6, 0, 0);
    this.knight.root.rotation.y = Math.PI / 2 - 0.3;
    this.enemies = mons.map((gl, i) => {
      const a = this.makeActor(gl, ENEMIES[i].height);
      a.root.visible = false;
      this.scene.add(a.root);
      return a;
    });
    this.play(this.knight, 'Idle_swordRight');
    this.ready = true;
  }

  makeActor(gl, height) {
    const root = new THREE.Group();
    const obj = gl.scene;
    // FBX → glTF 変換で不透明度 0 の半透明扱いになっているので、不透明に戻す
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const fix = (m) => { m = m.clone(); m.transparent = false; m.opacity = 1; m.depthWrite = true; return m; };
      o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
      o.frustumCulled = false; // スキンメッシュの境界が静止姿勢のままなので
    });
    // 大きさはスキニング後の姿で測る (変換元の静止メッシュと骨の姿勢がずれているため)
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
      else { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    });
    const h = box.max.y - box.min.y || 1;
    obj.scale.setScalar(height / h);
    obj.position.y = -box.min.y * (height / h);
    root.add(obj);
    const mixer = new THREE.AnimationMixer(obj);
    this.mixers.push(mixer);
    const clips = {};
    for (const c of gl.animations) clips[c.name.split('|').pop()] = c;
    return { root, obj, mixer, clips, cur: null };
  }

  play(actor, name, { once = false, fade = 0.2, speed = 1 } = {}) {
    if (!actor) return 0;
    const clip = actor.clips[name];
    if (!clip) return 0;
    const act = actor.mixer.clipAction(clip);
    act.reset();
    act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat);
    act.clampWhenFinished = once;
    act.timeScale = speed;
    if (actor.cur && actor.cur !== act) actor.cur.crossFadeTo(act, fade, false);
    act.play();
    actor.cur = act;
    return clip.duration / speed;
  }

  // ---------------- 場面 ----------------
  // 通常: 騎士が城の回廊を歩く
  walk() {
    this.scene_ = 'walk';
    this.hideEnemies();
    this.play(this.knight, 'Walking');
    this.knight && this.knight.root.position.set(0, 0, 0);
    this.knight && (this.knight.root.rotation.y = 0);
  }

  // 敵の出現 (予告 / バトル)
  encounter(i) {
    this.scene_ = 'battle';
    this.hideEnemies();
    const e = this.enemies?.[i];
    if (!e) return;
    const d = ENEMIES[i];
    e.root.visible = true;
    e.root.position.set(i === 3 ? 1.7 : 1.4, d.y, i === 3 ? -1.4 : -0.3);
    e.root.rotation.y = -Math.PI / 2 + 0.35;
    e.root.scale.setScalar(0.01);
    e.appear = 0;
    this.enemy = e; this.enemyIdx = i;
    this.play(e, d.idle);
    if (this.knight) { this.knight.root.position.set(-1.6, 0, 0); this.knight.root.rotation.y = Math.PI / 2 - 0.3; this.play(this.knight, 'Idle_swordRight'); }
    this.circle.material.color.set(d.color);
    this.circleT = 1;
  }

  hideEnemies() { this.enemies?.forEach((e) => { e.root.visible = false; }); this.enemy = null; }

  knightAttack(finish = false) {
    const d = this.play(this.knight, finish ? 'swordAttackJump' : 'Run_swordAttack', { once: true, speed: finish ? 0.9 : 1.2 });
    setTimeout(() => {
      this.slashT = 1;
      this.shake = finish ? 0.25 : 0.1;
      if (this.enemy) this.play(this.enemy, finish ? ENEMIES[this.enemyIdx].death : ENEMIES[this.enemyIdx].hit, { once: true });
    }, d * 450);
    setTimeout(() => this.play(this.knight, 'Idle_swordRight'), d * 1000 + 80);
    return d;
  }

  enemyAttack(knightDies = false) {
    if (!this.enemy) return 0;
    const d = this.play(this.enemy, ENEMIES[this.enemyIdx].attack, { once: true });
    setTimeout(() => {
      this.shake = 0.2;
      this.flash(0xff2030);
      this.play(this.knight, knightDies ? 'Death' : 'Roll_sword', { once: true });
    }, d * 500);
    if (!knightDies) setTimeout(() => this.play(this.knight, 'Idle_swordRight'), d * 1000 + 900);
    setTimeout(() => this.enemy && this.play(this.enemy, ENEMIES[this.enemyIdx].idle), d * 1000 + 100);
    return d;
  }

  // AT: 走りながら斬り進む
  rush() {
    this.scene_ = 'rush';
    this.hideEnemies();
    this.play(this.knight, 'Run_swordRight', { speed: 1.2 });
    if (this.knight) { this.knight.root.position.set(0, 0, 0); this.knight.root.rotation.y = 0; }
  }

  flash(color = 0xffffff, k = 1) { this.flashLight.color.set(color); this.flashK = k; }

  // カメラ: 場面ごとの構図へ寄せる
  update(dt) {
    this.t += dt;
    for (const m of this.mixers) m.update(dt);
    const scene = this.scene_ || 'walk';
    const T = this.camTarget;
    if (scene === 'walk' || scene === 'rush') {
      const run = scene === 'rush' ? 4 : 1;
      this.groundTex.offset.y += dt * 0.12 * run;
      T.pos.set(Math.sin(this.t * 0.25) * 1.2 + 1.6, 1.7, 4.2);
      T.look.set(0, 1.1, -1);
      for (const [i, fl] of this.torches.entries()) fl.intensity = 2.5 + Math.sin(this.t * 13 + i) * 0.8;
    } else {
      T.pos.set(Math.sin(this.t * 0.4) * 0.6, 1.8, 6.2);
      T.look.set(0.1, 1.2, 0);
    }
    if (this.enemy && this.enemy.appear < 1) {
      this.enemy.appear = Math.min(1, this.enemy.appear + dt * 2.5);
      const k = 1 - Math.pow(1 - this.enemy.appear, 3);
      this.enemy.root.scale.setScalar(Math.max(0.01, k));
    }
    this.circleT = Math.max(0, (this.circleT || 0) - dt * 0.6);
    this.circle.material.opacity = this.circleT * 0.9;
    this.circle.rotation.z += dt * 2;
    this.circle.position.set(this.enemy ? this.enemy.root.position.x : 0, 0.02, this.enemy ? this.enemy.root.position.z : 0);
    this.slashT = Math.max(0, (this.slashT || 0) - dt * 3);
    this.slash.material.opacity = this.slashT;
    this.slash.rotation.z = -0.5 + (1 - this.slashT) * 0.6;
    this.flashK = Math.max(0, (this.flashK || 0) - dt * 3);
    this.flashLight.intensity = this.flashK * 60;
    this.shake = Math.max(0, this.shake - dt * 0.8);
    const c = this.camera;
    c.position.lerp(T.pos, Math.min(1, dt * 2.5));
    c.position.x += (Math.random() - 0.5) * this.shake;
    c.position.y += (Math.random() - 0.5) * this.shake;
    c.lookAt(T.look);
  }

  render(renderer) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }
}
