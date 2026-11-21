// Pure game rules: save shape, stat formulas, economy. No DOM — also used by the balance sim.
import { ALLIES, ALLY_BY_ID, AREAS, STARTER_ID, elementFactor, type AllyDef, type Element, type Rarity, type Role } from '../data/monsters.ts';
import { EQUIP_BY_ID, EQUIPS, SKILL_BY_ID, SKILLS, equipLvMul, type StatKey } from '../data/items.ts';

export const SAVE_VERSION = 1;

export type Banner = 'char' | 'equip' | 'skill';

export interface Save {
  v: number;
  coins: number;
  gems: number;
  souls: number;
  g: number; // current global stage index (0-based)
  maxG: number; // highest stage index reached (unlocked)
  kills: number; // gauge for current stage
  farming: boolean; // lost to the boss → looping this stage
  failPower: number;
  train: Record<TrainKey, number>;
  chars: Record<string, { stars: number; copies: number }>;
  active: string;
  equips: Record<string, { lv: number; copies: number }>;
  equipped: { weapon: string | null; armor: string | null; acc: string | null };
  skills: Record<string, { lv: number; copies: number }>;
  skillSlots: (string | null)[];
  guardians: Record<string, { rank: number; copies: number; shiny: boolean }>;
  guardianSlots: (string | null)[];
  codex: string[];
  gacha: Record<Banner, { pulls: number; pity: number }>;
  orbs: number;
  settings: { autoTrain: boolean; autoBoss: boolean; speed: 1 | 2; sound: boolean; music: boolean; autoEquip: boolean };
  missions: { day: string; prog: Record<string, number>; claimed: string[]; guide: number };
  stats: { kills: number; bossKills: number; pulls: number; prestiges: number; bestG: number; played: number };
  chestAt: number;
  lastSeen: number;
  created: number;
  seenIntro: boolean;
}

export type TrainKey = 'atk' | 'hp' | 'crit' | 'critDmg' | 'speed';

export interface TrainDef {
  key: TrainKey;
  name: string;
  desc: string;
  max: number;
  cost: (lv: number) => number;
  value: (lv: number) => number;
  fmt: (v: number) => string;
}

const step = (lv: number) => Math.pow(2, Math.floor(lv / 10));

export const TRAIN: TrainDef[] = [
  {
    key: 'atk',
    name: '攻撃力',
    desc: '基礎攻撃力。10レベルごとに2倍。',
    max: Infinity,
    cost: (lv) => 6 * Math.pow(1.1, lv) + lv * 2,
    value: (lv) => 10 * (1 + 0.1 * lv) * step(lv),
    fmt: (v) => fmt(v),
  },
  {
    key: 'hp',
    name: '体力',
    desc: '基礎体力。10レベルごとに2倍。',
    max: Infinity,
    cost: (lv) => 6 * Math.pow(1.1, lv) + lv * 2,
    value: (lv) => 120 * (1 + 0.1 * lv) * step(lv),
    fmt: (v) => fmt(v),
  },
  {
    key: 'crit',
    name: '会心率',
    desc: '会心の一撃が出る確率。',
    max: 60,
    cost: (lv) => 40 * Math.pow(1.19, lv),
    value: (lv) => 0.05 + 0.004 * lv,
    fmt: (v) => (v * 100).toFixed(1) + '%',
  },
  {
    key: 'critDmg',
    name: '会心ダメージ',
    desc: '会心の一撃の倍率。',
    max: Infinity,
    cost: (lv) => 60 * Math.pow(1.14, lv),
    value: (lv) => 1.5 + 0.05 * lv,
    fmt: (v) => Math.round(v * 100) + '%',
  },
  {
    key: 'speed',
    name: '攻撃速度',
    desc: '攻撃の間隔が短くなる。',
    max: 60,
    cost: (lv) => 50 * Math.pow(1.18, lv),
    value: (lv) => 1 + 0.015 * lv,
    fmt: (v) => '×' + v.toFixed(2),
  },
];
export const TRAIN_BY_KEY = Object.fromEntries(TRAIN.map((t) => [t.key, t])) as Record<TrainKey, TrainDef>;

