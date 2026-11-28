// ゲーム本体:プレイヤー・敵・戦闘・拾得物・探索地点・ボス・難易度の進行
import * as THREE from 'three';
import { World, BIOMES, CHUNK } from '../world/world.js';
import { enemyGeometry, buildHero, itemGeometry, projectileGeometry } from '../render/models.js';
import { makeFlashMaterial } from '../render/renderer.js';
import { Particles, Rings, Numbers } from '../fx/fx.js';
import { WEAPONS, PASSIVES, RELICS, BLESSINGS, HEROES, ENEMIES, SPAWN_TABLE, NIGHT_EXTRA, BOSS_ORDER, BASE_WEAPONS } from './data.js';
import { newWeapon, updateWeapon, weaponStats } from './weapons.js';
import { SpatialGrid, TAU, clamp, rand, randInt, pick, shuffle, weightedPick, lerp, damp } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const MAX_SLOTS = 6;
const tmp = [];
const tmp2 = [];

const ENEMY_COLORS = { slime: '#6fd36b', bat: '#8a6fc0', goblin: '#6aa84f', skeleton: '#f2ecd9', wolf: '#b8c2d1', beetle: '#3f8faf', eye: '#ff5aa0', ghost: '#cfe8ff', golem: '#ff7a1a', crystal: '#d9a8ff', imp: '#ff5a3a', treant: '#58b84a', witch: '#aef4ff', wyrm: '#ffcc66', voidking: '#c060ff' };

export class Game {
  constructor(renderer, audio, save) {
    this.r = renderer;
    this.scene = renderer.scene;
    this.audio = audio;
    this.save = save;
    this.fx = new Particles(this.scene);
    this.rings = new Rings(this.scene);
    this.numbers = new Numbers(document.getElementById('fx2d'));
    this.grid = new SpatialGrid(3);
    this.events = {}; // UIへの通知先
    this.running = false;
    this.title = true;
    this.initViews();
  }
  on(name, fn) { this.events[name] = fn; }
  emit(name, ...a) { this.events[name] && this.events[name](...a); }

