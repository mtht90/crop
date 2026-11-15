import * as THREE from 'three';
import type { Match, Unit } from './game';
import type { WeaponName } from './weapons';
import type { IconName } from './icons';

export interface Aim {
  dir: THREE.Vector3; target: Unit | null; point: THREE.Vector3;
  /** 手動で狙った（引っぱった）。point は狙った地点 */
  manual?: boolean;
}
/** 引っぱったときの予告表示と、自動照準で敵を探す距離 */
export interface AimShape { kind: 'line' | 'area' | 'self'; reach: number; radius?: number; width?: number }

export interface SkillDef {
  name: string;
  icon: IconName;
  desc: string;
  cd: number;          // クールタイム(秒)。必殺技では未使用
  anim: string;
  lock: number;        // 発動中に動けない時間(秒)
  aiRange: number;     // AIが「この距離に敵がいれば使う」目安
  aim: AimShape;
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
  const p = aim.manual ? aim.point.clone() : aim.target ? aim.target.pos.clone() : ahead(u, aim, d);
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
        name: 'シールドバッシュ', icon: 'bash', desc: '前方を盾で殴り、ダメージとスタン', cd: 9, anim: 'Punch_Cross', lock: 0.27, aim: { kind: 'line', reach: 3.4, width: 2.6 }, aiRange: 3.2,
        cast(m, u, aim) {
          m.after(0.18, () => {
            const p = ahead(u, aim, 1.8);
            m.fx.slash(u.pos, u.yaw, 3.4, 0x9fd0ff);
            m.aoe(u, p, 2.8, u.power() * 1.6, { stun: 1.3, knock: 2.5 });
          });
        },
      },
      {
        name: '鉄壁の構え', icon: 'guard', desc: '5秒間、受けるダメージを60%カット', cd: 15, anim: 'Spell_Simple_Enter', lock: 0.18, aim: { kind: 'self', reach: 0, radius: 2.4 }, aiRange: 6, aiWhen: 'hurt',
        cast(m, u) {
          u.buff('def', 0.6, 5);
          m.fx.ring(u.pos, 2.4, 0x9fd0ff, 0.6);
          m.fx.aura(u, 0x7fbfff, 5);
        },
      },
    ],
    ults: [{
      name: '守護の号令', icon: 'rally', desc: '周囲の敵を吹き飛ばし、味方を大回復', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.42, aim: { kind: 'self', reach: 0, radius: 7 }, aiRange: 5,
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
      name: 'グラビティアンカー', icon: 'magnet', desc: '周囲の敵を引き寄せてスタンさせ、自分は固くなる', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.42, aim: { kind: 'self', reach: 0, radius: 9 }, aiRange: 7,
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
        name: '旋風斬', icon: 'spin', desc: '回転して周囲をまとめて斬る', cd: 8, anim: 'Sword_Attack', lock: 0.42, aim: { kind: 'self', reach: 0, radius: 3.8 }, aiRange: 3.4,
        cast(m, u) {
          for (let i = 0; i < 3; i++) m.after(0.15 + i * 0.2, () => {
            m.fx.ring(u.pos, 3.8, 0xffb070, 0.3);
            m.aoe(u, u.pos, 3.8, u.power() * 0.85, { knock: 0.8 });
          });
        },
      },
      {
        name: '雄叫び', icon: 'roar', desc: '6秒間、攻撃力+45%・移動速度+25%', cd: 15, anim: 'Spell_Simple_Enter', lock: 0.18, aim: { kind: 'self', reach: 0, radius: 3 }, aiRange: 9,
        cast(m, u) {
          u.buff('atk', 0.45, 6); u.buff('speed', 0.25, 6);
          m.fx.ring(u.pos, 3, 0xff7a30, 0.6); m.fx.aura(u, 0xff7a30, 6);
        },
      },
    ],
    ults: [{
      name: '大地割り', icon: 'quake', desc: '跳び上がって叩きつけ、広範囲に大ダメージ', cd: 0, anim: 'Sword_Attack', lock: 0.54, aim: { kind: 'area', reach: 8, radius: 5.5 }, aiRange: 7,
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
      name: 'バーサーク', icon: 'rage', desc: '8秒間、攻撃・速度・防御が大幅アップし体力も回復', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.24, aim: { kind: 'self', reach: 0, radius: 4 }, aiRange: 8,
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
        name: 'フレイムボム', icon: 'bomb', desc: '着弾地点で爆発する火球を放つ', cd: 7, anim: 'Spell_Simple_Shoot', lock: 0.24, aim: { kind: 'line', reach: 14, width: 1.1 }, aiRange: 12,
        cast(m, u, aim) {
          m.after(0.2, () => m.shoot(u, aim.dir, {
            speed: 22, range: 14, radius: 0.55, dmg: u.power() * 0.6, color: 0xff6a2a,
            explode: { radius: 3.6, dmg: u.power() * 1.7 },
          }));
        },
      },
      {
        name: '癒やしの輪', icon: 'heal', desc: '周囲の味方のHPを30%回復', cd: 16, anim: 'Spell_Simple_Enter', lock: 0.3, aim: { kind: 'self', reach: 0, radius: 6.5 }, aiRange: 99, aiWhen: 'allyHurt',
        cast(m, u) {
          m.after(0.3, () => { m.fx.ring(u.pos, 6.5, 0x7dffb0, 0.7); m.healAllies(u, u.pos, 6.5, 0.3); });
        },
      },
    ],
    ults: [{
      name: 'メテオレイン', icon: 'meteor', desc: '狙った場所に隕石を3連続で落とす', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.54, aim: { kind: 'area', reach: 13, radius: 5 }, aiRange: 12,
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
      name: 'サンクチュアリ', icon: 'holy', desc: '6秒間、足元の聖域で味方を回復し敵を鈍らせる', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.36, aim: { kind: 'self', reach: 0, radius: 6.5 }, aiRange: 8,
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
        name: '影走り', icon: 'dash', desc: '前方へ駆け抜け、通り道の敵を斬る', cd: 6, anim: 'Roll', lock: 0.18, aim: { kind: 'line', reach: 8, width: 1.8 }, aiRange: 7,
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
        name: '煙隠れ', icon: 'smoke', desc: '4秒間姿を消し、移動速度+40%', cd: 14, anim: 'Spell_Simple_Enter', lock: 0.12, aim: { kind: 'self', reach: 0, radius: 1.5 }, aiRange: 10, aiWhen: 'hurt',
        cast(m, u) {
          u.stealth = 4; u.buff('speed', 0.4, 4);
          m.fx.burst(u.pos.clone().add(v(0, 1, 0)), 0x99aabb, 16, 4);
        },
      },
    ],
    ults: [{
      name: '千刃乱舞', icon: 'blades', desc: '周囲の敵すべてに連続で斬りかかる', cd: 0, anim: 'Punch_Cross', lock: 0.54, aim: { kind: 'self', reach: 0, radius: 9 }, aiRange: 8,
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
      name: 'ファントムダイブ', icon: 'dive', desc: '狙った敵の背後へ瞬間移動し、致命の一撃', cd: 0, anim: 'Punch_Cross', lock: 0.3, aim: { kind: 'line', reach: 12, width: 1.2 }, aiRange: 12,
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
        name: '貫通レーザー', icon: 'laser', desc: '敵を貫く強力な一射', cd: 7, anim: 'Pistol_Shoot', lock: 0.27, aim: { kind: 'line', reach: 20, width: 1.8 }, aiRange: 15,
        cast(m, u, aim) {
          m.after(0.2, () => m.shoot(u, aim.dir, {
            speed: 38, range: 20, radius: 0.9, dmg: u.power() * 1.9, color: 0xffe27a, pierce: true,
          }));
        },
      },
      {
        name: '離脱ステップ', icon: 'dodge', desc: '敵から飛び退き（引っぱると好きな方向へ）、3秒間移動速度+30%', cd: 9, anim: 'Roll', lock: 0.15, aim: { kind: 'line', reach: 7, width: 1.2 }, aiRange: 4,
        cast(m, u, aim) {
          m.dash(u, ahead(u, aim, aim.manual ? 7 : -7), 0.22); // 引っぱった方向へ。タップなら敵から離れる
          u.buff('speed', 0.3, 3);
          m.fx.burst(u.pos, 0xffe27a, 8, 3);
        },
      },
    ],
    ults: [{
      name: '光弾の雨', icon: 'rain', desc: '狙った範囲に3秒間、光弾を降らせ続ける', cd: 0, anim: 'Pistol_Shoot', lock: 0.36, aim: { kind: 'area', reach: 16, radius: 5.5 }, aiRange: 15,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 9, 16);
        m.zone(p, 5.5, 3.2, 0xffd23c, 0.4, () => {
          m.aoe(u, p, 5.5, u.power() * 0.62, { slow: 0.6 });
          m.fx.burst(p.clone().add(v((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), 0xffe27a, 5, 3);
        });
      },
    }, {
      name: 'オーバーチャージ', icon: 'beam', desc: '溜めてから、すべてを貫く極太の光線を放つ', cd: 0, anim: 'Pistol_Shoot', lock: 0.51, aim: { kind: 'line', reach: 40, width: 3.4 }, aiRange: 18,
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
        name: '呪いの沼', icon: 'swamp', desc: '5秒間、範囲内の敵を鈍足にして削る', cd: 10, anim: 'Spell_Simple_Enter', lock: 0.27, aim: { kind: 'area', reach: 11, radius: 4.5 }, aiRange: 10,
        cast(m, u, aim) {
          const p = aimPoint(u, aim, 6, 11);
          m.zone(p, 4.5, 5, 0x9cff5a, 0.5, () => m.aoe(u, p, 4.5, u.power() * 0.4, { slow: 0.9 }));
        },
      },
      {
        name: '生命吸収', icon: 'drain', desc: '周囲の敵にダメージを与え、自分を回復', cd: 11, anim: 'Spell_Simple_Enter', lock: 0.3, aim: { kind: 'self', reach: 0, radius: 5 }, aiRange: 4.5,
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
      name: '死者の刻印', icon: 'mark', desc: '広範囲の敵をスタンさせ、大ダメージ', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.54, aim: { kind: 'self', reach: 0, radius: 11 }, aiRange: 10,
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
      name: '冥府の渦', icon: 'vortex', desc: '狙った場所に渦を作り、敵を吸い寄せながら削る', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.42, aim: { kind: 'area', reach: 12, radius: 6 }, aiRange: 11,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 7, 12);
        m.fx.pillar(p, 0x9cff5a, 1.4);
        m.zone(p, 6, 4.5, 0x9cff5a, 0.45, () => { m.pull(u, p, 6.5, 3.2); m.aoe(u, p, 6, u.power() * 0.55, { slow: 0.6 }); });
      },
    }],
  },
  {
    id: 'mio', name: 'ミオ', role: 'ボマー', blurb: '放物線で爆弾を投げ込む。壁の向こうもお構いなし。',
    model: 'AvatarSample_A', weapons: ['staff'],
    color: 0xff9ec7, hp: 820, atk: 118, speed: 6.3, range: 10, interval: 1.2, ranged: true,
    idle: 'Idle_Loop', run: 'Jog_Fwd_Loop', attacks: ['Spell_Simple_Shoot'],
    skills: [
      {
        name: 'スティッキーボム', icon: 'bomb', desc: '狙った地点に爆弾を貼り付け、1秒後に大爆発', cd: 8, anim: 'Spell_Simple_Shoot', lock: 0.2, aim: { kind: 'area', reach: 11, radius: 3.8 }, aiRange: 11,
        cast(m, u, aim) {
          const p = aimPoint(u, aim, 7, 11);
          m.fx.telegraph(p, 3.8, 1.0, 0xff9ec7);
          m.after(1.0, () => { m.fx.ring(p, 3.8, 0xffc4dd, 0.5); m.fx.burst(p, 0xff9ec7, 16, 8); m.aoe(u, p, 3.8, u.power() * 2.4, { knock: 2 }); m.shake(0.35); });
        },
      },
      {
        name: 'バリアドーム', icon: 'guard', desc: '4秒間、周囲の味方の被ダメージを40%カット', cd: 15, anim: 'Spell_Simple_Enter', lock: 0.2, aim: { kind: 'self', reach: 0, radius: 6 }, aiRange: 7, aiWhen: 'allyHurt',
        cast(m, u) {
          m.fx.ring(u.pos, 6, 0xffc4dd, 0.6);
          for (const a of m.alliesOf(u)) if (a.alive && a.pos.distanceTo(u.pos) < 6) { a.buff('def', 0.4, 4); m.fx.aura(a, 0xff9ec7, 4); }
        },
      },
    ],
    ults: [{
      name: 'じゅうたん爆撃', icon: 'meteor', desc: '狙った方向へ一直線に爆発を連ねる', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.4, aim: { kind: 'line', reach: 18, width: 4 }, aiRange: 14,
      cast(m, u, aim) {
        for (let i = 0; i < 6; i++) {
          const p = ahead(u, aim, 3 + i * 3);
          m.after(0.15 + i * 0.12, () => { m.fx.flash(p.clone().setY(0.8), 2.4, 0xff9ec7, 0.3); m.fx.ring(p, 3, 0xffc4dd, 0.4); m.aoe(u, p, 3, u.power() * 1.5, { knock: 1 }); m.shake(0.2); });
        }
      },
    }, {
      name: 'グラビティボム', icon: 'vortex', desc: '敵を吸い寄せてから爆発する重力弾', cd: 0, anim: 'Spell_Simple_Shoot', lock: 0.3, aim: { kind: 'area', reach: 12, radius: 6 }, aiRange: 12,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 8, 12);
        m.zone(p, 6, 1.6, 0xd28cff, 0.3, () => m.pull(u, p, 6.5, 3.5));
        m.after(1.7, () => { m.fx.pillar(p, 0xd28cff, 2); m.fx.ring(p, 6, 0xf0c8ff, 0.6); m.aoe(u, p, 6, u.power() * 3.4, { stun: 1 }); m.shake(0.6); });
      },
    }],
  },
  {
    id: 'nox', name: 'ノクス', role: 'ガンスリンガー', blurb: '二丁拳銃で弾をばら撒く。中距離の撃ち合いに強い。',
    model: 'AvatarSample_B', weapons: ['gun', 'gunOff'],
    color: 0xb36bff, hp: 900, atk: 66, speed: 6.9, range: 8.5, interval: 0.5, ranged: true,
    idle: 'Pistol_Idle_Loop', run: 'Sprint_Loop', attacks: ['Pistol_Shoot'],
    skills: [
      {
        name: 'ローリングショット', icon: 'dodge', desc: '転がって移動し、着地点から3連射', cd: 7, anim: 'Roll', lock: 0.15, aim: { kind: 'line', reach: 6, width: 1.2 }, aiRange: 9,
        cast(m, u, aim) {
          m.dash(u, ahead(u, aim, 6), 0.25);
          m.after(0.28, () => {
            const t = m.enemiesOf(u).filter((e) => e.alive && e.stealth <= 0).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos))[0];
            const dir = t ? t.pos.clone().sub(u.pos).setY(0).normalize() : aim.dir;
            for (let i = 0; i < 3; i++) m.after(i * 0.1, () => m.shoot(u, dir, { speed: 34, range: 11, radius: 0.5, dmg: u.power() * 1.1, color: 0xd6a8ff }));
          });
        },
      },
      {
        name: 'ヘッドショット', icon: 'laser', desc: '溜めてから撃つ、貫通する強力な一発', cd: 9, anim: 'Pistol_Shoot', lock: 0.3, aim: { kind: 'line', reach: 16, width: 1 }, aiRange: 14,
        cast(m, u, aim) { m.after(0.3, () => m.shoot(u, aim.dir, { speed: 50, range: 16, radius: 0.6, dmg: u.power() * 4, color: 0xffffff, pierce: true })); },
      },
    ],
    ults: [{
      name: 'バレットストーム', icon: 'blades', desc: '全方位に弾丸をばら撒く', cd: 0, anim: 'Pistol_Shoot', lock: 0.4, aim: { kind: 'self', reach: 0, radius: 10 }, aiRange: 8,
      cast(m, u) {
        for (let w = 0; w < 3; w++) m.after(w * 0.18, () => {
          for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + w * 0.26; m.shoot(u, v(Math.sin(a), 0, Math.cos(a)), { speed: 26, range: 10, radius: 0.6, dmg: u.power() * 1.3, color: 0xd6a8ff }); }
        });
        m.shake(0.3);
      },
    }, {
      name: 'ロックオン', icon: 'attack', desc: '近くの敵すべてに追尾弾を撃ち込む', cd: 0, anim: 'Pistol_Shoot', lock: 0.3, aim: { kind: 'self', reach: 0, radius: 14 }, aiRange: 13,
      cast(m, u) {
        const ts = m.enemiesOf(u).filter((e) => e.alive && e.pos.distanceTo(u.pos) < 14);
        ts.forEach((t, k) => { for (let i = 0; i < 4; i++) m.after(k * 0.05 + i * 0.12, () => { if (t.alive) m.shoot(u, t.pos.clone().sub(u.pos).setY(0).normalize(), { speed: 30, range: 18, radius: 0.6, dmg: u.power() * 1.4, color: 0xffe27a, homing: t }); }); });
      },
    }],
  },
  {
    id: 'ren', name: 'レン', role: 'ファイター', blurb: '居合の一太刀で切り込む剣士。間合いの管理が鍵。',
    model: 'AvatarSample_C', weapons: ['sword'],
    color: 0xff5a5a, hp: 1150, atk: 112, speed: 6.8, range: 2.7, interval: 0.85, ranged: false,
    idle: 'Sword_Idle', run: 'Jog_Fwd_Loop', attacks: ['Sword_Attack'],
    skills: [
      {
        name: '居合', icon: 'dash', desc: '一瞬で踏み込み、通り道を斬る', cd: 6, anim: 'Sword_Attack', lock: 0.15, aim: { kind: 'line', reach: 7, width: 1.8 }, aiRange: 7,
        cast(m, u, aim) {
          const from = u.pos.clone();
          m.dash(u, ahead(u, aim, 7), 0.12);
          m.after(0.13, () => { m.fx.trail(from, u.pos, 0xff9a9a); m.lineHit(u, from, u.pos, 1.8, u.power() * 2.2); });
        },
      },
      {
        name: '見切り', icon: 'guard', desc: '1秒間無敵になり、その後4秒間攻撃力+40%', cd: 12, anim: 'Spell_Simple_Enter', lock: 0.1, aim: { kind: 'self', reach: 0, radius: 1.5 }, aiRange: 5, aiWhen: 'hurt',
        cast(m, u) { u.invuln = 1; u.buff('atk', 0.4, 5); m.fx.ring(u.pos, 2, 0xff9a9a, 0.5); m.fx.aura(u, 0xff5a5a, 5); },
      },
    ],
    ults: [{
      name: '百花繚乱', icon: 'blades', desc: '近くの敵3人へ次々に斬りかかる', cd: 0, anim: 'Sword_Attack', lock: 0.3, aim: { kind: 'self', reach: 0, radius: 11 }, aiRange: 10,
      cast(m, u) {
        u.invuln = 1.2;
        const ts = m.enemiesOf(u).filter((e) => e.alive && e.pos.distanceTo(u.pos) < 11).slice(0, 3);
        ts.forEach((t, i) => m.after(0.08 + i * 0.3, () => {
          if (!t.alive) return;
          const from = u.pos.clone();
          m.dash(u, t.pos.clone(), 0.1);
          m.after(0.11, () => { m.fx.trail(from, u.pos, 0xffc0c0); m.fx.slash(t.pos, Math.random() * 6.28, 2.6, 0xffc0c0); m.damage(t, u.power() * 3.2, u); m.shake(0.25); });
        }));
      },
    }, {
      name: '一閃', icon: 'beam', desc: '前方を巨大な斬撃でまっすぐ薙ぎ払う', cd: 0, anim: 'Sword_Attack', lock: 0.35, aim: { kind: 'line', reach: 15, width: 3.6 }, aiRange: 13,
      cast(m, u, aim) {
        const to = ahead(u, aim, 15);
        m.after(0.25, () => { m.fx.trail(u.pos, to, 0xffffff); m.lineHit(u, u.pos.clone(), to, 1.8, u.power() * 4.5); m.shake(0.5); });
      },
    }],
  },
  {
    id: 'shirone', name: 'シロネ', role: 'ヒーラー', blurb: '星の魔法で仲間を癒やす猫耳の少女。',
    model: 'HairSample_Female', weapons: ['staff'],
    color: 0x9be7ff, hp: 900, atk: 84, speed: 6.6, range: 9.5, interval: 0.9, ranged: true,
    idle: 'Idle_Loop', run: 'Jog_Fwd_Loop', attacks: ['Spell_Simple_Shoot'],
    skills: [
      {
        name: 'スターヒール', icon: 'heal', desc: '狙った場所の味方のHPを25%回復', cd: 7, anim: 'Spell_Simple_Shoot', lock: 0.2, aim: { kind: 'area', reach: 12, radius: 4 }, aiRange: 99, aiWhen: 'allyHurt',
        cast(m, u, aim) {
          const hurt = m.alliesOf(u).filter((a) => a.alive && a.hp < a.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          const p = aim.manual ? aimPoint(u, aim, 6, 12) : (hurt && hurt.pos.distanceTo(u.pos) < 12 ? hurt.pos.clone() : u.pos.clone());
          m.fx.pillar(p, 0x9be7ff, 1.4); m.fx.ring(p, 4, 0xcff4ff, 0.5); m.healAllies(u, p, 4, 0.25);
        },
      },
      {
        name: 'ねこのきまぐれ', icon: 'rage', desc: '5秒間、周囲の味方の移動速度+30%', cd: 13, anim: 'Spell_Simple_Enter', lock: 0.15, aim: { kind: 'self', reach: 0, radius: 7 }, aiRange: 12,
        cast(m, u) { m.fx.ring(u.pos, 7, 0xcff4ff, 0.6); for (const a of m.alliesOf(u)) if (a.alive && a.pos.distanceTo(u.pos) < 7) { a.buff('speed', 0.3, 5); m.fx.aura(a, 0x9be7ff, 5); } },
      },
    ],
    ults: [{
      name: 'ほしふるよる', icon: 'holy', desc: '味方全員をどこにいても50%回復', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.4, aim: { kind: 'self', reach: 0, radius: 3 }, aiRange: 99, aiWhen: 'allyHurt',
      cast(m, u) { for (const a of m.alliesOf(u)) if (a.alive) { m.heal(a, a.maxHp * 0.5); m.fx.pillar(a.pos, 0x9be7ff, 1.2); } },
    }, {
      name: 'りゅうせいぐん', icon: 'meteor', desc: '狙った範囲に流れ星を降らせ、敵をスタン', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.4, aim: { kind: 'area', reach: 13, radius: 5.5 }, aiRange: 12,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 8, 13);
        m.fx.telegraph(p, 5.5, 0.6, 0x9be7ff);
        m.after(0.6, () => { m.fx.pillar(p, 0xcff4ff, 2.4); m.fx.burst(p, 0x9be7ff, 24, 9); m.aoe(u, p, 5.5, u.power() * 3, { stun: 1.5 }); m.shake(0.5); });
      },
    }],
  },
  {
    id: 'kai', name: 'カイ', role: 'ブルーザー', blurb: '大剣を軽々と振り回す突撃役。敵陣をかき乱す。',
    model: 'HairSample_Male', weapons: ['greatsword'],
    color: 0x5af0a0, hp: 1350, atk: 120, speed: 6.6, range: 3.0, interval: 1.0, ranged: false,
    idle: 'Sword_Idle', run: 'Jog_Fwd_Loop', attacks: ['Sword_Attack'],
    skills: [
      {
        name: 'チャージ', icon: 'dash', desc: '突進して、ぶつかった敵を吹き飛ばす', cd: 8, anim: 'Roll', lock: 0.2, aim: { kind: 'line', reach: 9, width: 2.2 }, aiRange: 8,
        cast(m, u, aim) {
          const from = u.pos.clone();
          m.dash(u, ahead(u, aim, 9), 0.3);
          m.after(0.3, () => { m.fx.trail(from, u.pos, 0x9fffc8); m.lineHit(u, from, u.pos, 2.2, u.power() * 1.6); m.aoe(u, u.pos, 2.5, 0, { knock: 4 }); });
        },
      },
      {
        name: 'グラウンドスラム', icon: 'quake', desc: '周囲を叩き割り、敵を1秒スタン', cd: 11, anim: 'Sword_Attack', lock: 0.3, aim: { kind: 'self', reach: 0, radius: 4.2 }, aiRange: 3.8,
        cast(m, u) { m.after(0.25, () => { m.fx.ring(u.pos, 4.2, 0x9fffc8, 0.4); m.fx.burst(u.pos, 0x5af0a0, 14, 7); m.aoe(u, u.pos, 4.2, u.power() * 1.6, { stun: 1 }); m.shake(0.4); }); },
      },
    ],
    ults: [{
      name: 'タイタンフォール', icon: 'quake', desc: '大きく跳んで着地点を叩き潰す', cd: 0, anim: 'Sword_Attack', lock: 0.55, aim: { kind: 'area', reach: 11, radius: 6 }, aiRange: 10,
      cast(m, u, aim) {
        const p = aimPoint(u, aim, 7, 11);
        m.fx.telegraph(p, 6, 0.55, 0x5af0a0);
        m.dash(u, p, 0.5);
        m.after(0.55, () => { m.fx.ring(u.pos, 6, 0x9fffc8, 0.6); m.fx.burst(u.pos, 0x5af0a0, 24, 10); m.aoe(u, u.pos, 6, u.power() * 3.6, { stun: 1, knock: 3 }); m.shake(0.8); });
      },
    }, {
      name: '不屈', icon: 'rage', desc: '3秒間無敵になり、体力を40%回復', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.2, aim: { kind: 'self', reach: 0, radius: 2 }, aiRange: 6, aiWhen: 'hurt',
      cast(m, u) { u.invuln = 3; m.heal(u, u.maxHp * 0.4); m.fx.aura(u, 0x5af0a0, 3); m.fx.pillar(u.pos, 0x9fffc8, 1.4); },
    }],
  },
  {
    id: 'pipi', name: 'ピピ', role: 'トリックスター', blurb: 'いたずら好きの森の子。風と花火で敵を翻弄する。',
    model: 'Vivi', weapons: ['staff'],
    color: 0xb6ff5a, hp: 860, atk: 92, speed: 7.2, range: 9, interval: 0.95, ranged: true,
    idle: 'Idle_Loop', run: 'Sprint_Loop', attacks: ['Spell_Simple_Shoot'],
    skills: [
      {
        name: 'いたずら花火', icon: 'bomb', desc: '着弾地点ではじける花火。敵を吹き飛ばす', cd: 6, anim: 'Spell_Simple_Shoot', lock: 0.15, aim: { kind: 'line', reach: 12, width: 1 }, aiRange: 11,
        cast(m, u, aim) { m.shoot(u, aim.dir, { speed: 24, range: 12, radius: 0.6, dmg: u.power() * 0.8, color: 0xffe25a, explode: { radius: 3.2, dmg: u.power() * 1.4 } }); },
      },
      {
        name: 'つむじ風', icon: 'vortex', desc: '狙った場所に風を起こし、敵を引き寄せる', cd: 10, anim: 'Spell_Simple_Enter', lock: 0.2, aim: { kind: 'area', reach: 10, radius: 4.5 }, aiRange: 10,
        cast(m, u, aim) { const p = aimPoint(u, aim, 6, 10); m.zone(p, 4.5, 2.4, 0xb6ff5a, 0.3, () => { m.pull(u, p, 5, 2.8); m.aoe(u, p, 4.5, u.power() * 0.3, {}); }); },
      },
    ],
    ults: [{
      name: 'おはなばたけ', icon: 'holy', desc: '6秒間、花畑で味方を回復し敵を鈍らせる', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.3, aim: { kind: 'area', reach: 10, radius: 7 }, aiRange: 9,
      cast(m, u, aim) { const p = aimPoint(u, aim, 3, 10); m.zone(p, 7, 6, 0xb6ff5a, 0.5, () => { m.healAllies(u, p, 7, 0.05); m.aoe(u, p, 7, u.power() * 0.3, { slow: 0.7 }); }); },
    }, {
      name: 'ピピ大旋風', icon: 'vortex', desc: '自分の周りに竜巻を起こし、敵を吹き飛ばし続ける', cd: 0, anim: 'Spell_Simple_Enter', lock: 0.2, aim: { kind: 'self', reach: 0, radius: 5 }, aiRange: 5,
      cast(m, u) { for (let i = 0; i < 8; i++) m.after(i * 0.3, () => { m.fx.ring(u.pos, 5, 0xd8ff9a, 0.3); m.aoe(u, u.pos, 5, u.power() * 0.7, { knock: 2.2 }); }); },
    }],
  },
];
