import * as THREE from 'three';
import type { Match, Unit } from './game';
import type { WeaponName } from './weapons';
import type { IconName } from './icons';

export interface Aim { dir: THREE.Vector3; target: Unit | null; point: THREE.Vector3 }

export interface SkillDef {
  name: string;
  icon: IconName;
  desc: string;
  cd: number;          // クールタイム(秒)。必殺技では未使用
  anim: string;
  lock: number;        // 発動中に動けない時間(秒)
  aiRange: number;     // AIが「この距離に敵がいれば使う」目安
  aiWhen?: 'hurt' | 'allyHurt'; // AIの追加条件: 自分が削られた時 / 近くの味方が削られた時
  cast(m: Match, u: Unit, aim: Aim): void;
}

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  blurb: string;
  model: string;       // public/assets/vrm/<model>.vrm
  weapons: WeaponName[];
  color: number;
  hp: number; atk: number; speed: number;
  range: number;       // 通常攻撃の射程
  interval: number;    // 通常攻撃の間隔(秒)
  ranged: boolean;
  idle: string;
  run: string;
  attacks: string[];
  skills: [SkillDef, SkillDef];
  /** 必殺技は2種類から出撃前に選ぶ */
  ults: [SkillDef, SkillDef];
}

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ahead = (u: Unit, aim: Aim, d: number) => u.pos.clone().addScaledVector(aim.dir, d);
/** 狙った相手の位置（いなければ前方 d の地点）。射程 max で頭打ち */
const aimPoint = (u: Unit, aim: Aim, d: number, max: number) => {
  const p = aim.target ? aim.target.pos.clone() : ahead(u, aim, d);
  const off = p.clone().sub(u.pos);
  if (off.length() > max) p.copy(u.pos).addScaledVector(off.normalize(), max);
  return p;
};

