import type { Element, Rarity } from './monsters.ts';

export type Slot = 'weapon' | 'armor' | 'acc';
export type StatKey = 'atk' | 'hp' | 'crit' | 'critDmg' | 'speed' | 'gold' | 'regen' | 'skillDmg' | 'boss';

export interface EquipDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  icon: string; // icon shape key (see ui/icons.tsx)
  main: [StatKey, number]; // percent values (0.1 = +10%)
  sub?: [StatKey, number];
  flavor: string;
}

export const STAT_LABEL: Record<StatKey, string> = {
  atk: '攻撃力',
  hp: '体力',
  crit: '会心率',
  critDmg: '会心ダメージ',
  speed: '攻撃速度',
  gold: 'コイン獲得',
  regen: '自然回復',
  skillDmg: '秘術威力',
  boss: 'ボス特効',
};

// Base main-stat value per rarity (percent as fraction)
const W = [0, 0.12, 0.25, 0.45, 0.8, 1.4];
const H = [0, 0.15, 0.3, 0.55, 1.0, 1.7];

const eq = (
  id: string,
  name: string,
  slot: Slot,
  rarity: Rarity,
  icon: string,
  main: [StatKey, number],
  flavor: string,
  sub?: [StatKey, number],
): EquipDef => ({ id, name, slot, rarity, icon, main, sub, flavor });

export const EQUIPS: EquipDef[] = [
  // weapons
  eq('w_wood_sword', '木の剣', 'weapon', 1, 'sword:wood', ['atk', W[1]], '手になじむ練習用の剣。'),
  eq('w_slingshot', 'パチンコ', 'weapon', 1, 'bow:wood', ['atk', W[1] * 0.9], 'どんぐりを飛ばす。', ['speed', 0.03]),
  eq('w_old_staff', '古びた杖', 'weapon', 1, 'staff:wood', ['atk', W[1] * 0.9], '先っぽが少し光る。', ['skillDmg', 0.05]),
  eq('w_iron_sword', '鉄の剣', 'weapon', 2, 'sword:iron', ['atk', W[2]], '鍛冶屋の自信作。'),
  eq('w_hunter_bow', '狩人の弓', 'weapon', 2, 'bow:iron', ['atk', W[2] * 0.9], '軽くてよくしなる。', ['speed', 0.05]),
  eq('w_hand_axe', '手斧', 'weapon', 2, 'axe:iron', ['atk', W[2] * 1.1], '重いが頼れる。'),
  eq('w_silver_rapier', '銀のレイピア', 'weapon', 3, 'dagger:silver', ['atk', W[3]], '月光を映す細剣。', ['crit', 0.04]),
  eq('w_crystal_staff', '水晶の杖', 'weapon', 3, 'staff:silver', ['atk', W[3]], '霊気を集める水晶。', ['skillDmg', 0.12]),
  eq('w_knight_lance', '騎士の槍', 'weapon', 3, 'spear:silver', ['atk', W[3] * 1.05], '誇り高き一突き。', ['boss', 0.1]),
  eq('w_sun_blade', '陽光の大剣', 'weapon', 4, 'sword:gold', ['atk', W[4]], '振るうたび陽が差す。', ['critDmg', 0.2]),
  eq('w_gale_bow', '疾風の弓', 'weapon', 4, 'bow:gold', ['atk', W[4] * 0.95], '風より速い矢。', ['speed', 0.1]),
  eq('w_moon_scythe', '月影の鎌', 'weapon', 4, 'axe:gold', ['atk', W[4]], '夜を刈る刃。', ['crit', 0.06]),
  eq('w_star_wand', '星詠みの杖', 'weapon', 5, 'staff:mythic', ['atk', W[5]], '星々の声を聴く。', ['skillDmg', 0.3]),
  eq('w_spirit_sword', '霊剣アマツ', 'weapon', 5, 'sword:mythic', ['atk', W[5] * 1.05], '精霊が宿る刃。', ['critDmg', 0.4]),
  eq('w_dragon_spear', '竜穿ちの槍', 'weapon', 5, 'spear:mythic', ['atk', W[5]], '竜の鱗をも貫く。', ['boss', 0.3]),
  // armor
  eq('a_cloth', '旅人の服', 'armor', 1, 'robe:wood', ['hp', H[1]], '丈夫な麻の服。'),
  eq('a_pot_lid', '鍋のふた', 'armor', 1, 'shield:wood', ['hp', H[1] * 1.1], '意外と守れる。'),
  eq('a_leather', '革の鎧', 'armor', 2, 'armor:iron', ['hp', H[2]], 'なめした革の鎧。'),
  eq('a_round_shield', '丸盾', 'armor', 2, 'shield:iron', ['hp', H[2]], '取り回しのよい盾。', ['regen', 0.003]),
  eq('a_mage_robe', '魔導士のローブ', 'armor', 2, 'robe:iron', ['hp', H[2] * 0.9], '魔力を通す布。', ['skillDmg', 0.06]),
  eq('a_silver_mail', '銀の鎖帷子', 'armor', 3, 'armor:silver', ['hp', H[3]], '軽く、固い。'),
  eq('a_knight_helm', '騎士の兜', 'armor', 3, 'helm:silver', ['hp', H[3]], '視界は狭いが安心。', ['regen', 0.005]),
  eq('a_spirit_robe', '霊織りの衣', 'armor', 3, 'robe:silver', ['hp', H[3] * 0.95], '霊糸で織られた衣。', ['atk', 0.08]),
  eq('a_gold_plate', '黄金の鎧', 'armor', 4, 'armor:gold', ['hp', H[4]], 'まばゆい輝き。', ['gold', 0.1]),
  eq('a_aegis', '守護者の大盾', 'armor', 4, 'shield:gold', ['hp', H[4] * 1.05], '何者も通さない。', ['regen', 0.008]),
  eq('a_star_robe', '星屑のドレス', 'armor', 4, 'robe:gold', ['hp', H[4] * 0.95], '夜空を纏う。', ['skillDmg', 0.15]),
  eq('a_dragon_mail', '竜鱗の鎧', 'armor', 5, 'armor:mythic', ['hp', H[5]], '古竜の鱗の鎧。', ['atk', 0.2]),
  eq('a_celestial', '天衣', 'armor', 5, 'robe:mythic', ['hp', H[5]], '天女の羽衣。', ['regen', 0.012]),
  // accessories
  eq('c_clover', '四つ葉', 'acc', 1, 'feather:wood', ['gold', 0.08], 'ちょっとした幸運。'),
  eq('c_copper_ring', '銅の指輪', 'acc', 1, 'ring:wood', ['crit', 0.02], 'くすんだ指輪。'),
  eq('c_feather', '風切り羽', 'acc', 2, 'feather:iron', ['speed', 0.06], '持つと体が軽い。'),
  eq('c_ruby_ring', 'ルビーの指輪', 'acc', 2, 'ring:iron', ['critDmg', 0.15], '情熱の赤。'),
  eq('c_lucky_coin', '招き金貨', 'acc', 2, 'gem:iron', ['gold', 0.15], 'お金を呼ぶ。'),
  eq('c_owl_amulet', 'ふくろうの護符', 'acc', 3, 'amulet:silver', ['crit', 0.05], '見通す瞳。', ['critDmg', 0.1]),
  eq('c_spirit_bell', '霊鈴', 'acc', 3, 'amulet:silver', ['skillDmg', 0.2], '清らかな音色。'),
  eq('c_hourglass', '砂時計', 'acc', 3, 'gem:silver', ['speed', 0.1], '時を少し早める。'),
  eq('c_phoenix', '不死鳥の羽', 'acc', 4, 'feather:gold', ['regen', 0.015], '燃え尽きぬ命。', ['hp', 0.2]),
  eq('c_kings_ring', '王の指輪', 'acc', 4, 'ring:gold', ['critDmg', 0.4], '王者の証。', ['crit', 0.04]),
  eq('c_treasure', '宝物庫の鍵', 'acc', 4, 'gem:gold', ['gold', 0.35], '眠れる財宝へ。'),
  eq('c_star_tear', '星の涙', 'acc', 5, 'gem:mythic', ['atk', 0.45], '願いを叶える雫。', ['crit', 0.06]),
  eq('c_world_amulet', '世界樹の首飾り', 'acc', 5, 'amulet:mythic', ['hp', 0.6], '命あふれる首飾り。', ['regen', 0.01]),
];

