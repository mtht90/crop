// Game actions on a Save (pure-ish: mutate the save, return what happened). Shared by the live game,
// offline catch-up and the balance sim.
import { ALLIES, ALLY_BY_ID, type AllyDef, type Rarity } from '../data/monsters.ts';
import { EQUIPS, EQUIP_BY_ID, EQUIP_MAX_LV, SKILLS, SKILL_BY_ID, SKILL_MAX_LV, copiesForLevel, type Slot } from '../data/items.ts';
import {
  CHEST_GEMS_PER_HOUR,
  CHEST_MAX_HOURS,
  FIRST_CLEAR_GEMS,
  GACHA_COST,
  GEM_DROP,
  GUARD_MAX_RANK,
  ORB_CHANCE,
  PITY,
  PRESTIGE_MIN_G,
  ROLE_AOE,
  TRAIN,
  TRAIN_BY_KEY,
  bossTime,
  copiesForStar,
  elementAvg,
  enemyStats,
  guardianKey,
  guardianSlotsUnlocked,
  heroStats,
  killsNeeded,
  newSave,
  parseGuardianKey,
  poolOf,
  rollGuardian,
  rollRarity,
  skillDps,
  soulsFor,
  type Banner,
  type EnemyKind,
  type HeroStats,
  type Save,
  type TrainKey,
} from './core.ts';

export type Rnd = () => number;

// ---------- training ----------
export function trainCost(s: Save, k: TrainKey) {
  return Math.ceil(TRAIN_BY_KEY[k].cost(s.train[k]));
}
export function canTrain(s: Save, k: TrainKey) {
  return s.train[k] < TRAIN_BY_KEY[k].max && s.coins >= trainCost(s, k);
}
export function doTrain(s: Save, k: TrainKey, times = 1): number {
  let n = 0;
  while (n < times && canTrain(s, k)) {
    s.coins -= trainCost(s, k);
    s.train[k]++;
    n++;
  }
  if (n) bump(s, 'train', n);
  return n;
}
/** Spend coins automatically: keep ATK/HP balanced, buy side stats when they're cheap relative to them. */
export function autoTrain(s: Save, budgetFrac = 1): number {
  let n = 0;
  const floor = s.coins * (1 - budgetFrac);
  for (let guard = 0; guard < 5000; guard++) {
    let best: TrainKey | null = null;
    let bestScore = Infinity;
    for (const t of TRAIN) {
      if (s.train[t.key] >= t.max) continue;
      const c = trainCost(s, t.key);
      const w = t.key === 'atk' ? 1 : t.key === 'hp' ? 1.05 : t.key === 'critDmg' ? 2.2 : 2.6;
      const score = c * w;
      if (score < bestScore) {
        bestScore = score;
        best = t.key;
      }
    }
    if (!best) break;
    const c = trainCost(s, best);
    if (s.coins - c < floor) break;
    s.coins -= c;
    s.train[best]++;
    n++;
  }
  if (n) bump(s, 'train', n);
  return n;
}

// ---------- kills & stages ----------
export interface KillReward {
  coins: number;
  gems: number;
  orb: boolean;
}
export function rewardKill(s: Save, h: HeroStats, kind: EnemyKind, rnd: Rnd): KillReward {
  const e = enemyStats(s.g, kind);
  const coins = e.gold * h.gold;
  s.coins += coins;
  let gems = 0;
  if (kind === 'mob' && rnd() < GEM_DROP.chance) gems = GEM_DROP.amount;
  s.gems += gems;
  const orb = rnd() < ORB_CHANCE[kind];
  if (orb) s.orbs++;
  if (kind === 'mob') {
    s.kills = Math.min(killsNeeded(s.g), s.kills + 1);
    s.stats.kills++;
    bump(s, 'kills');
  }
  return { coins, gems, orb };
}

