// =============================================================
//  NIGHT HORDE — ゲームバランス・定数はすべてここに集約
//  （時間はすべて秒、距離はワールド単位 ≒ px）
// =============================================================


// ---- 遊び方（モード） ----
// 出現・イベントの時刻は「基準時計」（ボスが 720 秒に出る想定の時計）で書いてある。
// k 倍速で進めることで、同じ流れを短い時間に詰める（本編は 8 分、短期決戦は 4 分でボス）
export const BASE_BOSS = 720;
export const MODES = [
  { id: 'main',  name: '本編',     sub: '10分', len: 600, k: 1.5, xp: 1.45, hp: 1, desc: '中ボス二体を越え、8分に現れるスケルトンキングを倒す' },
  { id: 'short', name: '短期決戦', sub: '5分',  len: 300, k: 3,   xp: 4,    hp: 0.55, dmg: 0.7, bonus: 4, desc: '流れを半分に詰めた腕試し。開始時にスキルを4つ選び、4分でスケルトンキング' },
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
  onibi:       { name: 'バット',       hp: 6,   speed: 88, dmg: 5,  r: 12, xp: 1,  mass: 0.6, color: 4, model: 'bat' },
  kooni:       { name: 'スケルトン',   hp: 15,  speed: 56, dmg: 7,  r: 13, xp: 1,  mass: 1,   color: 3, model: 'skMinion' },
  hitotsume:   { name: 'スライム',     hp: 30,  speed: 50, dmg: 9,  r: 15, xp: 2,  mass: 1.2, color: 6, model: 'slime' },
  kappa:       { name: 'ビッグトード', hp: 26,  speed: 80, dmg: 8,  r: 14, xp: 2,  mass: 0.9, color: 5, model: 'frog', hop: true },
  chochin:     { name: 'ラット',       hp: 22,  speed: 112, dmg: 8, r: 12, xp: 2,  mass: 0.7, color: 7, model: 'rat' },
  gashadokuro: { name: 'スケルトン剣士', hp: 95,  speed: 48, dmg: 14, r: 16, xp: 4,  mass: 2,   color: 3, model: 'skRogue' },
  // 行動つきの雑魚（章や時間で混ざる）
  skMage:      { name: 'スケルトンメイジ', hp: 26, speed: 52, dmg: 6, r: 13, xp: 3, mass: 1, color: 3, model: 'skMage', ai: 'shooter' },
  bomber:      { name: '毒スライム',   hp: 20,  speed: 70, dmg: 4,  r: 14, xp: 2,  mass: 1,   color: 5, model: 'slimeRed', ai: 'bomber' },
  wasp:        { name: 'ブラッドバット', hp: 16, speed: 84, dmg: 8,  r: 12, xp: 2,  mass: 0.6, color: 1, model: 'batRed', ai: 'charger' },
  splitter:    { name: 'ビッグスライム', hp: 60, speed: 44, dmg: 10, r: 20, xp: 3, mass: 1.6, color: 6, model: 'slime', ai: 'splitter' },
  slimelet:    { name: 'プチスライム', hp: 12,  speed: 74, dmg: 5,  r: 10, xp: 1,  mass: 0.6, color: 6, model: 'slime' },
  brazier:     { name: '魔石灯',       hp: 1,   speed: 0,  dmg: 0,  r: 18, xp: 0,  mass: 999, color: 7, model: 'brazier', static: true },
  oni:         { name: 'ジャイアントスパイダー', hp: 650, speed: 58, dmg: 20, r: 34, xp: 30, mass: 6,   color: 1, elite: true, model: 'spiderBig' },
  orochi:      { name: 'ヴェノムサーペント', hp: 8000, speed: 76, dmg: 30, r: 46, xp: 60, mass: 999, color: 6, mid: true, model: 'orochi' },
  mukuro:      { name: 'リッチ',       hp: 15000, speed: 62, dmg: 32, r: 40, xp: 90, mass: 999, color: 3, mid: true, model: 'mukuro' },
  queen:       { name: '女王グモ',     hp: 260000, speed: 92, dmg: 40, r: 70, xp: 0, mass: 999, color: 5, boss: true, model: 'spiderBig' },
  tengu:       { name: 'スケルトンキング', hp: 300000, speed: 80, dmg: 45, r: 60, xp: 0, mass: 999, color: 6, boss: true, model: 'boss' },
};

