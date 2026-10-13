// 3D 描画：シーン・カメラ（背後追従）・ポストエフェクト・ゲーム状態との同期
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MODELS, UnitSet, Rig } from './models.js';
import { World, XRAY } from './world.js';
import { FX, S } from '../fx.js';
import { input } from '../input.js';

// 仕上げ：周辺減光・色収差・被弾の赤・閃光・色調・フィルムグレイン
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0 }, uRed: { value: 0 }, uFlash: { value: 0 }, uVig: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uRed, uFlash, uVig;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float ca = 0.0025 + uCA * 0.012;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d * ca).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d * ca).b;
      // 夜の色調：影を藍へ、ハイライトを暖色へ
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c * vec3(0.85, 0.9, 1.15), smoothstep(0.4, 0.0, l) * 0.5);
      c = mix(c, c * vec3(1.08, 1.0, 0.9), smoothstep(0.5, 1.0, l) * 0.5);
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
      c *= mix(1.0, v, 0.75 * uVig);
      c = mix(c, vec3(0.9, 0.05, 0.12), uRed * (1.0 - v));
      c = mix(c, vec3(1.0, 0.98, 0.92), uFlash);
      c += (rnd(vUv * 300.0) - 0.5) * 0.035;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const ENEMY_SCALE = { oni: 1 };
const tmpC = new THREE.Color();
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

