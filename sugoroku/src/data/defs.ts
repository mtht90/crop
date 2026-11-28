// ゲームのデータ（v4：王国カードバトル）。カード・キャラ・ステージ・領地。
import type { CardDef, Effect, HeroDef, HeroId, Keyword, RegionDef, StageDef, StageId } from '../game/types.ts';

// ---------- バトルの基本 ----------
export const BATTLE = {
  attackerHp: 20, // 攻める側の城の体力
  maxMana: 7,
  field: 5, // 場に出せる兵の数
  handMax: 8,
  firstHand: 3, // 先攻の最初の手札
  secondHand: 4, // 後攻の最初の手札
  turnLimit: 14, // それぞれ14ターンで決着しなければ守る側の勝ち
};

export const KW_NAME: Record<Keyword, string> = { guard: '守護', rush: '速攻', ranged: '射撃', shield: '盾' };
export const KW_DESC: Record<Keyword, string> = {
  guard: '守護：この兵がいる間、敵は城やほかの兵を攻撃できない',
  rush: '速攻：出したターンから攻撃できる',
  ranged: '射撃：攻撃しても反撃を受けない',
  shield: '盾：最初に受けるダメージを1回だけ防ぐ',
};
export const RARITY_NAME = { common: 'コモン', rare: 'レア', epic: 'エピック' };

const U = (id: string, name: string, icon: string, cost: number, atk: number, hp: number, rarity: CardDef['rarity'], unlockLevel: number, kw: Keyword[] = [], fx: Effect[] = [], extra: Partial<CardDef> = {}): CardDef => ({ id, name, icon, type: 'unit', cost, atk, hp, kw, fx, rarity, unlockLevel, ...extra });
const S = (id: string, name: string, icon: string, cost: number, rarity: CardDef['rarity'], unlockLevel: number, fx: Effect[]): CardDef => ({ id, name, icon, type: 'spell', cost, fx, rarity, unlockLevel });