export interface BossResult {
  firstClear: boolean;
  gems: number;
  newSlot: boolean;
}
export function winBoss(s: Save): BossResult {
  const was = s.maxG;
  const oldSlots = guardianSlotsUnlocked(s.maxG);
  const g = s.g;
  s.g++;
  s.maxG = Math.max(s.maxG, s.g);
  s.stats.bestG = Math.max(s.stats.bestG, s.maxG);
  s.kills = 0;
  s.farming = false;
  s.failPower = 0;
  s.stats.bossKills++;
  bump(s, 'boss');
  const firstClear = s.g > was;
  const gems = firstClear ? FIRST_CLEAR_GEMS(g) : 0;
  s.gems += gems;
  return { firstClear, gems, newSlot: guardianSlotsUnlocked(s.maxG) > oldSlots };
}
export function loseBoss(s: Save) {
  s.kills = 0;
  s.farming = true;
  s.failPower = heroStats(s).power;
}
export function shouldAutoChallenge(s: Save) {
  if (s.kills < killsNeeded(s.g)) return false;
  if (!s.settings.autoBoss) return false;
  if (!s.farming) return true;
  return heroStats(s).power > s.failPower * 1.03;
}

// ---------- collection ----------
export interface Pull {
  banner: Banner;
  id: string;
  rarity: Rarity;
  isNew: boolean;
  upgraded?: string; // e.g. "★2" / "Lv3"
}

function addChar(s: Save, id: string): Pull {
  const def = ALLY_BY_ID[id];
  const own = s.chars[id];
  if (!own) {
    s.chars[id] = { stars: 0, copies: 0 };
    if (!s.codex.includes(id)) s.codex.push(id);
    return { banner: 'char', id, rarity: def.rarity, isNew: true };
  }
  own.copies++;
  let upgraded: string | undefined;
  while (own.stars < 5 && own.copies >= copiesForStar(own.stars)) {
    own.copies -= copiesForStar(own.stars);
    own.stars++;
    upgraded = `覚醒★${own.stars}`;
  }
  return { banner: 'char', id, rarity: def.rarity, isNew: false, upgraded };
}
function addLeveled(store: Record<string, { lv: number; copies: number }>, id: string, max: number) {
  const own = store[id];
  if (!own) {
    store[id] = { lv: 1, copies: 0 };
    return { isNew: true, upgraded: undefined as string | undefined };
  }
  own.copies++;
  let upgraded: string | undefined;
  while (own.lv < max && own.copies >= copiesForLevel(own.lv)) {
    own.copies -= copiesForLevel(own.lv);
    own.lv++;
    upgraded = `Lv${own.lv}`;
  }
  return { isNew: false, upgraded };
}

export function pull(s: Save, banner: Banner, count: 1 | 10, rnd: Rnd): Pull[] | null {
  const cost = count === 10 ? GACHA_COST[banner].ten : GACHA_COST[banner].one;
  if (s.gems < cost) return null;
  s.gems -= cost;
  const st = s.gacha[banner];
  const out: Pull[] = [];
  for (let i = 0; i < count; i++) {
    st.pity++;
    let r = rollRarity(st.pulls, rnd, count === 10 && i === count - 1 && !out.some((p) => p.rarity >= 3) ? 3 : 1);
    if (st.pity >= PITY[banner]) r = 5;
    if (r === 5) st.pity = 0;
    st.pulls++;
    s.stats.pulls++;
    const pool = poolOf(banner, r);
    const id = pool[Math.floor(rnd() * pool.length)];
    if (banner === 'char') out.push(addChar(s, id));
    else if (banner === 'equip') out.push({ banner, id, rarity: r, ...addLeveled(s.equips, id, EQUIP_MAX_LV) });
    else out.push({ banner, id, rarity: r, ...addLeveled(s.skills, id, SKILL_MAX_LV) });
  }
  bump(s, 'pull', count);
  if (s.settings.autoEquip) {
    if (banner === 'equip') autoEquip(s);
    if (banner === 'skill') autoSkills(s);
  }
  return out;
}

