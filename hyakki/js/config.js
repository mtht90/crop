// =============================================================
//  百鬼祓い — ゲームバランス・定数はすべてここに集約
//  （時間はすべて秒、距離はワールド単位 ≒ px）
// =============================================================

// 画面の短辺に何ワールド単位を映すか（大きいほど引きのカメラ）
export const VIEW_MIN = 640;

export const RUN = {
  bossAt: 720,   // 12:00 ボス「大天狗」出現
  winAt: 840,    // 14:00 まで生き残れば勝利（ボス撃破でも勝利）
};

// 同時存在数の上限（重さ対策）。スマホでは一部を自動で下げる
export const LIMITS = {
  enemies: 1500,
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
export const ENEMIES = {
  onibi:       { name: '鬼火',        hp: 6,   speed: 80, dmg: 5,  r: 10, xp: 1,  mass: 0.6, color: 2 },
  kooni:       { name: '小鬼',        hp: 15,  speed: 56, dmg: 7,  r: 12, xp: 1,  mass: 1,   color: 1 },
  hitotsume:   { name: '一つ目',      hp: 30,  speed: 62, dmg: 9,  r: 13, xp: 2,  mass: 1,   color: 6 },
  kappa:       { name: '河童',        hp: 26,  speed: 74, dmg: 8,  r: 12, xp: 2,  mass: 0.9, color: 5 },
  chochin:     { name: '提灯お化け',  hp: 36,  speed: 96, dmg: 10, r: 13, xp: 2,  mass: 0.8, color: 0, hop: true },
  gashadokuro: { name: 'がしゃどくろ', hp: 95, speed: 48, dmg: 14, r: 16, xp: 4,  mass: 2,   color: 3 },
  oni:         { name: '赤鬼',        hp: 650, speed: 52, dmg: 20, r: 26, xp: 30, mass: 6,   color: 1, elite: true },
  tengu:       { name: '大天狗',      hp: 220000, speed: 64, dmg: 34, r: 50, xp: 0, mass: 999, color: 6, boss: true },
};

export function hpScale(t) { const m = t / 60; return 1 + m * 0.45 + m * m * 0.025; }  // 5分≈3.9倍, 10分≈8倍
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
  { t: 150, type: 'ring',  enemy: 'kooni', count: 60, banner: '小鬼の包囲' },
  { t: 330, type: 'ring',  enemy: 'kappa', count: 80, banner: '河童の包囲' },
  { t: 270, type: 'march', mix: { kooni: 3, onibi: 2, hitotsume: 1 }, count: 160, dur: 12, dirs: 1, banner: '百鬼夜行 ─ 先触れ' },
  { t: 390, type: 'ring',  enemy: 'hitotsume', count: 110, banner: '一つ目の包囲' },
  { t: 480, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 1 }, count: 300, dur: 15, dirs: 2, banner: '百鬼夜行' },
  { t: 600, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 2, onibi: 2 }, count: 800, dur: 25, dirs: 2, banner: '百鬼夜行 ─ 本隊襲来', big: true },
  { t: 640, type: 'ring',  enemy: 'gashadokuro', count: 90 },
  { t: 660, type: 'march', mix: { chochin: 2, hitotsume: 2, gashadokuro: 2, onibi: 3 }, count: 900, dur: 25, dirs: 3 },
  { t: 700, type: 'ring',  enemy: 'chochin', count: 140 },
  { t: 720, type: 'boss',  banner: '大天狗 降臨' },
];

// エリート（赤鬼）：宝箱を落とす
export const ELITE = { first: 100, every: 70 };

// レアドロップ（通常の妖怪を倒したとき）
export const DROPS = { heal: 0.0016, magnet: 0.0009, bomb: 0.0006 };

// 必要経験値
export function xpNeed(lv) {
  return Math.floor(5 + (lv - 1) * 7 + Math.max(0, lv - 20) * 14 + Math.max(0, lv - 40) * 30);
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
    type: 'summon', name: '式霊', icon: '霊', color: '#cfeeff',
    desc: '小さな霊を大量に呼ぶ。妖怪に群がり壁となる',
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
    type: 'summon', name: '猫又', icon: '猫', color: '#ffffff',
    desc: '白い猫又が群れの中を駆け抜け、貫いて裂く',
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
    type: 'summon', name: '鎧武者', icon: '武', color: '#6fa8ff',
    desc: '双刀の鎧武者。斬撃で周囲をまとめて吹き飛ばす',
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
    type: 'summon', name: '烏天狗', icon: '天', color: '#ff6a3d',
    desc: '空を舞う烏天狗が苦無を放って援護する',
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
  reiryoku: { type: 'passive', name: '霊力', icon: '霊', color: '#c77dff', desc: '全ての攻撃威力 +12%', levels: [1, 2, 3, 4, 5], up: [] },
  shikiko:  { type: 'passive', name: '式神強化', icon: '式', color: '#7dffb0', desc: '式神の威力 +12%・持続 +10%。偶数Lvで召喚数 +1', levels: [1, 2, 3, 4, 5], up: [] },
  sokuei:   { type: 'passive', name: '速詠', icon: '詠', color: '#7fd7ff', desc: '攻撃・召喚の間隔 -7%', levels: [1, 2, 3, 4, 5], up: [] },
  idaten:   { type: 'passive', name: '韋駄天', icon: '韋', color: '#ffd35a', desc: '移動速度 +8%', levels: [1, 2, 3, 4, 5], up: [] },
  kyukon:   { type: 'passive', name: '吸魂', icon: '魂', color: '#7dffb0', desc: '経験値の吸引範囲 +30%・獲得量 +5%', levels: [1, 2, 3, 4, 5], up: [] },
  chomei:   { type: 'passive', name: '長命', icon: '命', color: '#ff6a8a', desc: '最大HP +20・毎秒 0.4 回復', levels: [1, 2, 3, 4, 5], up: [] },
};

// レベルアップ時の選択肢の出やすさ
export const PICK_WEIGHT = { upgrade: 1.2, attack: 1.0, summon: 1.35, passive: 0.75 };

// 開始時に持っているスキル（式神の楽しさを最初から体験できるよう召喚も持たせる）
export const START_SKILLS = ['ofuda', 'kami'];

// 使用素材は js/sprites.js の SPR に定義（assets/ 以下、Ninja Adventure Asset Pack / CC0）