// ---------- stages ----------
export const STAGES_PER_AREA = 10;
export function areaIndex(g: number) {
  return Math.floor(g / STAGES_PER_AREA);
}
export function areaDef(g: number) {
  return AREAS[areaIndex(g) % AREAS.length];
}
export function loopOf(g: number) {
  return Math.floor(areaIndex(g) / AREAS.length);
}
export function stageLabel(g: number) {
  return `${areaIndex(g) + 1}-${(g % STAGES_PER_AREA) + 1}`;
}
export function isAreaBoss(g: number) {
  return g % STAGES_PER_AREA === STAGES_PER_AREA - 1;
}
export function killsNeeded(g: number) {
  return isAreaBoss(g) ? 25 : g < 5 ? 10 : 15;
}

export type EnemyKind = 'mob' | 'elite' | 'boss';
export function enemyStats(g: number, kind: EnemyKind) {
  const hp = 20 * Math.pow(1.3, g);
  const atk = 5 * Math.pow(1.27, g);
  const gold = 3 * Math.pow(1.2, g);
  if (kind === 'mob') return { hp, atk, gold, interval: 1.4 };
  // bosses ramp up over the first area so a fresh player isn't walled at 1-1
  const ramp = Math.min(1, 0.4 + g * 0.06);
  if (kind === 'elite') return { hp: hp * 16 * ramp, atk: atk * 2.2 * ramp, gold: gold * 12, interval: 1.6 };
  return { hp: hp * 34 * ramp, atk: atk * 2.8 * ramp, gold: gold * 35, interval: 1.7 };
}
export function bossTime(g: number) {
  return isAreaBoss(g) ? 45 : 30;
}

// ---------- characters ----------
export const RARITY_MUL = [0, 1, 1.4, 2.0, 2.9, 4.2];
export const ROLE_MOD: Record<Role, { atk: number; hp: number; interval: number; range: number; regen: number }> = {
  blade: { atk: 1.0, hp: 1.0, interval: 0.95, range: 46, regen: 0.012 },
  archer: { atk: 0.88, hp: 0.82, interval: 0.75, range: 175, regen: 0.012 },
  mage: { atk: 1.45, hp: 0.85, interval: 1.35, range: 155, regen: 0.012 },
  guard: { atk: 0.78, hp: 1.75, interval: 1.1, range: 46, regen: 0.03 },
};
export const ROLE_AOE: Record<Role, number> = { blade: 1.15, archer: 1.0, mage: 1.45, guard: 1.1 };
export function starMul(stars: number) {
  return 1 + 0.2 * stars;
}
export function copiesForStar(stars: number) {
  return stars + 1; // 0→1 needs 1 dupe, 1→2 needs 2 ...
}
export function skillSlotsFor(r: Rarity) {
  return r >= 5 ? 3 : r >= 3 ? 2 : 1;
}

// ---------- guardians ----------
export const GUARD_BASE = [0, 0.06, 0.1, 0.16, 0.25, 0.4];
export const GUARD_EFFECT: Record<Element, { stat: StatKey | 'reduce'; label: string; scale: number }> = {
  fire: { stat: 'atk', label: '攻撃力', scale: 1 },
  water: { stat: 'hp', label: '体力', scale: 1 },
  wind: { stat: 'speed', label: '攻撃速度', scale: 0.35 },
  earth: { stat: 'reduce', label: '被ダメージ軽減', scale: 0.3 },
  light: { stat: 'gold', label: 'コイン獲得', scale: 1.2 },
  dark: { stat: 'critDmg', label: '会心ダメージ', scale: 1.5 },
};
export function guardianValue(def: AllyDef, rank: number, shiny: boolean) {
  return GUARD_BASE[def.rarity] * GUARD_EFFECT[def.el].scale * (1 + 0.5 * (rank - 1)) * (shiny ? 1.5 : 1);
}
export const GUARD_SLOT_UNLOCK = [0, 4, 10, 20, 40, 70]; // maxG needed for slot i
export function guardianSlotsUnlocked(maxG: number) {
  return GUARD_SLOT_UNLOCK.filter((x) => maxG >= x).length;
}
export function guardianKey(id: string, shiny: boolean) {
  return shiny ? id + '*' : id;
}
export function parseGuardianKey(k: string) {
  return { id: k.replace(/\*$/, ''), shiny: k.endsWith('*') };
}
export const GUARD_MAX_RANK = 10;

// ---------- prestige ----------
export const PRESTIGE_MIN_G = 30;
export function soulsFor(maxG: number) {
  if (maxG < PRESTIGE_MIN_G) return 0;
  return Math.floor(Math.pow((maxG - 25) / 5, 1.4));
}
export function soulMul(souls: number) {
  return { power: 1 + 0.05 * souls, gold: 1 + 0.03 * souls };
}