export function equipScore(id: string, lv: number) {
  const d = EQUIP_BY_ID[id];
  const w: Record<string, number> = { atk: 1, hp: 0.9, crit: 6, critDmg: 1.2, speed: 4, gold: 0.4, regen: 30, skillDmg: 0.8, boss: 0.7 };
  const m = 1 + 0.2 * (lv - 1);
  return (d.main[1] * (w[d.main[0]] ?? 1) + (d.sub ? d.sub[1] * (w[d.sub[0]] ?? 1) : 0)) * m;
}
export function autoEquip(s: Save) {
  for (const slot of ['weapon', 'armor', 'acc'] as Slot[]) {
    let best: string | null = s.equipped[slot];
    let bestScore = best ? equipScore(best, s.equips[best]?.lv ?? 1) : -1;
    for (const e of EQUIPS) {
      if (e.slot !== slot || !s.equips[e.id]) continue;
      const sc = equipScore(e.id, s.equips[e.id].lv);
      if (sc > bestScore) {
        bestScore = sc;
        best = e.id;
      }
    }
    s.equipped[slot] = best;
  }
}
export function skillScore(id: string, lv: number) {
  const d = SKILL_BY_ID[id];
  return d.rarity * 10 + lv * 1.5 + (d.kind === 'heal' || d.kind === 'shield' ? -3 : 0);
}
export function autoSkills(s: Save) {
  const owned = SKILLS.filter((k) => s.skills[k.id]).sort((a, b) => skillScore(b.id, s.skills[b.id].lv) - skillScore(a.id, s.skills[a.id].lv));
  s.skillSlots = [0, 1, 2].map((i) => owned[i]?.id ?? null);
}

export function openOrbs(s: Save, rnd: Rnd, max = Infinity) {
  const got: { key: string; def: AllyDef; isNew: boolean; shiny: boolean; rankUp: boolean }[] = [];
  while (s.orbs > 0 && got.length < max) {
    s.orbs--;
    const { id, shiny } = rollGuardian(rnd);
    const key = guardianKey(id, shiny);
    const own = s.guardians[key];
    let isNew = false;
    let rankUp = false;
    if (!own) {
      s.guardians[key] = { rank: 1, copies: 0, shiny };
      isNew = true;
      if (!s.codex.includes(id)) s.codex.push(id);
    } else {
      own.copies++;
      while (own.rank < GUARD_MAX_RANK && own.copies >= own.rank) {
        own.copies -= own.rank;
        own.rank++;
        rankUp = true;
      }
    }
    got.push({ key, def: ALLY_BY_ID[id], isNew, shiny, rankUp });
    bump(s, 'orb');
  }
  if (got.length) autoGuardians(s, true);
  return got;
}
export function guardianScore(s: Save, key: string) {
  const { id, shiny } = parseGuardianKey(key);
  const d = ALLY_BY_ID[id];
  const g = s.guardians[key];
  const w = { fire: 1.1, water: 1, wind: 1.6, earth: 1.8, light: 0.6, dark: 0.7 }[d.el];
  return d.rarity * 2 * (1 + 0.5 * (g.rank - 1)) * (shiny ? 1.5 : 1) * w;
}
/** Fill empty guardian slots (or all slots when `fill` is false) with the best owned guardians. */
export function autoGuardians(s: Save, onlyEmpty = false) {
  const n = guardianSlotsUnlocked(s.maxG);
  const used = new Set(s.guardianSlots.filter(Boolean) as string[]);
  const keys = Object.keys(s.guardians).sort((a, b) => guardianScore(s, b) - guardianScore(s, a));
  if (!onlyEmpty) {
    s.guardianSlots = s.guardianSlots.map((_, i) => (i < n ? keys[i] ?? null : null));
    return;
  }
  for (let i = 0; i < n; i++) {
    if (s.guardianSlots[i]) continue;
    const k = keys.find((x) => !used.has(x));
    if (!k) break;
    s.guardianSlots[i] = k;
    used.add(k);
  }
}

