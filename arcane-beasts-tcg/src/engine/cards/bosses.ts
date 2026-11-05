// ============================================================================
// レイドボス: giant monsters fought in the weekly boss raid. They are never in
// packs or decks; a raid gives the opponent a "deck" of the boss alone.
// Each boss uses its attacks in turn (the next one is shown on screen), and
// grows fiercer once half its HP is gone.
// ============================================================================
import type { MonsterCard } from '../types';

const boss = (o: Omit<MonsterCard, 'kind' | 'stage' | 'rarity' | 'set' | 'retreat' | 'no'> & { no: number }): MonsterCard => ({
  kind: 'monster',
  stage: 'basic',
  rarity: 5,
  set: 'AB1',
  retreat: 4,
  ...o,
});

export const BOSSES: MonsterCard[] = [
  boss({
    id: 'BOSS-frost', no: 1, name: '氷河の巨獣ユミル', art: 'monsters/yeti', type: 'water', hp: 500, weakness: 'fire',
    species: 'ひょうがの', scene: 'story/p-snowfield', flavor: '吹雪の夜にだけ、山が歩く。',
    attacks: [
      { name: '氷塊なげ', cost: [], damage: 60, text: '' },
      { name: '吹雪の咆哮', cost: [], damage: 40, text: '相手のベンチモンスター全員にも、それぞれ20ダメージ。', effects: [{ k: 'spread', n: 20 }] },
      { name: '凍てつく抱擁', cost: [], damage: 80, text: '相手のバトルモンスターをマヒにする。', effects: [{ k: 'condition', cond: 'paralyzed' }] },
    ],
  }),
  boss({
    id: 'BOSS-dragon', no: 2, name: '紅蓮竜ヴァルグリム', art: 'monsters/fire-dragon', type: 'fire', hp: 1500, weakness: 'water',
    species: 'ぐれんりゅう', scene: 'story/landscape-lava', flavor: '十二枚の一枚を、千年抱いて眠っていた竜。',
    attacks: [
      { name: '灼熱の爪', cost: [], damage: 80, text: '' },
      { name: '業火のブレス', cost: [], damage: 100, text: '相手のベンチモンスター全員にも、それぞれ30ダメージ。', effects: [{ k: 'spread', n: 30 }] },
      { name: '竜鱗の構え', cost: [], damage: 50, text: '次の相手の番、このモンスターが受けるワザのダメージは「-50」される。', effects: [{ k: 'reduceNext', n: 50 }] },
    ],
  }),
  boss({
    id: 'BOSS-kraken', no: 3, name: '深淵王クラーケン', art: 'monsters/kraken', type: 'water', hp: 3000, weakness: 'lightning',
    species: 'しんえんの', scene: 'story/p-storm-sea', flavor: '船乗りたちは、海が裏返る音を聞いたという。',
    attacks: [
      { name: '大渦', cost: [], damage: 70, text: '相手のバトルモンスターについているエネルギーを1個トラッシュする。', effects: [{ k: 'discardOppEnergy', n: 1 }] },
      { name: '触腕の連撃', cost: [], damage: 40, text: '相手のベンチモンスター2匹に、それぞれ40ダメージ。', effects: [{ k: 'benchSnipe', n: 40, count: 2 }] },
      { name: '深海の圧', cost: [], damage: 130, text: '' },
    ],
  }),
  boss({
    id: 'BOSS-herald', no: 4, name: '終焉の使者ハービンジャー', art: 'monsters/war-harbinger', type: 'dark', hp: 5000, weakness: 'grass',
    species: 'しゅうえんの', scene: 'story/p-the-fall', flavor: '十二枚の呪いが、形を持って歩き出したもの。',
    attacks: [
      { name: '滅びの鎌', cost: [], damage: 90, text: '相手のバトルモンスターをどくにする。', effects: [{ k: 'condition', cond: 'poisoned' }] },
      { name: '魂喰らい', cost: [], damage: 60, text: '相手の手札をウラにして1枚ランダムに選び、トラッシュする。', effects: [{ k: 'discardOppHand', n: 1 }] },
      { name: '終焉の刻', cost: [], damage: 150, text: '' },
    ],
  }),
];

