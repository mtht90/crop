// =============================================================
//  百鬼祓い — ゲームバランス・定数はすべてここに集約
//  （時間はすべて秒、距離はワールド単位 ≒ px）
// =============================================================


// ---- 遊び方（モード） ----
// 出現・イベントの時刻は「基準時計」（ボスが 720 秒に出る想定の時計）で書いてある。
// k 倍速で進めることで、同じ流れを短い時間に詰める（本編は 8 分、短期決戦は 4 分でボス）
export const BASE_BOSS = 720;
export const MODES = [
  { id: 'main',  name: '本編',     sub: '10分', len: 600, k: 1.5, xp: 1.45, hp: 1, desc: '中ボス二体を越え、8分に現れるがしゃどくろを討つ' },
  { id: 'short', name: '短期決戦', sub: '5分',  len: 300, k: 3,   xp: 4,    hp: 0.55, dmg: 0.7, bonus: 4, desc: '流れを半分に詰めた腕試し。開始時に術を4つ選び、4分でがしゃどくろ' },
];
// 制限時間を過ぎてもボスが生きていると激昂し、雑魚も湧き続ける（時間切れの勝利はない）
export const RUN = { bossAt: BASE_BOSS };

// ---- 難易度の倍率（ここを触れば全体の手応えが変わる） ----
// hp/dmg/speed: 雑魚・強敵 / rate: 湧く量 / mid・boss: 中ボス・大ボスの体力 / bullet: 敵弾の威力
export const DIFF = { hp: 1.7, dmg: 1.5, speed: 1.12, rate: 1.35, mid: 1.8, boss: 2.2, bullet: 1.4 };

// 同時存在数の上限（重さ対策）。スマホでは一部を自動で下げる
export const LIMITS = {
  enemies: 900,
  allies: 360,
  projectiles: 800,
  enemyBullets: 300,
  gems: 700,
  particles: 2600,
  texts: 100,
};

export const PLAYER = {
  hp: 120,
  speed: 150,
  r: 12,
  pickup: 90,       // 経験値の吸い寄せ半径
  hurtCd: 0.45,     // 被弾後の無敵時間
  crit: 0.1,        // 会心率
  critMul: 2.2,
};

// ---- 妖怪 ---------------------------------------------------
// hp は時間経過で hpScale(t) 倍される（ボスは固定）
// model: js/r3d/models.js の MODELS のキー
export const ENEMIES = {
  onibi:       { name: '化け蝙蝠',     hp: 6,   speed: 88, dmg: 5,  r: 12, xp: 1,  mass: 0.6, color: 4, model: 'bat' },
  kooni:       { name: '骸骨兵',       hp: 15,  speed: 56, dmg: 7,  r: 13, xp: 1,  mass: 1,   color: 3, model: 'skMinion' },
  hitotsume:   { name: 'ぬっぺふほふ', hp: 30,  speed: 50, dmg: 9,  r: 15, xp: 2,  mass: 1.2, color: 6, model: 'slime' },
  kappa:       { name: '大蝦蟇',       hp: 26,  speed: 80, dmg: 8,  r: 14, xp: 2,  mass: 0.9, color: 5, model: 'frog', hop: true },
  chochin:     { name: '鉄鼠',         hp: 22,  speed: 112, dmg: 8, r: 12, xp: 2,  mass: 0.7, color: 7, model: 'rat' },
  gashadokuro: { name: '落ち武者',     hp: 95,  speed: 48, dmg: 14, r: 16, xp: 4,  mass: 2,   color: 3, model: 'skRogue' },
  oni:         { name: '土蜘蛛',       hp: 650, speed: 58, dmg: 20, r: 34, xp: 30, mass: 6,   color: 1, elite: true, model: 'spiderBig' },
  orochi:      { name: '大蛇',         hp: 8000, speed: 76, dmg: 30, r: 46, xp: 60, mass: 999, color: 6, mid: true, model: 'orochi' },
  mukuro:      { name: '骸法師',       hp: 15000, speed: 62, dmg: 32, r: 40, xp: 90, mass: 999, color: 3, mid: true, model: 'mukuro' },
  tengu:       { name: 'がしゃどくろ', hp: 300000, speed: 80, dmg: 45, r: 60, xp: 0, mass: 999, color: 6, boss: true, model: 'boss' },
};

export function hpScale(t) { const m = t / 60; return 1 + m * 0.3 + m * m * 0.018; }  // 基準時計で 5分≈2.9倍, 12分≈6.2倍
export function speedScale(t) { return 1 + t / 1800; }