// ---------- idle chest ----------
export function chestContents(s: Save, now: number) {
  const hours = Math.min(CHEST_MAX_HOURS, Math.max(0, (now - s.chestAt) / 3600000));
  const r = farmRates(s);
  return {
    hours,
    gems: Math.floor(hours * CHEST_GEMS_PER_HOUR),
    coins: r.coinsPerSec * hours * 3600 * 0.25,
    orbs: Math.floor(hours * 0.75),
    full: hours >= CHEST_MAX_HOURS,
  };
}
export function claimChest(s: Save, now: number) {
  const c = chestContents(s, now);
  if (c.hours < 1 / 60) return null;
  s.gems += c.gems;
  s.coins += c.coins;
  s.orbs += c.orbs;
  s.chestAt = now;
  bump(s, 'chest');
  return c;
}

// ---------- estimates / offline ----------
export function farmRates(s: Save) {
  const h = heroStats(s);
  const mob = enemyStats(s.g, 'mob');
  const ef = elementAvg(h.ally.el, s.g);
  const base = (h.atk / h.interval) * (1 + h.crit * (h.critDmg - 1)) * ef;
  const dps = base * ROLE_AOE[h.ally.role] + skillDps(s, h, 2.5) * ef;
  const travel = h.range > 100 ? 0.55 : 0.9;
  const killTime = mob.hp / dps + travel;
  // danger: two mobs nibbling while we kill
  const incoming = (mob.atk / mob.interval) * 1.6 * (1 - h.reduce);
  const regen = h.hp * h.regen;
  let eff = 1;
  if (incoming > regen) {
    const survive = h.hp / (incoming - regen);
    if (survive < killTime * 6) eff = Math.max(0.15, survive / (killTime * 6));
  }
  const killsPerSec = eff / killTime;
  return { killsPerSec, coinsPerSec: killsPerSec * mob.gold * h.gold, dps, hero: h };
}
export function bossWinEstimate(s: Save) {
  const h = heroStats(s);
  const kind: EnemyKind = (s.g % 10) === 9 ? 'boss' : 'elite';
  const b = enemyStats(s.g, kind);
  const el = elementAvg(h.ally.el, s.g);
  const dps = ((h.atk / h.interval) * (1 + h.crit * (h.critDmg - 1)) + skillDps(s, h, 1)) * el * h.boss;
  const ttk = b.hp / dps;
  const incoming = (b.atk / b.interval) * (1 - h.reduce) - h.hp * h.regen;
  const ttd = incoming <= 0 ? Infinity : h.hp / incoming;
  return { win: ttk <= bossTime(s.g) && ttk < ttd, ttk, ttd };
}

export interface OfflineReport {
  seconds: number;
  fromG: number;
  toG: number;
  kills: number;
  coins: number;
  gems: number;
  orbs: number;
  bossWins: number;
  bossLosses: number;
  trained: number;
}

