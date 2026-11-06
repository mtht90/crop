// ============================================================================
// ステージイベント: a map of 15 stages that changes every two weeks.
//   • each stage is a battle against the event's foes under its own rule
//   • stages 5 and 10 are mid-bosses, 15 the great boss
//   • the first clear of a stage pays gems; every win may drop event shards
//   • the great boss may (rarely) drop the event card; shards trade for it
//     (and for gems) at the exchange
// No stamina: any stage already open can be played as often as you like.
// ============================================================================
import type { BattleMods, EType } from '../engine/types';
import { EVENT_CARDS } from '../engine/cards/events';
import { TYPE_JP } from '../engine/cards';
import { weekKey } from './progress';

export interface StageBoss {
  name: string;
  portrait: string;
}

export interface StageEvent {
  id: string;
  /** the title, in two lines */
  title: [string, string];
  type: EType;
  /** the map's painting */
  bg: string;
  /** the foes' decks, in the order the stages use them */
  decks: string[];
  /** a foe's name on ordinary stages */
  foe: string;
  foePortrait: string;
  bosses: [StageBoss, StageBoss, StageBoss];
  /** the event card */
  card: string;
  blurb: string;
}

export const STAGE_EVENTS: StageEvent[] = [
  {
    id: 'snow', title: ['氷雪の砦と', '眠れる巨兵'], type: 'water', bg: 'story/p-castle-winter', decks: ['frost', 'water', 'naga', 'tide-folk'],
    foe: '砦の衛兵', foePortrait: 'humans/spearman',
    bosses: [{ name: '氷の騎士長', portrait: 'humans/knight' }, { name: '吹雪の魔術師', portrait: 'humans/mage-white+female' }, { name: '氷雪の巨兵ガルム', portrait: 'event/snow-giant' }],
    card: 'EVENT-snow', blurb: '吹雪の向こうの古い砦で、巨兵が目を覚まそうとしている。',
  },
  {
    id: 'wyrm', title: ['竜翼の峰と', '翠の古竜'], type: 'grass', bg: 'story/p-great-tree', decks: ['wyrm', 'grass', 'highelf', 'swarm'],
    foe: '峰の狩人', foePortrait: 'humans/duelist',
    bosses: [{ name: '森の番人', portrait: 'woses/ancient-wose' }, { name: '竜騎兵', portrait: 'monsters/wyvern' }, { name: '古竜ヴェルデ', portrait: 'event/elder-wyrm' }],
    card: 'EVENT-wyrm', blurb: '風の生まれる峰の頂に、千年眠る竜がいる。',
  },
  {
    id: 'ghost', title: ['亡霊の都と', '冥府の王冠'], type: 'dark', bg: 'story/p-graves', decks: ['lich', 'night', 'dark', 'shadow'],
    foe: '都の亡者', foePortrait: 'undead/ghoul',
    bosses: [{ name: '死の騎士', portrait: 'undead/death-knight' }, { name: '古の死霊術師', portrait: 'undead/ancient-lich' }, { name: '幽冥王ネビュロス', portrait: 'event/ghost-king' }],
    card: 'EVENT-ghost', blurb: '霧の夜にだけ現れる都で、王冠が新しい王を待っている。',
  },
  {
    id: 'witch', title: ['禁書の塔と', '忘れられた頁'], type: 'psychic', bg: 'story/p-study', decks: ['elder', 'psychic', 'ghost-fleet', 'elder'],
    foe: '塔の書記', foePortrait: 'humans/mage-white+female',
    bosses: [{ name: '塔の魔人', portrait: 'monsters/jinn' }, { name: '頁の亡霊', portrait: 'undead/spectre' }, { name: '禁書の魔女リッツァ', portrait: 'event/book-witch' }],
    card: 'EVENT-witch', blurb: '一度読んだら戻れない本が、塔のいちばん上にある。',
  },
];

export const STAGE_COUNT = 15;
export const isBossStage = (i: number) => i % 5 === 4;
/** "2-3": chapter and step of stage i (0-based) */
export const stageLabel = (i: number) => `${Math.floor(i / 5) + 1}-${(i % 5) + 1}`;

/** the rule and the CPU's strength of each stage; T is the event's own type */
function stageRule(i: number, T: EType): { mods: BattleMods; cpu: number } {
  const R: { mods: BattleMods; cpu: number }[] = [
    { mods: { prizes: 3, hp: [0, -20] }, cpu: 2 },
    { mods: { prizes: 3 }, cpu: 3 },
    { mods: { prizes: 4, firstAttack: true }, cpu: 3 },
    { mods: { prizes: 4, dmg: [{ side: 'both', type: T, n: 20 }] }, cpu: 4 },
    { mods: { prizes: 4, hp: [0, 30] }, cpu: 5 },
    { mods: { prizes: 4, hp: [30, 30] }, cpu: 5 },
    { mods: { prizes: 4, hand: [9, 7] }, cpu: 5 },
    { mods: { prizes: 5, oppFirst: true }, cpu: 6 },
    { mods: { prizes: 5, dmg: [{ side: 1, n: 10 }] }, cpu: 6 },
    { mods: { prizes: 5, hp: [0, 40], dmg: [{ side: 1, n: 10 }] }, cpu: 7 },
    { mods: { prizes: 6, hand: [6, 7] }, cpu: 7 },
    { mods: { prizes: 6, hp: [0, 30] }, cpu: 7 },
    { mods: { prizes: 6, oppFirst: true, dmg: [{ side: 1, type: T, n: 20 }] }, cpu: 8 },
    { mods: { prizes: 6, hp: [-20, 0] }, cpu: 8 },
    { mods: { prizes: 6, hp: [0, 50], dmg: [{ side: 1, n: 20 }] }, cpu: 9 },
  ];
  return R[i];
}