export const CARDS: Record<string, CardDef> = Object.fromEntries(
  [
    // ---- 兵（基本） ----
    U('recruit', '見習い兵', 'swordman', 1, 1, 2, 'common', 1),
    U('spear', '槍兵', 'spear-hook', 1, 2, 1, 'common', 1),
    U('shield', '盾兵', 'shield-bash', 2, 1, 4, 'common', 1, ['guard']),
    U('archer', '弓兵', 'bowman', 2, 2, 2, 'common', 1, ['ranged']),
    U('scout', '斥候', 'cowled', 2, 2, 1, 'common', 1, ['rush']),
    U('priest', '僧侶', 'monk-face', 2, 1, 3, 'common', 1, [], [{ kind: 'heal', n: 3 }]),
    U('knight', '騎士', 'knight-banner', 3, 3, 3, 'common', 1, ['shield']),
    U('sellsword', '傭兵', 'sword-brandish', 3, 4, 2, 'common', 1),
    U('wolf', '森の狼', 'wolf-head', 1, 1, 1, 'common', 1, ['rush']),
    U('ranger', '狩人', 'archer', 3, 2, 2, 'rare', 1, ['ranged'], [{ kind: 'damage', n: 1, target: 'enemyUnit' }]),
    U('dwarf', '山の戦士', 'dwarf-face', 3, 2, 5, 'rare', 1, ['guard']),
    U('mage', '魔導士', 'wizard-face', 4, 3, 3, 'rare', 2, [], [{ kind: 'damage', n: 2, target: 'enemyAny' }]),
    U('paladin', '聖騎士', 'sun-priest', 4, 3, 4, 'rare', 3, ['shield'], [{ kind: 'heal', n: 3 }]),
    U('cavalry', '騎兵', 'mounted-knight', 4, 4, 3, 'rare', 2, ['rush']),
    U('heavy', '重装兵', 'heavy-helm', 5, 4, 7, 'rare', 4, ['guard']),
    U('catapult', '投石機', 'catapult', 4, 0, 4, 'rare', 3, [], [{ kind: 'siege', n: 2 }]),
    U('general', '将軍', 'rally-the-troops', 5, 4, 4, 'epic', 5, [], [{ kind: 'buffAll', atk: 1, hp: 1 }]),
    U('golem', '岩の巨人', 'golem-head', 6, 6, 8, 'epic', 6, ['guard']),
    U('champion', '英雄', 'crowned-skull', 6, 5, 5, 'epic', 7, ['rush', 'shield']),
    U('dragon', '竜', 'dragon-head', 7, 6, 6, 'epic', 8, [], [{ kind: 'aoe', n: 2 }]),
    // ---- 魔物（中立の守り手。倒すと仲間にできる） ----
    U('goblin', 'ゴブリン', 'goblin-head', 1, 2, 1, 'common', 1, [], [], { monster: true }),
    U('skeleton', '骸骨兵', 'skeleton', 2, 2, 2, 'common', 1, ['shield'], [], { monster: true }),
    U('spider', '大蜘蛛', 'spider-face', 2, 1, 3, 'common', 1, ['guard'], [], { monster: true }),
    U('bandit', '盗賊', 'bandit', 2, 2, 2, 'common', 1, [], [{ kind: 'damage', n: 1, target: 'enemyAny' }], { monster: true }),
    U('orc', 'オーク', 'orc-head', 3, 3, 4, 'common', 1, [], [], { monster: true }),
    U('wyvern', 'ワイバーン', 'wyvern', 4, 4, 3, 'rare', 2, ['rush'], [], { monster: true }),
    U('troll', 'トロル', 'troll', 5, 5, 6, 'rare', 3, [], [], { monster: true }),
    U('wraith', '亡霊', 'hooded-assassin', 3, 3, 2, 'rare', 2, ['shield', 'rush'], [], { monster: true }),
    // ---- 呪文 ----
    S('arrow', '火矢', 'flaming-arrow', 1, 'common', 1, [{ kind: 'damage', n: 2, target: 'enemyAny' }]),
    S('fireball', '火球', 'fireball', 3, 'common', 1, [{ kind: 'damage', n: 4, target: 'enemyAny' }]),
    S('rally', '鼓舞', 'trumpet-flag', 1, 'common', 1, [{ kind: 'buff', atk: 2, hp: 1 }]),
    S('supply', '補給', 'caravan', 2, 'common', 1, [{ kind: 'draw', n: 2 }]),
    S('prayer', '祈り', 'healing', 1, 'common', 1, [{ kind: 'heal', n: 4 }]),
    S('wall', '城壁', 'stone-wall', 2, 'common', 1, [{ kind: 'summon', card: 'wallToken', count: 1 }]),
    S('ambush', '伏兵', 'daggers', 3, 'rare', 2, [{ kind: 'summon', card: 'ambushToken', count: 2 }]),
    S('armor', '鍛え直し', 'armor-upgrade', 2, 'rare', 2, [{ kind: 'buff', atk: 1, hp: 2, shield: true }]),
    S('blizzard', '吹雪', 'snowflake-1', 4, 'rare', 4, [{ kind: 'aoe', n: 2 }]),
    S('meteor', '隕石', 'meteor-impact', 6, 'epic', 6, [{ kind: 'damage', n: 7, target: 'enemyUnit' }, { kind: 'damage', n: 3, target: 'enemyFace' }]),
    // ---- トークン ----
    U('wallToken', '石の壁', 'brick-wall', 0, 0, 5, 'common', 99, ['guard'], [], { token: true }),
    U('ambushToken', '伏兵', 'ninja-heroic-stance', 0, 2, 2, 'common', 99, [], [], { token: true }),
  ].map((c) => [c.id, c]),
);

