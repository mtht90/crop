// 成長要素（レベル・王冠・開放・実績）。ブラウザの localStorage に保存する。
import { CARDS, HEROES, STAGES } from './data/defs.ts';
import type { Campaign } from './game/campaign.ts';
import type { HeroId, Lord, StageId } from './game/types.ts';

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
  { id: 'first-battle', name: '初陣', desc: 'バトルに勝つ', crowns: 40, icon: 'crossed-swords' },
  { id: 'five', name: '領主', desc: '領地を5つ持つ', crowns: 100, icon: 'tower-flag' },
  { id: 'eight', name: '大領主', desc: '領地を8つ持つ', crowns: 250, icon: 'castle' },
  { id: 'capital', name: '王都陥落', desc: '相手の王都を落とす', crowns: 200, icon: 'gavel' },
  { id: 'dragon', name: '竜殺し', desc: '竜の巣を落とす', crowns: 300, icon: 'dragon-head' },
  { id: 'flawless', name: '無傷の勝利', desc: '自分の城に傷を負わずにバトルに勝つ', crowns: 120, icon: 'magic-shield' },
  { id: 'big-hit', name: '大打撃', desc: '1ターンで城に10ダメージ以上', crowns: 100, icon: 'fireball' },
  { id: 'seven-wins', name: '常勝将軍', desc: '1試合でバトルに7勝', crowns: 150, icon: 'laurel-crown' },
  { id: 'comeback', name: '大逆転', desc: '3位以下から巻き返して1位になる', crowns: 250, icon: 'upgrade' },
  { id: 'deck', name: '蒐集家', desc: '1試合でカードを6枚手に入れる', crowns: 100, icon: 'card-random' },
  { id: 'last-one', name: '天下統一', desc: 'ほかの領主を全員脱落させて勝つ', crowns: 500, icon: 'podium-winner' },
  { id: 'all-heroes', name: '英雄たちの王', desc: '6人全員で1位になる', crowns: 600, icon: 'podium-winner' },
  { id: 'sky-win', name: '天空の覇者', desc: '天空の王国で1位になる', crowns: 500, icon: 'sparkles' },
];

export type Reward =
  | { kind: 'crowns'; amount: number }
  | { kind: 'card'; card: string }
  | { kind: 'stage'; stage: StageId };

/** レベルごとの報酬（そのレベルに上がったときにもらえる） */
export function levelRewards(level: number): Reward[] {
  const r: Reward[] = [{ kind: 'crowns', amount: 60 + level * 20 }];
  for (const c of Object.values(CARDS)) if (c.unlockLevel === level && !c.token && !c.monster && level > 1) r.push({ kind: 'card', card: c.id });
  for (const s of Object.values(STAGES)) if (s.unlockLevel === level && level > 1) r.push({ kind: 'stage', stage: s.id });
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
  seenHelpV2: boolean;
  seenHelpV3: boolean;
  seenHelpV4: boolean;
}

const KEY = 'dice-kingdom-save-v1'; // 名前は旧版のまま（レベル・王冠・キャラは引き継ぐ）
const fresh = (): SaveData => ({
  v: 1, level: 1, xp: 0, crowns: 0, heroes: ['knight', 'merchant'], achievements: [], heroWins: [], dice: 'ivory',
  games: 0, wins: 0, lastHero: 'knight', lastStage: 'meadow', muted: false, speed: 1, seenHelp: false, seenHelpV2: false, seenHelpV3: false, seenHelpV4: false,
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

export const unlockedCards = (s: SaveData): string[] => Object.values(CARDS).filter((c) => !c.token && c.unlockLevel <= s.level).map((c) => c.id);
export const unlockedStages = (s: SaveData): StageId[] => Object.values(STAGES).filter((x) => x.unlockLevel <= s.level).map((x) => x.id);
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
export function applyMatch(save: SaveData, c: Campaign, me: Lord): MatchResult {
  const rank = c.rankOf(me);
  const won = c.winner === me.id;
  const regions = c.regionsOf(me.id).length;
  const xp: { label: string; xp: number }[] = [{ label: '参加', xp: 100 }];
  xp.push({ label: `${rank + 1}位`, xp: [220, 130, 80, 50][rank] });
  if (regions) xp.push({ label: `領地 ${regions}つ`, xp: regions * 15 });
  if (me.stats.battlesWon) xp.push({ label: `バトル ${me.stats.battlesWon}勝`, xp: me.stats.battlesWon * 15 });
  if (me.stats.capitalsTaken) xp.push({ label: '王都を落とした', xp: 80 * me.stats.capitalsTaken });
  if (me.stats.dragonSlain) xp.push({ label: '竜を倒した', xp: 150 });
  const stageBonus = { meadow: 1, snow: 1.2, volcano: 1.4, sky: 1.7 }[c.cfg.stage];
  if (stageBonus > 1) xp.push({ label: `${STAGES[c.cfg.stage].name}ボーナス`, xp: Math.round(xp.reduce((a, b) => a + b.xp, 0) * (stageBonus - 1)) });

  const crowns: { label: string; crowns: number }[] = [{ label: `${rank + 1}位の報酬`, crowns: Math.round([120, 70, 45, 30][rank] * stageBonus) }];

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
  check('first-battle', me.stats.battlesWon > 0);
  check('five', me.stats.maxRegions >= 5);
  check('eight', me.stats.maxRegions >= 8);
  check('capital', me.stats.capitalsTaken > 0);
  check('dragon', me.stats.dragonSlain);
  check('flawless', me.stats.flawless > 0);
  check('big-hit', me.stats.bestDamage >= 10);
  check('seven-wins', me.stats.battlesWon >= 7);
  check('comeback', won && me.stats.lowestRankSeen >= 2);
  check('deck', me.stats.cardsGained >= 6);
  check('last-one', won && c.alive.length === 1);
  check('all-heroes', heroWins.size >= 6);
  check('sky-win', won && c.cfg.stage === 'sky');
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