export function talismanTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff6dc'; g.fillRect(4, 4, 56, 120);
  g.strokeStyle = '#c3202a'; g.lineWidth = 4; g.strokeRect(8, 8, 48, 112);
  g.fillStyle = '#c3202a'; g.font = '34px "Yuji Boku", serif'; g.textAlign = 'center';
  g.fillText('急', 32, 50); g.fillText('令', 32, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTex(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function beamTex() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
const BEAM_COL = { chest: 0xffc94a, heal: 0x7dffb0, magnet: 0x6fd8ff, bomb: 0xfff2c0 };

export const R = {
  init(canvas, mobile) {
    this.mobile = mobile;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    r.shadowMap.enabled = !mobile;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r = r;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x120c22, 0.024);
    this.scene = scene;
    const cam = new THREE.PerspectiveCamera(52, 1, 0.1, 900);
    this.cam = cam;
    this.yaw = 0; this.pitch = 0.44; this.dist = 8;
    this.camPos = new THREE.Vector3(0, 8, 10);
    this.look = new THREE.Vector3();

    // 光：月明かり（影あり）・空の環境光・プレイヤーの手元の灯
    scene.add(new THREE.HemisphereLight(0x6f7fd0, 0x1a1428, 0.8));
    const moon = new THREE.DirectionalLight(0xa9bcff, 0.9);
    moon.castShadow = !mobile;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.03;
    scene.add(moon, moon.target);
    this.moonLight = moon;
    this.lantern = new THREE.PointLight(0xffb870, 5, 9, 2);
    scene.add(this.lantern);

    // ポストエフェクト
    const comp = new EffectComposer(r);
    comp.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.5 : 0.6, 0.5, 0.88);
    comp.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    comp.addPass(this.final);
    comp.addPass(new OutputPass());
    this.comp = comp;

    this.world = new World(scene, mobile);
    return this;
  },

  async load(onProgress) { await this.world.load(onProgress); },

  // モデル読み込み後に、描画セットを作る
  build(limits) {
    const sc = this.scene;
    this.units = {};
    for (const k of ['bat', 'skMinion', 'slime', 'frog', 'rat', 'skRogue', 'spiderBig', 'orochi', 'mukuro']) this.units[k] = new UnitSet(sc, k, k === 'spiderBig' ? 40 : k === 'orochi' || k === 'mukuro' ? 4 : limits.enemies);
    this.allies = {};
    for (const k of ['kami', 'byakko', 'zenki', 'karasu']) this.allies[k] = new UnitSet(sc, k, limits.allies);
    for (const u of [...Object.values(this.units), ...Object.values(this.allies)]) for (const im of [...u.walk, ...(u.atk || [])]) { im.castShadow = !this.mobile; }

    // プレイヤー（陰陽師）
    this.player = new Rig('player', 'player', 1.75, ['Spellbook', 'Spellbook_open', '1H_Wand']);
    this.player.silhouette(0xfff4dc);
    this.charId = 'seimei';
    sc.add(this.player.root);
    this.player.play('Idle');
    // ボス（がしゃどくろ）
    this.boss = new Rig('sk_warrior', 'sk_minion', 8);
    this.bossLight = new THREE.PointLight(0xb08aff, 0, 22, 1.6);
    sc.add(this.bossLight);
    this.boss.root.visible = false;
    for (const m of this.boss.materials()) {
      m.emissive = new THREE.Color(0x000000);
      m.userData.baseEmis = /glow/i.test(m.name) ? new THREE.Color(0xff3020) : new THREE.Color(0x000000);
      m.emissive.copy(m.userData.baseEmis);
      m.emissiveIntensity = 3;
    }
    sc.add(this.boss.root);

    // 弾
    const cap = limits.projectiles;
    const tal = new THREE.MeshBasicMaterial({ map: talismanTexture(), side: THREE.DoubleSide, color: 0x9a8a70 });
    this.ofuda = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.44), tal, cap);
    const glow = (c) => new THREE.MeshBasicMaterial({ color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const arrowGeo = new THREE.CylinderGeometry(0.035, 0.06, 1.6, 6); arrowGeo.rotateX(Math.PI / 2);
    this.arrow = new THREE.InstancedMesh(arrowGeo, glow(0xffe0a0), cap);
    this.orb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.18, 1), glow(0xff8a3a), cap);
    this.bullet = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), glow(0xd84aff), limits.enemyBullets);
    // 魂（経験値）
    this.gem = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), limits.gems);
    this.gem.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(limits.gems * 3), 3);
    this.gemCols = [new THREE.Color(0x4ad8ff).multiplyScalar(1.6), new THREE.Color(0x6aff8a).multiplyScalar(1.6), new THREE.Color(0xff5a6a).multiplyScalar(1.8), new THREE.Color(0xc77dff).multiplyScalar(2.2)];
    // 狐火
    this.fox = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 2), glow(0x7fd7ff), 12);
    for (const m of [this.ofuda, this.arrow, this.orb, this.bullet, this.gem, this.fox]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sc.add(m); }
    // 結界（足元の常設魔法陣）
    this.ward = null;
    // アイテム
    this.pick = {
      heal: this.mkPick(new THREE.ConeGeometry(0.3, 0.4, 3), 0xffffff, 0x333333),
      magnet: this.mkPick(new THREE.SphereGeometry(0.22, 12, 8), 0xd9a441, 0x332200),
      bomb: this.mkPick(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10), 0xffe066, 0x664400),
      chest: this.mkPick(new THREE.BoxGeometry(0.6, 0.42, 0.42), 0xb3141c, 0x400000),
    };
    this.dying = [];
    // ---- 視認性：光の柱・地面の光輪・警告 ----
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); beamGeo.translate(0, 0.5, 0);
    this.beam = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex(), side: THREE.DoubleSide, ...add }), 32);
    this.beam.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3);
    const decalGeo = new THREE.PlaneGeometry(2, 2); decalGeo.rotateX(-Math.PI / 2);
    const halo = radialTex([[0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    const ringT = radialTex([[0, 'rgba(255,255,255,0)'], [0.82, 'rgba(255,255,255,0)'], [0.9, 'rgba(255,255,255,0.9)'], [0.97, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]);
    this.halo = new THREE.InstancedMesh(decalGeo, new THREE.MeshBasicMaterial({ map: halo, ...add }), 96);
    this.halo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);
    this.ringD = new THREE.InstancedMesh(decalGeo, new THREE.MeshBasicMaterial({ map: ringT, ...add }), 64);
    this.ringD.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
    for (const m of [this.beam, this.halo, this.ringD]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 2; sc.add(m); }
    // ボス突進の予告帯
    const tg = new THREE.PlaneGeometry(1, 1); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -0.5);
    this.tele = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xff2030, ...add, opacity: 0.5 }));
    this.tele.visible = false;
    sc.add(this.tele);
    // 画面外マーカー（DOM）
    this.markLayer = document.getElementById('markers');
    this.marks = [];
  },

  // 陰陽師の見た目を切り替える
  setCharacter(ch) {
    if (this.player && this.charId === ch.id) return;
    if (this.player) this.scene.remove(this.player.root);
    this.player = new Rig(ch.model, 'player', 1.75, ch.hide || []);
    if (ch.tint) for (const m of this.player.materials()) if (m.isMeshStandardMaterial) { m.emissive = new THREE.Color(ch.tint); m.emissiveIntensity = 0.25; }
    this.player.silhouette(0xfff4dc);
    this.scene.add(this.player.root);
    this.player.play('Idle');
    this.charId = ch.id;
  },

  mkPick(geo, c, e) {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 1.5 }), 16);
    im.count = 0; im.frustumCulled = false;
    this.scene.add(im);
    return im;
  },

  resize(w, h, dpr) {
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.comp.setPixelRatio(dpr);
    this.comp.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    FX.uScaleFor(h * dpr);
    this.w = w; this.h = h;
  },

  render(G, rdt) {
    const P = G.player, sc = this.scene, t = G.time;
    if (!P) { this.comp.render(rdt); return; }
    const px = P.x * S, pz = P.y * S;

    // ---- カメラ ----
    const enemyZoom = Math.min(4, G.enemies.length / 180);
    const dist = 7.2 + enemyZoom * 0.8 + (G.boss ? 3 : 0) - (G.fovKick || 0) * 1.5;
    const yaw = input.camYaw;
    // 注視点はプレイヤーの少し前（画面下寄りにプレイヤー、前方の敵が見える）
    const target = tmpV.set(px - Math.sin(yaw) * 2.2, 1.0, pz - Math.cos(yaw) * 2.2);
    const want = new THREE.Vector3(px + Math.sin(yaw) * Math.cos(this.pitch) * dist, 1.4 + Math.sin(this.pitch) * dist, pz + Math.cos(yaw) * Math.cos(this.pitch) * dist);
    this.camPos.lerp(want, Math.min(1, rdt * 8));
    this.look.lerp(target, Math.min(1, rdt * 10));
    const sh = G.shake * G.shake * 0.45;
    this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.cam.lookAt(this.look);
    XRAY.cam.copy(this.cam.position);
    XRAY.player.set(px, 1.0, pz);
    const fov = 52 + (G.fovKick || 0) * 10 + (G.slowT > 0 ? -4 : 0);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, rdt * 10); this.cam.updateProjectionMatrix(); }
    if (G.fovKick > 0) G.fovKick = Math.max(0, G.fovKick - rdt * 2.5);

    this.moonLight.position.set(px - 12, 26, pz - 18);
    this.moonLight.target.position.set(px, 0, pz);
    this.lantern.position.set(px + Math.sin(yaw) * 1.6, 2.2, pz + Math.cos(yaw) * 1.6);
    this.lantern.intensity = 5 + Math.sin(t * 9) * 0.5 + Math.sin(t * 23) * 0.3;
    this.world.update(px, pz, performance.now() / 1000, rdt, this.cam);

    // ---- プレイヤー ----
    const pr = this.player;
    pr.root.position.set(px, 0, pz);
    if (P.yawR === undefined) P.yawR = P.yaw;
    P.yawR = lerpAngle(P.yawR, P.yaw, Math.min(1, rdt * 14));
    pr.root.rotation.y = P.yawR;
    if (G.state === 'result' && P.hp <= 0) pr.play('Death_A', { once: true, fade: 0.1 });
    else if (G.castT > 0) { pr.play('Spellcast_Shoot', { once: true, fade: 0.08, speed: 1.4 }); G.castT = 0; pr.castUntil = performance.now() + 450; }
    else if (performance.now() > (pr.castUntil || 0)) pr.play(P.moving ? 'Running_A' : 'Idle', { speed: P.moving ? 1.1 : 1 });
    pr.root.visible = !(P.hurtT > 0 && Math.sin(t * 60) > 0.6);
    pr.update(G.state === 'play' ? rdt * (G.slowT > 0 ? 0.35 : 1) : rdt * 0.2);

    // ---- 敵 ----
    for (const u of Object.values(this.units)) u.begin();
    const view2 = (this.mobile ? 28 : 40) ** 2;
    for (const e of G.enemies) {
      if (!e.alive || e.boss) continue;
      const ex = e.x * S, ez = e.y * S;
      const dx = ex - px, dz = ez - pz;
      if (dx * dx + dz * dz > view2) continue;
      const u = this.units[e.def.model];
      if (!u) continue;
      if (e.yawR === undefined) e.yawR = e.yaw || 0;
      e.yawR = lerpAngle(e.yawR, e.yaw || 0, Math.min(1, rdt * 8));
      let y = u.lift;
      if (u.lift) y += Math.sin(t * 5 + e.wob) * 0.15;
      const age = e.at < 1 ? e.at : 1;
      const k = (0.4 + 0.6 * Math.min(1, age * 1.5)) * (ENEMY_SCALE[e.type] || 1);
      tmpQ.setFromAxisAngle(UP, e.yawR);
      tmpM.compose(tmpV.set(ex, y, ez), tmpQ, tmpS.set(k, k, k));
      u.push(tmpM, e.at * 0.22 + e.wob, e.flash > 0 ? 1 : e.slowT > 0 ? 0.25 : 0);
    }
    // 倒れた妖怪：白く光って跳ね、縮んで消える
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += rdt;
      if (d.t > 0.32) { this.dying.splice(i, 1); continue; }
      const u = this.units[d.model];
      const p = d.t / 0.32;
      tmpQ.setFromAxisAngle(UP, d.yaw + p * 4 * d.spin);
      const k = (1 - p * p) * d.k;
      tmpM.compose(tmpV.set(d.x + d.vx * p, (u.lift || 0) + Math.sin(p * Math.PI) * 0.9, d.z + d.vz * p), tmpQ, tmpS.set(k * (1 + p * 0.4), k * (1 - p * 0.3), k * (1 + p * 0.4)));
      u.push(tmpM, d.ph, 1);
    }
    for (const u of Object.values(this.units)) u.end(t);

    // ---- 式神 ----
    for (const u of Object.values(this.allies)) u.begin();
    for (const a of G.allies) {
      if (!a.alive) continue;
      const u = this.allies[a.type];
      const ax = a.x * S, az = a.y * S;
      if (a.yawR === undefined) a.yawR = a.yaw || 0;
      if (a.type === 'byakko') a.yaw = Math.atan2(a.vx, a.vy);
      a.yawR = lerpAngle(a.yawR, a.yaw || 0, Math.min(1, rdt * 12));
      let k = a.spawnT < 0.25 ? 0.2 + a.spawnT * 3.2 : 1;
      if (a.life < 0.6) k *= a.life / 0.6;
      let y = u.lift ? u.lift + Math.sin(t * 4 + a.idx) * 0.2 : 0;
      if (a.spawnT < 0.25) y -= (0.25 - a.spawnT) * 4;
      tmpQ.setFromAxisAngle(UP, a.yawR);
      tmpM.compose(tmpV.set(ax, y, az), tmpQ, tmpS.set(k, k, k));
      const atk = a.atk > 0 ? 1 - a.atk / 0.36 : -1;
      u.push(tmpM, a.at * 0.18 + a.idx * 0.13, a.squash > 0 ? 0.6 : 0, atk);
    }
    for (const u of Object.values(this.allies)) u.end(t);

    // ---- ボス ----
    const b = G.boss;
    const br = this.boss;
    br.root.visible = !!b;
    this.bossLight.intensity = b ? 5 : 0;
    if (b) this.bossLight.position.set(b.x * S, 11, b.y * S + 7);
    if (b) {
      br.root.position.set(b.x * S, 0, b.y * S);
      const want2 = Math.atan2(P.x - b.x, P.y - b.y);
      if (b.yawR === undefined) b.yawR = want2;
      b.yawR = lerpAngle(b.yawR, b.ai && b.ai.state === 'charge' ? Math.atan2(b.ai.dx, b.ai.dy) : want2, Math.min(1, rdt * 4));
      br.root.rotation.y = b.yawR;
      const st = b.ai ? b.ai.state : 'walk';
      if (st === 'tele') br.play('2H_Melee_Attack_Spin', { speed: 0.6 });
      else if (st === 'charge') br.play('Running_C', { speed: 1.6 });
      else if (st === 'barrage') br.play('Spellcast_Shoot', { speed: 1.2 });
      else br.play('Walking_D_Skeletons', { speed: 0.9 });
      const fl = b.flash > 0 ? 1 : 0;
      for (const m of br.materials()) m.emissive.copy(m.userData.baseEmis).addScalar(fl * 0.6);
      br.update(rdt * (G.slowT > 0 ? 0.35 : 1));
      if (G.frame % 3 === 0) FX.p3(b.x * S + (Math.random() - 0.5) * 2, 0.2, b.y * S + (Math.random() - 0.5) * 2, 0, 1.5, 0, 1.2, 0.6, 4, 0.5, 0.3);
    }

    // ---- 弾 ----
    let no = 0, na = 0, nb = 0;
    for (const p of G.projs) {
      if (!p.alive) continue;
      const x = p.x * S, z = p.y * S;
      if (p.kind === 'ofuda') {
        tmpQ.setFromAxisAngle(UP, p.rot);
        const kb = p.big ? 1.5 : 1;
        tmpM.compose(tmpV.set(x, 1.1, z), tmpQ, tmpS.set(kb, kb, kb));
        this.ofuda.setMatrixAt(no++, tmpM);
        if (G.frame % 2 === 0) FX.p3(x, 1.1, z, 0, 0.2, 0, 0.3, 0.18, 0, 3, 0);
      } else if (p.kind === 'arrow') {
        tmpQ.setFromAxisAngle(UP, Math.atan2(p.vx, p.vy));
        const ka = p.big ? 1.8 : 1;
        tmpM.compose(tmpV.set(x, 1.0, z), tmpQ, tmpS.set(ka, ka, ka * 1.3));
        this.arrow.setMatrixAt(na++, tmpM);
        if (G.frame % 2 === 0) FX.p3(x, 1.0, z, 0, 0, 0, 0.22, 0.2, 7, 0, 0);
      } else {
        tmpM.makeTranslation(x, 1.6, z);
        this.orb.setMatrixAt(nb++, tmpM);
        if (G.frame % 2 === 0) FX.p3(x, 1.6, z, 0, 0.3, 0, 0.25, 0.22, 1, 2, 0);
      }
    }
    this.ofuda.count = no; this.arrow.count = na; this.orb.count = nb;
    let nu = 0;
    for (const u of G.bullets) {
      tmpM.makeTranslation(u.x * S, 1.2, u.y * S);
      this.bullet.setMatrixAt(nu++, tmpM);
      if (G.frame % 2 === 0) FX.p3(u.x * S, 1.2, u.y * S, 0, 0.4, 0, 0.35, 0.5, 4, 2, 0);
    }
    this.bullet.count = nu;

    // ---- 魂 ----
    let ng = 0;
    const gc = this.gem.instanceColor;
    for (const g of G.gems) {
      const x = g.x * S, z = g.y * S;
      const dx = x - px, dz = z - pz;
      if (dx * dx + dz * dz > 900) continue;
      tmpQ.setFromAxisAngle(UP, t * 3 + g.x);
      const k = 0.8 + g.tier * 0.35;
      tmpM.compose(tmpV.set(x, 0.45 + Math.sin(t * 4 + g.x) * 0.1 + (g.mag ? 0.4 : 0), z), tmpQ, tmpS.set(k, k * 1.4, k));
      this.gem.setMatrixAt(ng, tmpM);
      const c = this.gemCols[g.tier];
      gc.setXYZ(ng, c.r, c.g, c.b);
      ng++;
      if (g.mag && G.frame % 3 === 0) FX.p3(x, 0.8, z, 0, 0, 0, 0.25, 0.2, 2, 0, 0);
    }
    this.gem.count = ng;
    gc.needsUpdate = true;

    // ---- アイテム ----
    const pc = { heal: 0, magnet: 0, bomb: 0, chest: 0 };
    for (const k of G.pickups) {
      const im = this.pick[k.kind];
      tmpQ.setFromAxisAngle(UP, t * 2);
      tmpM.compose(tmpV.set(k.x * S, 0.6 + Math.sin(k.t * 4) * 0.15, k.y * S), tmpQ, tmpS.set(1, 1, 1));
      im.setMatrixAt(pc[k.kind]++, tmpM);
      if (G.frame % 4 === 0) FX.p3(k.x * S, 0.3, k.y * S, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.6, 0.3, k.kind === 'chest' ? 0 : 7, 1, 0);
    }
    for (const k in pc) { this.pick[k].count = pc[k]; this.pick[k].instanceMatrix.needsUpdate = true; }

    // ---- 狐火・結界 ----
    let nf = 0;
    for (const s of G.skills) {
      const sid = s.def.base || s.id;
      if (sid === 'kitsunebi' && s.orbs) {
        for (const o of s.orbs) {
          tmpM.makeTranslation(o.x * S, 1.0 + Math.sin(t * 6 + nf) * 0.15, o.y * S);
          this.fox.setMatrixAt(nf++, tmpM);
          if ((G.frame + nf) % 2 === 0) FX.p3(o.x * S, 1.0, o.y * S, 0, 1.2, 0, 0.3, 0.26, 2, 2, 0);
        }
      }
      if (sid === 'kekkai') {
        const L = s.def.levels[s.lv - 1];
        if (!this.ward) this.ward = FX.seal(P.x, P.y, L.radius, 1e9, P, false, s.def.base ? '#fff0b0' : '#ffd77a');
        this.ward.r = L.radius * S;
        this.ward.alpha = 0.22 + (s.pulse || 0) * 0.3;
        if (s.pulse > 0.95) FX.ring(P.x, P.y, L.radius * 0.3, L.radius, 0.35, '#ffd77a', 3);
      }
    }
    this.fox.count = nf;
    for (const m of [this.ofuda, this.arrow, this.orb, this.bullet, this.gem, this.fox]) m.instanceMatrix.needsUpdate = true;

    // ---- 視認性：アイテムの光柱・足元の光輪・エリートの警告輪・画面外マーカー ----
    let nb2 = 0, nh = 0, nr = 0;
    const col = new THREE.Color();
    const setC = (im, i, hex, k = 1) => { col.set(hex).multiplyScalar(k); im.instanceColor.setXYZ(i, col.r, col.g, col.b); };
    const marks = [];
    for (const k of G.pickups) {
      const x = k.x * S, z = k.y * S, big = k.kind === 'chest';
      const w = big ? 0.55 : 0.28, h = big ? 14 : 6;
      tmpM.compose(tmpV.set(x, 0, z), tmpQ.identity(), tmpS.set(w * (1 + Math.sin(t * 4) * 0.1), h, w * (1 + Math.sin(t * 4) * 0.1)));
      if (nb2 < 32) { this.beam.setMatrixAt(nb2, tmpM); setC(this.beam, nb2++, BEAM_COL[k.kind], big ? 1.1 : 0.7); }
      const r = big ? 1.6 : 0.8;
      tmpM.compose(tmpV.set(x, 0.04, z), tmpQ.identity(), tmpS.set(r, 1, r));
      if (nh < 96) { this.halo.setMatrixAt(nh, tmpM); setC(this.halo, nh++, BEAM_COL[k.kind], 0.8); }
      if (big) marks.push({ x, z, color: '#ffc94a', label: '宝' });
    }
    // プレイヤーの足元と吸引範囲
    tmpM.compose(tmpV.set(px, 0.035, pz), tmpQ.identity(), tmpS.set(0.75, 1, 0.75));
    this.halo.setMatrixAt(nh, tmpM); setC(this.halo, nh++, 0xffd77a, 0.55);
    const pkr = (G.st.pickup || 90) * S;
    tmpM.compose(tmpV.set(px, 0.03, pz), tmpQ.identity(), tmpS.set(pkr, 1, pkr));
    this.ringD.setMatrixAt(nr, tmpM); setC(this.ringD, nr++, 0x6fd8ff, 0.18);
    tmpM.compose(tmpV.set(px, 0.035, pz), tmpQ.identity(), tmpS.set(0.95, 1, 0.95));
    // 足元の輪は体力で色が変わる（金 → 朱）。危険域では脈打つ
    const hpK = Math.max(0, P.hp / P.maxHp);
    col.set(0xffd77a).lerp(tmpC.set(0xff2a2a), Math.min(1, Math.max(0, (0.6 - hpK) / 0.4)));
    col.multiplyScalar(hpK < 0.35 ? 1.2 + Math.sin(t * 12) * 0.6 : 0.9);
    this.ringD.setMatrixAt(nr, tmpM); this.ringD.instanceColor.setXYZ(nr++, col.r, col.g, col.b);
    // エリートは赤い警告輪
    for (const e of G.enemies) {
      if (!e.alive || !e.elite) continue;
      const r = e.r * S * 1.6 * (1 + Math.sin(t * 6) * 0.08);
      tmpM.compose(tmpV.set(e.x * S, 0.04, e.y * S), tmpQ.identity(), tmpS.set(r, 1, r));
      if (nr < 64) { this.ringD.setMatrixAt(nr, tmpM); setC(this.ringD, nr++, 0xff3030, 1.2); }
      if (nh < 96) { tmpS.set(r * 1.1, 1, r * 1.1); tmpM.compose(tmpV, tmpQ, tmpS); this.halo.setMatrixAt(nh, tmpM); setC(this.halo, nh++, 0xff2020, 0.5); }
      marks.push({ x: e.x * S, z: e.y * S, color: '#ff6a4a', label: '蜘' });
    }
    // 敵弾の足元に影（避けやすく）
    for (const u of G.bullets) {
      if (nh >= 96) break;
      tmpM.compose(tmpV.set(u.x * S, 0.04, u.y * S), tmpQ.identity(), tmpS.set(0.5, 1, 0.5));
      this.halo.setMatrixAt(nh, tmpM); setC(this.halo, nh++, 0xd84aff, 0.9);
    }
    if (b) marks.push({ x: b.x * S, z: b.y * S, color: '#ff3040', label: '骸', boss: true });
    const mb = G.midBoss;
    if (mb && mb.alive) {
      marks.push({ x: mb.x * S, z: mb.y * S, color: '#ff8a3a', label: mb.type === 'orochi' ? '蛇' : '法', boss: true });
      const r = mb.r * S * 1.5 * (1 + Math.sin(t * 5) * 0.06);
      tmpM.compose(tmpV.set(mb.x * S, 0.04, mb.y * S), tmpQ.identity(), tmpS.set(r, 1, r));
      if (nr < 64) { this.ringD.setMatrixAt(nr, tmpM); setC(this.ringD, nr++, 0xff5020, 1.3); }
    }
    this.beam.count = nb2; this.halo.count = nh; this.ringD.count = nr;
    for (const m of [this.beam, this.halo, this.ringD]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    // ボス突進の予告帯
    const tb = b && b.ai && b.ai.state === 'tele' ? b : mb && mb.alive && mb.ai && mb.ai.state === 'tele' ? mb : null;
    if (tb) {
      const b = tb;
      const l = Math.hypot(b.ai.dx, b.ai.dy) || 1;
      this.tele.visible = true;
      this.tele.position.set(b.x * S, 0.05, b.y * S);
      this.tele.rotation.y = Math.atan2(-b.ai.dx / l, -b.ai.dy / l);
      this.tele.scale.set(b.r * S * 2.2, 1, 15);
      this.tele.material.opacity = 0.3 + 0.3 * Math.abs(Math.sin(t * 14));
    } else this.tele.visible = false;
    this.updateMarkers(marks);

    // ---- 仕上げ ----
    const u = this.final.uniforms;
    u.uTime.value = t;
    u.uCA.value = Math.min(1, G.shake * 1.2 + G.hurtFlash);
    const low = P.hp / P.maxHp < 0.25 ? 0.08 + Math.sin(t * 6) * 0.04 : 0;
    u.uRed.value = Math.max(G.hurtFlash * 0.4, G.redPulse > 0 ? (Math.sin(t * 10) * 0.5 + 0.5) * Math.min(1, G.redPulse) * 0.25 : 0, low * 1.5);
    u.uFlash.value = Math.min(0.8, G.flash);
    FX.drawTexts(rdt, this.w, this.h);
    this.comp.render(rdt);
  },

  // 画面外の重要目標（宝箱・エリート・ボス）を画面端の矢印で示す
  updateMarkers(list) {
    if (!this.markLayer) return;
    const W = this.w, H = this.h, m = 34;
    while (this.marks.length < list.length) {
      const el = document.createElement('div');
      el.className = 'mark';
      el.innerHTML = '<i></i><b></b>';
      this.markLayer.appendChild(el);
      this.marks.push(el);
    }
    const v = new THREE.Vector3();
    this.marks.forEach((el, i) => {
      const it = list[i];
      if (!it || G_STATE() !== 'play') { el.style.display = 'none'; return; }
      v.set(it.x, 1.2, it.z).project(this.cam);
      const behind = v.z > 1;
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      if (behind) { sx = W - sx; sy = H - sy; }
      const on = !behind && sx > m && sx < W - m && sy > m && sy < H - m;
      if (on) { el.style.display = 'none'; return; }
      const cx = W / 2, cy = H / 2;
      let dx = sx - cx, dy = sy - cy;
      if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
      const ex = cx + dx * k, ey = cy + dy * k;
      el.style.display = '';
      el.style.setProperty('--c', it.color);
      el.style.transform = `translate(${ex.toFixed(0)}px, ${ey.toFixed(0)}px)`;
      el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(2)}rad)`;
      el.lastChild.textContent = it.label;
      el.classList.toggle('boss', !!it.boss);
    });
  },

  // ゲーム側からの通知：撃破した妖怪を「跳ねて消える」演出用に記録
  onKill(e) {
    if (!this.units || e.boss) return;
    const u = this.units[e.def.model];
    if (!u || this.dying.length > 120) return;
    const a = Math.random() * Math.PI * 2;
    this.dying.push({ model: e.def.model, x: e.x * S, z: e.y * S, vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, yaw: e.yawR || 0, t: 0, ph: e.at * 0.22, k: 1, spin: Math.random() < 0.5 ? -1 : 1 });
  },
  resetRun() {
    this.dying.length = 0;
    this.ward = null;
    input.camYaw = 0;
    this.camPos.set(0, 8, 10);
  },
};

let G_STATE = () => 'play';
export function setStateGetter(f) { G_STATE = f; }

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
