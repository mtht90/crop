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
  // a boss looks just like its raid card (gold rainbow foil)
  raid: true,
  ...o,
});

export const BOSSES: MonsterCard[] = [
  // the order is the weekly rotation (week index mod length); the week of
  // 2026-11-02 is index 5
  boss({
    id: 'BOSS-boneking', no: 8, name: '紅衣の骸王マリグレス', art: 'bosses/bone-king', type: 'fire', hp: 1500, weakness: 'water',
    species: 'こういの', scene: 'story/p-burning', flavor: '燃える宝珠を胸に、骨だけになっても玉座を降りなかった王。',
    attacks: [
      { name: '骸骨の宝珠', cost: [], damage: 50, text: '相手のバトルモンスターをやけどにする。', effects: [{ k: 'condition', cond: 'burned' }] },
      { name: '呪眼の光', cost: [], damage: 30, text: '相手のベンチモンスター1匹に、30ダメージ。', effects: [{ k: 'benchSnipe', n: 30 }] },
      { name: '紅蓮の葬送', cost: [], damage: 90, text: '' },
    ],
  }),
  boss({
    id: 'BOSS-frost', no: 1, name: '氷河の巨獣ユミル', art: 'monsters/yeti', type: 'water', hp: 1500, weakness: 'fire',
    species: 'ひょうがの', scene: 'story/p-snowfield', flavor: '吹雪の夜にだけ、山が歩く。',
    attacks: [
      { name: '氷塊なげ', cost: [], damage: 40, text: '' },
      { name: '吹雪の咆哮', cost: [], damage: 20, text: '相手のベンチモンスター全員にも、それぞれ10ダメージ。', effects: [{ k: 'spread', n: 10 }] },
      { name: '凍てつく抱擁', cost: [], damage: 50, text: '相手のバトルモンスターをマヒにする。', effects: [{ k: 'condition', cond: 'paralyzed' }] },
    ],
  }),
  boss({
    id: 'BOSS-kraken', no: 3, name: '深淵王クラーケン', art: 'monsters/kraken', type: 'water', hp: 1500, weakness: 'lightning',
    species: 'しんえんの', scene: 'story/p-storm-sea', flavor: '船乗りたちは、海が裏返る音を聞いたという。',
    attacks: [
      { name: '大渦', cost: [], damage: 40, text: '相手のバトルモンスターについているエネルギーを1個トラッシュする。', effects: [{ k: 'discardOppEnergy', n: 1 }] },
      { name: '触腕の連撃', cost: [], damage: 20, text: '相手のベンチモンスター2匹に、それぞれ20ダメージ。', effects: [{ k: 'benchSnipe', n: 20, count: 2 }] },
      { name: '深海の圧', cost: [], damage: 80, text: '' },
    ],
  }),
  boss({
    id: 'BOSS-herald', no: 4, name: '終焉の使者ハービンジャー', art: 'monsters/war-harbinger', type: 'dark', hp: 1500, weakness: 'grass',
    species: 'しゅうえんの', scene: 'story/p-the-fall', flavor: '十二枚の呪いが、形を持って歩き出したもの。',
    attacks: [
      { name: '滅びの鎌', cost: [], damage: 50, text: '相手のバトルモンスターをどくにする。', effects: [{ k: 'condition', cond: 'poisoned' }] },
      { name: '魂喰らい', cost: [], damage: 40, text: '相手の手札をウラにして1枚ランダムに選び、トラッシュする。', effects: [{ k: 'discardOppHand', n: 1 }] },
      { name: '終焉の刻', cost: [], damage: 90, text: '' },
    ],
  }),
  boss({
    id: 'BOSS-dragon', no: 2, name: '紅蓮竜ヴァルグリム', art: 'monsters/fire-dragon', type: 'fire', hp: 1500, weakness: 'water',
    species: 'ぐれんりゅう', scene: 'story/landscape-lava', flavor: '十二枚の一枚を、千年抱いて眠っていた竜。',
    attacks: [
      { name: '灼熱の爪', cost: [], damage: 50, text: '' },
      { name: '業火のブレス', cost: [], damage: 60, text: '相手のベンチモンスター全員にも、それぞれ20ダメージ。', effects: [{ k: 'spread', n: 20 }] },
      { name: '竜鱗の構え', cost: [], damage: 30, text: '次の相手の番、このモンスターが受けるワザのダメージは「-30」される。', effects: [{ k: 'reduceNext', n: 30 }] },
    ],
  }),
  boss({
    id: 'BOSS-emperor', no: 5, name: '不死皇帝ネクロディウス', art: 'bosses/undying-emperor', type: 'dark', hp: 1500, weakness: 'fighting',
    species: 'ふしこうてい', scene: 'story/grim-altar', flavor: '砂時計が落ちきるたび、ひとつの国が死者の国になった。',
    attacks: [
      { name: '冥府の王笏', cost: [], damage: 60, text: '' },
      { name: '時を喰らう砂時計', cost: [], damage: 30, text: '相手のバトルモンスターについているエネルギーを1個トラッシュする。', effects: [{ k: 'discardOppEnergy', n: 1 }] },
      { name: '死の宣告', cost: [], damage: 80, text: '相手のバトルモンスターをどくにする。', effects: [{ k: 'condition', cond: 'poisoned' }] },
    ],
  }),
  boss({
    id: 'BOSS-seaking', no: 6, name: '海王ネプトラス', art: 'bosses/sea-king', type: 'water', hp: 1500, weakness: 'lightning',
    species: 'かいおう', scene: 'story/p-wild-sea', flavor: '王冠が波間に光ったら、港の鐘を三度鳴らせ。',
    attacks: [
      { name: '王の戦鎚', cost: [], damage: 70, text: '' },
      { name: '大海嘯', cost: [], damage: 30, text: '相手のベンチモンスター全員にも、それぞれ20ダメージ。', effects: [{ k: 'spread', n: 20 }] },
      { name: '深海の加護', cost: [], damage: 40, text: '次の相手の番、このモンスターが受けるワザのダメージは「-30」される。', effects: [{ k: 'reduceNext', n: 30 }] },
    ],
  }),
  boss({
    id: 'BOSS-archlich', no: 7, name: '古の大魔導ゼルヴァーン', art: 'bosses/archlich', type: 'psychic', hp: 1500, weakness: 'dark',
    species: 'いにしえの', scene: 'story/p-summoning', flavor: '死を越えるために、すべての禁書を読み終えた者。',
    attacks: [
      { name: '禁呪の書', cost: [], damage: 40, text: '相手の手札をウラにして1枚ランダムに選び、トラッシュする。', effects: [{ k: 'discardOppHand', n: 1 }] },
      { name: '蒼炎の嵐', cost: [], damage: 20, text: '相手のベンチモンスター全員にも、それぞれ20ダメージ。', effects: [{ k: 'spread', n: 20 }] },
      { name: '魂の惑い', cost: [], damage: 60, text: '相手のバトルモンスターをこんらんにする。', effects: [{ k: 'condition', cond: 'confused' }] },
    ],
  }),
];