export function hpScale(t) { const m = t / 60; return 1 + m * 0.3 + m * m * 0.018; }  // 基準時計で 5分≈2.9倍, 12分≈6.2倍
export function speedScale(t) { return 1 + t / 1800; }

// ---- 通常湧き（時刻 t 以降、rate 体/秒。rate は次の段階へ線形補間） ----
export const SPAWN = [
  { t: 0,   rate: 2,   mix: { onibi: 3, kooni: 2 } },
  { t: 60,  rate: 5,   mix: { onibi: 2, kooni: 4 } },
  { t: 120, rate: 8,   mix: { kooni: 4, hitotsume: 2, onibi: 2, kappa: 2 } },
  { t: 210, rate: 16,  mix: { kooni: 3, hitotsume: 3, chochin: 2, onibi: 2, kappa: 2, skMage: 1 } },
  { t: 300, rate: 24,  mix: { hitotsume: 3, chochin: 3, kooni: 2, onibi: 3, kappa: 2, skMage: 1, wasp: 1, bomber: 1 } },
  { t: 420, rate: 34,  mix: { hitotsume: 2, chochin: 3, gashadokuro: 2, onibi: 3, skMage: 2, wasp: 2, bomber: 1, splitter: 1 } },
  { t: 540, rate: 46,  mix: { chochin: 3, gashadokuro: 3, hitotsume: 2, onibi: 3, skMage: 2, wasp: 2, bomber: 2, splitter: 1 } },
  { t: 600, rate: 70,  mix: { chochin: 3, gashadokuro: 3, hitotsume: 3, onibi: 3, kooni: 2, skMage: 2, wasp: 2, bomber: 2, splitter: 1 } },
  { t: 719, rate: 90,  mix: { chochin: 3, gashadokuro: 3, hitotsume: 3, onibi: 3, kooni: 2, skMage: 2, wasp: 2, bomber: 2, splitter: 1 } },
  { t: 720, rate: 14,  mix: { onibi: 3, kooni: 2, chochin: 1 } },   // ボス戦は控えめ
];