// ---- 通常湧き（時刻 t 以降、rate 体/秒。rate は次の段階へ線形補間） ----
export const SPAWN = [
  { t: 0,   rate: 2,   mix: { onibi: 3, kooni: 2 } },
  { t: 60,  rate: 5,   mix: { onibi: 2, kooni: 4 } },
  { t: 120, rate: 8,   mix: { kooni: 4, hitotsume: 2, onibi: 2, kappa: 2 } },
  { t: 210, rate: 16,  mix: { kooni: 3, hitotsume: 3, chochin: 2, onibi: 2, kappa: 2 } },
  { t: 300, rate: 24,  mix: { hitotsume: 3, chochin: 3, kooni: 2, onibi: 3, kappa: 2 } },
  { t: 420, rate: 34,  mix: { hitotsume: 2, chochin: 3, gashadokuro: 2, onibi: 3 } },
  { t: 540, rate: 46,  mix: { chochin: 3, gashadokuro: 3, hitotsume: 2, onibi: 3 } },
  { t: 600, rate: 70,  mix: { chochin: 3, gashadokuro: 3, hitotsume: 3, onibi: 3, kooni: 2 } },
  { t: 719, rate: 90,  mix: { chochin: 3, gashadokuro: 3, hitotsume: 3, onibi: 3, kooni: 2 } },
  { t: 720, rate: 14,  mix: { onibi: 3, kooni: 2, chochin: 1 } },   // ボス戦は控えめ
];

// ---- イベント（包囲・百鬼夜行の行列・ボス） ----
// ring : プレイヤーを円形に包囲
// march: 画面外から行列が横切る（百鬼夜行）。dur 秒かけて流し込む。dirs=同時方向数
export const EVENTS = [
  { t: 150, type: 'ring',  enemy: 'kooni', count: 60, banner: '骸骨兵の包囲' },
  { t: 330, type: 'ring',  enemy: 'kappa', count: 80, banner: '大蝦蟇の包囲' },
  { t: 300, type: 'march', mix: { kooni: 3, onibi: 2, hitotsume: 1 }, count: 160, dur: 12, dirs: 1, banner: '百鬼夜行 ─ 先触れ' },
  { t: 260, type: 'mid', enemy: 'orochi', banner: '中ボス ─ 大蛇' },
  { t: 540, type: 'mid', enemy: 'mukuro', banner: '中ボス ─ 骸法師' },
  { t: 390, type: 'ring',  enemy: 'hitotsume', count: 110, banner: 'ぬっぺふほふの群れ' },
  { t: 480, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 1 }, count: 300, dur: 15, dirs: 2, banner: '百鬼夜行' },
  { t: 610, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 2, onibi: 2 }, count: 800, dur: 25, dirs: 2, banner: '百鬼夜行 ─ 本隊襲来', big: true },
  { t: 640, type: 'ring',  enemy: 'gashadokuro', count: 90 },
  { t: 660, type: 'march', mix: { chochin: 2, hitotsume: 2, gashadokuro: 2, onibi: 3 }, count: 900, dur: 25, dirs: 3 },
  { t: 700, type: 'ring',  enemy: 'chochin', count: 140 },
  { t: 720, type: 'boss',  banner: 'がしゃどくろ 出現' },
];

EVENTS.sort((a, b) => a.t - b.t);   // 時刻順に処理するので並べておく

// エリート（土蜘蛛）：宝箱を落とす
export const ELITE = { first: 100, every: 70 };

// レアドロップ（通常の妖怪を倒したとき）
export const DROPS = { heal: 0.0016, magnet: 0.0009, bomb: 0.0006 };

// 必要経験値：Lv が上がるほど二次的に重くなる。本編のボス到達で Lv40 前後＝全ての術は育ちきらないので、何を取るかで差が出る
export function xpNeed(lv) {
  const n = lv - 1;
  return Math.floor(6 + n * 12 + n * n * 1.6);
}

// ---- スキル ---------------------------------------------------
// type: attack(攻撃) / summon(召喚・式神) / passive(補助)
// levels[i] がレベル i+1 の性能。up[i] がレベル i+1 になったときの説明
export const SLOTS = { active: 6, passive: 4 };