export const HEROES: HeroDef[] = [
  {
    id: 'gald', name: 'ガルド', role: 'タンク', blurb: '盾で仲間を守る前線の要。拠点に居座るのが得意。',
    model: 'Sakurada_Fumiriya', weapons: ['sword', 'shield'],
    color: 0x5aa9ff, hp: 1500, atk: 92, speed: 6.3, range: 2.6, interval: 1.0, ranged: false,
    idle: 'Sword_Idle', run: 'Jog_Fwd_Loop', attacks: ['Sword_Attack'],
    skills: [
      {
        name: 'シールドバッシュ', icon: 'bash', desc: '前方を盾で殴り、ダメージとスタン', cd: 9, anim: 'Punch_Cross', lock: 0.45, aiRange: 3.2,
        cast(m, u, aim) {
          m.after(0.18, () => {
            const p = ahead(u, aim, 1.8);
            m.fx.slash(u.pos, u.yaw, 3.4, 0x9fd0ff);
            m.aoe(u, p, 2.8, u.power() * 1.6, { stun: 1.3, knock: 2.5 });
          });
        },
      },
      {
        name: '鉄壁の構え', icon: 'guard', desc: '5秒間、受けるダメージを60%カット', cd: 15, anim: 'Spell_Simple_Enter', lock: 0.3, aiRange: 6, aiWhen: 'hurt',
        cast(m, u) {
          u.buff('def', 0.6, 5);
          m.fx.ring(u.pos, 2.4, 0x9fd0ff, 0.6);
          m.fx.aura(u, 0x7fbfff, 5);
        },
      },
    ],
    ults: [{
      name: '守護の号令', icon: 'rally', desc: '周囲の敵を吹き飛ばし、味方を大回復', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.7, aiRange: 5,
      cast(m, u) {
        m.fx.telegraph(u.pos, 7, 0.45, 0x9fd0ff);
        m.after(0.45, () => {
          m.fx.ring(u.pos, 7, 0xcfe8ff, 0.7); m.fx.pillar(u.pos, 0x9fd0ff, 2.2);
          m.aoe(u, u.pos, 7, u.power() * 3.2, { stun: 1.0, knock: 6 });
          m.healAllies(u, u.pos, 9, 0.45);
          m.shake(0.5);
        });
      },
    }, {
      name: 'グラビティアンカー', icon: 'magnet', desc: '周囲の敵を引き寄せてスタンさせ、自分は固くなる', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.7, aiRange: 7,
      cast(m, u) {
        u.buff('def', 0.5, 4);
        m.fx.telegraph(u.pos, 9, 0.4, 0x9fd0ff);
        m.after(0.4, () => {
          m.pull(u, u.pos, 9, 7);
          m.fx.ring(u.pos, 9, 0xcfe8ff, 0.5);
          m.aoe(u, u.pos, 9, u.power() * 2.0, { stun: 1.6 });
          m.shake(0.5);
        });
      },
    }],
  },
  {
    id: 'volga', name: 'ボルガ', role: 'アタッカー', blurb: '大剣で薙ぎ払う突破役。乱戦で真価を発揮。',
    model: 'Sendagaya_Shibu', weapons: ['greatsword'],
    color: 0xff8a3c, hp: 1200, atk: 138, speed: 6.6, range: 2.9, interval: 1.15, ranged: false,
    idle: 'Sword_Idle', run: 'Jog_Fwd_Loop', attacks: ['Sword_Attack'],
    skills: [
      {
        name: '旋風斬', icon: 'spin', desc: '回転して周囲をまとめて斬る', cd: 8, anim: 'Sword_Attack', lock: 0.7, aiRange: 3.4,
        cast(m, u) {
          for (let i = 0; i < 3; i++) m.after(0.15 + i * 0.2, () => {
            m.fx.ring(u.pos, 3.8, 0xffb070, 0.3);
            m.aoe(u, u.pos, 3.8, u.power() * 0.85, { knock: 0.8 });
          });
        },
      },
      {
        name: '雄叫び', icon: 'roar', desc: '6秒間、攻撃力+45%・移動速度+25%', cd: 15, anim: 'Spell_Simple_Enter', lock: 0.3, aiRange: 9,
        cast(m, u) {
          u.buff('atk', 0.45, 6); u.buff('speed', 0.25, 6);
          m.fx.ring(u.pos, 3, 0xff7a30, 0.6); m.fx.aura(u, 0xff7a30, 6);
        },
      },
    ],
    ults: [{
      name: '大地割り', icon: 'quake', desc: '跳び上がって叩きつけ、広範囲に大ダメージ', cd: 0, anim: 'Sword_Attack', lock: 0.9, aiRange: 7,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 5, 8);
        m.fx.telegraph(p, 5.5, 0.6, 0xff7a30);
        m.dash(u, p, 0.55);
        m.after(0.6, () => {
          m.fx.ring(u.pos, 5.5, 0xffc090, 0.6); m.fx.burst(u.pos, 0xff9a50, 22, 9);
          m.aoe(u, u.pos, 5.5, u.power() * 4.0, { stun: 1.2, knock: 3 });
          m.shake(0.8);
        });
      },
    }, {
      name: 'バーサーク', icon: 'rage', desc: '8秒間、攻撃・速度・防御が大幅アップし体力も回復', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.4, aiRange: 8,
      cast(m, u) {
        u.buff('atk', 0.7, 8); u.buff('speed', 0.35, 8); u.buff('def', 0.3, 8);
        m.heal(u, u.maxHp * 0.3);
        m.fx.ring(u.pos, 4, 0xff5a20, 0.7); m.fx.aura(u, 0xff5a20, 8);
        m.aoe(u, u.pos, 4, u.power() * 1.2, { knock: 3 });
        m.shake(0.4);
      },
    }],
  },
  {
    id: 'lumina', name: 'ルミナ', role: 'サポート', blurb: '遠距離から炎を放ち、味方を癒やす魔導士。',
    model: 'Victoria_Rubin', weapons: ['staff'],
    color: 0xc77dff, hp: 850, atk: 105, speed: 6.4, range: 11, interval: 1.1, ranged: true,
    idle: 'Idle_Loop', run: 'Jog_Fwd_Loop', attacks: ['Spell_Simple_Shoot'],
    skills: [
      {
        name: 'フレイムボム', icon: 'bomb', desc: '着弾地点で爆発する火球を放つ', cd: 7, anim: 'Spell_Simple_Shoot', lock: 0.4, aiRange: 12,
        cast(m, u, aim) {
          m.after(0.2, () => m.shoot(u, aim.dir, {
            speed: 22, range: 14, radius: 0.55, dmg: u.power() * 0.6, color: 0xff6a2a,
            explode: { radius: 3.6, dmg: u.power() * 1.7 },
          }));
        },
      },
      {
        name: '癒やしの輪', icon: 'heal', desc: '周囲の味方のHPを30%回復', cd: 16, anim: 'Spell_Simple_Enter', lock: 0.5, aiRange: 99, aiWhen: 'allyHurt',
        cast(m, u) {
          m.after(0.3, () => { m.fx.ring(u.pos, 6.5, 0x7dffb0, 0.7); m.healAllies(u, u.pos, 6.5, 0.3); });
        },
      },
    ],
    ults: [{
      name: 'メテオレイン', icon: 'meteor', desc: '狙った場所に隕石を3連続で落とす', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.9, aiRange: 12,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 8, 13);
        for (let i = 0; i < 3; i++) {
          const q = p.clone().add(v(Math.cos(i * 2.1) * (i ? 2.2 : 0), 0, Math.sin(i * 2.1) * (i ? 2.2 : 0)));
          m.after(0.2 + i * 0.35, () => m.fx.telegraph(q, 4.2, 0.7, 0xff5a2a));
          m.after(0.9 + i * 0.35, () => {
            m.fx.pillar(q, 0xff7a3a, 1.6); m.fx.ring(q, 4.2, 0xffb070, 0.5); m.fx.burst(q, 0xff8a40, 14, 8);
            m.aoe(u, q, 4.2, u.power() * 2.2, { knock: 1.5 });
            m.shake(0.45);
          });
        }
      },
    }, {
      name: 'サンクチュアリ', icon: 'holy', desc: '6秒間、足元の聖域で味方を回復し敵を鈍らせる', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.6, aiRange: 8,
      cast(m, u) {
        const p = u.pos.clone();
        m.fx.pillar(p, 0x7dffb0, 2);
        m.zone(p, 6.5, 6, 0x7dffb0, 0.5, () => { m.healAllies(u, p, 6.5, 0.06); m.aoe(u, p, 6.5, u.power() * 0.35, { slow: 0.7 }); });
      },
    }],
  },
  {
    id: 'shade', name: 'シェイド', role: 'スプリンター', blurb: '最速の二刀使い。拠点を奪って回る遊撃手。',
    model: 'Vita', weapons: ['dagger', 'daggerOff'],
    color: 0x4be0c0, hp: 900, atk: 78, speed: 8.4, range: 2.4, interval: 0.62, ranged: false,
    idle: 'Idle_Loop', run: 'Sprint_Loop', attacks: ['Punch_Jab', 'Punch_Cross'],
    skills: [
      {
        name: '影走り', icon: 'dash', desc: '前方へ駆け抜け、通り道の敵を斬る', cd: 6, anim: 'Roll', lock: 0.3, aiRange: 7,
        cast(m, u, aim) {
          const from = u.pos.clone();
          const to = ahead(u, aim, 8);
          m.dash(u, to, 0.22);
          m.after(0.22, () => {
            m.fx.trail(from, u.pos, 0x4be0c0);
            m.lineHit(u, from, u.pos, 1.8, u.power() * 2.0);
          });
        },
      },
      {
        name: '煙隠れ', icon: 'smoke', desc: '4秒間姿を消し、移動速度+40%', cd: 14, anim: 'Spell_Simple_Enter', lock: 0.2, aiRange: 10, aiWhen: 'hurt',
        cast(m, u) {
          u.stealth = 4; u.buff('speed', 0.4, 4);
          m.fx.burst(u.pos.clone().add(v(0, 1, 0)), 0x99aabb, 16, 4);
        },
      },
    ],
    ults: [{
      name: '千刃乱舞', icon: 'blades', desc: '周囲の敵すべてに連続で斬りかかる', cd: 0, anim: 'Punch_Cross', lock: 0.9, aiRange: 8,
      cast(m, u) {
        u.invuln = 1.0;
        m.fx.telegraph(u.pos, 9, 0.3, 0x4be0c0);
        const origin = u.pos.clone();
        for (let i = 0; i < 5; i++) m.after(0.25 + i * 0.13, () => {
          for (const e of m.enemiesOf(u)) {
            if (!e.alive || e.pos.distanceTo(origin) > 9) continue;
            m.fx.trail(u.pos, e.pos, 0x9ffff0); m.fx.slash(e.pos, Math.random() * 6.28, 2.2, 0x9ffff0);
            m.damage(e, u.power() * 1.25, u);
          }
        });
        m.shake(0.4);
      },
    }, {
      name: 'ファントムダイブ', icon: 'dive', desc: '狙った敵の背後へ瞬間移動し、致命の一撃', cd: 0, anim: 'Punch_Cross', lock: 0.5, aiRange: 12,
      cast(m, u, aim) {
        const t = aim.target;
        u.invuln = 0.6;
        if (!t) { m.dash(u, ahead(u, aim, 8), 0.2); return; }
        const from = u.pos.clone();
        m.dash(u, t.pos.clone().addScaledVector(aim.dir, 1.6), 0.12);
        m.after(0.2, () => {
          m.fx.trail(from, u.pos, 0x9ffff0);
          if (!t.alive) return;
          u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
          m.fx.slash(t.pos, u.yaw, 3, 0x9ffff0); m.fx.flash(t.pos.clone().setY(1.2), 2.2, 0x9ffff0);
          t.stun = Math.max(t.stun, 1.0);
          m.damage(t, u.power() * 6.5, u);
          m.shake(0.5);
        });
      },
    }],
  },
  {
    id: 'veil', name: 'ヴェイル', role: 'スナイパー', blurb: '長射程の光線銃で拠点の外から制圧する。',
    model: 'Sendagaya_Shino', weapons: ['gun'],
    color: 0xffd23c, hp: 800, atk: 150, speed: 6.5, range: 14, interval: 1.45, ranged: true,
    idle: 'Pistol_Idle_Loop', run: 'Jog_Fwd_Loop', attacks: ['Pistol_Shoot'],
    skills: [
      {
        name: '貫通レーザー', icon: 'laser', desc: '敵を貫く強力な一射', cd: 7, anim: 'Pistol_Shoot', lock: 0.45, aiRange: 15,
        cast(m, u, aim) {
          m.after(0.2, () => m.shoot(u, aim.dir, {
            speed: 38, range: 20, radius: 0.9, dmg: u.power() * 1.9, color: 0xffe27a, pierce: true,
          }));
        },
      },
      {
        name: '離脱ステップ', icon: 'dodge', desc: '後ろへ飛び退き、3秒間移動速度+30%', cd: 9, anim: 'Roll', lock: 0.25, aiRange: 4,
        cast(m, u, aim) {
          m.dash(u, ahead(u, aim, -7), 0.22);
          u.buff('speed', 0.3, 3);
          m.fx.burst(u.pos, 0xffe27a, 8, 3);
        },
      },
    ],
    ults: [{
      name: '光弾の雨', icon: 'rain', desc: '狙った範囲に3秒間、光弾を降らせ続ける', cd: 0, anim: 'Pistol_Shoot', lock: 0.6, aiRange: 15,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 9, 16);
        m.zone(p, 5.5, 3.2, 0xffd23c, 0.4, () => {
          m.aoe(u, p, 5.5, u.power() * 0.62, { slow: 0.6 });
          m.fx.burst(p.clone().add(v((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), 0xffe27a, 5, 3);
        });
      },
    }, {
      name: 'オーバーチャージ', icon: 'beam', desc: '溜めてから、すべてを貫く極太の光線を放つ', cd: 0, anim: 'Pistol_Shoot', lock: 0.85, aiRange: 18,
      cast(m, u, aim) {
        m.fx.trail(u.pos, ahead(u, aim, 30), 0xffe27a);
        m.after(0.55, () => {
          m.shoot(u, aim.dir, { speed: 70, range: 40, radius: 1.7, dmg: u.power() * 4.2, color: 0xfff2b0, pierce: true });
          m.shake(0.5);
        });
      },
    }],
  },
  {
    id: 'mors', name: 'モルス', role: 'トリックスター', blurb: '呪いで敵を縛る大鎌の術師。足止めの達人。',
    model: 'Darkness_Shibu', weapons: ['scythe'],
    color: 0x9cff5a, hp: 980, atk: 92, speed: 6.4, range: 9.5, interval: 1.0, ranged: true,
    idle: 'Idle_Loop', run: 'Jog_Fwd_Loop', attacks: ['Spell_Simple_Shoot'],
    skills: [
      {
        name: '呪いの沼', icon: 'swamp', desc: '5秒間、範囲内の敵を鈍足にして削る', cd: 10, anim: 'Spell_Simple_Enter', lock: 0.45, aiRange: 10,
        cast(m, u, aim) {
          const p = aimPoint(u, aim, 6, 11);
          m.zone(p, 4.5, 5, 0x9cff5a, 0.5, () => m.aoe(u, p, 4.5, u.power() * 0.4, { slow: 0.9 }));
        },
      },
      {
        name: '生命吸収', icon: 'drain', desc: '周囲の敵にダメージを与え、自分を回復', cd: 11, anim: 'Spell_Simple_Enter', lock: 0.5, aiRange: 4.5,
        cast(m, u) {
          m.after(0.3, () => {
            m.fx.ring(u.pos, 5, 0x9cff5a, 0.5);
            const n = m.aoe(u, u.pos, 5, u.power() * 1.5, {});
            if (n) m.heal(u, u.maxHp * 0.12 * n);
          });
        },
      },
    ],
    ults: [{
      name: '死者の刻印', icon: 'mark', desc: '広範囲の敵をスタンさせ、大ダメージ', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.9, aiRange: 10,
      cast(m, u) {
        m.fx.telegraph(u.pos, 11, 0.7, 0x9cff5a);
        m.after(0.7, () => {
          m.fx.ring(u.pos, 11, 0xcaff9a, 0.8);
          for (const e of m.enemiesOf(u)) if (e.alive && e.pos.distanceTo(u.pos) < 11) m.fx.pillar(e.pos, 0x9cff5a, 1.0);
          m.aoe(u, u.pos, 11, u.power() * 2.6, { stun: 2.0 });
          m.shake(0.6);
        });
      },
    }, {
      name: '冥府の渦', icon: 'vortex', desc: '狙った場所に渦を作り、敵を吸い寄せながら削る', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.7, aiRange: 11,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 7, 12);
        m.fx.pillar(p, 0x9cff5a, 1.4);
        m.zone(p, 6, 4.5, 0x9cff5a, 0.45, () => { m.pull(u, p, 6.5, 3.2); m.aoe(u, p, 6, u.power() * 0.55, { slow: 0.6 }); });
      },
    }],
  },
];