/** カードの説明文（能力と効果から作る） */
export function cardText(c: CardDef, spellBonus = 0): string {
  const parts: string[] = [];
  if (c.kw?.length) parts.push(c.kw.map((k) => KW_NAME[k]).join('・'));
  for (const f of c.fx ?? []) {
    const pre = c.type === 'unit' && f.kind !== 'siege' ? '登場時：' : '';
    const dmg = (n: number) => n + (c.type === 'spell' ? spellBonus : 0);
    switch (f.kind) {
      case 'damage':
        parts.push(`${pre}${f.target === 'enemyUnit' ? '敵の兵1体' : f.target === 'enemyFace' ? '敵の城' : '敵1体か敵の城'}に${dmg(f.n)}ダメージ`);
        break;
      case 'aoe':
        parts.push(`${pre}敵の兵全員に${dmg(f.n)}ダメージ`);
        break;
      case 'heal':
        parts.push(`${pre}自分の城を${f.n}回復`);
        break;
      case 'buff':
        parts.push(`${pre}味方の兵1体に+${f.atk}/+${f.hp}${f.shield ? 'と盾' : ''}`);
        break;
      case 'buffAll':
        parts.push(`${pre}ほかの味方全員に+${f.atk}/+${f.hp}`);
        break;
      case 'draw':
        parts.push(`${pre}カードを${f.n}枚引く`);
        break;
      case 'summon': {
        const t = CARDS[f.card];
        parts.push(`${pre}${t.name}（${t.atk}/${t.hp}${t.kw?.length ? ' ' + t.kw.map((k) => KW_NAME[k]).join('・') : ''}）を${f.count}体出す`);
        break;
      }
      case 'siege':
        parts.push(`自分のターンの終わりに敵の城に${f.n}ダメージ`);
        break;
    }
  }
  return parts.join('。') + (parts.length ? '。' : '');
}

/** 対象を選ぶ必要があるか */
export function needsTarget(c: CardDef): 'enemyAny' | 'enemyUnit' | 'ownUnit' | null {
  const f = c.fx?.[0];
  if (!f) return null;
  if (f.kind === 'damage' && f.target !== 'enemyFace') return f.target;
  if (f.kind === 'buff') return 'ownUnit';
  return null;
}

// ---------- キャラ ----------
export const HEROES: Record<HeroId, HeroDef> = {
  knight: { id: 'knight', name: 'レオン', title: '誓いの騎士', icon: 'visored-helm', model: 'Knight', cost: 0, signature: 'shield', passive: '守護を持つ味方の体力 +1' },
  merchant: { id: 'merchant', name: 'ミラ', title: '旅の商人', icon: 'swap-bag', model: 'Rogue', cost: 0, signature: 'priest', passive: 'バトルの最初の手札が1枚多い。訓練ではカードを2枚もらえる' },
  mage: { id: 'mage', name: 'ルナ', title: '夜空の魔女', icon: 'pointy-hat', model: 'Mage', cost: 300, signature: 'fireball', passive: '呪文のダメージ +1' },
  ranger: { id: 'ranger', name: 'カイ', title: '風読みの狩人', icon: 'bow-arrow', model: 'Ranger', cost: 500, signature: 'ranger', passive: '射撃を持つ味方の攻撃 +1' },
  assassin: { id: 'assassin', name: 'ジン', title: '影の暗殺者', icon: 'hooded-figure', model: 'Rogue_Hooded', cost: 800, signature: 'scout', passive: '速攻を持つ味方の攻撃 +1。初期デッキの見習い兵1枚が森の狼' },
  barbarian: { id: 'barbarian', name: 'ボルグ', title: '略奪王', icon: 'barbarian', model: 'Barbarian', cost: 1200, signature: 'sellsword', passive: '兵が敵の城を攻撃するとダメージ +1。攻めるときは自分の城の体力 +4' },
};
export const HERO_ORDER: HeroId[] = ['knight', 'merchant', 'mage', 'ranger', 'assassin', 'barbarian'];
/** 最初のデッキ（＋キャラの得意カード1枚） */
export const START_DECK = ['recruit', 'recruit', 'spear', 'spear', 'shield', 'shield', 'archer', 'priest', 'knight', 'arrow', 'arrow', 'rally'];
export function startDeck(h: HeroId): string[] {
  const d = [...START_DECK, HEROES[h].signature];
  if (h === 'assassin') d[d.indexOf('recruit')] = 'wolf';
  return d;
}
/** 中立の守り手は、最初から少しマナを持っている（奥の領地ほど多い） */
export function neutralMana(r: RegionDef) {
  return r.kind === 'dragon' ? 1 : ['goblin', 'spider', 'fort'].includes(r.kind) ? 1 : 0;
}