export function simulateOffline(s: Save, seconds: number, rnd: Rnd): OfflineReport {
  const rep: OfflineReport = { seconds, fromG: s.g, toG: s.g, kills: 0, coins: 0, gems: 0, orbs: 0, bossWins: 0, bossLosses: 0, trained: 0 };
  let t = 0;
  const dt = 15;
  let r = farmRates(s);
  let carry = 0;
  while (t < seconds) {
    const step = Math.min(dt, seconds - t);
    t += step;
    carry += r.killsPerSec * step;
    const n = Math.floor(carry);
    carry -= n;
    if (n > 0) {
      const mob = enemyStats(s.g, 'mob');
      const c = n * mob.gold * r.hero.gold;
      s.coins += c;
      rep.coins += c;
      rep.kills += n;
      s.stats.kills += n;
      bump(s, 'kills', n);
      // expected drops (rolled in aggregate)
      const orbs = binom(n, ORB_CHANCE.mob, rnd);
      s.orbs += orbs;
      rep.orbs += orbs;
      const gems = binom(n, GEM_DROP.chance, rnd) * GEM_DROP.amount;
      s.gems += gems;
      rep.gems += gems;
      s.kills = Math.min(killsNeeded(s.g), s.kills + n);
    }
    if (s.settings.autoTrain && s.coins > 0) {
      const k = autoTrain(s);
      rep.trained += k;
      if (k) r = farmRates(s);
    }
    if (shouldAutoChallenge(s)) {
      const est = bossWinEstimate(s);
      const kind: EnemyKind = s.g % 10 === 9 ? 'boss' : 'elite';
      t += Math.min(est.ttk, bossTime(s.g));
      if (est.win) {
        const b = enemyStats(s.g, kind);
        s.coins += b.gold * r.hero.gold;
        rep.coins += b.gold * r.hero.gold;
        if (rnd() < ORB_CHANCE[kind]) {
          s.orbs++;
          rep.orbs++;
        }
        const res = winBoss(s);
        rep.gems += res.gems;
        rep.bossWins++;
      } else {
        loseBoss(s);
        rep.bossLosses++;
      }
      r = farmRates(s);
    }
  }
  rep.toG = s.g;
  return rep;
}
function binom(n: number, p: number, rnd: Rnd) {
  if (n * p > 30) return Math.round(n * p + (rnd() - 0.5) * Math.sqrt(n * p * (1 - p)) * 2);
  let k = 0;
  const lim = Math.min(n, 5000);
  for (let i = 0; i < lim; i++) if (rnd() < p) k++;
  return Math.round((k * n) / lim);
}

// ---------- prestige ----------
export function canPrestige(s: Save) {
  return s.maxG >= PRESTIGE_MIN_G;
}
export function prestigeGain(s: Save) {
  return soulsFor(s.maxG);
}
export function doPrestige(s: Save) {
  const gain = prestigeGain(s);
  if (gain <= 0) return 0;
  const fresh = newSave();
  s.souls += gain;
  s.coins = 0;
  s.g = 0;
  s.maxG = 0;
  s.kills = 0;
  s.farming = false;
  s.failPower = 0;
  s.train = fresh.train;
  s.stats.prestiges++;
  bump(s, 'prestige');
  return gain;
}

// ---------- missions ----------
export interface MissionDef {
  id: string;
  label: string;
  key: string;
  goal: number;
  gems: number;
}
export const DAILY: MissionDef[] = [
  { id: 'd_kills', label: 'モンスターを500体討伐', key: 'kills', goal: 500, gems: 60 },
  { id: 'd_boss', label: 'ボスを3体撃破', key: 'boss', goal: 3, gems: 60 },
  { id: 'd_pull', label: '召喚を3回行う', key: 'pull', goal: 3, gems: 60 },
  { id: 'd_train', label: '修練を20回行う', key: 'train', goal: 20, gems: 40 },
  { id: 'd_chest', label: '霊脈の恵みを受け取る', key: 'chest', goal: 1, gems: 40 },
  { id: 'd_orb', label: '霊珠を2個ひらく', key: 'orb', goal: 2, gems: 40 },
];
export const DAILY_BONUS = 150;