// ---- イベント（包囲・百鬼夜行の行列・ボス） ----
// ring : プレイヤーを円形に包囲
// march: 画面外から行列が横切る（百鬼夜行）。dur 秒かけて流し込む。dirs=同時方向数
export const EVENTS = [
  { t: 150, type: 'ring',  enemy: 'kooni', count: 60, banner: 'スケルトンの包囲' },
  { t: 330, type: 'ring',  enemy: 'kappa', count: 80, banner: 'ビッグトードの包囲' },
  { t: 300, type: 'march', mix: { kooni: 3, onibi: 2, hitotsume: 1 }, count: 160, dur: 12, dirs: 1, banner: '大群 ─ 先遣隊' },
  { t: 260, type: 'mid', enemy: 'orochi', banner: '中ボス ─ ヴェノムサーペント' },
  { t: 540, type: 'mid', enemy: 'mukuro', banner: '中ボス ─ リッチ' },
  { t: 390, type: 'ring',  enemy: 'hitotsume', count: 110, banner: 'スライムの群れ' },
  { t: 480, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 1 }, count: 300, dur: 15, dirs: 2, banner: '大群襲来' },
  { t: 610, type: 'march', mix: { chochin: 2, hitotsume: 2, kooni: 2, gashadokuro: 2, onibi: 2 }, count: 800, dur: 25, dirs: 2, banner: '大群 ─ 本隊襲来', big: true },
  { t: 640, type: 'ring',  enemy: 'gashadokuro', count: 90 },
  { t: 660, type: 'march', mix: { chochin: 2, hitotsume: 2, gashadokuro: 2, onibi: 3 }, count: 900, dur: 25, dirs: 3 },
  { t: 700, type: 'ring',  enemy: 'chochin', count: 140 },
  { t: 720, type: 'boss',  banner: 'スケルトンキング 出現' },
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
    type: 'attack', name: 'マジックボルト', icon: '弾', color: '#ffd35a',
    desc: '近くの魔物へ追尾する魔法弾を放つ',
    levels: [
      { dmg: 10, count: 1, pierce: 1, cd: 0.75 },
      { dmg: 10, count: 2, pierce: 1, cd: 0.75 },
      { dmg: 14, count: 2, pierce: 2, cd: 0.7 },
      { dmg: 14, count: 3, pierce: 2, cd: 0.6 },
      { dmg: 19, count: 4, pierce: 3, cd: 0.55 },
      { dmg: 26, count: 6, pierce: 4, cd: 0.5 },
    ],
    up: ['', '弾 +1', '威力UP・貫通 +1', '弾 +1・連射UP', '弾 +1・威力UP・貫通 +1', '弾 +2・大幅強化'],
  },
  kitsunebi: {
    type: 'attack', name: 'ファイアオーブ', icon: '火', color: '#7fd7ff',
    desc: '青い炎の球が周囲を回り、触れた魔物を焼く',
    levels: [
      { dmg: 9,  count: 2, radius: 70,  spin: 3.0 },
      { dmg: 9,  count: 3, radius: 72,  spin: 3.1 },
      { dmg: 13, count: 3, radius: 82,  spin: 3.3 },
      { dmg: 13, count: 4, radius: 86,  spin: 3.4 },
      { dmg: 18, count: 5, radius: 94,  spin: 3.6 },
      { dmg: 25, count: 7, radius: 106, spin: 3.9 },
    ],
    up: ['', '炎 +1', '威力・範囲UP', '炎 +1', '炎 +1・威力UP', '炎 +2・大幅強化'],
  },
  raifu: {
    type: 'attack', name: 'サンダー', icon: '雷', color: '#d9c2ff',
    desc: '画面内の魔物へ落雷。周囲を巻き込む',
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
    type: 'attack', name: 'ホーリーサークル', icon: '聖', color: '#ffe9b0',
    desc: '足元の聖なる円が魔物を焼き、足を鈍らせる',
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
    type: 'attack', name: 'ライトアロー', icon: '矢', color: '#ff9a6b',
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
    type: 'summon', name: 'スピリット', icon: '霊', color: '#8fe3ff',
    desc: '霊体の小兵を大量に呼ぶ。魔物に群がり壁となる',
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
    type: 'summon', name: 'シャドウ', icon: '影', color: '#c79bff',
    desc: '影の刺客が群れの中を駆け抜け、貫いて斬る',
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
    type: 'summon', name: 'バーサーカー', icon: '斧', color: '#ffc04a',
    desc: '大斧の戦霊。叩きつけで周囲をまとめて吹き飛ばす',
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
    type: 'summon', name: 'ドラゴン', icon: '龍', color: '#ff6a3d',
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
  reiryoku: { type: 'passive', name: '魔力', icon: '魔', color: '#c77dff', desc: '全ての攻撃威力 +9%', levels: [1, 2, 3, 4, 5], up: [] },
  shikiko:  { type: 'passive', name: '召喚強化', icon: '召', color: '#7dffb0', desc: '召喚の威力 +9%・持続 +8%。偶数Lvで召喚数 +1', levels: [1, 2, 3, 4, 5], up: [] },
  sokuei:   { type: 'passive', name: '詠唱短縮', icon: '詠', color: '#7fd7ff', desc: '攻撃・召喚の間隔 -6%', levels: [1, 2, 3, 4, 5], up: [] },
  idaten:   { type: 'passive', name: '俊足', icon: '速', color: '#ffd35a', desc: '移動速度 +8%', levels: [1, 2, 3, 4, 5], up: [] },
  kyukon:   { type: 'passive', name: 'マグネット', icon: '磁', color: '#7dffb0', desc: '経験値の吸引範囲 +30%・獲得量 +5%', levels: [1, 2, 3, 4, 5], up: [] },
  chomei:   { type: 'passive', name: '活力', icon: '命', color: '#ff6a8a', desc: '最大HP +20・毎秒 0.4 回復', levels: [1, 2, 3, 4, 5], up: [] },
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
  tenpu:       { type: 'attack', base: 'ofuda', name: 'アークバースト', icon: '天', color: '#ffe9a0', desc: '八方へ魔法弾を放ち、着弾で炸裂する', levels: [{ dmg: 36, count: 8, pierce: 5, cd: 0.42, omni: true, boom: 48 }], up: [''] },
  kyubi:       { type: 'attack', base: 'kitsunebi', name: 'インフェルノリング', icon: '環', color: '#9fe8ff', desc: '九つの炎が呼吸するように広がり、群れを焼き払う', levels: [{ dmg: 34, count: 9, radius: 112, spin: 4.4, breathe: 44 }], up: [''] },
  raijin:      { type: 'attack', base: 'raifu', name: 'テンペスト', icon: '嵐', color: '#e2d0ff', desc: '雷が降り注ぎ、周りの魔物へ連鎖する', levels: [{ dmg: 95, strikes: 8, aoe: 84, cd: 1.0, chain: 3 }], up: [''] },
  daikekkai:   { type: 'attack', base: 'kekkai', name: 'サンクチュアリ', icon: '域', color: '#fff0b0', desc: '巨大な聖域で焼き払い、押し返し、傷を癒やす', levels: [{ dmg: 26, radius: 170, tick: 0.32, heal: 1.5, push: true }], up: [''] },
  tenkyu:      { type: 'attack', base: 'hamaya', name: 'ジャッジメント', icon: '弓', color: '#ffc59a', desc: '十の光の矢が扇状に全てを貫く', levels: [{ dmg: 60, count: 10, cd: 0.55, spread: 0.2, big: true }], up: [''] },
  hyakki:      { type: 'summon', base: 'kami', ally: 'kami', name: 'スピリットレギオン', icon: '軍', color: '#8fe3ff', desc: '画面を埋め尽くすスピリットの軍勢を呼ぶ', levels: [{ count: 28, hp: 40, dmg: 20, dur: 15, cd: 5.5 }], up: [''] },
  kagebunshin: { type: 'summon', base: 'byakko', ally: 'byakko', name: 'シャドウダンス', icon: '舞', color: '#d2a8ff', desc: '十二の影が嵐のように駆け抜ける', levels: [{ count: 12, dmg: 52, dur: 16, cd: 6 }], up: [''] },
  kishin:      { type: 'summon', base: 'zenki', ally: 'zenki', name: 'タイタンズ', icon: '巨', color: '#ffd77a', desc: '四体の巨人の戦霊が大地を砕く', levels: [{ count: 4, hp: 700, dmg: 130, aoe: 135, dur: 20, cd: 9 }], up: [''] },
  karyu:       { type: 'summon', base: 'karasu', ally: 'karasu', name: 'ドラゴンフライト', icon: '炎', color: '#ff8a4a', desc: '九匹の龍が炸裂する火球を降らせる', levels: [{ count: 9, dmg: 28, fire: 0.3, dur: 17, cd: 7, boom: 42 }], up: [''] },
});

