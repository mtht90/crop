// 成長要素（レベル・王冠・開放・実績）。ブラウザの localStorage に保存する。
import { CARDS, HEROES, STAGES } from './data/defs.ts';
import type { Game } from './game/engine.ts';
import type { CardId, HeroId, Player, StageId } from './game/types.ts';

export interface DiceSkin {
  id: string;
  name: string;
  model: string;
  level: number;
}
export const DICE_SKINS: DiceSkin[] = [
  { id: 'ivory', name: '象牙', model: 'D6_A', level: 1 },
  { id: 'ruby', name: '紅玉', model: 'D6_A_red', level: 4 },
  { id: 'sapphire', name: '蒼玉', model: 'D6_B_blue', level: 8 },
  { id: 'gold', name: '黄金', model: 'D6_A_yellow', level: 11 },
  { id: 'jade', name: '翡翠の数字', model: 'D6_C_green', level: 13 },
  { id: 'crimson', name: '紅の数字', model: 'D6_C_red', level: 15 },
];

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  crowns: number;
  icon: string;
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-game', name: '王国への第一歩', desc: '1回遊ぶ', crowns: 50, icon: 'flag-objective' },
  { id: 'first-win', name: '初めての戴冠', desc: '1位になる', crowns: 150, icon: 'crown' },
  { id: 'monopoly', name: '領主', desc: '領地制覇する', crowns: 80, icon: 'castle' },
  { id: 'two-sets', name: '大領主', desc: '1試合で2色を領地制覇する', crowns: 150, icon: 'tower-flag' },
  { id: 'unify', name: '三国統一', desc: '三国統一で勝つ', crowns: 400, icon: 'laurel-crown' },
  { id: 'jackpot', name: '黄金の泉', desc: 'ジャックポットを獲得する', crowns: 80, icon: 'fountain' },
  { id: 'big-jackpot', name: '泉の主', desc: '1000G以上のジャックポットを獲得する', crowns: 200, icon: 'coins' },
  { id: 'landmark', name: '王国の象徴', desc: '王国の象徴を建てる', crowns: 120, icon: 'ancient-columns' },
  { id: 'takeover', name: '乗っ取り屋', desc: '1試合で3回買収する', crowns: 100, icon: 'gavel' },
  { id: 'big-toll', name: '大地主', desc: '一度に1000G以上の通行料を受け取る', crowns: 150, icon: 'receive-money' },
  { id: 'comeback', name: '大逆転', desc: '3位以下から巻き返して1位になる', crowns: 250, icon: 'upgrade' },
  { id: 'bankrupt-win', name: '最後の王', desc: '他の全員を破産させて勝つ', crowns: 300, icon: 'skull-crossed-bones' },
  { id: 'cards', name: 'カード使い', desc: '1試合でカードを6枚使う', crowns: 80, icon: 'card-random' },
  { id: 'all-heroes', name: '英雄たちの王', desc: '6人全員で1位になる', crowns: 600, icon: 'podium-winner' },
  { id: 'sky-win', name: '天空の覇者', desc: '天空の王国で1位になる', crowns: 500, icon: 'sparkles' },
];

export type Reward =
  | { kind: 'crowns'; amount: number }
  | { kind: 'card'; card: CardId }
  | { kind: 'stage'; stage: StageId }
  | { kind: 'dice'; skin: string };

/** レベルごとの報酬（そのレベルに上がったときにもらえる） */
export function levelRewards(level: number): Reward[] {
  const r: Reward[] = [{ kind: 'crowns', amount: 60 + level * 20 }];
  for (const c of Object.values(CARDS)) if (c.unlockLevel === level) r.push({ kind: 'card', card: c.id });
  for (const s of Object.values(STAGES)) if (s.unlockLevel === level && level > 1) r.push({ kind: 'stage', stage: s.id });
  for (const d of DICE_SKINS) if (d.level === level && level > 1) r.push({ kind: 'dice', skin: d.id });
  return r;
}
export const xpForLevel = (level: number) => 180 + (level - 1) * 90;

export interface SaveData {
  v: 1;
  level: number;
  xp: number;
  crowns: number;
  heroes: HeroId[];
  achievements: string[];
  heroWins: HeroId[];
  dice: string;
  games: number;
  wins: number;
  lastHero: HeroId;
  lastStage: StageId;
  muted: boolean;
  speed: number;
  seenHelp: boolean;
}

const KEY = 'dice-kingdom-save-v1';
const fresh = (): SaveData => ({
  v: 1, level: 1, xp: 0, crowns: 0, heroes: ['knight', 'merchant'], achievements: [], heroWins: [], dice: 'ivory',
  games: 0, wins: 0, lastHero: 'knight', lastStage: 'meadow', muted: false, speed: 1, seenHelp: false,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* 保存できない環境でも遊べるようにする */
  }
  return fresh();
}
export function writeSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 無視 */
  }
}

