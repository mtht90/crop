// ============================================================================
// イベントカード: one per stage event, won only there (a rare drop from the
// final boss, or traded for event shards). Never in packs; not counted in the
// collection percentage.
// ============================================================================
import type { MonsterCard } from '../types';

const ev = (o: Omit<MonsterCard, 'kind' | 'stage' | 'rarity' | 'set' | 'fullArt'> & { rarity?: MonsterCard['rarity'] }): MonsterCard => ({
  kind: 'monster',
  stage: 'basic',
  rarity: 4,
  set: 'AB1',
  fullArt: true,
  ...o,
});

export const EVENT_CARDS: MonsterCard[] = [
  ev({
    id: 'EVENT-snow', no: 911, name: '氷雪の巨兵ガルム', art: 'event/snow-giant', type: 'water', hp: 220, retreat: 3, weakness: 'lightning',
    species: 'ひょうせつの', scene: 'story/p-castle-winter', flavor: '砦の門番は、溶けることを知らない。',
    attacks: [
      { name: '雪崩の拳', cost: ['water', 'colorless'], damage: 70, text: '' },
      { name: '凍結の咆哮', cost: ['water', 'water', 'colorless'], damage: 150, text: 'コインを1回投げオモテなら、相手のバトルモンスターをマヒにする。', effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    ],
  }),
  ev({
    id: 'EVENT-wyrm', no: 912, name: '古竜ヴェルデ', art: 'event/elder-wyrm', type: 'grass', hp: 220, retreat: 2, weakness: 'fire',
    species: 'こりゅう', scene: 'story/p-great-tree', flavor: '峰の風はすべて、この翼から生まれたという。',
    attacks: [
      { name: '翠風の翼', cost: ['grass', 'colorless'], damage: 60, text: '相手のベンチモンスター全員にも、それぞれ10ダメージ。', effects: [{ k: 'spread', n: 10 }] },
      { name: '古竜の息吹', cost: ['grass', 'grass', 'colorless', 'colorless'], damage: 190, text: '' },
    ],
  }),
  ev({
    id: 'EVENT-ghost', no: 913, name: '幽冥王ネビュロス', art: 'event/ghost-king', type: 'dark', hp: 210, retreat: 2, weakness: 'fighting',
    species: 'ゆうめいおう', scene: 'story/p-graves', flavor: '王は死んでも、都は王を手放さなかった。',
    attacks: [
      { name: '魂縛り', cost: ['dark', 'colorless'], damage: 60, text: '次の相手の番、このワザを受けたモンスターはにげられない。', effects: [{ k: 'oppCantRetreat' }] },
      { name: '冥界の門', cost: ['dark', 'dark', 'colorless'], damage: 150, text: '相手の手札をウラにして1枚ランダムに選び、トラッシュする。', effects: [{ k: 'discardOppHand', n: 1 }] },
    ],
  }),
  ev({
    id: 'EVENT-witch', no: 914, name: '禁書の魔女リッツァ', art: 'event/book-witch', type: 'psychic', hp: 200, retreat: 1, weakness: 'dark',
    species: 'きんしょの', scene: 'story/p-study', flavor: '読んではいけない頁ほど、彼女はよく覚えている。',
    attacks: [
      { name: '禁断の頁', cost: ['psychic'], damage: 30, text: '自分の山札を2枚引く。', effects: [{ k: 'draw', n: 2 }] },
      { name: '魂の焔', cost: ['psychic', 'psychic', 'colorless'], damage: 150, text: '相手のバトルモンスターをこんらんにする。', effects: [{ k: 'condition', cond: 'confused' }] },
    ],
  }),
  // 覇王の塔: the card of the top floor, one per tower (never in packs)
  ev({
    id: 'EVENT-tower-sky', no: 915, name: '天穹の女神アウラ', art: 'event/tower-goddess', type: 'lightning', hp: 280, retreat: 1, weakness: 'fighting', resistance: 'water', rarity: 5,
    species: 'てんきゅうの', scene: 'story/p-mountains', flavor: '塔の頂より高い空を、彼女だけが知っている。',
    attacks: [
      { name: '天翔ける槍', cost: ['lightning', 'colorless'], damage: 90, text: '', effects: [{ k: 'benchSnipe', n: 20 }] },
      { name: '覇者の雷霆', cost: ['lightning', 'lightning', 'colorless', 'colorless'], damage: 200, text: '', effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    ],
  }),
  ev({
    id: 'EVENT-tower-lava', no: 916, name: '溶鉄の巨神ヴォルガ', art: 'event/tower-lavagolem', type: 'fire', hp: 270, retreat: 3, weakness: 'water', resistance: 'grass', rarity: 5,
    species: 'ようてつの', scene: 'story/landscape-lava', flavor: '塔を支える炉の火は、この巨神の心臓だった。',
    attacks: [
      { name: '溶鉄の拳', cost: ['fire', 'colorless'], damage: 80, text: '', effects: [{ k: 'condition', cond: 'burned' }] },
      { name: '大噴火', cost: ['fire', 'fire', 'colorless', 'colorless'], damage: 200, text: '', effects: [{ k: 'discardSelfEnergy', n: 1, type: 'fire' }] },
    ],
  }),
  ev({
    id: 'EVENT-tower-grave', no: 917, name: '不死王モルディス', art: 'event/tower-elderlich', type: 'dark', hp: 250, retreat: 2, weakness: 'grass', resistance: 'psychic', rarity: 5,
    species: 'ふしおう', scene: 'story/p-graves', flavor: '塔で倒れた挑戦者は、みな彼の兵になった。',
    attacks: [
      { name: '亡者の召集', cost: ['dark'], damage: 30, text: '', effects: [{ k: 'callForFamily', n: 1 }] },
      { name: '不死の大鎌', cost: ['dark', 'dark', 'colorless'], damage: 140, text: '', suffix: '+', effects: [{ k: 'bonusPerDiscardMonster', per: 10, max: 60 }] },
    ],
  }),
  ev({
    id: 'EVENT-tower-holy', no: 918, name: '白法の聖女ルミエル', art: 'event/tower-sister', type: 'psychic', hp: 250, retreat: 1, weakness: 'dark', resistance: 'fighting', rarity: 5,
    species: 'はくほうの', scene: 'story/landscape-castle', flavor: '塔の頂で、挑戦者の魂の重さを静かに量っている。',
    attacks: [
      { name: '審判の光', cost: ['psychic', 'colorless'], damage: 70, text: '', effects: [{ k: 'healAllSelf', n: 20 }] },
      { name: '天上の裁き', cost: ['psychic', 'psychic', 'colorless'], damage: 160, text: '', effects: [{ k: 'condition', cond: 'confused' }] },
    ],
  }),
];