// ---- ヒーロー（使えるキャラクター）。職ごとに初期のスキル・特性・必殺技が違う ----
// mods: hp 最大HP加算 / speed 移動倍率 / cd 間隔倍率 / shikiDur 式神持続倍率 / crit 会心率加算 / critMul 会心倍率加算
//       taken 被ダメ倍率 / heal 回復倍率 / regen 毎秒回復 / dmg 威力倍率 / drain 撃破ごとの回復
// unlock.type: winShort 短期決戦でボス撃破 / mids 本編の1回で中ボス二体撃破 / evos 進化を図鑑に n 種 / winMain 本編でボス撃破 / clears 本編を制した退魔師 n 人
const KNIGHT_HIDE = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', 'Knight_Helmet'];
export const CHARACTERS = [
  { id: 'seimei', job: 'ウィザード', name: 'アルト', model: 'player', hide: ['Spellbook', 'Spellbook_open', '1H_Wand'], start: ['ofuda', 'kami'],
    desc: 'マジックボルトとスピリット。召喚の持続 +20%', mods: { shikiDur: 1.2 },
    ult: { id: 'hyakki', name: 'サモンストーム', desc: 'スピリットの軍勢を一度に呼び、周りの魔物を吹き飛ばす' }, unlock: null },
  { id: 'miko', job: 'クレリック', name: 'セレナ', model: 'ally_hooded', tint: '#b02a3a', start: ['kekkai', 'kitsunebi'],
    desc: 'ホーリーサークルとファイアオーブ。回復量 2倍・毎秒 0.6 回復', mods: { heal: 2, regen: 0.6 },
    ult: { id: 'harae', name: 'ホーリーノヴァ', desc: '画面の魔物と敵の弾を消し、体力を 35% 回復' }, unlock: { type: 'winShort', text: '短期決戦でスケルトンキングを倒す' } },
  { id: 'shinobi', job: 'アサシン', name: 'ジン', model: 'ally_rogue', start: ['hamaya', 'byakko'],
    desc: 'ライトアローとシャドウ。移動 +18%・会心率 +12%・HP -30', mods: { speed: 1.18, crit: 0.12, hp: -30 },
    ult: { id: 'kagenui', name: 'シャドウラッシュ', desc: '3秒間、無敵で駆けながら近くの魔物を斬り続ける' }, unlock: { type: 'mids', text: '本編の1回で中ボスを二体とも倒す' } },
  { id: 'sohei', job: 'バーバリアン', name: 'ガルド', model: 'ally_barbarian', start: ['zenki', 'raifu'],
    desc: 'バーサーカーとサンダー。HP +80・被ダメ -20%・移動 -8%', mods: { hp: 80, taken: 0.8, speed: 0.92 },
    ult: { id: 'kongo', name: 'アイアンウィル', desc: '6秒間無敵になり、衝撃波で周りを吹き飛ばし続ける' }, unlock: { type: 'evos', v: 3, text: '図鑑に進化スキルを 3 種登録する' } },
  { id: 'kengo', job: 'ナイト', name: 'レオン', model: 'ally_knight', hide: KNIGHT_HIDE, start: ['hamaya', 'raifu'],
    desc: 'ライトアローとサンダー。会心ダメージ +100%・スキルの間隔 -8%', mods: { critMul: 1.0, cd: 0.92 },
    ult: { id: 'issen', name: 'グランドスラッシュ', desc: '向いた方向を一直線に斬り裂く。ボスにも大打撃' }, unlock: { type: 'winMain', text: '本編でスケルトンキングを倒す' } },
  { id: 'hanyo', job: 'アンデッド', name: 'ヴォルク', model: 'sk_rogue', tint: '#7a2cff', start: ['kitsunebi', 'byakko'],
    desc: 'ファイアオーブとシャドウ。威力 +10%・倒すたび回復・HP -20', mods: { dmg: 1.1, drain: 0.3, hp: -20 },
    ult: { id: 'youka', name: 'デスフォーム', desc: '8秒間、威力 2倍・移動 +30%・倒すたび大きく回復' }, unlock: { type: 'clears', v: 3, text: '本編を 3 人のヒーローで制す' } },
];