  // ===== 描画オブジェクトの準備 =====
  initViews() {
    this.enemyViews = {};
    const mat = makeFlashMaterial();
    for (const k of Object.keys(ENEMIES)) {
      const def = ENEMIES[k];
      const geo = enemyGeometry(def.model || k);
      const cap = def.cap;
      const flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      flash.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFlash', flash);
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.enemyViews[k] = { mesh, flash, cap };
    }
    // 弾
    this.projViews = {};
    const pmat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    pmat.color.setRGB(1.8, 1.8, 1.8);
    for (const [k, cap] of Object.entries({ bolt: 300, star: 200, arrow: 500, flask: 60, boomerang: 60, meteor: 30, orb: 400, blade: 40 })) {
      const mesh = new THREE.InstancedMesh(projectileGeometry(k), pmat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.projViews[k] = { mesh, cap, n: 0 };
    }
    // 拾得物
    this.itemViews = {};
    const imat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const imatL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#222' });
    for (const [k, cap] of Object.entries({ gem: 1600, coin: 400, meat: 40, magnet: 20, bomb: 20, chest: 20 })) {
      const m = k === 'gem' || k === 'coin' ? imat : imatL;
      const mesh = new THREE.InstancedMesh(itemGeometry(k), m, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (k === 'gem') mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = k !== 'gem';
      this.scene.add(mesh);
      this.itemViews[k] = { mesh, cap };
    }
    this.heroMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.heroMat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlash = this.heroFlash = { value: 0 };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlash;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0,0.3,0.3), uFlash);');
    };
    // オーラ
    this.auraMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.auraMesh.rotation.x = -Math.PI / 2; this.auraMesh.position.y = 0.06; this.auraMesh.visible = false;
    this.auraRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), this.auraMesh.material.clone());
    this.auraRing.material.opacity = 0.5;
    this.auraRing.rotation.x = -Math.PI / 2; this.auraRing.position.y = 0.07; this.auraRing.visible = false;
    this.scene.add(this.auraMesh, this.auraRing);
    // 回収範囲・ダッシュ・シールド表示
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: '#c78bff', transparent: true, opacity: 0.25, wireframe: true, toneMapped: false }));
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
    // 光の柱(遠くからでも見える目印)
    this.beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 60, 8, 1, true);
    this.beamGeo.translate(0, 30, 0);
  }

  // ===== ラン開始 =====
  start(heroId) {
    this.cleanup();
    this.title = false;
    this.heroId = heroId;
    const seed = (Math.random() * 1e9) | 0;
    this.world = new World(this.scene, seed);
    this.world.onPoiSpawn = (p) => this.onPoiSpawn(p);
    this.world.onPoiDespawn = (p) => this.onPoiDespawn(p);
    const hero = HEROES[heroId];
    this.hero = buildHero(heroId, this.heroMat);
    this.scene.add(this.hero);
    this.player = { x: 0, z: 0, vx: 0, vz: 0, fx: 1, fz: 0, hp: 100, level: 1, xp: 0, xpNeed: 5, weapons: [], passives: {}, relics: [], dashCd: 0, dashT: 0, iframe: 0, hurtT: 0, walk: 0, shield: false, shieldT: 0, revives: 0, dead: false, regenBuff: 0 };
    this.blessings = [];
    this.runStats = { kills: 0, gold: 0, time: 0, level: 1, maxCombo: 0, fevers: 0, chests: 0, bosses: 0, seals: 0, evolves: 0, relics: 0, biomes: 0, dmg: {}, won: false };
    this.visited = new Set();
    this.enemies = [];
    this.projs = [];
    this.ebullets = [];
    this.items = [];
    this.zones = [];
    this.props = [];
    this.pending = [];
    this.beams = new Map();
    this.time = 0;
    this.spawnAcc = 0;
    this.nextEvent = 45;
    this.eventIdx = 0;
    this.combo = 0; this.comboT = 0;
    this.fever = 0; this.feverT = 0; this.feverNeed = 200; this.feverCount = 0;
    this.bosses = [];
    this.sealsBroken = 0;
    this.finalSpawned = false;
    this.challenge = null;
    this.shrineCharge = null;
    this.hitstop = 0;
    this.slowmo = 0;
    this.rerolls = this.shopLv('reroll') + 1;
    this.banishes = this.shopLv('banish');
    this.banished = new Set();
    this.idSeq = 1;
    this.dmgMul = 1; this.cdMul = 1;
    this.gravT = 20; this.shieldTimer = 0;
    this.biome = 'meadow';
    this.pendingLevels = 0;
    this.levelDelay = 0;
    this.nightPrev = false;
    this.player.revives = this.shopLv('revive');
    this.computeStats();
    this.player.hp = this.stats.maxHp;
    this.addWeapon(hero.weapon);
    this.world.update(0, 0, 0);
    this.exploredSeen = this.world.explored.size;
    this.newLand = 0;
    this.running = true;
    this.over = false;
    this.r._cx = undefined;
    this.emit('start');
    this.emit('banner', BIOMES.meadow.name, '冒険の始まり');
    this.visit('meadow');
  }
  cleanup() {
    if (this.world) this.world.dispose();
    if (this.hero) this.scene.remove(this.hero);
    if (this.beams) for (const b of this.beams.values()) this.scene.remove(b);
    for (const v of Object.values(this.enemyViews)) v.mesh.count = 0;
    for (const v of Object.values(this.projViews)) v.mesh.count = 0;
    for (const v of Object.values(this.itemViews)) v.mesh.count = 0;
    this.fx.clear(); this.rings.clear(); this.numbers.clear();
    this.auraMesh.visible = this.auraRing.visible = false;
    this.world = null;
  }
  shopLv(id) { return this.save.shop[id] || 0; }

  computeStats() {
    const s = { might: 1, cooldown: 1, area: 1, duration: 1, amount: 0, speedMul: 1, move: 1, magnet: 1, maxHp: 100, regen: 0, armor: 0, crit: 0.05, critMult: 2, luck: 0, growth: 1, greed: 1, knock: 1 };
    const h = HEROES[this.heroId].stats;
    for (const [k, v] of Object.entries(h)) { if (k === 'cooldown') s.cooldown *= v; else s[k] += v; }
    const L = (id) => this.shopLv(id);
    s.might += L('might') * 0.05; s.maxHp += L('maxhp') * 10; s.regen += L('regen') * 0.15; s.armor += L('armor');
    s.move += L('move') * 0.04; s.cooldown *= Math.pow(0.97, L('cooldown')); s.area += L('area') * 0.05; s.magnet += L('magnet') * 0.15;
    s.growth += L('growth') * 0.05; s.greed += L('greed') * 0.1; s.crit += L('luck') * 0.02;
    for (const [id, lv] of Object.entries(this.player.passives)) for (let i = 1; i <= lv; i++) PASSIVES[id].apply(s, i);
    for (const id of this.blessings) BLESSINGS.find((b) => b.id === id).apply(s, null);
    const R = (id) => this.player.relics.includes(id);
    if (R('twin')) s.amount += 1;
    if (R('harvest')) { s.growth += 0.3; s.magnet += 0.5; }
    if (R('bloodpact')) { s.growth += 0.6; s.greed += 0.6; }
    if (R('overload')) s.cooldown *= 0.9;
    this.stats = s;
    this.player.hp = Math.min(this.player.hp, s.maxHp);
    this.emit('inventory');
  }
  hasRelic(id) { return this.player.relics.includes(id); }

  // ===== メインループ =====
  update(rawDt) {
    if (!this.running) return;
    let dt = Math.min(rawDt, 1 / 20);
    if (this.hitstop > 0) { this.hitstop -= rawDt; dt *= 0.08; }
    if (this.slowmo > 0) { this.slowmo -= rawDt; dt *= 0.3; }
    if (this.levelDelay > 0) {
      this.levelDelay -= rawDt;
      dt *= 0.15;
      if (this.levelDelay <= 0) this.emit('levelup');
    }
    this.time += dt;
    this.runStats.time = this.time;
    const p = this.player;
    const s = this.stats;
    // 秘宝などによる倍率
    this.dmgMul = 1;
    if (this.hasRelic('berserk')) this.dmgMul *= 1 + (1 - p.hp / s.maxHp);
    if (this.hasRelic('midas')) this.dmgMul *= 1 + Math.min(0.6, this.runStats.gold / 50 / 100);
    if (this.feverT > 0) this.dmgMul *= 1.3;
    this.cdMul = 1;
    if (this.feverT > 0) this.cdMul *= 0.5;
    const moving = Math.hypot(p.vx, p.vz) > 0.5;
    if (this.hasRelic('haste') && moving) this.cdMul *= 0.75;

    this.updatePlayer(dt);
    this.world.update(p.x, p.z, dt);
    this.updateBiome();
    // 探索ボーナス:新しい土地を踏むほどゴールド
    const ex = this.world.explored.size;
    if (ex > this.exploredSeen) {
      this.exploredSeen = ex;
      this.newLand = (this.newLand || 0) + 1;
      if (this.newLand % 12 === 0) {
        const gold = 15 * (1 + (this.danger || 0));
        this.addGold(gold, true);
        this.audio.play('coin');
        this.emit('toast', `未踏の地を踏破 +${gold}G`, '#ffd24a');
      }
    }
    this.director(dt);
    // 敵を空間グリッドへ
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e, e.x, e.z);
    this.auraMesh.visible = this.auraRing.visible = false;
    this.bladeList = null;
    for (const w of p.weapons) updateWeapon(this, w, dt);
    this.updateEnemies(dt);
    this.updateProjs(dt);
    this.updateEBullets(dt);
    this.updateZones(dt);
    this.updatePending(dt);
    this.updateItems(dt);
    this.updatePois(dt);
    this.updateCombo(dt);
    this.updateRelicTimers(dt);
    // 死亡判定
    if (p.hp <= 0 && !p.dead) this.playerDown();
    this.compactEnemies();
    this.render(dt, rawDt);
  }

  updatePlayer(dt) {
    const p = this.player, s = this.stats;
    const inp = this.input;
    let ix = inp.x, iz = inp.z;
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    const spd = 6.2 * s.move * (this.feverT > 0 ? 1.2 : 1);
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashVx; p.vz = p.dashVz;
      if (Math.random() < 0.8) this.fx.emit(p.x, 0.5, p.z, 2, '#cfe8ff', { speed: 1, up: 1, size: 0.25, life: 0.3, grav: 0, glow: 1.5 });
    } else {
      p.vx = damp(p.vx, ix * spd, 14, dt);
      p.vz = damp(p.vz, iz * spd, 14, dt);
    }
    if (il > 0.1) { p.fx = ix / Math.max(il, 1e-3); p.fz = iz / Math.max(il, 1e-3); }
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.dashCd -= dt;
    if (inp.dash) {
      inp.dash = false;
      if (p.dashCd <= 0) this.dash();
    }
    p.iframe -= dt; p.hurtT -= dt;
    // 回復
    p.hp = Math.min(s.maxHp, p.hp + (s.regen + (p.regenBuff > 0 ? 3 : 0)) * dt);
    p.regenBuff -= dt;
    // 見た目
    const h = this.hero;
    const sp = Math.hypot(p.vx, p.vz);
    p.walk += dt * sp * 1.6;
    const sw = Math.sin(p.walk) * Math.min(1, sp / 4);
    const U = h.userData;
    U.legL.rotation.x = sw * 0.8; U.legR.rotation.x = -sw * 0.8;
    U.armL.rotation.x = -sw * 0.7; U.armR.rotation.x = sw * 0.7;
    U.cape.rotation.x = 0.15 + Math.min(0.9, sp / 8);
    const bob = Math.abs(Math.sin(p.walk)) * 0.08 * Math.min(1, sp / 4);
    U.torso.position.y = 0.85 + bob; U.head.position.y = 1.43 + bob;
    h.position.set(p.x, p.dashT > 0 ? 0.15 : 0, p.z);
    const targetRot = Math.atan2(p.fx, p.fz);
    let dr = targetRot - h.rotation.y;
    while (dr > Math.PI) dr -= TAU; while (dr < -Math.PI) dr += TAU;
    h.rotation.y += dr * Math.min(1, dt * 14);
    h.rotation.z = p.dashT > 0 ? 0 : 0;
    const sq = p.dashT > 0 ? 0.85 : 1;
    h.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (this.heroFlash) this.heroFlash.value = Math.max(0, p.hurtT * 2.5);
    h.visible = !(p.iframe > 0 && p.dashT <= 0 && Math.floor(this.time * 20) % 2 === 0);
    if (sp > 2 && Math.random() < dt * 6) this.fx.emit(p.x, 0.1, p.z, 1, BIOMES[this.biome].ground[0], { speed: 1, up: 1.5, size: 0.18, life: 0.4 });
    this.shieldMesh.visible = p.shield;
    if (p.shield) { this.shieldMesh.position.set(p.x, 1, p.z); this.shieldMesh.rotation.y += dt * 2; }
  }
  dash() {
    const p = this.player;
    const cd = this.hasRelic('gale') ? 1.3 : 2.2;
    p.dashCd = cd; p.dashMax = cd;
    p.dashT = 0.16;
    p.iframe = Math.max(p.iframe, 0.32);
    p.dashVx = p.fx * 34; p.dashVz = p.fz * 34;
    this.audio.play('dash');
    this.rings.spawn('ring', p.x, p.z, { color: '#cfe8ff', r0: 0.4, r1: 2.2, life: 0.3, opacity: 0.8 });
    if (this.hasRelic('gale')) {
      this.pending.push({ t: 0.16, fn: () => {
        this.rings.spawn('ring', p.x, p.z, { color: '#9cff6b', r0: 0.5, r1: 6, life: 0.35, opacity: 1 });
        this.hitArea(p.x, p.z, 6, 25 * this.stats.might, { id: 'gale' }, 0, { radial: true, kb: 14 });
      } });
    }
  }
  hurt(dmg, src = 'other') {
    const p = this.player;
    if (p.iframe > 0 || p.dead || this.over) return;
    if (p.shield) {
      p.shield = false; this.shieldTimer = 12;
      p.iframe = 0.5;
      this.rings.spawn('sphere', p.x, p.z, { color: '#c78bff', r0: 1, r1: 3, life: 0.35, opacity: 0.6, y: 1 });
      this.audio.play('nova');
      return;
    }
    const d = Math.max(1, dmg - this.stats.armor);
    p.hp -= d;
    this.runStats.taken = this.runStats.taken || {};
    this.runStats.taken[src] = (this.runStats.taken[src] || 0) + d;
    p.iframe = 0.5;
    p.hurtT = 0.4;
    this.r.addShake(0.35);
    this.audio.play('hurt');
    this.numbers.add(p.x, 2.2, p.z, `-${Math.round(d)}`, { color: '#ff5050', size: 22 });
    this.fx.emit(p.x, 1, p.z, 10, '#ff4040', { speed: 5, size: 0.2 });
    this.emit('hurt');
    // 近くの敵を少し押し返して囲まれ詰みを防ぐ
    this.grid.query(p.x, p.z, 2.5, tmp);
    for (const e of tmp) { if (e.boss) continue; const dx = e.x - p.x, dz = e.z - p.z, l = Math.hypot(dx, dz) || 1; e.kx += (dx / l) * 9; e.kz += (dz / l) * 9; }
  }
  heal(v, show = true) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + v);
    if (show && p.hp - before >= 1) this.numbers.add(p.x, 2.4, p.z, `+${Math.round(p.hp - before)}`, { color: '#6bff8a', size: 20 });
  }
  playerDown() {
    const p = this.player;
    if (p.revives > 0 || this.hasRelic('phoenix')) {
      if (this.hasRelic('phoenix') && !p.phoenixUsed) p.phoenixUsed = true; else p.revives--;
      p.hp = this.stats.maxHp;
      p.iframe = 2.5;
      this.slowmo = 0.6;
      this.emit('banner', '復活!', '炎の中から立ち上がる');
      this.audio.play('evolve');
      this.bigBlast(p.x, p.z, 14, 500 * this.stats.might, '#ff9a3c');
      return;
    }
    p.dead = true;
    this.over = true;
    this.slowmo = 1.2;
    this.audio.play('lose');
    this.fx.emit(p.x, 1, p.z, 60, '#ff5050', { speed: 8, up: 7, size: 0.3, life: 1.2 });
    this.hero.visible = false;
    setTimeout(() => this.endRun(false), 1400);
  }
  endRun(won) {
    if (!this.running) return;
    this.running = false;
    this.runStats.won = won;
    this.runStats.level = this.player.level;
    this.emit('end', this.runStats);
  }

  // ===== 地域 =====
  updateBiome() {
    const p = this.player;
    const b = this.world.biomeAt(p.x, p.z);
    if (b !== this.biome) {
      this.biome = b;
      this.biomeHold = 0;
    }
    this.biomeHold = (this.biomeHold || 0) + 1;
    if (this.biomeHold === 40 && this.shownBiome !== b) {
      this.shownBiome = b;
      const dg = this.world.dangerAt(p.x, p.z);
      this.emit('banner', BIOMES[b].name, '危険度 ' + '★'.repeat(dg + 1) + '☆'.repeat(5 - dg));
      this.visit(b);
    }
  }
  visit(b) {
    if (!this.visited.has(b)) { this.visited.add(b); this.runStats.biomes = this.visited.size; }
  }
  isNight() {
    const t = this.time % 300;
    return this.time > 200 && t > 240;
  }
  nightAmount() {
    if (this.time < 200) return 0;
    const t = this.time % 300;
    if (t < 230) return 0;
    if (t < 240) return (t - 230) / 10;
    if (t > 295) return (300 - t) / 5;
    return 1;
  }

  // ===== 敵の出現(ディレクター) =====
  director(dt) {
    const p = this.player;
    const tmin = this.time / 60;
    const danger = this.world.dangerAt(p.x, p.z);
    this.danger = danger;
    const night = this.isNight();
    if (night !== this.nightPrev) {
      this.nightPrev = night;
      if (night) { this.emit('banner', '血月の夜', '魔物が活性化する。経験値 +50%'); this.audio.play('warn'); }
    }
    let rate = (3.6 + tmin * 2.6 + tmin * tmin * 0.08 + danger * 1.2) * (night ? 1.8 : 1) * (this.hasRelic('bloodpact') ? 1.5 : 1);
    if (this.challenge) rate *= 2.2;
    if (this.bosses.length) rate *= 0.6;
    const maxAlive = Math.min(720, 90 + tmin * 45 + danger * 45);
    this.spawnAcc += rate * dt;
    let alive = this.enemies.length;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (alive >= maxAlive) continue;
      const a = Math.random() * TAU;
      const d = rand(24, 30);
      // 進行方向側に少し多く湧かせる
      const bias = Math.hypot(p.vx, p.vz) > 1 ? 0.5 : 0;
      const ax = Math.cos(a) + p.fx * bias, az = Math.sin(a) + p.fz * bias;
      const l = Math.hypot(ax, az) || 1;
      const sx = p.x + (ax / l) * d, sz = p.z + (az / l) * d;
      if (this.challenge && Math.random() < 0.5) {
        const c = this.challenge;
        const ca = Math.random() * TAU;
        this.spawnEnemy(this.pickType(sx, sz), c.x + Math.cos(ca) * 22, c.z + Math.sin(ca) * 22);
      } else this.spawnEnemy(this.pickType(sx, sz), sx, sz);
      alive++;
    }
    // 定期イベント
    if (this.time >= this.nextEvent) {
      this.nextEvent += 55;
      this.eventIdx++;
      const kind = ['ring', 'swarm', 'elite', 'ring', 'swarm', 'horde'][this.eventIdx % 6];
      this.waveEvent(kind);
    }
    // 制限時間で最終ボス
    if (!this.finalSpawned && this.time >= 20 * 60) {
      this.emit('banner', '時は満ちた', '虚ろの王が目覚める');
      this.spawnFinal();
    }
  }
  pickType(x, z) {
    const biome = this.world.biomeAt(x, z);
    const tmin = this.time / 60 + this.world.dangerAt(x, z) * 1.4;
    const tab = { ...SPAWN_TABLE[biome] };
    if (this.isNight()) for (const [k, v] of Object.entries(NIGHT_EXTRA)) tab[k] = (tab[k] || 0) + v;
    const keys = Object.keys(tab).filter((k) => ENEMIES[k].from <= tmin);
    if (!keys.length) return 'slime';
    // 序盤の弱い敵は時間と共に減る
    return weightedPick(keys, (k) => tab[k] * (ENEMIES[k].from < 1 && tmin > 8 ? 0.4 : 1));
  }
  hpScale(x, z) {
    const tmin = this.time / 60;
    const dg = this.world.dangerAt(x, z);
    return (1 + tmin * 0.2 + tmin * tmin * 0.028) * (1 + dg * 0.45);
  }
  spawnEnemy(type, x, z, opt = {}) {
    const def = ENEMIES[type];
    const view = this.enemyViews[type];
    let cnt = 0;
    for (const e of this.enemies) if (e.type === type) cnt++;
    if (cnt >= view.cap) return null;
    const elite = opt.elite || (!def.boss && Math.random() < 0.003 + this.time / 60 * 0.0006);
    const hs = this.hpScale(x, z);
    const hp = (opt.hp || def.hp * hs) * (elite ? 14 : 1);
    const dg = this.world.dangerAt(x, z);
    const e = {
      id: this.idSeq++, type, def, x, z, kx: 0, kz: 0, hp, maxHp: hp,
      spd: def.spd * (1 + Math.min(0.35, this.time / 60 * 0.015)) * rand(0.9, 1.1) * (elite ? 0.9 : 1),
      dmg: def.boss ? def.dmg * (1 + this.time / 60 * 0.03) : def.dmg * (1 + this.time / 60 * 0.075 + dg * 0.25) * (elite ? 1.5 : 1),
      r: def.r * (elite ? 1.6 : 1) * (opt.scale || 1), scale: (elite ? 1.6 : 1) * (opt.scale || 1),
      xp: def.xp * (1 + dg * 0.3) * (elite ? 20 : 1), elite, boss: !!def.boss,
      flash: 0, frozen: 0, burn: 0, phase: Math.random() * 10, t: rand(0, 3), state: 0, spawnT: 0.35, dead: false, small: opt.small,
    };
    if (e.boss) { e.patternT = 2.5; e.pi = 0; e.spawnT = 1.2; }
    this.enemies.push(e);
    return e;
  }
  waveEvent(kind) {
    const p = this.player;
    const tmin = this.time / 60;
    const type = this.pickType(p.x, p.z);
    if (kind === 'ring') {
      const n = Math.min(80, 26 + Math.floor(tmin * 5));
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.spawnEnemy(type, p.x + Math.cos(a) * 19, p.z + Math.sin(a) * 19); }
      this.emit('toast', '包囲網!', '#ff6b6b');
      this.audio.play('warn');
    } else if (kind === 'swarm') {
      const a0 = Math.random() * TAU;
      const n = Math.min(70, 25 + Math.floor(tmin * 4));
      for (let i = 0; i < n; i++) {
        const a = a0 + rand(-0.35, 0.35);
        const d = rand(23, 34);
        const e = this.spawnEnemy('bat', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
        if (e) e.spd *= 1.3;
      }
      this.emit('toast', '大群が来る!', '#b98bff');
    } else if (kind === 'elite') {
      const a = Math.random() * TAU;
      this.spawnEnemy(type, p.x + Math.cos(a) * 22, p.z + Math.sin(a) * 22, { elite: true });
      for (let i = 0; i < 12; i++) this.spawnEnemy(type, p.x + Math.cos(a) * 22 + rand(-3, 3), p.z + Math.sin(a) * 22 + rand(-3, 3));
      this.emit('toast', '強敵出現!宝箱を持っている', '#ffd24a');
      this.audio.play('warn');
    } else if (kind === 'horde') {
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * TAU;
        for (let i = 0; i < 14 + tmin * 2; i++) this.spawnEnemy(type, p.x + Math.cos(a) * 25 + rand(-4, 4), p.z + Math.sin(a) * 25 + rand(-4, 4));
      }
      this.emit('toast', '魔物の行進!', '#ff9a3c');
    }
  }

  // ===== 敵の更新 =====
  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 7);
      e.t += dt;
      if (e.spawnT > 0) e.spawnT -= dt;
      let dx = p.x - e.x, dz = p.z - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      dx /= dist; dz /= dist;
      // 遠すぎる敵はプレイヤーの近くに配置し直す(群れの密度を保つ)
      if (dist > 50 && !e.boss) {
        const a = Math.random() * TAU;
        e.x = p.x + p.fx * 26 + Math.cos(a) * 6; e.z = p.z + p.fz * 26 + Math.sin(a) * 6;
        continue;
      }
      if (e.burn > 0) {
        e.burn -= dt;
        e.burnTick = (e.burnTick || 0) - dt;
        if (e.burnTick <= 0) { e.burnTick = 0.5; this.damage(e, e.burnDmg, { id: 'burn' }, { noKb: true, noCrit: true }); if (e.dead) continue; }
      }
      let vx = 0, vz = 0;
      if (e.frozen > 0) { e.frozen -= dt; }
      else if (e.boss) {
        const v = this.updateBoss(e, dt, dx, dz, dist);
        vx = v[0]; vz = v[1];
      } else {
        let sp = e.spd;
        const D = e.def;
        if (D.erratic) { const w = Math.sin(e.t * 3 + e.phase) * 0.9; vx = (dx - dz * w) * sp; vz = (dz + dx * w) * sp; }
        else if (D.charger) {
          // 身構え(0.45秒) → 直線で飛びかかる(0.5秒) → 3秒休む。横に避けられる
          e.state -= dt;
          if (e.mode === 1) { vx = 0; vz = 0; e.flash = Math.max(e.flash, 0.35); if (e.state <= 0) { e.mode = 2; e.state = 0.5; } }
          else if (e.mode === 2) { vx = e.cdx * sp * 2.8; vz = e.cdz * sp * 2.8; if (e.state <= 0) { e.mode = 0; e.state = 3; } }
          else {
            vx = dx * sp * 0.8; vz = dz * sp * 0.8;
            if (e.state <= 0 && dist < 9 && dist > 3) { e.mode = 1; e.state = 0.45; e.cdx = dx; e.cdz = dz; }
          }
        } else if (D.shooter) {
          const want = dist > 9 ? 1 : dist < 6 ? -0.6 : 0.15;
          vx = (dx * want - dz * 0.4) * sp; vz = (dz * want + dx * 0.4) * sp;
          e.state -= dt;
          if (e.state <= 0 && dist < 18) {
            e.state = rand(2.6, 3.6);
            this.enemyShot(e.x, e.z, Math.atan2(dz, dx), 7, e.dmg * 0.8);
          }
        } else { vx = dx * sp; vz = dz * sp; }
        if (e.spawnT > 0) { vx *= 0.2; vz *= 0.2; }
      }
      // 押し合い(重ならないように)
      if (!e.boss) {
        const near = this.grid.query(e.x, e.z, e.r * 2, tmp);
        let sx = 0, sz = 0, cnt = 0;
        for (let i = 0; i < near.length && cnt < 6; i++) {
          const o = near[i];
          if (o === e) continue;
          const ox = e.x - o.x, oz = e.z - o.z;
          const rr = e.r + o.r;
          const d2 = ox * ox + oz * oz;
          if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); const f = (rr - d) / rr; sx += (ox / d) * f; sz += (oz / d) * f; cnt++; }
        }
        vx += sx * 5; vz += sz * 5;
      }
      e.kx *= Math.exp(-7 * dt); e.kz *= Math.exp(-7 * dt);
      e.x += (vx + e.kx) * dt; e.z += (vz + e.kz) * dt;
      e.vx = vx; e.vz = vz;
      // 接触ダメージ
      if (dist < e.r + 0.45 && e.spawnT <= 0 && e.frozen <= 0) this.hurt(e.dmg, e.type);
    }
  }
  compactEnemies() {
    let j = 0;
    for (let i = 0; i < this.enemies.length; i++) { const e = this.enemies[i]; if (!e.dead) this.enemies[j++] = e; }
    this.enemies.length = j;
  }

  // ===== ダメージ処理 =====
  damage(e, dmg, src, o = {}) {
    if (e.dead) return 0;
    const s = this.stats;
    let crit = false;
    if (!o.noCrit && Math.random() < s.crit) { dmg *= s.critMult; crit = true; }
    if (e.frozen > 0 && this.hasRelic('frostheart')) dmg *= 1.5;
    if (o.shatter && e.frozen > 0) dmg *= 2;
    dmg *= rand(0.92, 1.08);
    e.hp -= dmg;
    e.flash = 1;
    const key = src.id || 'other';
    this.runStats.dmg[key] = (this.runStats.dmg[key] || 0) + Math.min(dmg, e.hp + dmg);
    if (!o.noKb && !e.boss) {
      const kb = (o.kb ?? 2.5) * s.knock * (e.elite ? 0.3 : 1);
      if (o.kx !== undefined) { e.kx += o.kx * kb; e.kz += o.kz * kb; }
      else { const dx = e.x - this.player.x, dz = e.z - this.player.z, l = Math.hypot(dx, dz) || 1; e.kx += (dx / l) * kb; e.kz += (dz / l) * kb; }
    }
    if (o.freeze) { e.frozen = Math.max(e.frozen, e.boss ? o.freeze * 0.2 : o.freeze); }
    else if (this.hasRelic('frostheart') && Math.random() < 0.08) e.frozen = e.boss ? 0.3 : 1.5;
    if (o.burn) { e.burn = 3; e.burnDmg = o.burn; }
    if (this.settingsNumbers !== false) {
      const big = dmg > 100;
      this.numbers.add(e.x, 1.6 * e.scale + 0.4, e.z, crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`, { color: crit ? '#ffe14d' : e.boss ? '#ffb0ff' : '#ffffff', size: crit ? 24 : big ? 19 : 15, crit });
    }
    if (crit) {
      this.audio.play('crit');
      if (this.hasRelic('thunder') && src.id !== 'thunderRelic' && Math.random() < 0.5) this.lightning(e, 25 * s.might, 1, { id: 'thunderRelic' }, 0.8);
    } else if (!o.noSound) this.audio.play('hit');
    if (e.boss) { this.emit('bosshp'); if (dmg > 200) this.hitstop = Math.max(this.hitstop, 0.03); }
    if (e.hp <= 0) this.kill(e, src);
    return dmg;
  }
  // 範囲内の敵すべてに当てる(同じ敵には cooldown 秒ごと)
  hitArea(x, z, r, dmg, w, cooldown, o = {}) {
    const c = this.grid.query(x, z, r + 1.2, tmp).slice();
    let hits = 0;
    for (const e of c) {
      if (e.dead) continue;
      const dx = e.x - x, dz = e.z - z;
      const rr = r + e.r;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (cooldown > 0) {
        const last = w.hits && w.hits.get(e.id);
        if (last !== undefined && this.time - last < cooldown) continue;
        w.hits && w.hits.set(e.id, this.time);
      }
      const opt = { ...o };
      if (o.radial) { const l = Math.hypot(dx, dz) || 1; opt.kx = dx / l; opt.kz = dz / l; }
      this.damage(e, dmg, w, opt);
      hits++;
    }
    if (w.hits && w.hits.size > 2000) w.hits.clear();
    this.hitProps(x, z, r);
    return hits;
  }
  lightning(target, dmg, chains, src, scale = 1) {
    let cur = target;
    const hit = new Set();
    let px = target.x, pz = target.z;
    this.rings.spawn('pillar', target.x, target.z, { color: '#fff7a0', r0: 0.5 * scale, r1: 0.1, life: 0.25, opacity: 1, height: 14 });
    this.rings.spawn('ring', target.x, target.z, { color: '#fff36b', r0: 0.3, r1: 2.2 * scale, life: 0.3, opacity: 1 });
    this.fx.emit(target.x, 0.5, target.z, 10, '#fff7a0', { speed: 7, up: 5, size: 0.16, life: 0.4, glow: 2 });
    this.audio.play('thunder');
    let d = dmg;
    for (let i = 0; i <= chains && cur; i++) {
      hit.add(cur.id);
      if (i > 0) {
        const dx = cur.x - px, dz = cur.z - pz, len = Math.hypot(dx, dz);
        this.rings.spawn('line', (cur.x + px) / 2, (cur.z + pz) / 2, { color: '#fffbcf', life: 0.18, opacity: 1, y: 1, rotY: -Math.atan2(dz, dx) + Math.PI / 2, len, w: 0.2 });
      }
      px = cur.x; pz = cur.z;
      this.damage(cur, d, src, { kb: 1.5, noSound: true });
      d *= 0.85;
      const near = this.grid.query(cur.x, cur.z, 5 * scale, tmp);
      let best = null, bd = 1e9;
      for (const e of near) { if (e.dead || hit.has(e.id)) continue; const dd = (e.x - cur.x) ** 2 + (e.z - cur.z) ** 2; if (dd < bd) { bd = dd; best = e; } }
      cur = best;
    }
  }
  explode(x, z, r, dmg, color = '#ff9a3c', o = {}) {
    this.rings.spawn('sphere', x, z, { color, r0: r * 0.3, r1: r, life: 0.3, opacity: 0.55, y: 0.5 });
    this.rings.spawn('ring', x, z, { color: '#fff1c0', r0: r * 0.4, r1: r * 1.15, life: 0.35, opacity: 0.9 });
    this.fx.emit(x, 0.6, z, o.big ? 40 : 14, color, { speed: r * 3, up: 6, size: 0.25, life: 0.6, glow: 1.6 });
    if (o.big) this.fx.emit(x, 0.4, z, 20, '#5a4a4a', { speed: r * 2, up: 3, size: 0.35, life: 1.0, glow: 0.7 });
    this.r.addShake(o.big ? 0.4 : 0.1);
    this.audio.play('explode', { big: o.big });
    if (o.big) this.hitstop = Math.max(this.hitstop, 0.035);
    this.hitArea(x, z, r, dmg, o.src || { id: 'explode' }, 0, { radial: true, kb: o.big ? 10 : 6, noSound: true });
  }
  bigBlast(x, z, r, dmg, color) {
    this.rings.spawn('ring', x, z, { color, r0: 1, r1: r, life: 0.6, opacity: 1 });
    this.rings.spawn('disc', x, z, { color, r0: 1, r1: r, life: 0.5, opacity: 0.4 });
    this.rings.spawn('pillar', x, z, { color: '#fff4d0', r0: 2.5, r1: 0.2, life: 0.6, opacity: 0.9, height: 20 });
    this.fx.emit(x, 1, z, 80, color, { speed: r * 2.5, up: 8, size: 0.3, life: 0.9, glow: 1.8 });
    this.r.addShake(0.8);
    this.audio.play('bomb');
    this.hitArea(x, z, r, dmg, { id: 'blast' }, 0, { radial: true, kb: 18, noSound: true });
  }
  kill(e, src) {
    e.dead = true;
    const col = ENEMY_COLORS[e.type] || '#fff';
    this.fx.emit(e.x, 0.7 * e.scale, e.z, e.boss ? 80 : e.elite ? 30 : 7, col, { speed: e.boss ? 12 : 6, up: 6, size: 0.22 * Math.sqrt(e.scale), life: 0.55 });
    this.audio.play('kill');
    this.runStats.kills++;
    this.combo++; this.comboT = 2.6;
    if (this.combo > this.runStats.maxCombo) this.runStats.maxCombo = this.combo;
    if (this.feverT <= 0) { this.fever++; if (this.fever >= this.feverNeed) this.startFever(); }
    // ドロップ
    const xpMul = this.isNight() ? 1.5 : 1;
    if (e.xp > 0) this.dropGem(e.x, e.z, e.xp * xpMul);
    const dg = this.danger || 0;
    if (Math.random() < 0.025 + dg * 0.006) this.dropItem('coin', e.x, e.z, randInt(1, 3) * (1 + dg));
    const rr = Math.random();
    if (rr < 0.004) this.dropItem('meat', e.x, e.z);
    else if (rr < 0.0055) this.dropItem('magnet', e.x, e.z);
    else if (rr < 0.007) this.dropItem('bomb', e.x, e.z);
    if (e.elite) { this.dropItem('chest', e.x, e.z); this.r.addShake(0.3); this.hitstop = 0.06; for (let i = 0; i < 8; i++) this.dropItem('coin', e.x + rand(-1, 1), e.z + rand(-1, 1), 5 + dg * 3); }
    if (e.def.splits && !e.small) for (let i = 0; i < 2; i++) this.spawnEnemy(e.type, e.x + rand(-0.6, 0.6), e.z + rand(-0.6, 0.6), { scale: 0.6, small: true, hp: e.maxHp * 0.25 });
    // 秘宝
    if (this.hasRelic('chain') && Math.random() < 0.18 && !e.boss) this.pending.push({ t: 0.08, fn: () => this.explode(e.x, e.z, 2.6 * this.stats.area, 22 * this.stats.might * (1 + this.time / 300), '#ff7a2a', { src: { id: 'chain' } }) });
    if (this.hasRelic('vampire') && Math.random() < 0.08) this.heal(2, false);
    if (this.player.weapons.some((w) => w.id === 'sanctum') && Math.random() < 0.1) this.heal(1, false);
    if (e.boss) this.bossDown(e);
  }
  startFever() {
    this.fever = 0;
    this.feverT = 9;
    this.feverNeed = Math.floor(this.feverNeed * 1.35 + 80);
    this.feverCount++;
    this.runStats.fevers++;
    this.audio.play('fever');
    this.emit('fever', true);
    this.r.punch = 1;
    const p = this.player;
    this.bigBlast(p.x, p.z, 9, 40 * this.stats.might, '#ffd24a');
    for (let i = 0; i < 20; i++) { const a = rand(0, TAU), d = rand(2, 9); this.dropItem('coin', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); }
  }
  updateCombo(dt) {
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.feverT > 0) { this.feverT -= dt; if (this.feverT <= 0) this.emit('fever', false); }
  }
  updateRelicTimers(dt) {
    const p = this.player;
    if (this.hasRelic('gravity')) { this.gravT -= dt; if (this.gravT <= 0) { this.gravT = 20; this.vacuum(); } }
    if (this.hasRelic('shield') && !p.shield) { this.shieldTimer -= dt; if (this.shieldTimer <= 0) { p.shield = true; } }
  }
  vacuum() {
    for (const it of this.items) if (it.kind === 'gem' || it.kind === 'coin') it.attract = true;
    this.rings.spawn('ring', this.player.x, this.player.z, { color: '#7fb2ff', r0: 30, r1: 1, life: 0.5, opacity: 0.8, ease: 'in' });
    this.audio.play('pick');
  }

  // ===== 弾 =====
  spawnProj(o) {
    o.hit = o.hit || new Set();
    o.t = 0;
    o.y = o.y ?? 1;
    o.vy = o.vy || 0;
    this.projs.push(o);
    return o;
  }
  updateProjs(dt) {
    const p = this.player;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const b = this.projs[i];
      b.t += dt;
      b.life -= dt;
      let done = b.life <= 0;
      if (b.homing && !b.homing.dead) {
        const tg = b.homing;
        const want = Math.atan2(tg.z - b.z, tg.x - b.x);
        const cur = Math.atan2(b.vz, b.vx);
        let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const na = cur + clamp(da, -b.turn * dt, b.turn * dt);
        const sp = Math.hypot(b.vx, b.vz);
        b.vx = Math.cos(na) * sp; b.vz = Math.sin(na) * sp;
      }
      if (b.boomer) {
        if (b.t > b.out) {
          const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
          const sp = Math.hypot(b.vx, b.vz);
          b.vx = damp(b.vx, (dx / l) * sp * 1.15, 6, dt); b.vz = damp(b.vz, (dz / l) * sp * 1.15, 6, dt);
          if (!b.back) { b.back = true; b.hit.clear(); }
          if (l < 1 && b.t > b.out + 0.2) done = true;
        } else { b.vx *= Math.exp(-2.4 * dt); b.vz *= Math.exp(-2.4 * dt); }
      }
      if (b.grav) b.vy -= b.grav * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.kind === 'bolt' && Math.random() < 0.5) this.fx.emit(b.x, b.y, b.z, 1, '#9ef7ff', { speed: 0.5, up: 0, size: 0.14, life: 0.2, grav: 0, glow: 2 });
      if (b.kind === 'meteor') this.fx.emit(b.x, b.y, b.z, 2, '#ff9a3c', { speed: 1, up: 1, size: 0.4, life: 0.35, grav: 0, glow: 2 });
      if (b.sky || b.lob) {
        if (done || b.y <= 0.1) {
          if (b.boom) this.explode(b.x, b.z, b.boom, b.dmg, b.kind === 'star' ? '#fff1a8' : '#ff6a2a', { big: b.big, src: { id: b.src } });
          if (b.zone) { this.addZone(b.x, b.z, b.zone.r, b.zone.dur, b.zone.dps, { id: b.src }, b.zone.color); this.audio.play('fire'); }
          this.projs.splice(i, 1);
        }
        continue;
      }
      if (!done) {
        const near = this.grid.query(b.x, b.z, b.r + 1.5, tmp2);
        for (const e of near) {
          if (e.dead || b.hit.has(e.id)) continue;
          const rr = b.r + e.r;
          if ((e.x - b.x) ** 2 + (e.z - b.z) ** 2 > rr * rr) continue;
          b.hit.add(e.id);
          const l = Math.hypot(b.vx, b.vz) || 1;
          this.damage(e, b.dmg, { id: b.src }, { kx: b.vx / l, kz: b.vz / l, kb: b.kb ?? 2.5 });
          if (b.kind === 'bolt') this.fx.emit(b.x, 1, b.z, 4, '#9ef7ff', { speed: 4, up: 2, size: 0.15, life: 0.25, glow: 2 });
          b.pierce--;
          if (b.pierce <= 0) { done = true; break; }
        }
        if (this.hitProps(b.x, b.z, b.r) && !b.boomer) b.pierce--;
      }
      if (done) this.projs.splice(i, 1);
    }
  }
  enemyShot(x, z, a, speed, dmg, r = 0.35) {
    if (this.ebullets.length > 380) return;
    this.ebullets.push({ x, z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, dmg, r, life: 7 });
  }
  updateEBullets(dt) {
    const p = this.player;
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      const dx = b.x - p.x, dz = b.z - p.z;
      if (dx * dx + dz * dz < (b.r + 0.4) ** 2 && p.iframe <= 0) { this.hurt(b.dmg, 'bullet'); this.ebullets.splice(i, 1); continue; }
      if (b.life <= 0 || dx * dx + dz * dz > 3600) this.ebullets.splice(i, 1);
    }
  }
  addZone(x, z, r, dur, dps, src, color) {
    this.zones.push({ x, z, r, life: dur, dps, src, tick: 0 });
    this.rings.spawn('disc', x, z, { color, r0: r * 0.6, r1: r, life: dur, opacity: 0.4, fadeIn: 0.1, ease: 'out' });
    this.rings.spawn('ring', x, z, { color: '#ffd080', r0: r * 0.2, r1: r, life: 0.3, opacity: 1 });
  }
  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      z.tick -= dt;
      if (Math.random() < dt * 14) this.fx.emit(z.x + rand(-z.r, z.r) * 0.7, 0.2, z.z + rand(-z.r, z.r) * 0.7, 1, '#ff9a3c', { speed: 0.5, up: 3, size: 0.25, life: 0.5, grav: -2, glow: 2 });
      if (z.tick <= 0) { z.tick = 0.3; this.hitArea(z.x, z.z, z.r, z.dps * 0.5, z.src, 0, { noKb: true, noSound: true }); }
      if (z.life <= 0) this.zones.splice(i, 1);
    }
  }
  updatePending(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i];
      q.t -= dt;
      if (q.t <= 0) { this.pending.splice(i, 1); q.fn(); }
    }
  }
  setAura(r, color) {
    const p = this.player;
    this.auraMesh.visible = this.auraRing.visible = true;
    const pulse = 1 + Math.sin(this.time * 6) * 0.03;
    this.auraMesh.scale.set(r * pulse, r * pulse, 1);
    this.auraRing.scale.set(r * pulse, r * pulse, 1);
    this.auraMesh.position.set(p.x, 0.06, p.z);
    this.auraRing.position.set(p.x, 0.07, p.z);
    this.auraMesh.material.color.set(color);
  }
  drawBlades(list, scale) { this.bladeList = (this.bladeList || []).concat(list.map((b) => [...b, scale])); }

  // ===== 拾得物 =====
  dropGem(x, z, v) {
    let gems = 0;
    for (const it of this.items) if (it.kind === 'gem') gems++;
    if (gems > 900) {
      // 多すぎるときは近くの宝石に合体させる
      for (let k = 0; k < 12; k++) {
        const it = this.items[(Math.random() * this.items.length) | 0];
        if (it && it.kind === 'gem' && !it.attract) { it.value += v; return; }
      }
    }
    this.items.push({ kind: 'gem', x, z, y: 0.5, vy: 4, vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), value: v, attract: false, t: 0 });
  }
  dropItem(kind, x, z, value = 1) {
    this.items.push({ kind, x, z, y: 0.5, vy: kind === 'chest' ? 7 : 5, vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), value, attract: false, t: 0 });
  }
  updateItems(dt) {
    const p = this.player;
    const mr = 3.0 * this.stats.magnet * (this.feverT > 0 ? 2.5 : 1);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.y > 0.35 || it.vy > 0) { it.vy -= 22 * dt; it.y += it.vy * dt; it.x += it.vx * dt; it.z += it.vz * dt; if (it.y < 0.35) { it.y = 0.35; it.vy = 0; it.vx = it.vz = 0; } }
      const dx = p.x - it.x, dz = p.z - it.z, d = Math.hypot(dx, dz);
      const magnetable = it.kind === 'gem' || it.kind === 'coin' || it.kind === 'meat' || it.kind === 'magnet' || it.kind === 'bomb';
      if (!it.attract && magnetable && d < mr) { it.attract = true; it.sp = -4; }
      if (it.attract) {
        it.sp = Math.min(40, (it.sp || 0) + 55 * dt);
        const sp = Math.max(it.sp, -4);
        it.x += (dx / (d || 1)) * sp * dt; it.z += (dz / (d || 1)) * sp * dt;
      }
      if (d < (it.kind === 'chest' ? 1.3 : 0.75)) { this.collect(it); this.items.splice(i, 1); continue; }
      if (d > 90 && it.kind === 'gem') this.items.splice(i, 1);
    }
  }
  collect(it) {
    const p = this.player;
    switch (it.kind) {
      case 'gem': {
        this.gemCombo = (this.gemT > this.time - 0.6 ? (this.gemCombo || 0) + 1 : 0);
        this.gemT = this.time;
        this.audio.play('gem', { combo: this.gemCombo });
        const comboMul = 1 + Math.min(this.combo, 500) / 1000;
        this.addXp(it.value * this.stats.growth * comboMul);
        break;
      }
      case 'coin': this.addGold(it.value); this.audio.play('coin'); break;
      case 'meat': this.heal(30); this.audio.play('heal'); this.fx.emit(p.x, 1, p.z, 12, '#6bff8a', { speed: 3, up: 4, size: 0.2, life: 0.6, grav: -2, glow: 1.5 }); break;
      case 'magnet': this.vacuum(); break;
      case 'bomb': this.bigBlast(p.x, p.z, 16, 300 * this.stats.might * (1 + this.time / 180), '#ffcc33'); break;
      case 'chest': this.openChest(); break;
    }
  }
  addGold(v, raw) {
    const g = Math.round(v * (raw ? 1 : this.stats.greed));
    this.runStats.gold += g;
  }
  addXp(v) {
    const p = this.player;
    p.xp += v;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level++;
      this.runStats.level = p.level;
      p.xpNeed = Math.floor(5 + (p.level - 1) * 9 + Math.pow(p.level, 1.85) * 0.55 + Math.pow(Math.max(0, p.level - 15), 2) * 2.2);
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && this.levelDelay <= 0 && !this.modal) this.triggerLevelUp();
  }
  triggerLevelUp() {
    const p = this.player;
    this.audio.play('levelup');
    this.levelDelay = 0.35;
    this.r.punch = 0.8;
    this.rings.spawn('ring', p.x, p.z, { color: '#6bffd8', r0: 0.5, r1: 9, life: 0.5, opacity: 1 });
    this.rings.spawn('pillar', p.x, p.z, { color: '#6bffd8', r0: 1.6, r1: 0.4, life: 0.6, opacity: 0.7, height: 12 });
    this.fx.emit(p.x, 1, p.z, 40, '#6bffd8', { speed: 9, up: 8, size: 0.22, life: 0.8, glow: 2 });
    // まわりの敵を吹き飛ばして一息つける
    this.hitArea(p.x, p.z, this.hasRelic('overload') ? 30 : 6, this.hasRelic('overload') ? 60 * this.stats.might : 1, { id: this.hasRelic('overload') ? 'overload' : 'levelwave' }, 0, { radial: true, kb: 16, noSound: true });
  }

  // ===== レベルアップの選択肢 =====
  unlockedWeapons() {
    return BASE_WEAPONS.filter((id) => !['frost', 'boomerang', 'meteor'].includes(id) || this.save.unlocks['w_' + id]);
  }
  rollChoices() {
    const p = this.player;
    const n = 3 + this.shopLv('choice') + (this.stats.luck >= 0.3 ? 1 : 0);
    const pool = [];
    const ownedW = p.weapons.map((w) => w.id);
    const baseOwned = ownedW.map((id) => (WEAPONS[id].evolved ? Object.keys(WEAPONS).find((k) => WEAPONS[k].evo && WEAPONS[k].evo.into === id) : id));
    for (const w of p.weapons) if (!WEAPONS[w.id].evolved && w.lv < 8) pool.push({ type: 'weapon', id: w.id, w: 3.2 });
    for (const [id, lv] of Object.entries(p.passives)) if (lv < PASSIVES[id].max) pool.push({ type: 'passive', id, w: 2.4 });
    if (p.weapons.length < MAX_SLOTS) for (const id of this.unlockedWeapons()) if (!baseOwned.includes(id) && !this.banished.has(id)) pool.push({ type: 'weapon', id, w: 1.7 });
    if (Object.keys(p.passives).length < MAX_SLOTS) for (const id of Object.keys(PASSIVES)) if (!(id in p.passives) && !this.banished.has(id)) {
      // 持っている武器の進化に必要なパッシブは出やすくする
      const needed = p.weapons.some((w) => WEAPONS[w.id].evo && WEAPONS[w.id].evo.with === id);
      pool.push({ type: 'passive', id, w: needed ? 2.6 : 1.3 });
    }
    const out = [];
    while (out.length < n && pool.length) {
      const c = weightedPick(pool, (x) => x.w);
      pool.splice(pool.indexOf(c), 1);
      out.push(c);
    }
    if (!out.length) out.push({ type: 'gold', id: 'gold' }, { type: 'heal', id: 'heal' });
    return out.map((c) => this.describeChoice(c));
  }
  describeChoice(c) {
    const p = this.player;
    if (c.type === 'weapon') {
      const w = p.weapons.find((x) => x.id === c.id);
      const d = WEAPONS[c.id];
      const lv = w ? w.lv + 1 : 1;
      const evoHint = d.evo && (lv === 8 || !w) ? `進化:${WEAPONS[d.evo.into].name}(${PASSIVES[d.evo.with].name} が必要)` : null;
      return { ...c, name: d.name, icon: d.icon, color: d.color, lv, isNew: !w, desc: w ? levelTextFor(c.id, lv) : d.desc, hint: evoHint, kind: '武器' };
    }
    if (c.type === 'passive') {
      const lv = (p.passives[c.id] || 0) + 1;
      const d = PASSIVES[c.id];
      const enables = p.weapons.filter((w) => WEAPONS[w.id].evo && WEAPONS[w.id].evo.with === c.id).map((w) => WEAPONS[WEAPONS[w.id].evo.into].name);
      return { ...c, name: d.name, icon: d.icon, color: d.color, lv, isNew: lv === 1, desc: d.desc, hint: enables.length ? `${enables.join('・')} への進化に必要` : null, kind: 'パッシブ', max: d.max };
    }
    if (c.type === 'gold') return { ...c, name: 'ゴールド', icon: '金', color: '#ffd24a', desc: '+50 ゴールド', kind: '' };
    return { ...c, name: '肉', icon: '肉', color: '#ff8a6b', desc: 'HPを30回復', kind: '' };
  }
  applyChoice(c) {
    const p = this.player;
    if (c.type === 'weapon') {
      const w = p.weapons.find((x) => x.id === c.id);
      if (w) w.lv++; else this.addWeapon(c.id);
    } else if (c.type === 'passive') {
      p.passives[c.id] = (p.passives[c.id] || 0) + 1;
    } else if (c.type === 'gold') this.addGold(50, true);
    else if (c.type === 'heal') this.heal(30);
    this.computeStats();
    this.audio.play('pick');
  }
  banish(c) { this.banished.add(c.id); this.banishes--; }
  addWeapon(id) {
    this.player.weapons.push(newWeapon(id));
    this.emit('inventory');
  }
  levelDone() {
    this.pendingLevels--;
    if (this.pendingLevels > 0) this.levelDelay = 0.12;
  }

  // ===== 宝箱 =====
  evolvable() {
    const p = this.player;
    return p.weapons.filter((w) => { const d = WEAPONS[w.id]; return d.evo && w.lv >= 8 && p.passives[d.evo.with]; });
  }
  openChest(fromPoi) {
    this.runStats.chests++;
    const p = this.player;
    const luck = this.stats.luck;
    const r = Math.random();
    const count = r < 0.06 + luck * 0.15 ? 5 : r < 0.3 + luck * 0.3 ? 3 : 1;
    const rewards = [];
    for (let i = 0; i < count; i++) {
      const ev = this.evolvable();
      if (ev.length) {
        const w = ev[0];
        const into = WEAPONS[w.id].evo.into;
        const from = w.id;
        w.id = into; w.lv = 1; w.t = 0; w.extra = {}; w.hits.clear();
        this.runStats.evolves++;
        rewards.push({ name: WEAPONS[into].name, icon: WEAPONS[into].icon, color: WEAPONS[into].color, desc: `${WEAPONS[from].name} が進化した!`, evolve: true });
        continue;
      }
      const opts = [];
      for (const w of p.weapons) if (!WEAPONS[w.id].evolved && w.lv < 8) opts.push({ type: 'weapon', id: w.id });
      for (const [id, lv] of Object.entries(p.passives)) if (lv < PASSIVES[id].max) opts.push({ type: 'passive', id });
      if (!opts.length) { const g = 60; this.addGold(g, true); rewards.push({ name: `${g} ゴールド`, icon: '金', color: '#ffd24a', desc: '' }); continue; }
      const c = pick(opts);
      const dsc = this.describeChoice(c);
      this.applyChoice(c);
      rewards.push({ name: dsc.name, icon: dsc.icon, color: dsc.color, desc: `Lv ${dsc.lv}` });
    }
    const gold = Math.round(rand(25, 60) * (1 + (this.danger || 0) * 0.6) * this.stats.greed);
    this.runStats.gold += gold;
    this.computeStats();
    this.emit('chest', rewards, gold);
  }

  // ===== 探索地点 =====
  onPoiSpawn(p) {
    if (p.kind === 'crate' || p.kind === 'vase') this.props.push(p);
    const beamColor = { seal: '#ffcc33', obelisk: '#ff3a6a', chest: '#ffe9a0', shrine: '#7ff3ff', spring: '#5df2c0' }[p.kind];
    if (beamColor) {
      const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: p.kind === 'seal' ? 0.32 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      m.position.set(p.x, 0, p.z);
      if (p.kind === 'chest') m.scale.set(0.5, 0.25, 0.5);
      else if (p.kind !== 'seal') m.scale.set(0.8, 0.5, 0.8);
      else m.scale.set(2.2, 1.6, 2.2);
      this.scene.add(m);
      this.beams.set(p.id, m);
    }
  }
  onPoiDespawn(p) {
    if (p.kind === 'crate' || p.kind === 'vase') this.props = this.props.filter((q) => q !== p);
    const b = this.beams.get(p.id);
    if (b) { this.scene.remove(b); b.material.dispose(); this.beams.delete(p.id); }
  }
  hitProps(x, z, r) {
    let hit = false;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const q = this.props[i];
      if ((q.x - x) ** 2 + (q.z - z) ** 2 < (r + 0.6) ** 2) { this.breakProp(q); hit = true; }
    }
    return hit;
  }
  breakProp(q) {
    this.world.consume(q);
    this.fx.emit(q.x, 0.5, q.z, 14, q.kind === 'crate' ? '#a77b4a' : '#5d7fb0', { speed: 5, up: 5, size: 0.25, life: 0.7 });
    this.audio.play('kill');
    const r = Math.random();
    if (r < 0.42) for (let i = 0; i < randInt(3, 6); i++) this.dropItem('coin', q.x, q.z, 2 + (this.danger || 0));
    else if (r < 0.64) this.dropItem('meat', q.x, q.z);
    else if (r < 0.78) this.dropItem('magnet', q.x, q.z);
    else if (r < 0.9) this.dropItem('bomb', q.x, q.z);
    else this.dropGem(q.x, q.z, 20 + this.time / 10);
  }
  updatePois(dt) {
    const p = this.player;
    const t = this.time;
    for (const [id, b] of this.beams) b.material.opacity = (b.userData.base ??= b.material.opacity) * (0.75 + Math.sin(t * 2 + b.position.x) * 0.25);
    let nearShrine = null;
    for (const q of this.world.pois.values()) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (q.mesh && q.kind === 'chest') q.mesh.position.y = Math.abs(Math.sin(t * 2)) * 0.1;
      if (q.kind === 'seal' && q.mesh) q.mesh.rotation.y += dt * 0.2;
      if (d > 10) continue;
      switch (q.kind) {
        case 'crate': case 'vase': if (d < 1.2) this.breakProp(q); break;
        case 'chest': if (d < 1.6) { this.world.consume(q); this.fx.emit(q.x, 1, q.z, 30, '#ffd24a', { speed: 6, up: 8, glow: 2 }); this.openChest(true); } break;
        case 'spring':
          if (d < 2.4) {
            this.world.consume(q);
            this.heal(this.stats.maxHp * 0.5);
            p.regenBuff = 20;
            this.audio.play('heal');
            this.rings.spawn('pillar', q.x, q.z, { color: '#5df2c0', r0: 2, r1: 0.5, life: 1, opacity: 0.7, height: 10 });
            this.emit('toast', '癒しの泉:HP回復 + 再生', '#5df2c0');
          }
          break;
        case 'shrine':
          if (d < 2.6) nearShrine = q;
          break;
        case 'obelisk':
          if (d < 3 && !this.challenge) {
            this.world.consume(q);
            this.challenge = { x: q.x, z: q.z, t: 30 };
            this.audio.play('boss');
            this.r.addShake(0.5);
            this.rings.spawn('ring', q.x, q.z, { color: '#ff3a6a', r0: 1, r1: 25, life: 1, opacity: 1 });
            this.emit('banner', '呪いの石碑', '30秒間、魔物の猛攻に耐えろ');
          }
          break;
        case 'seal':
          if (d < 9 && !q.active && !q.broken) this.activateSeal(q);
          break;
      }
    }
    // 祠:中に立ち続けると祝福を選べる
    if (nearShrine) {
      this.shrineCharge = this.shrineCharge && this.shrineCharge.q === nearShrine ? this.shrineCharge : { q: nearShrine, v: 0 };
      this.shrineCharge.v += dt / 1.6;
      if (Math.random() < dt * 30) this.fx.emit(nearShrine.x + rand(-2, 2), 0.2, nearShrine.z + rand(-2, 2), 1, '#7ff3ff', { speed: 0.3, up: 5, size: 0.15, life: 0.6, grav: -3, glow: 2 });
      if (this.shrineCharge.v >= 1) {
        this.world.consume(nearShrine);
        this.shrineCharge = null;
        this.audio.play('shrine');
        this.emit('blessing', shuffle(BLESSINGS.slice()).slice(0, 3));
      }
    } else this.shrineCharge = null;
    // 石碑の試練
    if (this.challenge) {
      this.challenge.t -= dt;
      if (this.challenge.t <= 0) {
        const c = this.challenge;
        this.challenge = null;
        this.emit('banner', '試練を乗り越えた!', '秘宝を手に入れる');
        this.audio.play('win');
        this.dropItem('chest', p.x + 1.5, p.z);
        for (let i = 0; i < 12; i++) this.dropItem('coin', p.x + rand(-2, 2), p.z + rand(-2, 2), 6 + (this.danger || 0) * 3);
        this.offerRelic();
      }
    }
  }
  offerRelic() {
    const avail = Object.keys(RELICS).filter((id) => !this.player.relics.includes(id));
    if (!avail.length) { this.addGold(500, true); return; }
    const opts = shuffle(avail).slice(0, 3).map((id) => ({ id, ...RELICS[id] }));
    this.emit('relic', opts);
  }
  takeRelic(id) {
    this.player.relics.push(id);
    this.runStats.relics++;
    if (id === 'shield') this.player.shield = true;
    this.computeStats();
    this.audio.play('evolve');
  }
  takeBlessing(b) {
    this.blessings.push(b.id);
    b.apply(this.stats, this);
    this.computeStats();
    this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
    this.audio.play('pick');
  }

  // ===== 封印塔とボス =====
  activateSeal(q) {
    q.active = true;
    const type = BOSS_ORDER[this.sealsBroken % 3];
    const tmin = this.time / 60;
    const hp = 2000 * (1 + tmin * 0.36) * (1 + this.sealsBroken * 0.45);
    const b = this.spawnEnemy(type, q.x + 5, q.z + 5, { hp });
    b.seal = q;
    this.bosses.push(b);
    this.audio.play('boss');
    this.r.addShake(0.8);
    this.emit('boss', b);
    this.emit('banner', ENEMIES[type].title, '封印の守護者が現れた');
  }
  spawnFinal() {
    this.finalSpawned = true;
    const p = this.player;
    const tmin = this.time / 60;
    const hp = 40000 * (1 + tmin * 0.1) * (1 + this.sealsBroken * 0.1);
    const a = Math.random() * TAU;
    const b = this.spawnEnemy('voidking', p.x + Math.cos(a) * 14, p.z + Math.sin(a) * 14, { hp });
    b.final = true;
    this.bosses.push(b);
    this.audio.play('boss');
    this.r.addShake(1);
    this.emit('boss', b);
  }
  bossDown(e) {
    this.bosses = this.bosses.filter((b) => b !== e);
    this.runStats.bosses++;
    this.r.addShake(1.2);
    this.hitstop = 0.25;
    this.slowmo = 0.8;
    this.bigBlast(e.x, e.z, 12, 200, ENEMY_COLORS[e.type]);
    for (let i = 0; i < 30; i++) this.dropItem('coin', e.x + rand(-3, 3), e.z + rand(-3, 3), 10 + this.time / 30);
    this.dropGem(e.x, e.z, 120 + this.time / 3);
    this.emit('boss', null);
    if (e.final) {
      this.emit('banner', '虚ろの王を討ち果たした!', '世界に光が戻る');
      this.audio.play('win');
      this.player.iframe = 99;
      setTimeout(() => this.endRun(true), 3200);
      return;
    }
    this.dropItem('chest', e.x, e.z);
    if (e.seal) {
      const q = e.seal;
      q.broken = true;
      this.sealsBroken++;
      this.runStats.seals++;
      this.world.removePoiMesh(q);
      this.rings.spawn('pillar', q.x, q.z, { color: '#ffcc33', r0: 3, r1: 0.2, life: 1.5, opacity: 1, height: 40 });
      this.emit('banner', `封印塔を破壊した(${this.sealsBroken}/3)`, this.sealsBroken >= 3 ? '虚ろの王が来る…!' : '残る塔を探せ');
      this.offerRelic();
      if (this.sealsBroken >= 3 && !this.finalSpawned) this.pending.push({ t: 6, fn: () => this.spawnFinal() });
    }
  }
  updateBoss(e, dt, dx, dz, dist) {
    const p = this.player;
    const phase2 = e.hp < e.maxHp * 0.5;
    e.patternT -= dt * (phase2 ? 1.35 : 1);
    if (e.spawnT > 0) return [0, 0];
    const patterns = { treant: ['burst', 'summon', 'stomp', 'burst'], witch: ['spiral', 'blink', 'nova', 'summon', 'spiral'], wyrm: ['charge', 'burst', 'charge', 'summon', 'stomp'], voidking: ['spiral', 'charge', 'nova', 'summon', 'stomp', 'blink', 'burst'] }[e.type];
    // 実行中の技
    if (e.act) {
      const a = e.act;
      a.t -= dt;
      if (a.kind === 'charge') {
        if (a.stage === 0 && a.t <= 0) { a.stage = 1; a.t = 0.55; this.audio.play('dash'); }
        if (a.stage === 1) { if (a.t <= 0) e.act = null; if (Math.random() < 0.6) this.fx.emit(e.x, 0.5, e.z, 2, ENEMY_COLORS[e.type], { speed: 2, size: 0.4, life: 0.4 }); return [a.dx * 24, a.dz * 24]; }
        return [0, 0];
      }
      if (a.kind === 'spiral') {
        a.acc = (a.acc || 0) + dt;
        while (a.acc > 0.07) { a.acc -= 0.07; a.ang += 0.32; const arms = phase2 ? 4 : 3; for (let k = 0; k < arms; k++) this.enemyShot(e.x, e.z, a.ang + (k / arms) * TAU, 6.5, e.dmg * 0.6, 0.4); }
        if (a.t <= 0) e.act = null;
        return [dx * e.spd * 0.3, dz * e.spd * 0.3];
      }
      if (a.kind === 'stomp' && a.t <= 0) {
        e.act = null;
        this.rings.spawn('ring', e.x, e.z, { color: '#ff6a3a', r0: 1, r1: a.r, life: 0.4, opacity: 1 });
        this.fx.emit(e.x, 0.3, e.z, 40, '#a08060', { speed: 14, up: 4, size: 0.35, life: 0.7 });
        this.r.addShake(0.7); this.audio.play('bomb');
        if (Math.hypot(p.x - e.x, p.z - e.z) < a.r) this.hurt(e.dmg * 1.2);
        return [0, 0];
      }
      if (a.kind === 'stomp') return [0, 0];
    }
    if (e.patternT <= 0 && !e.act) {
      const kind = patterns[e.pi % patterns.length];
      e.pi++;
      e.patternT = 2.6;
      switch (kind) {
        case 'burst': {
          const n = phase2 ? 22 : 16;
          for (let w = 0; w < 2; w++) this.pending.push({ t: w * 0.4, fn: () => { if (e.dead) return; for (let k = 0; k < n; k++) this.enemyShot(e.x, e.z, (k / n) * TAU + w * 0.15, 7, e.dmg * 0.6, 0.45); } });
          this.audio.play('nova');
          break;
        }
        case 'spiral': e.act = { kind: 'spiral', t: 2.2, ang: Math.random() * TAU }; break;
        case 'summon': {
          const minion = this.pickType(e.x, e.z);
          for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; this.spawnEnemy(minion, e.x + Math.cos(a) * 4, e.z + Math.sin(a) * 4); }
          this.rings.spawn('ring', e.x, e.z, { color: ENEMY_COLORS[e.type], r0: 1, r1: 5, life: 0.5 });
          break;
        }
        case 'stomp': {
          const r = 7 + (phase2 ? 2 : 0);
          e.act = { kind: 'stomp', t: 1.0, r };
          this.rings.spawn('disc', e.x, e.z, { color: '#ff2a2a', r0: r, r1: r, life: 1.0, opacity: 0.28, ease: 'lin', fadeIn: 0.9 });
          this.rings.spawn('ring', e.x, e.z, { color: '#ff2a2a', r0: 0.5, r1: r, life: 1.0, opacity: 0.9, ease: 'lin' });
          break;
        }
        case 'charge': {
          const l = dist || 1;
          e.act = { kind: 'charge', t: 0.75, stage: 0, dx, dz };
          this.rings.spawn('line', e.x + dx * 7, e.z + dz * 7, { color: '#ff2a2a', life: 0.75, opacity: 0.45, rotY: -Math.atan2(dz, dx) + Math.PI / 2, len: 14, w: e.r * 2, ease: 'lin' });
          break;
        }
        case 'blink': {
          this.fx.emit(e.x, 1, e.z, 30, ENEMY_COLORS[e.type], { speed: 6, up: 3, glow: 1.5 });
          const a = Math.random() * TAU;
          e.x = p.x + Math.cos(a) * 9; e.z = p.z + Math.sin(a) * 9;
          this.fx.emit(e.x, 1, e.z, 30, ENEMY_COLORS[e.type], { speed: 6, up: 3, glow: 1.5 });
          e.patternT = 0.8;
          break;
        }
        case 'nova': {
          const n = 28;
          for (let k = 0; k < n; k++) { const a = (k / n) * TAU; this.enemyShot(p.x + Math.cos(a) * 13, p.z + Math.sin(a) * 13, a + Math.PI, 3.2, e.dmg * 0.5, 0.5); }
          this.audio.play('warn');
          break;
        }
      }
    }
    if (dist < e.r + 1.5) return [0, 0];
    return [dx * e.spd, dz * e.spd];
  }

  // ===== 描画 =====
  render(dt, rawDt) {
    const p = this.player;
    // 敵
    const counts = {};
    for (const k in this.enemyViews) counts[k] = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const v = this.enemyViews[e.type];
      const i = counts[e.type]++;
      if (i >= v.cap) continue;
      const hop = e.type === 'slime' ? Math.abs(Math.sin(e.t * 6 + e.phase)) : 0;
      const fly = e.type === 'bat' || e.type === 'ghost' || e.type === 'eye' ? Math.sin(e.t * 4 + e.phase) * 0.2 : 0;
      const spawn = e.spawnT > 0 ? 1 - e.spawnT / (e.boss ? 1.2 : 0.35) : 1;
      const sq = e.frozen > 0 ? 1 : 1 + (e.type === 'slime' ? (hop - 0.5) * 0.25 : Math.sin(e.t * 10 + e.phase) * 0.04) + e.flash * 0.15;
      const sc = e.scale * spawn * (e.boss ? 1 : 1);
      const ang = Math.atan2(p.x - e.x, p.z - e.z);
      _e.set(e.type === 'bat' ? Math.sin(e.t * 18) * 0.15 : 0, ang, e.frozen > 0 ? 0 : Math.sin(e.t * 9 + e.phase) * 0.06);
      _q.setFromEuler(_e);
      _m.compose(_p.set(e.x, hop * 0.5 + fly, e.z), _q, _s.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq)));
      v.mesh.setMatrixAt(i, _m);
      v.flash.array[i] = e.flash;
      if (e.frozen > 0) _c.setRGB(0.6, 0.9, 1.6);
      else if (e.elite) _c.setRGB(1.6, 1.25, 0.5);
      else if (e.burn > 0) _c.setRGB(1.4, 0.8, 0.6);
      else _c.setRGB(1, 1, 1);
      v.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    }
    for (const k in this.enemyViews) {
      const v = this.enemyViews[k];
      v.mesh.count = Math.min(counts[k], v.cap);
      v.mesh.instanceMatrix.needsUpdate = true;
      v.mesh.instanceColor.needsUpdate = true;
      v.flash.needsUpdate = true;
    }
    // 弾
    for (const k in this.projViews) this.projViews[k].n = 0;
    const put = (kind, x, y, z, rx, ry, rz, s) => {
      const v = this.projViews[kind];
      if (v.n >= v.cap) return;
      _e.set(rx, ry, rz); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
      v.mesh.setMatrixAt(v.n++, _m);
    };
    for (const b of this.projs) {
      const ang = Math.atan2(b.vx, b.vz);
      const sc = b.scale || 1;
      if (b.kind === 'boomerang') put('boomerang', b.x, b.y, b.z, 0, this.time * 18, 0, sc);
      else if (b.kind === 'flask' || b.kind === 'meteor' || b.kind === 'star') put(b.kind, b.x, b.y, b.z, this.time * 9, this.time * 7, 0, sc);
      else put(b.kind, b.x, b.y, b.z, 0, ang, 0, sc);
    }
    for (const b of this.ebullets) put('orb', b.x, 0.9, b.z, 0, this.time * 5, 0, b.r / 0.3);
    if (this.bladeList) for (const [x, z, a, s] of this.bladeList) put('blade', x, 1.0, z, 0, -a, 0, s);
    for (const k in this.projViews) { const v = this.projViews[k]; v.mesh.count = v.n; v.mesh.instanceMatrix.needsUpdate = true; }
    // 拾得物
    const ic = {};
    for (const k in this.itemViews) ic[k] = 0;
    for (const it of this.items) {
      const v = this.itemViews[it.kind];
      const i = ic[it.kind];
      if (i >= v.cap) continue;
      ic[it.kind]++;
      const bob = Math.sin(this.time * 3 + it.x) * 0.1;
      const s = it.kind === 'gem' ? (it.value >= 100 ? 2.2 : it.value >= 25 ? 1.8 : it.value >= 5 ? 1.5 : 1.25) : it.kind === 'chest' ? 1 : 1.1;
      _e.set(0, this.time * 2.5 + it.x, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(it.x, it.kind === 'chest' ? Math.max(0, it.y - 0.35) : it.y + bob, it.z), _q, _s.set(s, s, s));
      v.mesh.setMatrixAt(i, _m);
      if (it.kind === 'gem') {
        if (it.value >= 100) _c.setRGB(2.2, 0.5, 2.4);
        else if (it.value >= 25) _c.setRGB(2.4, 0.5, 0.5);
        else if (it.value >= 5) _c.setRGB(0.5, 2.3, 0.7);
        else _c.setRGB(0.4, 1.3, 2.6);
        v.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      }
    }
    for (const k in this.itemViews) { const v = this.itemViews[k]; v.mesh.count = ic[k]; v.mesh.instanceMatrix.needsUpdate = true; if (v.mesh.instanceColor) v.mesh.instanceColor.needsUpdate = true; }

    this.fx.update(dt);
    this.rings.update(dt);
    // 昼夜
    const n = this.nightAmount();
    const tintHex = BIOMES[this.biome].tint;
    this.r.setNight(n * 0.85, tintHex ? new THREE.Color(tintHex) : null);
    this.r.follow(p.x, p.z, p.vx, p.vz, rawDt, this.settingsShake !== false);
  }
}

function levelTextFor(id, lv) {
  const d = WEAPONS[id];
  const L = d.lv && d.lv[lv - 2];
  if (!L) return d.desc;
  const t = [];
  if (L.dmg) t.push(`ダメージ +${L.dmg}`);
  if (L.amount) t.push(`弾数 +${L.amount}`);
  if (L.cd) t.push(`攻撃間隔 -${Math.round((1 - L.cd) * 100)}%`);
  if (L.area) t.push(`範囲 +${Math.round((L.area - 1) * 100)}%`);
  if (L.pierce) t.push(`貫通 +${L.pierce}`);
  if (L.dur) t.push(`持続 +${Math.round((L.dur - 1) * 100)}%`);
  if (L.speed) t.push(`速度 +${Math.round((L.speed - 1) * 100)}%`);
  return t.join('、');
}