/** a raid boss's attacks grow by this much once half its HP is gone */
export const BOSS_RAGE_BONUS = 40;
/** in a raid, your damage to the boss is multiplied by this (1: as printed) */
export const RAID_MULT = 1;

// ----------------------------------------------------------------------------
// レイドカード: each boss can (very rarely) be won after beating it. These are
// real cards, one per deck, at a strong but fair level — the boss's avatar.
// They are never in packs and are not counted in the collection percentage.
// ----------------------------------------------------------------------------
const raidCard = (o: Omit<MonsterCard, 'kind' | 'stage' | 'rarity' | 'set' | 'raid'>): MonsterCard => ({
  kind: 'monster',
  stage: 'basic',
  rarity: 5,
  set: 'AB1',
  raid: true,
  ...o,
});

export const RAID_CARDS: MonsterCard[] = [
  raidCard({
    id: 'RAID-frost', no: 901, name: 'ユミル', art: 'monsters/yeti', type: 'water', hp: 180, retreat: 3, weakness: 'fire',
    species: 'ひょうがの', scene: 'story/p-snowfield', flavor: '吹雪の夜にだけ、山が歩く。',
    attacks: [
      { name: '吹雪の咆哮', cost: ['water', 'colorless'], damage: 50, text: '相手のベンチモンスター全員にも、それぞれ10ダメージ。', effects: [{ k: 'spread', n: 10 }] },
      { name: '凍てつく抱擁', cost: ['water', 'water', 'colorless'], damage: 130, text: 'コインを1回投げオモテなら、相手のバトルモンスターをマヒにする。', effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    ],
  }),
  raidCard({
    id: 'RAID-dragon', no: 902, name: 'ヴァルグリム', art: 'monsters/fire-dragon', type: 'fire', hp: 190, retreat: 3, weakness: 'water',
    species: 'ぐれんりゅう', scene: 'story/landscape-lava', flavor: '十二枚の一枚を、千年抱いて眠っていた竜。',
    attacks: [
      { name: '灼熱の爪', cost: ['fire', 'colorless'], damage: 70, text: '' },
      { name: '業火のブレス', cost: ['fire', 'fire', 'colorless'], damage: 140, text: '相手のベンチモンスター全員にも、それぞれ20ダメージ。', effects: [{ k: 'spread', n: 20 }] },
    ],
  }),
  raidCard({
    id: 'RAID-kraken', no: 903, name: 'クラーケン王', art: 'monsters/kraken', type: 'water', hp: 200, retreat: 4, weakness: 'lightning',
    species: 'しんえんの', scene: 'story/p-storm-sea', flavor: '船乗りたちは、海が裏返る音を聞いたという。',
    attacks: [
      { name: '触腕の連撃', cost: ['water', 'colorless'], damage: 30, text: '相手のベンチモンスター2匹に、それぞれ30ダメージ。', effects: [{ k: 'benchSnipe', n: 30, count: 2 }] },
      { name: '深海の圧', cost: ['water', 'water', 'colorless', 'colorless'], damage: 170, text: '' },
    ],
  }),
  raidCard({
    id: 'RAID-herald', no: 904, name: 'ハービンジャー', art: 'monsters/war-harbinger', type: 'dark', hp: 200, retreat: 3, weakness: 'grass',
    species: 'しゅうえんの', scene: 'story/p-the-fall', flavor: '十二枚の呪いが、形を持って歩き出したもの。',
    attacks: [
      { name: '滅びの鎌', cost: ['dark', 'colorless'], damage: 60, text: '相手のバトルモンスターをどくにする。', effects: [{ k: 'condition', cond: 'poisoned' }] },
      { name: '終焉の刻', cost: ['dark', 'dark', 'colorless'], damage: 150, text: '' },
    ],
  }),
];

/** the raid card a boss can drop */
export const raidCardOf = (bossId: string) => RAID_CARDS.find((c) => c.id === bossId.replace('BOSS-', 'RAID-'))!;
/** chance a raid card drops after a win */
export const RAID_DROP = 0.003;