// ---- 実績（図鑑に並ぶ。条件は progress.js が記録から判定する） ----
export const ACHIEVEMENTS = [
  { id: 'first',   name: '初陣',         text: '一度出撃する' },
  { id: 'k1000',   name: '千体斬り',     text: '1回で 1000 体倒す' },
  { id: 'k3000',   name: '三千世界',     text: '1回で 3000 体倒す' },
  { id: 'orochi',  name: '蛇狩り',       text: 'ヴェノムサーペントを倒す' },
  { id: 'mukuro',  name: '不死殺し',     text: 'リッチを倒す' },
  { id: 'short',   name: '電光石火',     text: '短期決戦を制す' },
  { id: 'main',    name: '夜明けをもたらす者', text: '本編を制す' },
  { id: 'evo1',    name: '進化の兆し',   text: 'スキルを進化させる' },
  { id: 'evo9',    name: '万象の理',     text: '進化スキルを全 9 種登録する' },
  { id: 'yokai',   name: '魔物博士',     text: '魔物を全種倒す' },
  { id: 'ult10',   name: '必殺皆伝',     text: '必殺技を通算 10 回放つ' },
  { id: 'allwin',  name: '英雄の頂',     text: '6 人全員で本編を制す' },
];

// ---- 永続強化（金貨で買う。周回をまたいで残る） ----
// per: 1段あたりの効果 / max: 最大段 / cost: 1段目の値段（段が上がるほど高くなる）
export const POWERUPS = [
  { id: 'atk',    name: '攻撃力',   per: 0.05, max: 5, cost: 200, fmt: (v) => `威力 +${Math.round(v * 100)}%` },
  { id: 'hp',     name: '最大HP',   per: 12,   max: 5, cost: 150, fmt: (v) => `最大HP +${v}` },
  { id: 'regen',  name: '再生',     per: 0.15, max: 4, cost: 200, fmt: (v) => `毎秒 ${v.toFixed(2)} 回復` },
  { id: 'armor',  name: '防御',     per: 0.04, max: 4, cost: 250, fmt: (v) => `被ダメ -${Math.round(v * 100)}%` },
  { id: 'speed',  name: '移動速度', per: 0.04, max: 4, cost: 200, fmt: (v) => `移動 +${Math.round(v * 100)}%` },
  { id: 'cd',     name: '詠唱',     per: 0.03, max: 4, cost: 300, fmt: (v) => `間隔 -${Math.round(v * 100)}%` },
  { id: 'pickup', name: '回収範囲', per: 0.12, max: 4, cost: 120, fmt: (v) => `回収 +${Math.round(v * 100)}%` },
  { id: 'xp',     name: '成長',     per: 0.05, max: 5, cost: 250, fmt: (v) => `経験値 +${Math.round(v * 100)}%` },
  { id: 'luck',   name: '運',       per: 0.08, max: 4, cost: 300, fmt: (v) => `運 +${Math.round(v * 100)}%（会心・宝箱・ドロップ）` },
  { id: 'greed',  name: '強欲',     per: 0.1,  max: 4, cost: 200, fmt: (v) => `金貨 +${Math.round(v * 100)}%` },
  { id: 'reroll', name: '引き直し', per: 1,    max: 3, cost: 400, fmt: (v) => `引き直し +${v} 回` },
  { id: 'banish', name: '除外',     per: 1,    max: 2, cost: 500, fmt: (v) => `除外 +${v} 回` },
  { id: 'skip',   name: 'スキップ', per: 1,    max: 2, cost: 300, fmt: (v) => `スキップ +${v} 回` },
  { id: 'revive', name: '復活',     per: 1,    max: 1, cost: 2000, fmt: (v) => `力尽きても ${v} 回だけ復活` },
];
export const powerCost = (p, lv) => Math.round((p.cost * Math.pow(lv + 1, 1.6)) / 10) * 10;