export interface GuideDef {
  label: string;
  hint: string;
  gems: number;
  done: (s: Save) => boolean;
}
export const GUIDE: GuideDef[] = [
  { label: '攻撃力を Lv5 まで鍛える', hint: '「修練」タブで攻撃力を強化しよう', gems: 100, done: (s) => s.train.atk >= 5 },
  { label: 'ステージ 1-3 に到達', hint: '放っておけば霊獣が勝手に進む', gems: 100, done: (s) => s.maxG >= 2 },
  { label: '霊獣を召喚する', hint: '「召喚」タブで霊晶を使おう', gems: 150, done: (s) => s.gacha.char.pulls >= 1 },
  { label: '別の霊獣を出撃させる', hint: '「霊獣」タブで出撃を選ぶ', gems: 100, done: (s) => s.active !== newSave().active },
  { label: '装備を身につける', hint: '武具召喚で装備を手に入れよう', gems: 150, done: (s) => Object.values(s.equipped).some(Boolean) },
  { label: '秘術をセットする', hint: '秘術召喚でスキルを手に入れよう', gems: 150, done: (s) => s.skillSlots.some(Boolean) },
  { label: 'エリアボスを倒す (1-10)', hint: '討伐ゲージが溜まるとボスが現れる', gems: 200, done: (s) => s.maxG >= 10 },
  { label: '守護霊を宿す', hint: '霊珠はモンスターがたまに落とす', gems: 150, done: (s) => s.guardianSlots.some(Boolean) },
  { label: 'ステージ 2-5 に到達', hint: '強化と装備で押し進もう', gems: 200, done: (s) => s.maxG >= 14 },
  { label: '霊獣を覚醒させる', hint: '同じ霊獣を引くと覚醒する', gems: 200, done: (s) => Object.values(s.chars).some((c) => c.stars > 0) },
  { label: 'ステージ 3-10 を突破', hint: '属性相性も意識してみよう', gems: 300, done: (s) => s.maxG >= 30 },
  { label: '輪廻を行う', hint: '「その他」→輪廻。魂石で恒久的に強くなる', gems: 400, done: (s) => s.stats.prestiges >= 1 },
  { label: 'ステージ 6-1 に到達', hint: '', gems: 400, done: (s) => s.stats.bestG >= 50 },
  { label: '守護霊を5体宿す', hint: '', gems: 400, done: (s) => s.guardianSlots.filter(Boolean).length >= 5 },
  { label: 'ステージ 10-1 に到達', hint: '', gems: 600, done: (s) => s.stats.bestG >= 90 },
  { label: '深淵の底を突破 (12-10)', hint: '', gems: 1500, done: (s) => s.stats.bestG >= 120 },
];

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function rollDaily(s: Save) {
  const t = today();
  if (s.missions.day !== t) {
    s.missions.day = t;
    s.missions.prog = {};
    s.missions.claimed = [];
  }
}
export function bump(s: Save, key: string, n = 1) {
  s.missions.prog[key] = (s.missions.prog[key] ?? 0) + n;
}
export function claimDaily(s: Save, id: string) {
  const m = DAILY.find((x) => x.id === id);
  if (!m || s.missions.claimed.includes(id) || (s.missions.prog[m.key] ?? 0) < m.goal) return 0;
  s.missions.claimed.push(id);
  s.gems += m.gems;
  return m.gems;
}
export function claimDailyBonus(s: Save) {
  if (s.missions.claimed.includes('bonus')) return 0;
  if (!DAILY.every((m) => s.missions.claimed.includes(m.id))) return 0;
  s.missions.claimed.push('bonus');
  s.gems += DAILY_BONUS;
  return DAILY_BONUS;
}
export function claimGuide(s: Save) {
  const gd = GUIDE[s.missions.guide];
  if (!gd || !gd.done(s)) return 0;
  s.missions.guide++;
  s.gems += gd.gems;
  return gd.gems;
}
export function pendingMissionCount(s: Save) {
  let n = DAILY.filter((m) => !s.missions.claimed.includes(m.id) && (s.missions.prog[m.key] ?? 0) >= m.goal).length;
  if (!s.missions.claimed.includes('bonus') && DAILY.every((m) => s.missions.claimed.includes(m.id))) n++;
  const gd = GUIDE[s.missions.guide];
  if (gd && gd.done(s)) n++;
  return n;
}

export function bestCharFor(s: Save): string {
  let best = s.active;
  let bp = -1;
  for (const id of Object.keys(s.chars)) {
    const h = heroStats(s, id);
    const p = h.power * elementAvg(h.ally.el, s.g);
    if (p > bp) {
      bp = p;
      best = id;
    }
  }
  return best;
}

export const ALL_ALLY_COUNT = ALLIES.length;
export { PRESTIGE_MIN_G };
