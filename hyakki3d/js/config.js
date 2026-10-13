// =============================================================
//  百鬼祓い — ゲームバランス・定数はすべてここに集約
//  （時間はすべて秒、距離はワールド単位 ≒ px）
// =============================================================


export const RUN = {
  bossAt: 720,   // 12:00 ボス「がしゃどくろ」出現
  winAt: 840,    // 14:00 まで生き残れば勝利（ボス撃破でも勝利）
};

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
  tengu:       { name: 'がしゃどくろ', hp: 220000, speed: 64, dmg: 34, r: 60, xp: 0, mass: 999, color: 6, boss: true, model: 'boss' },
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
  { t: 150, type: 'ring',  enemy: 'kooni', count: 60, banner: '骸骨兵の包囲' },
  { t: 330, type: 'ring',  enemy: 'kappa', count: 80, banner: '大蝦蟇の包囲' },
  { t: 270, type: 'march', mix: { kooni: 3, onibi: 2, hitotsume: 1 }, count: 160, dur: 12, dirs: 1, banner: '百鬼夜行 ─ 先触れ' },
  { t: 390, type: 'ring',  enemy: 'hitotsume', count: 110, banner: 'ぬっぺふほふの群れ' },
  { t: 480, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 1 }, count: 300, dur: 15, dirs: 2, banner: '百鬼夜行' },
  { t: 600, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 2, onibi: 2 }, count: 800, dur: 25, dirs: 2, banner: '百鬼夜行 ─ 本隊襲来', big: true },
  { t: 640, type: 'ring',  enemy: 'gashadokuro', count: 90 },
  { t: 660, type: 'march', mix: { chochin: 2, hitotsume: 2, gashadokuro: 2, onibi: 3 }, count: 900, dur: 25, dirs: 3 },
  { t: 700, type: 'ring',  enemy: 'chochin', count: 140 },
  { t: 720, type: 'boss',  banner: 'がしゃどくろ 出現' },
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
  reiryoku: { type: 'passive', name: '霊力', icon: '霊', color: '#c77dff', desc: '全ての攻撃威力 +12%', levels: [1, 2, 3, 4, 5], up: [] },
  shikiko:  { type: 'passive', name: '式神強化', icon: '式', color: '#7dffb0', desc: '式神の威力 +12%・持続 +10%。偶数Lvで召喚数 +1', levels: [1, 2, 3, 4, 5], up: [] },
  sokuei:   { type: 'passive', name: '速詠', icon: '詠', color: '#7fd7ff', desc: '攻撃・召喚の間隔 -7%', levels: [1, 2, 3, 4, 5], up: [] },
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

// ---- 陰陽師（キャラクター）。unlock を満たすと解放される ----
export const CHARACTERS = [
  { id: 'seimei', name: '安倍晴明', title: '陰陽頭', model: 'player', start: ['ofuda', 'kami'], desc: '札と式霊で戦う、癖のない万能型', mods: {}, unlock: null },
  { id: 'raiko', name: '雷光', title: '雷を呼ぶ陰陽師', model: 'ally_rogue', start: ['raifu', 'byakko'], desc: '落雷と影忍で切り込む。術の間隔 -10%', mods: { cd: 0.9 }, unlock: { type: 'time', v: 300, text: '5分生き延びる' } },
  { id: 'kuzunoha', name: '葛の葉', title: '白狐の母', model: 'ally_hooded', start: ['kitsunebi', 'kami'], desc: '狐火と式霊。式神の持続 +25%', mods: { shikiDur: 1.25 }, unlock: { type: 'kills', v: 1500, text: '1回で 1500 体祓う' } },
  { id: 'kiichi', name: '鬼一法眼', title: '鬼を従える者', model: 'ally_barbarian', start: ['hamaya', 'zenki'], desc: '破魔矢と前鬼。HP +50・移動 -5%', mods: { hp: 50, speed: 0.95 }, unlock: { type: 'chests', v: 5, text: '宝箱を通算 5 個開ける' } },
  { id: 'shikibu', name: '式部', title: '百鬼使い', model: 'player', tint: '#5fd8ff', start: ['kami', 'byakko', 'karasu'], desc: '攻撃術なし・式神三種で開始。召喚数 +1', mods: { shikiCount: 1 }, unlock: { type: 'win', text: '夜明けを迎える（勝利）' } },
];