export const unlockedCards = (s: SaveData): CardId[] => Object.values(CARDS).filter((c) => c.unlockLevel <= s.level).map((c) => c.id);
export const unlockedStages = (s: SaveData): StageId[] => Object.values(STAGES).filter((x) => x.unlockLevel <= s.level).map((x) => x.id);
export const unlockedDice = (s: SaveData) => DICE_SKINS.filter((d) => d.level <= s.level);
export const heroCost = (h: HeroId) => HEROES[h].cost;

export interface MatchResult {
  rank: number;
  xpGained: { label: string; xp: number }[];
  crownsGained: { label: string; crowns: number }[];
  levelBefore: number;
  xpBefore: number;
  levelAfter: number;
  xpAfter: number;
  rewards: Reward[];
  newAchievements: Achievement[];
}

/** 試合結果を保存データに反映する */
export function applyMatch(save: SaveData, g: Game, me: Player): MatchResult {
  const rank = g.ranking().indexOf(me);
  const won = g.s.winner === me.id;
  const xp: { label: string; xp: number }[] = [{ label: '参加', xp: 100 }];
  xp.push({ label: `${rank + 1}位`, xp: [220, 130, 80, 50][rank] });
  if (me.stats.monopoliesMax) xp.push({ label: '領地制覇', xp: 40 * me.stats.monopoliesMax });
  if (me.stats.jackpots) xp.push({ label: 'ジャックポット', xp: 40 * me.stats.jackpots });
  if (me.stats.takeovers) xp.push({ label: '買収', xp: 15 * me.stats.takeovers });
  if (me.stats.landmarks) xp.push({ label: '王国の象徴', xp: 50 * me.stats.landmarks });
  if (won && g.s.winReason === 'unify') xp.push({ label: '三国統一', xp: 200 });
  const stageBonus = { meadow: 1, snow: 1.2, volcano: 1.4, sky: 1.7 }[g.s.cfg.stage];
  if (stageBonus > 1) xp.push({ label: `${STAGES[g.s.cfg.stage].name}ボーナス`, xp: Math.round(xp.reduce((a, b) => a + b.xp, 0) * (stageBonus - 1)) });

  const crowns: { label: string; crowns: number }[] = [{ label: `${rank + 1}位の報酬`, crowns: Math.round([120, 70, 45, 30][rank] * stageBonus) }];

  // 実績
  const got = new Set(save.achievements);
  const newAch: Achievement[] = [];
  const check = (id: string, ok: boolean) => {
    if (ok && !got.has(id)) {
      got.add(id);
      newAch.push(ACHIEVEMENTS.find((a) => a.id === id)!);
    }
  };
  const heroWins = new Set(save.heroWins);
  if (won) heroWins.add(me.hero);
  check('first-game', true);
  check('first-win', won);
  check('monopoly', me.stats.monopoliesMax >= 1);
  check('two-sets', me.stats.monopoliesMax >= 2);
  check('unify', won && g.s.winReason === 'unify');
  check('jackpot', me.stats.jackpots > 0);
  check('big-jackpot', me.stats.maxJackpot >= 1000);
  check('landmark', me.stats.landmarks > 0);
  check('takeover', me.stats.takeovers >= 3);
  check('big-toll', me.stats.maxToll >= 1000);
  check('comeback', won && me.stats.lowestRankSeen >= 2);
  check('bankrupt-win', won && g.s.winReason === 'bankrupt');
  check('cards', me.stats.cardsUsed >= 6);
  check('all-heroes', heroWins.size >= 6);
  check('sky-win', won && g.s.cfg.stage === 'sky');
  for (const a of newAch) crowns.push({ label: `実績「${a.name}」`, crowns: a.crowns });

  const levelBefore = save.level;
  const xpBefore = save.xp;
  let level = save.level;
  let cur = save.xp + xp.reduce((a, b) => a + b.xp, 0);
  const rewards: Reward[] = [];
  while (cur >= xpForLevel(level)) {
    cur -= xpForLevel(level);
    level++;
    rewards.push(...levelRewards(level));
  }
  const crownTotal = crowns.reduce((a, b) => a + b.crowns, 0) + rewards.reduce((a, r) => a + (r.kind === 'crowns' ? r.amount : 0), 0);

  save.level = level;
  save.xp = cur;
  save.crowns += crownTotal;
  save.achievements = [...got];
  save.heroWins = [...heroWins];
  save.games++;
  if (won) save.wins++;
  writeSave(save);
  return { rank, xpGained: xp, crownsGained: crowns, levelBefore, xpBefore, levelAfter: level, xpAfter: cur, rewards, newAchievements: newAch };
}