// ---------- 領地（島を13に分ける） ----------
const rp = (kind: RegionDef['kind']) => kind;
export const REGIONS: RegionDef[] = [
  { id: 0, name: '東の王都', kind: rp('capital'), icon: 'castle', hp: 20, pool: [], defenders: [], seed: [6, -2], start: 1 },
  { id: 1, name: '南の王都', kind: 'capital', icon: 'castle', hp: 20, pool: [], defenders: [], seed: [-1, 6], start: 0 },
  { id: 2, name: '西の王都', kind: 'capital', icon: 'castle', hp: 20, pool: [], defenders: [], seed: [-6, 2], start: 2 },
  { id: 3, name: '北の王都', kind: 'capital', icon: 'castle', hp: 20, pool: [], defenders: [], seed: [1, -6], start: 3 },
  { id: 4, name: '狼の森', kind: 'forest', icon: 'wolf-howl', hp: 14, pool: ['wolf', 'ranger', 'archer', 'scout'], defenders: ['wolf', 'wolf', 'wolf', 'archer', 'archer', 'ranger', 'ranger', 'orc', 'spear', 'arrow', 'arrow', 'wyvern'], seed: [4, 3], start: null },
  { id: 5, name: '鉄の鉱山', kind: 'mine', icon: 'gold-mine', hp: 14, pool: ['dwarf', 'shield', 'heavy', 'armor'], defenders: ['dwarf', 'dwarf', 'shield', 'shield', 'orc', 'orc', 'catapult', 'armor', 'spear', 'archer', 'troll', 'arrow'], seed: [-5, 6], start: null },
  { id: 6, name: '盗賊の港', kind: 'harbor', icon: 'anchor', hp: 14, pool: ['bandit', 'sellsword', 'supply', 'ambush'], defenders: ['bandit', 'bandit', 'bandit', 'goblin', 'sellsword', 'sellsword', 'arrow', 'fireball', 'orc', 'shield', 'wraith', 'supply'], seed: [-4, -3], start: null },
  { id: 7, name: '骸骨の墓地', kind: 'grave', icon: 'tombstone', hp: 19, pool: ['skeleton', 'wraith', 'prayer', 'priest'], defenders: ['skeleton', 'skeleton', 'skeleton', 'skeleton', 'wraith', 'wraith', 'spider', 'spider', 'priest', 'arrow', 'orc', 'troll'], seed: [5, -6], start: null },
  { id: 8, name: 'ゴブリンの洞窟', kind: 'goblin', icon: 'cave-entrance', hp: 14, pool: ['goblin', 'orc', 'wyvern', 'ambush'], defenders: ['goblin', 'goblin', 'goblin', 'orc', 'orc', 'orc', 'wyvern', 'wyvern', 'troll', 'troll', 'bandit', 'arrow', 'fireball', 'ambush'], seed: [2, 1], start: null },
  { id: 9, name: '大蜘蛛の谷', kind: 'spider', icon: 'spider-web', hp: 14, pool: ['spider', 'catapult', 'wall', 'blizzard'], defenders: ['spider', 'spider', 'spider', 'catapult', 'catapult', 'archer', 'ranger', 'orc', 'wall', 'troll', 'troll', 'arrow', 'blizzard', 'wyvern'], seed: [-3, 3], start: null },
  { id: 10, name: '魔導の塔', kind: 'tower', icon: 'wizard-staff', hp: 12, pool: ['mage', 'fireball', 'blizzard', 'arrow'], defenders: ['mage', 'mage', 'arrow', 'arrow', 'fireball', 'shield', 'shield', 'priest', 'skeleton', 'wraith', 'recruit', 'blizzard'], seed: [-2, -1], start: null },
  { id: 11, name: '騎士団の砦', kind: 'fort', icon: 'stone-tower', hp: 11, pool: ['knight', 'cavalry', 'paladin', 'general'], defenders: ['knight', 'knight', 'cavalry', 'cavalry', 'shield', 'paladin', 'paladin', 'archer', 'rally', 'sellsword', 'heavy', 'priest', 'general', 'armor'], seed: [3, -3], start: null },
  { id: 12, name: '竜の巣', kind: 'dragon', icon: 'dragon-head', hp: 22, pool: ['dragon', 'golem', 'champion', 'meteor'], defenders: ['spider', 'spider', 'skeleton', 'skeleton', 'wyvern', 'wyvern', 'troll', 'troll', 'orc', 'orc', 'fireball', 'blizzard', 'golem', 'dragon', 'dragon', 'wraith'], seed: [0, 0], start: null },
];
/** 領地のとなり（scripts で六角形の割り当てから求めた） */
export const REGION_ADJ: number[][] = [
  [4, 7, 8, 11], [4, 5, 8, 9], [5, 6, 9, 10], [6, 7, 10, 11],
  [0, 1, 8], [1, 2, 9], [2, 3, 10], [0, 3, 11],
  [0, 1, 4, 9, 11, 12], [1, 2, 5, 8, 10, 12], [2, 3, 6, 9, 11, 12], [0, 3, 7, 8, 10, 12],
  [8, 9, 10, 11],
];
/** プレイヤーの領地（王都以外）の守りの城の体力 */
export const OWNED_REGION_HP = 20;
/** 王都の城の体力 */
export const CAPITAL_HP = 30;

