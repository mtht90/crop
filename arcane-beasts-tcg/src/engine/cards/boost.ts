// ============================================================================
// Rarer printings are stronger.
//   tier 0 … the regular card and its mirror
//   tier 1 … full art (★3)
//   tier 2 … special art / silver (★4)
//   tier 3 … gold (★5)
// Monsters gain HP and attack damage; trainers (and 虹色エネルギー) get a
// stronger effect, and their card text says so. The engine reads the same
// numbers from POWER, so the text and the game never disagree.
// ============================================================================
import type { Attack, CardDef, MonsterCard, Variant } from '../types';

export const TIER: Record<Variant, number> = { mirror: 0, SR: 1, SAR: 2, SV: 2, UR: 3 };
export const tierOf = (c: { tier?: number }) => c.tier ?? 0;

const HP_UP = [0, 10, 30, 50];
const DMG_UP = [0, 10, 20, 30];
/** attacks that hit once per coin (“30×”) grow more gently */
const MULTI_UP = [0, 0, 10, 10];

export function boostMonster(m: MonsterCard, t: number): Pick<MonsterCard, 'hp' | 'attacks'> {
  if (!t) return { hp: m.hp, attacks: m.attacks };
  return {
    hp: m.hp + HP_UP[t],
    attacks: m.attacks.map((a): Attack => (a.damage ? { ...a, damage: a.damage + (a.suffix === '×' ? MULTI_UP[t] : DMG_UP[t]) } : a)),
  };
}

const ceilHalf = (t: number) => Math.ceil(t / 2);

/** the numbers each boosted effect uses, by tier */
export const POWER = {
  research: (t: number) => 7 + t, // cards drawn
  boss: (t: number) => t, // cards drawn afterwards
  iono: (t: number) => t, // extra cards for you
  cleric: (t: number) => 80 + 20 * t, // HP healed
  rally: (t: number) => 2 + ceilHalf(t), // basics benched
  assassin: (t: number) => 3 + t, // damage counters
  paladin: (t: number) => 30 + 10 * t, // HP healed on each
  mercenary: (t: number) => 2 + t, // coins
  guide: (t: number) => 2 + ceilHalf(t), // basics from the trash
  warchief: (t: number) => 5 + t, // hand size drawn to
  candy: (t: number) => t, // cards drawn afterwards
  tutor: (t: number) => 1 + ceilHalf(t), // trainers searched
  crest: (t: number) => 30 + 10 * t, // damage reduced
  rainbow: (t: number) => (t >= 2 ? 0 : 1), // damage counters on attach
} as const;

const TEXT: Record<string, (t: number) => string> = {
  research: (t) => `自分の手札をすべてトラッシュし、山札を${POWER.research(t)}枚引く。`,
  boss: (t) => `相手のベンチモンスターを1匹選び、バトル場のモンスターと入れ替える。その後、自分の山札を${POWER.boss(t)}枚引く。`,
  iono: (t) =>
    `おたがいのプレイヤーは、それぞれ手札をすべてウラにして切り、山札の下にもどす。その後、それぞれ自分のサイドの残り枚数ぶん、山札を引く。さらに自分は${POWER.iono(t)}枚引く。`,
  cleric: (t) => `自分のモンスター1匹のHPを「${POWER.cleric(t)}」回復し、特殊状態をすべて回復する。`,
  rally: (t) => `自分の山札からたねモンスターを${POWER.rally(t)}枚まで選び、ベンチに出す。そして山札を切る。`,
  assassin: (t) => `相手のモンスター1匹に、ダメカンを${POWER.assassin(t)}個のせる。`,
  paladin: (t) => `自分のモンスター全員のHPを、それぞれ「${POWER.paladin(t)}」回復する。`,
  mercenary: (t) => `コインを${POWER.mercenary(t)}回投げる。オモテの数だけ、自分の山札から好きなカードを1枚ずつ選び、相手に見せて手札に加える。そして山札を切る。`,
  guide: (t) => `自分のトラッシュからたねモンスターを${POWER.guide(t)}枚まで選び、ベンチに出す。`,
  warchief: (t) => `自分の手札が${POWER.warchief(t)}枚になるまで、山札を引く。（手札が${POWER.warchief(t)}枚以上のときは使えない）`,
  candy: (t) =>
    `自分の場のたねモンスター1匹に、そのモンスターから進化する2進化モンスターを手札から重ねて進化させる。その後、自分の山札を${POWER.candy(t)}枚引く。(最初の番や、出したばかりのモンスターには使えない。)`,
  tutor: (t) => `自分の山札からトレーナーズを${POWER.tutor(t)}枚まで選び、相手に見せて手札に加える。そして山札を切る。`,
  crest: (t) => `このカードをつけているHP150以上のモンスターが、相手のモンスターから受けるワザのダメージは「-${POWER.crest(t)}」される。`,
  rainbow: (t) =>
    POWER.rainbow(t)
      ? 'このカードは、すべてのタイプのエネルギー1個ぶんとしてはたらく。このカードを手札からモンスターにつけたとき、そのモンスターにダメカンを1個のせる。'
      : 'このカードは、すべてのタイプのエネルギー1個ぶんとしてはたらく。（この版は、つけてもダメカンがのらない）',
};

/** the key a trainer or special energy is boosted by */
const boostKey = (c: CardDef) => (c.kind === 'trainer' ? c.key : c.kind === 'energy' && c.any ? 'rainbow' : null);

/** the stronger text of a boosted trainer / energy printing (or undefined) */
export function boostedText(c: CardDef, t: number): string | undefined {
  const k = boostKey(c);
  return t && k && TEXT[k] ? TEXT[k](t) : undefined;
}
export const BOOSTED_KEYS = Object.keys(TEXT);