// ---------- derived stats ----------
export interface HeroStats {
  ally: AllyDef;
  atk: number;
  hp: number;
  interval: number;
  crit: number;
  critDmg: number;
  regen: number;
  reduce: number;
  gold: number;
  skillDmg: number;
  boss: number;
  range: number;
  power: number;
  skillSlots: number;
}

export function bonusTotals(s: Save) {
  const b: Record<StatKey | 'reduce', number> = { atk: 0, hp: 0, crit: 0, critDmg: 0, speed: 0, gold: 0, regen: 0, skillDmg: 0, boss: 0, reduce: 0 };
  for (const id of Object.values(s.equipped)) {
    if (!id) continue;
    const def = EQUIP_BY_ID[id];
    const own = s.equips[id];
    if (!def || !own) continue;
    const m = equipLvMul(own.lv);
    b[def.main[0]] += def.main[1] * m;
    if (def.sub) b[def.sub[0]] += def.sub[1] * m;
  }
  const slots = guardianSlotsUnlocked(s.maxG);
  s.guardianSlots.slice(0, slots).forEach((k) => {
    if (!k) return;
    const g = s.guardians[k];
    const { id } = parseGuardianKey(k);
    const def = ALLY_BY_ID[id];
    if (!g || !def) return;
    b[GUARD_EFFECT[def.el].stat] += guardianValue(def, g.rank, g.shiny);
  });
  return b;
}

export function heroStats(s: Save, charId = s.active): HeroStats {
  const ally = ALLY_BY_ID[charId] ?? ALLY_BY_ID[STARTER_ID];
  const own = s.chars[ally.id] ?? { stars: 0, copies: 0 };
  const rm = ROLE_MOD[ally.role];
  const b = bonusTotals(s);
  const codex = 1 + 0.02 * s.codex.length;
  const soul = soulMul(s.souls);
  const cm = RARITY_MUL[ally.rarity] * starMul(own.stars);
  const atk = TRAIN_BY_KEY.atk.value(s.train.atk) * cm * rm.atk * (1 + b.atk) * codex * soul.power;
  const hp = TRAIN_BY_KEY.hp.value(s.train.hp) * cm * rm.hp * (1 + b.hp) * codex * soul.power;
  const spd = TRAIN_BY_KEY.speed.value(s.train.speed) * (1 + b.speed);
  const interval = rm.interval / spd;
  const crit = Math.min(0.75, TRAIN_BY_KEY.crit.value(s.train.crit) + b.crit);
  const critDmg = TRAIN_BY_KEY.critDmg.value(s.train.critDmg) + b.critDmg;
  const regen = rm.regen + b.regen;
  const reduce = Math.min(0.6, b.reduce);
  const gold = (1 + b.gold) * soul.gold;
  const dps = (atk / interval) * (1 + crit * (critDmg - 1)) * ROLE_AOE[ally.role];
  const ehp = hp / (1 - reduce);
  const power = Math.round(Math.sqrt(dps * ehp) * 3);
  return {
    ally,
    atk,
    hp,
    interval,
    crit,
    critDmg,
    regen,
    reduce,
    gold,
    skillDmg: 1 + b.skillDmg,
    boss: 1 + b.boss,
    range: rm.range,
    power,
    skillSlots: skillSlotsFor(ally.rarity),
  };
}

/** average damage per second of skills (rough, for offline estimates) */
export function skillDps(s: Save, h: HeroStats, targets: number) {
  let d = 0;
  for (const id of s.skillSlots.slice(0, h.skillSlots)) {
    if (!id) continue;
    const def = SKILL_BY_ID[id];
    const lv = s.skills[id]?.lv ?? 1;
    const m = (1 + 0.15 * (lv - 1)) * h.skillDmg;
    const hits = def.kind === 'bolt' ? def.hits ?? 1 : def.kind === 'nova' || def.kind === 'meteor' || def.kind === 'freeze' ? Math.min(targets, 4) : 1;
    let mult = def.power * hits;
    if (def.kind === 'buff') mult = (def.atkBuff ?? 0) * m * ((def.dur ?? 0) / def.cd) * 2 + (def.spdBuff ?? 0) * ((def.dur ?? 0) / def.cd) * 2;
    d += (h.atk * mult * m) / def.cd;
  }
  return d;
}

export function elementAvg(el: Element, g: number) {
  const area = areaDef(g);
  const list = area.mobs;
  return list.reduce((acc, m) => acc + elementFactor(el, m.el), 0) / list.length;
}

