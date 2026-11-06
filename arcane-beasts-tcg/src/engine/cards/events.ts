// ============================================================================
// イベントカード: one per stage event, won only there (a rare drop from the
// final boss, or traded for event shards). Never in packs; not counted in the
// collection percentage.
// ============================================================================
import type { MonsterCard } from '../types';

const ev = (o: Omit<MonsterCard, 'kind' | 'stage' | 'rarity' | 'set' | 'fullArt'>): MonsterCard => ({
  kind: 'monster',
  stage: 'basic',
  rarity: 4,
  set: 'AB1',
  fullArt: true,
  ...o,
});

export const EVENT_CARDS: MonsterCard[] = [
  ev({
    id: 'EVENT-snow', no: 911, name: '氷雪の巨兵ガルム', art: 'event/snow-giant', type: 'water', hp: 140, retreat: 3, weakness: 'lightning',
    species: 'ひょうせつの', scene: 'story/p-castle-winter', flavor: '砦の門番は、溶けることを知らない。',
    attacks: [
      { name: '雪崩の拳', cost: ['water', 'colorless'], damage: 50, text: '' },
      { name: '凍結の咆哮', cost: ['water', 'water', 'colorless'], damage: 110, text: 'コインを1回投げオモテなら、相手のバトルモンスターをマヒにする。', effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    ],
  }),
  ev({
    id: 'EVENT-wyrm', no: 912, name: '古竜ヴェルデ', art: 'event/elder-wyrm', type: 'grass', hp: 150, retreat: 2, weakness: 'fire',
    species: 'こりゅう', scene: 'story/p-great-tree', flavor: '峰の風はすべて、この翼から生まれたという。',
    attacks: [
      { name: '翠風の翼', cost: ['grass', 'colorless'], damage: 40, text: '相手のベンチモンスター全員にも、それぞれ10ダメージ。', effects: [{ k: 'spread', n: 10 }] },
      { name: '古竜の息吹', cost: ['grass', 'grass', 'colorless', 'colorless'], damage: 150, text: '' },
    ],
  }),
  ev({
    id: 'EVENT-ghost', no: 913, name: '幽冥王ネビュロス', art: 'event/ghost-king', type: 'dark', hp: 130, retreat: 2, weakness: 'fighting',
    species: 'ゆうめいおう', scene: 'story/p-graves', flavor: '王は死んでも、都は王を手放さなかった。',
    attacks: [
      { name: '魂縛り', cost: ['dark', 'colorless'], damage: 40, text: '次の相手の番、このワザを受けたモンスターはにげられない。', effects: [{ k: 'oppCantRetreat' }] },
      { name: '冥界の門', cost: ['dark', 'dark', 'colorless'], damage: 110, text: '相手の手札をウラにして1枚ランダムに選び、トラッシュする。', effects: [{ k: 'discardOppHand', n: 1 }] },
    ],
  }),
  ev({
    id: 'EVENT-witch', no: 914, name: '禁書の魔女リッツァ', art: 'event/book-witch', type: 'psychic', hp: 120, retreat: 1, weakness: 'dark',
    species: 'きんしょの', scene: 'story/p-study', flavor: '読んではいけない頁ほど、彼女はよく覚えている。',
    attacks: [
      { name: '禁断の頁', cost: ['psychic'], damage: 20, text: '自分の山札を2枚引く。', effects: [{ k: 'draw', n: 2 }] },
      { name: '魂の焔', cost: ['psychic', 'psychic', 'colorless'], damage: 110, text: '相手のバトルモンスターをこんらんにする。', effects: [{ k: 'condition', cond: 'confused' }] },
    ],
  }),
];