export const SKILLS = {
  // ===== 攻撃 =====
  ofuda: {
    type: 'attack', name: '護符', icon: '符', color: '#ffd35a',
    desc: '近くの妖怪へ追尾する札を放つ',
    levels: [
      { dmg: 10, count: 1, pierce: 1, cd: 0.75 },
      { dmg: 10, count: 2, pierce: 1, cd: 0.75 },
      { dmg: 14, count: 2, pierce: 2, cd: 0.7 },
      { dmg: 14, count: 3, pierce: 2, cd: 0.6 },
      { dmg: 19, count: 4, pierce: 3, cd: 0.55 },
      { dmg: 26, count: 6, pierce: 4, cd: 0.5 },
    ],
    up: ['', '札 +1', '威力UP・貫通 +1', '札 +1・連射UP', '札 +1・威力UP・貫通 +1', '札 +2・大幅強化'],
  },
  kitsunebi: {
    type: 'attack', name: '狐火', icon: '火', color: '#7fd7ff',
    desc: '青い狐火が周囲を回り、触れた妖怪を焼く',
    levels: [
      { dmg: 9,  count: 2, radius: 70,  spin: 3.0 },
      { dmg: 9,  count: 3, radius: 72,  spin: 3.1 },
      { dmg: 13, count: 3, radius: 82,  spin: 3.3 },
      { dmg: 13, count: 4, radius: 86,  spin: 3.4 },
      { dmg: 18, count: 5, radius: 94,  spin: 3.6 },
      { dmg: 25, count: 7, radius: 106, spin: 3.9 },
    ],
    up: ['', '狐火 +1', '威力・範囲UP', '狐火 +1', '狐火 +1・威力UP', '狐火 +2・大幅強化'],
  },
  raifu: {
    type: 'attack', name: '雷符', icon: '雷', color: '#d9c2ff',
    desc: '画面内の妖怪へ落雷。周囲を巻き込む',
    levels: [
      { dmg: 30, strikes: 1, aoe: 48, cd: 2.2 },
      { dmg: 30, strikes: 2, aoe: 48, cd: 2.2 },
      { dmg: 46, strikes: 2, aoe: 54, cd: 2.0 },
      { dmg: 46, strikes: 3, aoe: 58, cd: 1.8 },
      { dmg: 60, strikes: 4, aoe: 64, cd: 1.6 },
      { dmg: 80, strikes: 6, aoe: 72, cd: 1.35 },
    ],
    up: ['', '落雷 +1', '威力・範囲UP', '落雷 +1・頻度UP', '落雷 +1・威力UP', '落雷 +2・大幅強化'],
  },
  kekkai: {
    type: 'attack', name: '結界', icon: '結', color: '#ffe9b0',
    desc: '足元の結界が妖怪を焼き、足を鈍らせる',
    levels: [
      { dmg: 6,  radius: 62,  tick: 0.5 },
      { dmg: 6,  radius: 74,  tick: 0.5 },
      { dmg: 9,  radius: 80,  tick: 0.5 },
      { dmg: 9,  radius: 92,  tick: 0.45 },
      { dmg: 13, radius: 102, tick: 0.42 },
      { dmg: 18, radius: 120, tick: 0.38 },
    ],
    up: ['', '範囲UP', '威力UP', '範囲・頻度UP', '威力・範囲UP', '大幅強化'],
  },
  hamaya: {
    type: 'attack', name: '破魔矢', icon: '矢', color: '#ff9a6b',
    desc: '進行方向へ全てを貫く矢を放つ',
    levels: [
      { dmg: 18, count: 1, cd: 1.3 },
      { dmg: 18, count: 2, cd: 1.3 },
      { dmg: 26, count: 2, cd: 1.15 },
      { dmg: 26, count: 3, cd: 1.0 },
      { dmg: 34, count: 4, cd: 0.9 },
      { dmg: 46, count: 6, cd: 0.75 },
    ],
    up: ['', '矢 +1', '威力・連射UP', '矢 +1・連射UP', '矢 +1・威力UP', '矢 +2・大幅強化'],
  },

  // ===== 召喚（式神）=====
  kami: {
    type: 'summon', name: '式霊', icon: '霊', color: '#8fe3ff',
    desc: '霊体の小兵を大量に呼ぶ。妖怪に群がり壁となる',
    levels: [
      { count: 4,  hp: 18, dmg: 6,  dur: 9,  cd: 7 },
      { count: 6,  hp: 18, dmg: 6,  dur: 9,  cd: 7 },
      { count: 7,  hp: 22, dmg: 9,  dur: 11, cd: 7 },
      { count: 9,  hp: 28, dmg: 9,  dur: 11, cd: 6.5 },
      { count: 12, hp: 28, dmg: 12, dur: 12, cd: 6.5 },
      { count: 16, hp: 34, dmg: 16, dur: 14, cd: 6 },
    ],
    up: ['', '数 +2', '威力・持続UP', '数 +2・耐久UP', '数 +3・威力UP', '数 +4・大幅強化'],
  },
  byakko: {
    type: 'summon', name: '影忍', icon: '影', color: '#c79bff',
    desc: '影の忍が群れの中を駆け抜け、貫いて斬る',
    levels: [
      { count: 2, dmg: 14, dur: 10, cd: 9 },
      { count: 3, dmg: 14, dur: 10, cd: 9 },
      { count: 3, dmg: 21, dur: 12, cd: 8.5 },
      { count: 4, dmg: 21, dur: 13, cd: 8 },
      { count: 5, dmg: 29, dur: 14, cd: 8 },
      { count: 7, dmg: 40, dur: 16, cd: 7.5 },
    ],
    up: ['', '数 +1', '威力・持続UP', '数 +1', '数 +1・威力UP', '数 +2・大幅強化'],
  },
  zenki: {
    type: 'summon', name: '前鬼', icon: '鬼', color: '#ffc04a',
    desc: '大斧の鬼神。叩きつけで周囲をまとめて吹き飛ばす',
    levels: [
      { count: 1, hp: 260, dmg: 30, aoe: 72, dur: 12, cd: 15 },
      { count: 1, hp: 300, dmg: 42, aoe: 76, dur: 13, cd: 14 },
      { count: 2, hp: 300, dmg: 42, aoe: 78, dur: 13, cd: 14 },
      { count: 2, hp: 420, dmg: 55, aoe: 88, dur: 15, cd: 13 },
      { count: 2, hp: 480, dmg: 70, aoe: 96, dur: 17, cd: 12 },
      { count: 3, hp: 560, dmg: 95, aoe: 108, dur: 19, cd: 11 },
    ],
    up: ['', '威力・耐久UP', '数 +1', '耐久・範囲・持続UP', '威力UP', '数 +1・大幅強化'],
  },
  karasu: {
    type: 'summon', name: '飛龍', icon: '龍', color: '#ff6a3d',
    desc: '空を舞う小さな龍が火球を放って援護する',
    levels: [
      { count: 2, dmg: 8,  fire: 0.6,  dur: 11, cd: 10 },
      { count: 3, dmg: 8,  fire: 0.6,  dur: 11, cd: 10 },
      { count: 3, dmg: 11, fire: 0.55, dur: 12, cd: 9.5 },
      { count: 4, dmg: 11, fire: 0.5,  dur: 13, cd: 9 },
      { count: 5, dmg: 15, fire: 0.45, dur: 14, cd: 9 },
      { count: 7, dmg: 20, fire: 0.4,  dur: 16, cd: 8.5 },
    ],
    up: ['', '数 +1', '威力・連射UP', '数 +1・連射UP', '数 +1・威力UP', '数 +2・大幅強化'],
  },

  // ===== 補助 =====
  reiryoku: { type: 'passive', name: '霊力', icon: '霊', color: '#c77dff', desc: '全ての攻撃威力 +9%', levels: [1, 2, 3, 4, 5], up: [] },
  shikiko:  { type: 'passive', name: '式神強化', icon: '式', color: '#7dffb0', desc: '式神の威力 +9%・持続 +8%。偶数Lvで召喚数 +1', levels: [1, 2, 3, 4, 5], up: [] },
  sokuei:   { type: 'passive', name: '速詠', icon: '詠', color: '#7fd7ff', desc: '攻撃・召喚の間隔 -6%', levels: [1, 2, 3, 4, 5], up: [] },
  idaten:   { type: 'passive', name: '韋駄天', icon: '韋', color: '#ffd35a', desc: '移動速度 +8%', levels: [1, 2, 3, 4, 5], up: [] },
  kyukon:   { type: 'passive', name: '吸魂', icon: '魂', color: '#7dffb0', desc: '経験値の吸引範囲 +30%・獲得量 +5%', levels: [1, 2, 3, 4, 5], up: [] },
  chomei:   { type: 'passive', name: '長命', icon: '命', color: '#ff6a8a', desc: '最大HP +20・毎秒 0.4 回復', levels: [1, 2, 3, 4, 5], up: [] },
};