export const EQUIP_BY_ID: Record<string, EquipDef> = Object.fromEntries(EQUIPS.map((x) => [x.id, x]));
export const SLOT_LABEL: Record<Slot, string> = { weapon: '武器', armor: '防具', acc: '装飾' };

export const EQUIP_MAX_LV = 10;
export function equipLvMul(lv: number): number {
  return 1 + 0.2 * (lv - 1);
}
/** copies needed to go from lv to lv+1 */
export function copiesForLevel(lv: number): number {
  return lv; // 1,2,3,...
}

// ---------- skills ----------
export type SkillKind = 'strike' | 'nova' | 'bolt' | 'heal' | 'buff' | 'shield' | 'freeze' | 'drain' | 'meteor';

export interface SkillDef {
  id: string;
  name: string;
  rarity: Rarity;
  kind: SkillKind;
  el: Element;
  cd: number;
  power: number; // damage multiplier of ATK (or heal fraction)
  hits?: number;
  radius?: number;
  dur?: number;
  atkBuff?: number;
  spdBuff?: number;
  heal?: number;
  shield?: number;
  desc: string;
}

const sk = (s: SkillDef) => s;

export const SKILLS: SkillDef[] = [
  sk({ id: 's_bash', name: '強打', rarity: 1, kind: 'strike', el: 'earth', cd: 6, power: 3, desc: '目の前の敵に攻撃力の{p}倍。' }),
  sk({ id: 's_mend', name: 'ちいさな癒し', rarity: 1, kind: 'heal', el: 'wind', cd: 12, power: 0, heal: 0.18, desc: '体力を{h}回復。' }),
  sk({ id: 's_sparks', name: '火の粉', rarity: 1, kind: 'bolt', el: 'fire', cd: 8, power: 1.2, hits: 3, desc: 'ランダムな敵に{n}回、{p}倍の火の粉。' }),
  sk({ id: 's_whirl', name: '旋風斬', rarity: 2, kind: 'nova', el: 'wind', cd: 8, power: 2, radius: 95, desc: '周囲の敵すべてに{p}倍。' }),
  sk({ id: 's_rally', name: '鼓舞', rarity: 2, kind: 'buff', el: 'light', cd: 16, power: 0, dur: 8, atkBuff: 0.35, desc: '{d}秒間、攻撃力+{a}。' }),
  sk({ id: 's_bubble', name: '水の盾', rarity: 2, kind: 'shield', el: 'water', cd: 15, power: 0, shield: 0.25, desc: '最大体力の{s}のバリア。' }),
  sk({ id: 's_gust', name: '疾風', rarity: 2, kind: 'buff', el: 'wind', cd: 15, power: 0, dur: 7, spdBuff: 0.45, desc: '{d}秒間、攻撃速度+{v}。' }),
  sk({ id: 's_thunder', name: '雷撃', rarity: 3, kind: 'bolt', el: 'light', cd: 10, power: 1.8, hits: 5, desc: 'ランダムな敵に{n}回、{p}倍の雷。' }),
  sk({ id: 's_frost', name: '氷結陣', rarity: 3, kind: 'freeze', el: 'water', cd: 14, power: 2, radius: 110, dur: 2.5, desc: '周囲に{p}倍＋{d}秒凍結。' }),
  sk({ id: 's_drain', name: '吸魂の刃', rarity: 3, kind: 'drain', el: 'dark', cd: 9, power: 3.5, heal: 0.3, desc: '{p}倍の斬撃。与えたダメージの{h}を吸収。' }),
  sk({ id: 's_quake', name: '大地の怒り', rarity: 3, kind: 'nova', el: 'earth', cd: 12, power: 3, radius: 120, desc: '周囲の敵すべてに{p}倍。' }),
  sk({ id: 's_meteor', name: '流星', rarity: 4, kind: 'meteor', el: 'fire', cd: 14, power: 6, radius: 90, desc: '敵の群れに隕石。範囲{p}倍。' }),
  sk({ id: 's_sanctum', name: '聖域', rarity: 4, kind: 'heal', el: 'light', cd: 16, power: 0, heal: 0.4, shield: 0.15, desc: '体力を{h}回復し、{s}のバリア。' }),
  sk({ id: 's_berserk', name: '狂戦士', rarity: 4, kind: 'buff', el: 'fire', cd: 20, power: 0, dur: 9, atkBuff: 0.7, spdBuff: 0.3, desc: '{d}秒間、攻撃力+{a}・攻撃速度+{v}。' }),
  sk({ id: 's_petals', name: '千本桜', rarity: 4, kind: 'bolt', el: 'wind', cd: 14, power: 1.4, hits: 12, desc: '{n}枚の花弁が舞う。各{p}倍。' }),
  sk({ id: 's_starfall', name: '星詠みの雨', rarity: 5, kind: 'meteor', el: 'light', cd: 18, power: 11, radius: 150, desc: '星が降り注ぐ。範囲{p}倍。' }),
  sk({ id: 's_amaterasu', name: '天照', rarity: 5, kind: 'nova', el: 'fire', cd: 20, power: 7, radius: 170, heal: 0.25, desc: '周囲に{p}倍＋体力{h}回復。' }),
  sk({ id: 's_timestop', name: '刻止め', rarity: 5, kind: 'freeze', el: 'dark', cd: 24, power: 4, radius: 999, dur: 4, atkBuff: 0.5, desc: '全ての敵を{d}秒停止、{p}倍。攻撃力+{a}。' }),
  sk({ id: 's_hades', name: '冥府の門', rarity: 5, kind: 'drain', el: 'dark', cd: 16, power: 14, heal: 0.5, desc: '{p}倍の一撃。ダメージの{h}を吸収。' }),
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((x) => [x.id, x]));
export const SKILL_MAX_LV = 10;
export function skillLvMul(lv: number): number {
  return 1 + 0.15 * (lv - 1);
}

export function skillDesc(s: SkillDef, lv: number): string {
  const m = skillLvMul(lv);
  const pct = (x: number) => Math.round(x * 100) + '%';
  return s.desc
    .replace('{p}', (s.power * m).toFixed(1))
    .replace('{h}', pct((s.heal ?? 0) * (s.kind === 'drain' ? 1 : m)))
    .replace('{n}', String(s.hits ?? 1))
    .replace('{d}', String(s.dur ?? 0))
    .replace('{a}', pct((s.atkBuff ?? 0) * m))
    .replace('{v}', pct((s.spdBuff ?? 0) * m))
    .replace('{s}', pct((s.shield ?? 0) * m));
}
