import * as THREE from 'three';
import { assets } from './assets';
import { audio } from './audio';
import { World } from './world';
import { Player } from './player';
import { FX } from './fx';
import { Combat, type HitInfo, type HitResult, type Target } from './combat';
import { Weapons } from './weapons';
import { HUD } from './hud';
import { Monster } from './monsters';
import { Boss } from './boss';
import { input } from './input';
import { CORES, MONSTERS, BOSS, type CoreId, type MatId, MATERIALS, type WeaponId, AREA } from './data';
import type { Creature, Ctx, PartState } from './creature';

interface Pickup {
  obj: THREE.Object3D;
  glow: THREE.Sprite;
  core: CoreId;
  t: number;
  pos: THREE.Vector3;
}

export interface HuntResult {
  success: boolean;
  time: number;
  kills: number;
  mats: Partial<Record<MatId, number>>;
  partsBroken: number;
  coresEaten: number;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.05, 190);
  world: World;
  player: Player;
  fx: FX;
  combat: Combat;
  weapons: Weapons;
  hud = new HUD();
  creatures: Creature[] = [];
  boss: Boss | null = null;
  pickups: Pickup[] = [];
  pouch: CoreId[] = [];
  pouchSel = 0;
  loot: Partial<Record<MatId, number>> = {};
  kills = 0;
  partsBroken = 0;
  coresEaten = 0;
  time = 0;
  running = false;
  paused = false;
  ended = false;
  endT = 0;
  success = false;
  built = false;
  onEnd?: (r: HuntResult) => void;
  onPause?: (p: boolean) => void;
  ctx!: Ctx;
  gemSrc: THREE.Object3D[] = [];
  nearGate = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world);
    this.fx = new FX(this.scene);
    this.combat = new Combat(this.scene, this.world, this.fx, this.player, {
      onPlayerHit: (res, h, t) => this.onPlayerHit(res, h, t),
    });
    this.weapons = new Weapons(this.player, this.combat, this.fx);
    this.weapons.takeCore = () => {
      if (!this.pouch.length) {
        this.hud.message('魔核を持っていない', 'warn');
        return undefined;
      }
      const c = this.pouch.splice(Math.min(this.pouchSel, this.pouch.length - 1), 1)[0];
      this.pouchSel = Math.min(this.pouchSel, Math.max(0, this.pouch.length - 1));
      return c;
    };
    this.weapons.onDevoured = (c) => {
      this.coresEaten++;
      this.hud.message(`喰炉が<b style="color:#${CORES[c].color.toString(16).padStart(6, '0')}">${CORES[c].name}</b>を喰らった → ${CORES[c].ammo}：${CORES[c].desc}`, 'core');
    };
    this.player.onHurt = (dmg) => {
      if (dmg > 3) audio.play('mon_pain2', { vol: 0.25, rate: 1.6 });
    };
  }

  buildOnce() {
    if (this.built) return;
    this.world.build();
    this.scene.add(this.camera);
    const g = assets.model('gems').scene;
    for (const n of ['RoundCut', 'TeardropCut', 'PrincessCut', 'EmeraldCut']) {
      const o = g.getObjectByName(n);
      if (o) this.gemSrc.push(o);
    }
    this.built = true;
  }

  start(loadout: WeaponId[]) {
    this.buildOnce();
    // 前回の狩りを掃除
    for (const c of this.creatures) c.dispose();
    this.creatures = [];
    this.boss = null;
    for (const p of this.pickups) this.scene.remove(p.obj, p.glow);
    this.pickups = [];
    this.combat.clear();
    this.fx.clear();
    this.pouch = [];
    this.pouchSel = 0;
    this.loot = {};
    this.kills = this.partsBroken = this.coresEaten = 0;
    this.time = 0;
    this.ended = false;
    this.success = false;
    this.endT = 0;
    this.world.lockArena = false;
    this.nearGate = false;

    this.ctx = {
      world: this.world,
      player: this.player,
      combat: this.combat,
      fx: this.fx,
      scene: this.scene,
      creatures: this.creatures,
      onKill: (c) => this.onKill(c),
      onPartBreak: (c, p) => this.onPartBreak(c, p),
    };
    for (const s of this.world.spawns) {
      const n = s.group ?? 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const pos = new THREE.Vector3(s.x + Math.sin(a) * (n > 1 ? 2.5 : 0), 0, s.z + Math.cos(a) * (n > 1 ? 2.5 : 0));
        this.creatures.push(new Monster(this.ctx, s.id, pos));
      }
    }
    const boss = new Boss(this.ctx, new THREE.Vector3(0, 0, this.world.arena.z - 6));
    boss.onStart = () => {
      this.world.lockArena = true;
      audio.playBgm('boss', 1);
      this.hud.showBanner(BOSS.name, BOSS.title, 4);
      this.hud.setObjective('骸鍛王を討伐せよ　<small>部位破壊で動きが変わる</small>');
    };
    boss.onAnnounce = (m) => this.hud.message(m, 'boss');
    boss.spawnMinion = (p) => this.creatures.push(new Monster(this.ctx, 'skeleton', p, { minion: true }));
    boss.minionCount = () => this.creatures.filter((c) => c instanceof Monster && c.minion && c.alive).length;
    this.boss = boss;
    this.creatures.push(boss);
    this.combat.targets = this.creatures as unknown as Target[];

    this.weapons.setup(loadout);
    this.player.spawn(this.world.start, 0);
    this.hud.show(true);
    this.hud.setObjective('沼沢を進み、最奥の炉跡を目指せ');
    this.hud.showBanner(AREA.name, '狩猟開始', 3.5);
    this.running = true;
    this.paused = false;
    audio.playBgm('field', 2);
    audio.ambience(true);
  }

  stop() {
    this.running = false;
    this.hud.show(false);
    audio.ambience(false);
  }

  setPaused(p: boolean) {
    if (this.ended) return;
    this.paused = p;
    this.onPause?.(p);
  }

  onPlayerHit(res: HitResult, h: HitInfo, t: Target) {
    if (res.kind === 'immune') return;
    this.hud.hitMarker(res.kind, res.killed);
    if (res.dealt > 0) this.hud.damageNumber(h.point, this.camera, res.dealt, res.kind + (h.core ? ' core' : ''));
    if (!h.splash) {
      if (res.kind === 'weak') audio.play('weak_hit', { vol: 0.75, rate: 1.1 });
      else if (res.kind === 'armor' || res.kind === 'part') audio.play('armor_hit', { vol: 0.45, rate: 1.3 });
    }
    void t;
  }

  onKill(c: Creature) {
    this.kills++;
    if (c instanceof Boss) {
      this.hud.showBanner('狩猟成功', `${BOSS.name} を討伐した`, 5);
      audio.stopBgm(2);
      setTimeout(() => audio.play('jingle_win', { vol: 0.9 }), 1200);
      this.addLoot(BOSS.drops);
      this.success = true;
      this.ended = true;
      this.endT = 7;
      this.hud.setObjective('討伐完了');
      return;
    }
    if (c instanceof Monster) {
      const def = c.def;
      this.addLoot(def.drops);
      // 魔核を落とす（骸鍛王の召喚体は確率）
      if (!c.minion || Math.random() < 0.5) {
        const p = c.center.clone();
        p.y = this.world.heightAt(p.x, p.z) + 0.9;
        this.spawnCore(p, def.core);
      }
      this.hud.message(`${c.displayName} を倒した`, 'kill');
    }
  }

  addLoot(d: Partial<Record<MatId, [number, number]>>) {
    for (const [k, [a, b]] of Object.entries(d) as [MatId, [number, number]][]) {
      const n = a + Math.floor(Math.random() * (b - a + 1));
      this.loot[k] = (this.loot[k] ?? 0) + n;
      this.hud.message(`素材「${MATERIALS[k].name}」×${n}`, 'loot');
    }
  }

  onPartBreak(c: Creature, p: PartState) {
    this.partsBroken++;
    this.hud.message(`${c.displayName} の <b>${p.def.name}</b> を破壊！`, 'break');
    this.hud.hitMarker('part', true);
    if (c instanceof Monster && c.def.id === 'crab') this.hud.message('トロッコを失い、もう潜れない・隠れられない', 'break');
    if (c instanceof Monster && c.def.id === 'skeleton') this.hud.message('連弩を失った骸弩兵が突進してくる', 'break');
    if (c instanceof Monster && c.def.id === 'wasp') this.hud.message('毒針を失った（刺されても毒にならない）', 'break');
    if (c instanceof Boss) this.addLoot({ bonechip: [1, 2] });
  }

  spawnCore(pos: THREE.Vector3, core: CoreId) {
    const src = this.gemSrc[Object.keys(CORES).indexOf(core) % this.gemSrc.length];
    const obj = src.clone(true);
    obj.scale.setScalar(0.35);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.color.set(CORES[core].color);
        mat.emissive = new THREE.Color(CORES[core].color).multiplyScalar(0.6);
        mat.metalness = 0.2;
        mat.roughness = 0.15;
        m.material = mat;
      }
    });
    obj.position.copy(pos);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.texture('flarefour'), color: CORES[core].color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(1.6);
    glow.position.copy(pos);
    this.scene.add(obj, glow);
    this.pickups.push({ obj, glow, core, t: 0, pos: pos.clone() });
    this.fx.coreBurst(pos, CORES[core].color);
  }

  update(dt: number) {
    if (!this.running) return;
    if (this.paused) {
      this.render();
      return;
    }
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const p = this.player;
    const canAct = !p.dead && input.locked && !(this.ended && this.endT < 4);
    if (input.locked) p.update(dt, this.weapons.ads);
    else p.update(0, false);
    this.weapons.update(dt, canAct);

    // 魔核ポーチ選択
    if (input.hit('KeyQ') && this.pouch.length > 1) {
      this.pouchSel = (this.pouchSel + 1) % this.pouch.length;
      audio.play('ui_select', { vol: 0.5 });
    }

    for (const c of this.creatures) {
      // 遠くの非戦闘個体は更新・描画しない（霧で見えない）
      const far = !c.isBoss && !c.aggro && c.alive && c.root.position.distanceTo(p.pos) > 110;
      c.root.visible = !far;
      if (!far) c.update(dt);
    }
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      if (this.creatures[i].removeMe) {
        this.creatures[i].dispose();
        this.creatures.splice(i, 1);
      }
    }
    this.combat.targets = this.creatures as unknown as Target[];
    this.combat.update(dt);
    this.fx.update(dt);
    this.world.update(p.pos, this.time);

    // 拾得
    let prompt: string | null = null;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.obj.position.y = pk.pos.y + Math.sin(pk.t * 2.5) * 0.12;
      pk.obj.rotation.y += dt * 1.8;
      pk.glow.position.copy(pk.obj.position);
      pk.glow.material.rotation += dt * 0.6;
      const d = pk.pos.distanceTo(p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)));
      if (d < 2.6) {
        const cd = CORES[pk.core];
        if (this.pouch.length >= 3) prompt = `<b>魔核ポーチが一杯</b>（F で喰わせて空けよう）`;
        else {
          prompt = `<kbd>E</kbd> ${cd.name}を回収　<small>${cd.ammo}：${cd.desc}</small>`;
          if (input.hit('KeyE')) {
            this.pouch.push(pk.core);
            this.pouchSel = this.pouch.length - 1;
            this.scene.remove(pk.obj, pk.glow);
            this.pickups.splice(i, 1);
            audio.play('pickup', { vol: 0.8 });
            this.hud.message(`${cd.name}を回収（<kbd>F</kbd>で喰銃に喰わせる）`, 'core');
            prompt = null;
          }
        }
      }
    }
    if (!prompt && this.pouch.length && !this.weapons.cur.chamber && this.time % 8 < 3) prompt = `<kbd>F</kbd> 魔核を喰わせて特殊弾に　<kbd>Q</kbd> 選択切替`;
    this.hud.setPrompt(prompt);

    // 目的
    if (!this.nearGate && p.pos.z < -165) {
      this.nearGate = true;
      this.hud.setObjective('炉跡の闘技場へ　<small>中に入ると戦闘開始・脱出不可</small>');
      this.hud.message('古い炉の熱が残っている……奥に何かがいる', 'boss');
    }

    // 終了処理
    if (p.dead && !this.ended) {
      this.ended = true;
      this.success = false;
      this.endT = 4;
      this.hud.showBanner('力尽きた', '工房船へ帰還します', 4);
      audio.stopBgm(1.5);
      audio.play('jingle_lose', { vol: 0.8 });
    }
    if (this.ended) {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.running = false;
        this.finish();
      }
    }

    audio.setListener(p.eyePos(), p.forward());
    this.hud.update(dt, p, this.weapons, this.pouch, this.pouchSel, this.boss);
    this.render();
  }

  finish() {
    // 失敗時は素材の半分を持ち帰る
    const mats: Partial<Record<MatId, number>> = {};
    for (const [k, v] of Object.entries(this.loot) as [MatId, number][]) mats[k] = this.success ? v : Math.floor(v / 2);
    this.stop();
    this.onEnd?.({ success: this.success, time: this.time, kills: this.kills, mats, partsBroken: this.partsBroken, coresEaten: this.coresEaten });
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.vCam.aspect = w / h;
    this.weapons.vCam.updateProjectionMatrix();
  }

  noRender = false;
  /** テスト用：描画せずに時間を進める */
  simulate(sec: number, dt = 1 / 30, perFrame?: () => boolean | void) {
    this.noRender = true;
    for (let t = 0; t < sec; t += dt) {
      if (perFrame?.() === true) break;
      this.update(dt);
      input.endFrame();
    }
    this.noRender = false;
  }

  render() {
    if (this.noRender) return;
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (!this.player.dead) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.weapons.vScene, this.weapons.vCam);
    }
  }
}

export { MONSTERS };