// レベルアップ時の選択肢の出やすさ
export const PICK_WEIGHT = { upgrade: 1.2, attack: 1.0, summon: 1.35, passive: 0.75 };




// ---- 進化（最大 Lv の術 ＋ 指定の補助を持った状態で宝箱を開けると上位の術に化ける） ----
export const EVOLUTIONS = [
  { from: 'ofuda', need: 'reiryoku', to: 'tenpu' },
  { from: 'kitsunebi', need: 'sokuei', to: 'kyubi' },
  { from: 'raifu', need: 'kyukon', to: 'raijin' },
  { from: 'kekkai', need: 'chomei', to: 'daikekkai' },
  { from: 'hamaya', need: 'idaten', to: 'tenkyu' },
  { from: 'kami', need: 'shikiko', to: 'hyakki' },
  { from: 'byakko', need: 'idaten', to: 'kagebunshin' },
  { from: 'zenki', need: 'reiryoku', to: 'kishin' },
  { from: 'karasu', need: 'sokuei', to: 'karyu' },
];
Object.assign(SKILLS, {
  tenpu:       { type: 'attack', base: 'ofuda', name: '八方天符', icon: '天', color: '#ffe9a0', desc: '八方へ天符を放ち、着弾で炸裂する', levels: [{ dmg: 36, count: 8, pierce: 5, cd: 0.42, omni: true, boom: 48 }], up: [''] },
  kyubi:       { type: 'attack', base: 'kitsunebi', name: '九尾の狐火', icon: '尾', color: '#9fe8ff', desc: '九つの狐火が呼吸するように広がり、群れを焼き払う', levels: [{ dmg: 34, count: 9, radius: 112, spin: 4.4, breathe: 44 }], up: [''] },
  raijin:      { type: 'attack', base: 'raifu', name: '雷神招来', icon: '神', color: '#e2d0ff', desc: '雷が降り注ぎ、周りの妖怪へ連鎖する', levels: [{ dmg: 95, strikes: 8, aoe: 84, cd: 1.0, chain: 3 }], up: [''] },
  daikekkai:   { type: 'attack', base: 'kekkai', name: '大結界・不動', icon: '不', color: '#fff0b0', desc: '巨大な結界で焼き払い、押し返し、傷を癒やす', levels: [{ dmg: 26, radius: 170, tick: 0.32, heal: 1.5, push: true }], up: [''] },
  tenkyu:      { type: 'attack', base: 'hamaya', name: '天弓・破魔', icon: '弓', color: '#ffc59a', desc: '十の光の矢が扇状に全てを貫く', levels: [{ dmg: 60, count: 10, cd: 0.55, spread: 0.2, big: true }], up: [''] },
  hyakki:      { type: 'summon', base: 'kami', ally: 'kami', name: '百鬼返し', icon: '百', color: '#8fe3ff', desc: '画面を埋め尽くす式霊の軍勢を呼ぶ', levels: [{ count: 28, hp: 40, dmg: 20, dur: 15, cd: 5.5 }], up: [''] },
  kagebunshin: { type: 'summon', base: 'byakko', ally: 'byakko', name: '影分身', icon: '分', color: '#d2a8ff', desc: '十二の影忍が嵐のように駆け抜ける', levels: [{ count: 12, dmg: 52, dur: 16, cd: 6 }], up: [''] },
  kishin:      { type: 'summon', base: 'zenki', ally: 'zenki', name: '前鬼・後鬼', icon: '神', color: '#ffd77a', desc: '四体の鬼神が大地を砕く', levels: [{ count: 4, hp: 700, dmg: 130, aoe: 135, dur: 20, cd: 9 }], up: [''] },
  karyu:       { type: 'summon', base: 'karasu', ally: 'karasu', name: '火龍の群れ', icon: '炎', color: '#ff8a4a', desc: '九匹の龍が炸裂する火球を降らせる', levels: [{ count: 9, dmg: 28, fire: 0.3, dur: 17, cd: 7, boom: 42 }], up: [''] },
});