/** a raid boss's attacks grow by this much once half its HP is gone */
export const BOSS_RAGE_BONUS = 10;
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
  raidCard({
    id: 'RAID-emperor', no: 905, name: 'ネクロディウス', art: 'bosses/undying-emperor', type: 'dark', hp: 210, retreat: 3, weakness: 'fighting',
    species: 'ふしこうてい', scene: 'story/grim-altar', flavor: '砂時計が落ちきるたび、ひとつの国が死者の国になった。',
    attacks: [
      { name: '時を喰らう砂時計', cost: ['dark', 'colorless'], damage: 50, text: '相手のバトルモンスターについているエネルギーを1個トラッシュする。', effects: [{ k: 'discardOppEnergy', n: 1 }] },
      { name: '死の宣告', cost: ['dark', 'dark', 'colorless'], damage: 140, text: '相手のバトルモンスターをどくにする。', effects: [{ k: 'condition', cond: 'poisoned' }] },
    ],
  }),
  raidCard({
    id: 'RAID-seaking', no: 906, name: 'ネプトラス', art: 'bosses/sea-king', type: 'water', hp: 200, retreat: 3, weakness: 'lightning',
    species: 'かいおう', scene: 'story/p-wild-sea', flavor: '王冠が波間に光ったら、港の鐘を三度鳴らせ。',
    attacks: [
      { name: '大海嘯', cost: ['water', 'colorless'], damage: 50, text: '相手のベンチモンスター全員にも、それぞれ10ダメージ。', effects: [{ k: 'spread', n: 10 }] },
      { name: '王の戦鎚', cost: ['water', 'water', 'colorless'], damage: 150, text: '' },
    ],
  }),
  raidCard({
    id: 'RAID-archlich', no: 907, name: 'ゼルヴァーン', art: 'bosses/archlich', type: 'psychic', hp: 190, retreat: 2, weakness: 'dark',
    species: 'いにしえの', scene: 'story/p-summoning', flavor: '死を越えるために、すべての禁書を読み終えた者。',
    attacks: [
      { name: '禁呪の書', cost: ['psychic', 'colorless'], damage: 60, text: '相手の手札をウラにして1枚ランダムに選び、トラッシュする。', effects: [{ k: 'discardOppHand', n: 1 }] },
      { name: '魂の惑い', cost: ['psychic', 'psychic', 'colorless'], damage: 130, text: '相手のバトルモンスターをこんらんにする。', effects: [{ k: 'condition', cond: 'confused' }] },
    ],
  }),
  raidCard({
    id: 'RAID-boneking', no: 908, name: 'マリグレス', art: 'bosses/bone-king', type: 'fire', hp: 190, retreat: 3, weakness: 'water',
    species: 'こういの', scene: 'story/p-burning', flavor: '燃える宝珠を胸に、骨だけになっても玉座を降りなかった王。',
    attacks: [
      { name: '骸骨の宝珠', cost: ['fire', 'colorless'], damage: 60, text: '相手のバトルモンスターをやけどにする。', effects: [{ k: 'condition', cond: 'burned' }] },
      { name: '紅蓮の葬送', cost: ['fire', 'fire', 'colorless'], damage: 140, text: '' },
    ],
  }),
];

/** the raid card a boss can drop */
export const raidCardOf = (bossId: string) => RAID_CARDS.find((c) => c.id === bossId.replace('BOSS-', 'RAID-'))!;
/** chance a raid card drops after a win */
export const RAID_DROP = 0.01;