// ---- 装備（ボス・中ボスやクリアで手に入る。同じ装備・同じレア度を3つ合成すると1段上がる） ----
export const RARITY = [
  { id: 'N',   mul: 1,   color: '#b8b8c8' },
  { id: 'R',   mul: 1.5, color: '#5ab0ff' },
  { id: 'SR',  mul: 2.2, color: '#c27bff' },
  { id: 'SSR', mul: 3.2, color: '#ffc94a' },
  { id: 'UR',  mul: 4.5, color: '#ff5a7a' },
];
export const SLOTS_GEAR = { weapon: '武器', armor: '防具', charm: '装飾' };
// stats: 1倍（N）での効果。レア度の倍率が掛かる
export const GEAR = [
  { id: 'staff',   slot: 'weapon', name: '古びた杖',     stats: { atk: 0.06 } },
  { id: 'sword',   slot: 'weapon', name: '騎士の剣',     stats: { crit: 0.03, critMul: 0.1 } },
  { id: 'bow',     slot: 'weapon', name: '狩人の弓',     stats: { cd: 0.035 } },
  { id: 'tome',    slot: 'weapon', name: '召喚の書',     stats: { summon: 0.08 } },
  { id: 'leather', slot: 'armor',  name: '革の鎧',       stats: { hp: 18 } },
  { id: 'mail',    slot: 'armor',  name: '鎖かたびら',   stats: { armor: 0.04 } },
  { id: 'cloak',   slot: 'armor',  name: '旅人の外套',   stats: { speed: 0.04 } },
  { id: 'clover',  slot: 'charm',  name: '四つ葉のお守り', stats: { luck: 0.08 } },
  { id: 'ring',    slot: 'charm',  name: '吸魂の指輪',   stats: { pickup: 0.12, xp: 0.03 } },
  { id: 'amulet',  slot: 'charm',  name: '再生の首飾り', stats: { regen: 0.25 } },
];
export const STAT_LABEL = {
  atk: (v) => `威力 +${Math.round(v * 100)}%`, crit: (v) => `会心率 +${Math.round(v * 100)}%`, critMul: (v) => `会心ダメ +${Math.round(v * 100)}%`,
  cd: (v) => `間隔 -${Math.round(v * 100)}%`, summon: (v) => `召喚の威力 +${Math.round(v * 100)}%`, hp: (v) => `最大HP +${Math.round(v)}`,
  armor: (v) => `被ダメ -${Math.round(v * 100)}%`, speed: (v) => `移動 +${Math.round(v * 100)}%`, luck: (v) => `運 +${Math.round(v * 100)}%`,
  pickup: (v) => `回収 +${Math.round(v * 100)}%`, xp: (v) => `経験値 +${Math.round(v * 100)}%`, regen: (v) => `毎秒 ${v.toFixed(2)} 回復`,
};