// ---------- gacha ----------
export const GACHA_COST: Record<Banner, { one: number; ten: number }> = {
  char: { one: 150, ten: 1350 },
  equip: { one: 100, ten: 900 },
  skill: { one: 100, ten: 900 },
};
export const PITY: Record<Banner, number> = { char: 70, equip: 50, skill: 50 };
const GLV = [0, 10, 30, 60, 100, 160, 240, 340, 460, 600];
export function gachaLevel(pulls: number) {
  let l = 1;
  for (let i = 1; i < GLV.length; i++) if (pulls >= GLV[i]) l = i + 1;
  return l;
}
export function gachaNextLv(pulls: number) {
  const l = gachaLevel(pulls);
  return l >= GLV.length ? null : GLV[l];
}
export function gachaRates(pulls: number): number[] {
  const L = gachaLevel(pulls) - 1;
  const r5 = 0.01 + 0.0025 * L;
  const r4 = 0.05 + 0.006 * L;
  const r3 = 0.16 + 0.01 * L;
  const r2 = 0.32;
  return [0, 1 - r5 - r4 - r3 - r2, r2, r3, r4, r5];
}
export function rollRarity(pulls: number, rnd: () => number, minR = 1): Rarity {
  const rates = gachaRates(pulls);
  let x = rnd();
  for (let r = 5; r >= 1; r--) {
    if (x < rates[r]) return Math.max(r, minR) as Rarity;
    x -= rates[r];
  }
  return Math.max(1, minR) as Rarity;
}
export function poolOf(b: Banner, r: Rarity): string[] {
  if (b === 'char') return ALLIES.filter((x) => x.rarity === r).map((x) => x.id);
  if (b === 'equip') return EQUIPS.filter((x) => x.rarity === r).map((x) => x.id);
  return SKILLS.filter((x) => x.rarity === r).map((x) => x.id);
}

// ---------- guardian orbs ----------
const ORB_W = [0, 50, 30, 14, 5, 1];
export function rollGuardian(rnd: () => number): { id: string; shiny: boolean } {
  const tot = ORB_W.reduce((a, b) => a + b, 0);
  let x = rnd() * tot;
  let r: Rarity = 1;
  for (let i = 1; i <= 5; i++) {
    if (x < ORB_W[i]) {
      r = i as Rarity;
      break;
    }
    x -= ORB_W[i];
  }
  const pool = ALLIES.filter((a) => a.rarity === r);
  const pick = pool[Math.floor(rnd() * pool.length)];
  return { id: pick.id, shiny: rnd() < 0.03 };
}
export const ORB_CHANCE = { mob: 0.006, elite: 0.3, boss: 1 };
export const GEM_DROP = { chance: 0.004, amount: 5 };
export const FIRST_CLEAR_GEMS = (g: number) => (isAreaBoss(g) ? 120 : 25);
export const CHEST_GEMS_PER_HOUR = 40;
export const CHEST_MAX_HOURS = 12;
export const OFFLINE_MAX_HOURS = 24;

// ---------- new save ----------
export function newSave(now = Date.now()): Save {
  return {
    v: SAVE_VERSION,
    coins: 0,
    gems: 300,
    souls: 0,
    g: 0,
    maxG: 0,
    kills: 0,
    farming: false,
    failPower: 0,
    train: { atk: 0, hp: 0, crit: 0, critDmg: 0, speed: 0 },
    chars: { [STARTER_ID]: { stars: 0, copies: 0 } },
    active: STARTER_ID,
    equips: {},
    equipped: { weapon: null, armor: null, acc: null },
    skills: {},
    skillSlots: [null, null, null],
    guardians: {},
    guardianSlots: [null, null, null, null, null, null],
    codex: [STARTER_ID],
    gacha: { char: { pulls: 0, pity: 0 }, equip: { pulls: 0, pity: 0 }, skill: { pulls: 0, pity: 0 } },
    orbs: 0,
    settings: { autoTrain: true, autoBoss: true, speed: 1, sound: true, music: true, autoEquip: true },
    missions: { day: '', prog: {}, claimed: [], guide: 0 },
    stats: { kills: 0, bossKills: 0, pulls: 0, prestiges: 0, bestG: 0, played: 0 },
    chestAt: now,
    lastSeen: now,
    created: now,
    seenIntro: false,
  };
}

// ---------- number formatting ----------
const UNITS = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah', 'ai', 'aj'];
export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  const e = Math.min(UNITS.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, e);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + UNITS[e];
}
export function fmtTime(sec: number): string {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