// ---------- ステージ ----------
export const STAGES: Record<StageId, StageDef> = {
  meadow: {
    id: 'meadow', name: '翠緑の王国', desc: '穏やかな草原の島。まずはここで王を目指そう。', unlockLevel: 1, aiSkill: 0.45, neutralBonus: 0,
    palette: { skyTop: '#5fa8f0', skyBottom: '#d8f0ff', fog: '#cfe8fb', grass: '#7cc95a', grassDark: '#4f9a3c', rock: '#8a7462', plaza: '#e8dcc0', sun: '#fff1d6', ambient: '#bfe0ff', particle: 'pollen' },
  },
  snow: {
    id: 'snow', name: '白銀の王国', desc: '雪に閉ざされた島。CPUが少し賢く、魔物も手強い。', unlockLevel: 3, aiSkill: 0.65, neutralBonus: 2,
    palette: { skyTop: '#7f9fc4', skyBottom: '#e9f2fb', fog: '#e2ecf7', grass: '#eef4fa', grassDark: '#c3d3e4', rock: '#6e7b8c', plaza: '#d6e2ef', sun: '#e8f1ff', ambient: '#c9dcf5', particle: 'snow' },
  },
  volcano: {
    id: 'volcano', name: '灼熱の王国', desc: '溶岩が流れる島。CPUも魔物も手強い。', unlockLevel: 6, aiSkill: 0.85, neutralBonus: 4,
    palette: { skyTop: '#2a1420', skyBottom: '#c2502e', fog: '#5a2a26', grass: '#5d4a40', grassDark: '#3a2c27', rock: '#2d2321', plaza: '#a58a72', sun: '#ffb27a', ambient: '#a04a3a', particle: 'ember' },
  },
  sky: {
    id: 'sky', name: '天空の王国', desc: '雲の上の伝説の島。CPUは最強。', unlockLevel: 10, aiSkill: 1, neutralBonus: 6,
    palette: { skyTop: '#1a1f5c', skyBottom: '#f3a8c8', fog: '#c9a8d8', grass: '#b8e3d0', grassDark: '#86c2ae', rock: '#e8e0f0', plaza: '#fff4dc', sun: '#ffe7f2', ambient: '#b7a6ff', particle: 'stars' },
  },
};
export const STAGE_ORDER: StageId[] = ['meadow', 'snow', 'volcano', 'sky'];

export const PLAYER_COLORS = ['#e8483f', '#3b8eea', '#47c26b', '#f2b630'];
/** KayKit の建物・旗の色名（PLAYER_COLORS と同じ順） */
export const PLAYER_KEYS = ['red', 'blue', 'green', 'yellow'] as const;
export const NEUTRAL_COLOR = '#8a8070';