// ---- 章（ステージ）。前の章の本編を制すと次が開く ----
// swap: 雑魚の置き換え / diff: 敵の体力・攻撃の倍率 / boss: その章の大ボス / sky・fog・ground: 色
export const CHAPTERS = [
  { id: 1, name: '月夜の墓地', sub: 'CHAPTER 1', diff: 1, gold: 1, swap: {}, boss: 'tengu',
    sky: null, fog: null, ground: null, desc: 'スケルトンと獣の群れ。真夜中にスケルトンキングが現れる' },
  { id: 2, name: '毒沼の森', sub: 'CHAPTER 2', diff: 1.6, gold: 1.6, swap: { kooni: 'bomber', onibi: 'wasp', gashadokuro: 'skMage' }, boss: 'queen',
    sky: [0x040c09, 0x14281a], fog: 0x0b1a12, ground: [0.6, 0.85, 0.55], desc: '自爆する毒スライムと血に飢えたコウモリ。主は巨大な女王グモ' },
  { id: 3, name: '骸の城', sub: 'CHAPTER 3', diff: 2.4, gold: 2.4, swap: { onibi: 'wasp', hitotsume: 'splitter', chochin: 'skMage', kappa: 'bomber' }, boss: 'tengu', bossHp: 2.2,
    sky: [0x0c0308, 0x2e0a16], fog: 0x1c070c, ground: [0.85, 0.55, 0.6], desc: '呪文を撃つ骸骨と分裂する魔物。強化された王が待つ' },
];