// ---- 退魔師（使えるキャラクター）。職ごとに初期の術・特性・奥義が違う ----
// mods: hp 最大HP加算 / speed 移動倍率 / cd 間隔倍率 / shikiDur 式神持続倍率 / crit 会心率加算 / critMul 会心倍率加算
//       taken 被ダメ倍率 / heal 回復倍率 / regen 毎秒回復 / dmg 威力倍率 / drain 撃破ごとの回復
// unlock.type: winShort 短期決戦でボス撃破 / mids 本編の1回で中ボス二体撃破 / evos 進化を図鑑に n 種 / winMain 本編でボス撃破 / clears 本編を制した退魔師 n 人
const KNIGHT_HIDE = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', 'Knight_Helmet'];
export const CHARACTERS = [
  { id: 'seimei', job: '陰陽師', name: '安倍晴明', model: 'player', hide: ['Spellbook', 'Spellbook_open', '1H_Wand'], start: ['ofuda', 'kami'],
    desc: '札と式霊。式神の持続 +20%', mods: { shikiDur: 1.2 },
    ult: { id: 'hyakki', name: '百鬼招来', desc: '式霊の軍勢を一度に呼び、周りの妖怪を祓う' }, unlock: null },
  { id: 'miko', job: '巫女', name: '鈴鹿', model: 'ally_hooded', tint: '#b02a3a', start: ['kekkai', 'kitsunebi'],
    desc: '結界と狐火。回復量 2倍・毎秒 0.6 回復', mods: { heal: 2, regen: 0.6 },
    ult: { id: 'harae', name: '大祓', desc: '画面の妖怪と敵の弾を消し、体力を 35% 回復' }, unlock: { type: 'winShort', text: '短期決戦でがしゃどくろを討つ' } },
  { id: 'shinobi', job: '忍', name: '霞', model: 'ally_rogue', start: ['hamaya', 'byakko'],
    desc: '破魔矢と影忍。移動 +18%・会心率 +12%・HP -30', mods: { speed: 1.18, crit: 0.12, hp: -30 },
    ult: { id: 'kagenui', name: '影縫い', desc: '3秒間、無敵で駆けながら近くの妖怪を斬り続ける' }, unlock: { type: 'mids', text: '本編の1回で中ボスを二体とも討つ' } },
  { id: 'sohei', job: '僧兵', name: '武蔵坊', model: 'ally_barbarian', start: ['zenki', 'raifu'],
    desc: '前鬼と雷符。HP +80・被ダメ -20%・移動 -8%', mods: { hp: 80, taken: 0.8, speed: 0.92 },
    ult: { id: 'kongo', name: '金剛不壊', desc: '6秒間無敵になり、衝撃波で周りを吹き飛ばし続ける' }, unlock: { type: 'evos', v: 3, text: '図鑑に進化の術を 3 種登録する' } },
  { id: 'kengo', job: '剣豪', name: '頼光', model: 'ally_knight', hide: KNIGHT_HIDE, start: ['hamaya', 'raifu'],
    desc: '破魔矢と雷符。会心ダメージ +100%・術の間隔 -8%', mods: { critMul: 1.0, cd: 0.92 },
    ult: { id: 'issen', name: '一閃', desc: '向いた方向を一直線に斬り裂く。ボスにも大打撃' }, unlock: { type: 'winMain', text: '本編でがしゃどくろを討つ' } },
  { id: 'hanyo', job: '半妖', name: '骸丸', model: 'sk_rogue', tint: '#7a2cff', start: ['kitsunebi', 'byakko'],
    desc: '狐火と影忍。威力 +10%・倒すたび回復・HP -20', mods: { dmg: 1.1, drain: 0.3, hp: -20 },
    ult: { id: 'youka', name: '妖化', desc: '8秒間、威力 2倍・移動 +30%・倒すたび大きく回復' }, unlock: { type: 'clears', v: 3, text: '本編を 3 人の退魔師で制す' } },
];

// ---- 実績（図鑑に並ぶ。条件は progress.js が記録から判定する） ----
export const ACHIEVEMENTS = [
  { id: 'first',   name: '初陣',         text: '一度出陣する' },
  { id: 'k1000',   name: '千体祓い',     text: '1回で 1000 体祓う' },
  { id: 'k3000',   name: '三千世界',     text: '1回で 3000 体祓う' },
  { id: 'orochi',  name: '大蛇退治',     text: '大蛇を討つ' },
  { id: 'mukuro',  name: '骸送り',       text: '骸法師を討つ' },
  { id: 'short',   name: '電光石火',     text: '短期決戦を制す' },
  { id: 'main',    name: '百鬼夜行を退けし者', text: '本編を制す' },
  { id: 'evo1',    name: '術の極み',     text: '術を進化させる' },
  { id: 'evo9',    name: '万象の理',     text: '進化の術を全 9 種登録する' },
  { id: 'yokai',   name: '妖怪博士',     text: '妖怪を全種祓う' },
  { id: 'ult10',   name: '奥義皆伝',     text: '奥義を通算 10 回放つ' },
  { id: 'allwin',  name: '退魔の頂',     text: '6 人全員で本編を制す' },
];