export interface Stage {
  index: number;
  label: string;
  boss: boolean;
  name: string;
  portrait: string;
  deck: string;
  mods: BattleMods;
  cpu: number;
  rules: string[];
  /** gems for the first clear */
  gems: number;
}

/** the rule written out, one line each */
export function modsText(m: BattleMods): string[] {
  const out: string[] = [];
  if (m.prizes && m.prizes !== 6) out.push(`サイド${m.prizes}枚で勝負`);
  if (m.hp) {
    const [a, b] = m.hp;
    if (a && a === b) out.push(`おたがいのモンスターのHP${a > 0 ? '+' : ''}${a}`);
    else {
      if (a) out.push(`自分のモンスターのHP${a > 0 ? '+' : ''}${a}`);
      if (b) out.push(`相手のモンスターのHP${b > 0 ? '+' : ''}${b}`);
    }
  }
  for (const d of m.dmg ?? []) out.push(`${d.side === 'both' ? 'おたがいの' : d.side === 0 ? '自分の' : '相手の'}${d.type ? `${TYPE_JP[d.type]}タイプの` : ''}ワザのダメージ+${d.n}`);
  if (m.hand) {
    if (m.hand[0] !== 7) out.push(`自分の最初の手札は${m.hand[0]}枚`);
    if (m.hand[1] !== 7) out.push(`相手の最初の手札は${m.hand[1]}枚`);
  }
  if (m.firstAttack) out.push('最初の番からワザが使える');
  if (m.oppFirst) out.push('相手が先攻');
  return out.length ? out : ['ふつうのルール'];
}

export function stagesOf(ev: StageEvent): Stage[] {
  return Array.from({ length: STAGE_COUNT }, (_, i) => {
    const r = stageRule(i, ev.type);
    const boss = isBossStage(i);
    const b = boss ? ev.bosses[Math.floor(i / 5)] : null;
    return {
      index: i,
      label: stageLabel(i),
      boss,
      name: b ? b.name : `${ev.foe}`,
      portrait: b ? b.portrait : ev.foePortrait,
      deck: ev.decks[i % ev.decks.length],
      mods: r.mods,
      cpu: r.cpu,
      rules: modsText(r.mods),
      gems: i === STAGE_COUNT - 1 ? 150 : boss ? 60 : 20,
    };
  });
}

// ---------------------------------------------------------------------------
// The calendar: an event runs two weeks, Monday to Monday
// ---------------------------------------------------------------------------
const WEEK = 7 * 86400000;
function weekIndex(key = weekKey()) {
  return Math.floor(new Date(key.slice(1) + 'T00:00:00').getTime() / WEEK);
}
/** the event running now, and when its period started / ends */
export function currentStageEvent(now = new Date()): { ev: StageEvent; key: string; ends: Date } {
  const w = weekIndex(weekKey(now));
  // pairs of weeks starting on an odd week index (so the first event starts on 2026-11-02)
  const period = Math.floor((w - 1) / 2);
  const ev = STAGE_EVENTS[((period % STAGE_EVENTS.length) + STAGE_EVENTS.length) % STAGE_EVENTS.length];
  // this week's Monday, back to the period's first Monday, plus two weeks
  const monday = new Date(weekKey(now).slice(1) + 'T00:00:00');
  const ends = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (w - (period * 2 + 1)) * 7 + 14);
  return { ev, key: `${ev.id}:${period}`, ends };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
/** shards a won stage drops (random); bosses always drop some */
export function rollShards(i: number, rand = Math.random): number {
  if (i === STAGE_COUNT - 1) return 30 + Math.floor(rand() * 11);
  if (isBossStage(i)) return 15 + Math.floor(rand() * 11);
  if (rand() >= 0.6) return 0;
  const r = rand();
  return r < 0.6 ? 5 : r < 0.9 ? 10 : 20;
}
/** chance the great boss drops the event card on a win */
export const EVENT_CARD_DROP = 0.05;

export interface ShopItem {
  id: string;
  label: string;
  cost: number;
  /** how many times it can be traded per event */
  limit: number;
  card?: string;
  gems?: number;
}
export function shopOf(ev: StageEvent): ShopItem[] {
  const card = EVENT_CARDS.find((c) => c.id === ev.card)!;
  return [
    { id: 'card', label: card.name, cost: 400, limit: 2, card: card.id },
    { id: 'gems100', label: 'ジェム 100', cost: 60, limit: 5, gems: 100 },
    { id: 'gems30', label: 'ジェム 30', cost: 20, limit: 20, gems: 30 },
  ];
}

export interface StageSave {
  /** which event (and which run of it) this is */
  key: string;
  /** stages cleared so far (the next one to play is this index) */
  cleared: number;
  shards: number;
  /** trades made at the exchange, by item */
  bought: Record<string, number>;
}
/** the save for the event running now (a fresh one when the event has changed) */
export function stageNow(s: StageSave | undefined): StageSave {
  const { key } = currentStageEvent();
  if (s && s.key === key) return s;
  return { key, cleared: 0, shards: 0, bought: {} };
}
