// ゲームデータ:武器・パッシブ・秘宝・キャラクター・敵・恒久強化・実績

// 各レベルでの変化(L2〜L8 の7段)。キー:dmg 加算 / amount 弾数 / cd 間隔倍率 / area 範囲倍率 / pierce 貫通 / dur 持続倍率 / speed 弾速倍率
export const WEAPONS = {
  bolt: {
    name: '魔弾', icon: '弾', color: '#5df2ff', desc: '近くの敵へ自動で飛んでいく魔力の弾。',
    base: { dmg: 11, cd: 0.9, amount: 1, area: 1, pierce: 1, speed: 20, dur: 1.6 },
    lv: [{ amount: 1 }, { dmg: 5 }, { cd: 0.85 }, { amount: 1 }, { pierce: 1, dmg: 4 }, { dmg: 8 }, { amount: 1, cd: 0.9 }],
    evo: { with: 'cooldown', into: 'starfall' },
  },
  blades: {
    name: '旋刃', icon: '刃', color: '#e8f0ff', desc: '体のまわりを回転する刃。触れた敵を切り裂く。',
    base: { dmg: 15, cd: 1.6, amount: 2, area: 1, pierce: 999, speed: 1, dur: 3.2 },
    lv: [{ amount: 1 }, { dmg: 6, area: 1.15 }, { cd: 0.7 }, { amount: 1 }, { dmg: 8, speed: 1.2 }, { area: 1.2 }, { amount: 1, dmg: 6 }],
    evo: { with: 'area', into: 'bladestorm' },
  },
  lightning: {
    name: '雷撃', icon: '雷', color: '#fff36b', desc: 'ランダムな敵に雷を落とし、周囲へ連鎖する。',
    base: { dmg: 22, cd: 1.7, amount: 2, area: 1, pierce: 2, speed: 1, dur: 1 },
    lv: [{ amount: 1 }, { dmg: 10 }, { pierce: 1 }, { cd: 0.85 }, { amount: 1, dmg: 8 }, { pierce: 2 }, { amount: 1, dmg: 14 }],
    evo: { with: 'luck', into: 'tempest' },
  },
  arrows: {
    name: '連弩', icon: '矢', color: '#ffd39a', desc: '進む方向へ貫通する矢を扇状に放つ。',
    base: { dmg: 13, cd: 0.75, amount: 2, area: 1, pierce: 3, speed: 30, dur: 1.0 },
    lv: [{ amount: 1 }, { dmg: 5 }, { pierce: 2 }, { amount: 1 }, { cd: 0.85 }, { dmg: 7, pierce: 2 }, { amount: 2 }],
    evo: { with: 'amount', into: 'thousand' },
  },
  aura: {
    name: '聖域', icon: '聖', color: '#ffe9a8', desc: '自分のまわりの敵に継続ダメージを与え、押し返す。',
    base: { dmg: 7, cd: 0.4, amount: 1, area: 1, pierce: 999, speed: 1, dur: 1 },
    lv: [{ area: 1.2 }, { dmg: 3 }, { area: 1.15 }, { cd: 0.85 }, { dmg: 4, area: 1.1 }, { dmg: 4 }, { area: 1.2, dmg: 4 }],
    evo: { with: 'maxhp', into: 'sanctum' },
  },
  firebomb: {
    name: '火炎瓶', icon: '炎', color: '#ff8a3c', desc: '敵の群れに瓶を投げ、燃え続ける炎を残す。',
    base: { dmg: 9, cd: 2.4, amount: 1, area: 1, pierce: 999, speed: 1, dur: 2.6 },
    lv: [{ amount: 1 }, { dmg: 4, area: 1.15 }, { dur: 1.3 }, { amount: 1 }, { dmg: 5 }, { area: 1.2, cd: 0.85 }, { amount: 1, dmg: 6 }],
    evo: { with: 'duration', into: 'inferno' },
  },
  frost: {
    name: '氷輪', icon: '氷', color: '#aef4ff', desc: '一定間隔で冷気の輪を放ち、敵を凍らせる。',
    base: { dmg: 16, cd: 3.0, amount: 1, area: 1, pierce: 999, speed: 1, dur: 1.2 },
    lv: [{ area: 1.15 }, { dmg: 8 }, { cd: 0.85 }, { dur: 1.3, area: 1.1 }, { dmg: 10 }, { cd: 0.85 }, { area: 1.25, dmg: 12 }],
    evo: { with: 'armor', into: 'zero' },
  },
  boomerang: {
    name: '戻り刃', icon: '輪', color: '#ff9a3c', desc: '遠くまで飛んで戻ってくる刃。行きと帰りで2回当たる。',
    base: { dmg: 16, cd: 1.5, amount: 1, area: 1, pierce: 999, speed: 16, dur: 1 },
    lv: [{ amount: 1 }, { dmg: 7 }, { area: 1.25 }, { amount: 1 }, { cd: 0.85, dmg: 6 }, { speed: 1.2, area: 1.2 }, { amount: 1, dmg: 10 }],
    evo: { with: 'move', into: 'cyclone' },
  },
  meteor: {
    name: '隕星', icon: '星', color: '#ff6a2a', desc: '敵の密集地に隕石を落とす。大爆発で画面が揺れる。',
    base: { dmg: 55, cd: 4.2, amount: 1, area: 1, pierce: 999, speed: 1, dur: 1 },
    lv: [{ dmg: 20 }, { amount: 1 }, { area: 1.2 }, { cd: 0.85 }, { dmg: 30, amount: 1 }, { area: 1.2 }, { amount: 1, dmg: 40 }],
    evo: { with: 'might', into: 'doomstar' },
  },
  // ===== 進化武器 =====
  starfall: { name: '星雨', icon: '★', color: '#fff1a8', evolved: true, desc: '無数の星弾が絶え間なく降り注ぐ。', base: { dmg: 30, cd: 0.18, amount: 3, area: 1.3, pierce: 3, speed: 24, dur: 1.6 } },
  bladestorm: { name: '刃の嵐', icon: '嵐', color: '#ffffff', evolved: true, desc: '巨大な刃が絶えず回り続ける。', base: { dmg: 40, cd: 999, amount: 7, area: 1.8, pierce: 999, speed: 1.6, dur: 999 } },
  tempest: { name: '天雷', icon: '轟', color: '#fffbcf', evolved: true, desc: '雷の雨。会心で更に落雷が増える。', base: { dmg: 60, cd: 0.6, amount: 6, area: 1.5, pierce: 5, speed: 1, dur: 1 } },
  thousand: { name: '千本矢', icon: '千', color: '#ffe6c2', evolved: true, desc: '全方位へ矢の嵐を放つ。', base: { dmg: 34, cd: 0.35, amount: 14, area: 1.2, pierce: 8, speed: 34, dur: 1.1 } },
  sanctum: { name: '聖光の帳', icon: '光', color: '#fffbe0', evolved: true, desc: '広大な聖域。敵を倒すたびに少し回復。', base: { dmg: 26, cd: 0.3, amount: 1, area: 2.3, pierce: 999, speed: 1, dur: 1 } },
  inferno: { name: '業火', icon: '獄', color: '#ff5a1a', evolved: true, desc: '火の海が自分の後を追ってくる。', base: { dmg: 28, cd: 0.9, amount: 4, area: 1.6, pierce: 999, speed: 1, dur: 4 } },
  zero: { name: '絶対零度', icon: '零', color: '#e8ffff', evolved: true, desc: '巨大な冷気が全てを凍らせ、砕く。', base: { dmg: 80, cd: 2.0, amount: 1, area: 2.0, pierce: 999, speed: 1, dur: 2.5 } },
  cyclone: { name: '大旋風', icon: '旋', color: '#ffc06b', evolved: true, desc: '戻り刃が竜巻となって敵を巻き込む。', base: { dmg: 42, cd: 0.9, amount: 4, area: 1.7, pierce: 999, speed: 18, dur: 1.2 } },
  doomstar: { name: '終焉の星', icon: '終', color: '#ff3a1a', evolved: true, desc: '空から絶え間なく巨星が落ちる。', base: { dmg: 160, cd: 1.6, amount: 3, area: 1.7, pierce: 999, speed: 1, dur: 1 } },
};
export const BASE_WEAPONS = ['bolt', 'blades', 'lightning', 'arrows', 'aura', 'firebomb', 'frost', 'boomerang', 'meteor'];

export const PASSIVES = {
  might: { name: '剛力', icon: '力', color: '#ff6b6b', desc: 'ダメージ +12%', max: 5, apply: (s) => (s.might += 0.12) },
  cooldown: { name: '速詠', icon: '速', color: '#5df2ff', desc: '攻撃間隔 -7%', max: 5, apply: (s) => (s.cooldown *= 0.93) },
  area: { name: '拡がり', icon: '広', color: '#b98bff', desc: '攻撃範囲 +12%', max: 5, apply: (s) => (s.area += 0.12) },
  duration: { name: '残響', icon: '久', color: '#ffb33a', desc: '効果時間 +12%', max: 5, apply: (s) => (s.duration += 0.12) },
  amount: { name: '分裂', icon: '多', color: '#ff8bd8', desc: '弾数 +1(Lv2,4,5で)', max: 5, apply: (s, lv) => { if (lv === 2 || lv === 4 || lv === 5) s.amount += 1; } },
  move: { name: '疾風', icon: '疾', color: '#9cff6b', desc: '移動速度 +8%', max: 5, apply: (s) => (s.move += 0.08) },
  magnet: { name: '引力', icon: '磁', color: '#7fb2ff', desc: '回収範囲 +30%', max: 5, apply: (s) => (s.magnet += 0.3) },
  maxhp: { name: '生命', icon: '命', color: '#ff4f6a', desc: '最大HP +20、毎秒回復 +0.2', max: 5, apply: (s) => { s.maxHp += 20; s.regen += 0.2; } },
  armor: { name: '鉄壁', icon: '盾', color: '#c9d3e6', desc: '被ダメージ -1、ノックバック強化', max: 5, apply: (s) => { s.armor += 1; s.knock += 0.15; } },
  luck: { name: '幸運', icon: '運', color: '#ffe14d', desc: '会心率 +6%、宝箱の中身が増える', max: 5, apply: (s) => { s.crit += 0.06; s.luck += 0.1; } },
  growth: { name: '叡智', icon: '智', color: '#6bffd8', desc: '獲得経験値 +12%', max: 5, apply: (s) => (s.growth += 0.12) },
  greed: { name: '強欲', icon: '金', color: '#ffd24a', desc: '獲得ゴールド +25%', max: 5, apply: (s) => (s.greed += 0.25) },
};

export const RELICS = {
  chain: { name: '連鎖の火種', icon: '爆', color: '#ff7a2a', desc: '倒した敵の18%が爆発し、周りを巻き込む。爆発が爆発を呼ぶ。' },
  vampire: { name: '吸血の牙', icon: '牙', color: '#ff3a5a', desc: '敵を倒すたび 8% の確率でHPが2回復。' },
  thunder: { name: '雷鳴の指輪', icon: '鳴', color: '#fff36b', desc: '会心が出るたび、近くの敵に雷が落ちる。' },
  twin: { name: '双子の呪符', icon: '双', color: '#ff8bd8', desc: 'すべての武器の弾数 +1。' },
  gravity: { name: '重力の核', icon: '核', color: '#7fb2ff', desc: '20秒ごとに、フィールド上の経験値をすべて吸い寄せる。' },
  berserk: { name: '狂戦士の兜', icon: '狂', color: '#ff4040', desc: '減っているHP 1%ごとに、ダメージ +1%。' },
  haste: { name: '加速の砂時計', icon: '砂', color: '#ffe9a8', desc: '移動中は攻撃間隔 -25%。' },
  midas: { name: '黄金律', icon: '律', color: '#ffd24a', desc: 'このランで得たゴールド50ごとにダメージ +1%(最大+60%)。' },
  frostheart: { name: '凍てつく心', icon: '凍', color: '#aef4ff', desc: '攻撃が 8% の確率で敵を凍らせる。凍った敵への与ダメ +50%。' },
  phoenix: { name: '不死鳥の羽', icon: '鳳', color: '#ff9a3c', desc: '一度だけ、倒れても全回復して蘇り、周囲を焼き払う。' },
  gale: { name: '疾風の靴', icon: '靴', color: '#9cff6b', desc: 'ダッシュの再使用 -40%。ダッシュ時に衝撃波を放つ。' },
  harvest: { name: '収穫の月', icon: '月', color: '#6bffd8', desc: '獲得経験値 +30%、回収範囲 +50%。' },
  bloodpact: { name: '血月の契約', icon: '契', color: '#c0306a', desc: '敵の出現 +50%。そのかわり経験値とゴールド +60%。' },
  shield: { name: '結晶の盾', icon: '晶', color: '#c78bff', desc: '12秒ごとに、1回だけ攻撃を防ぐ障壁をまとう。' },
  overload: { name: '過剰詠唱', icon: '過', color: '#5df2ff', desc: 'レベルアップのたびに全画面へ衝撃波。攻撃間隔 -10%。' },
};

export const BLESSINGS = [
  { id: 'b_might', name: '戦神の祝福', icon: '力', color: '#ff6b6b', desc: 'ダメージ +10%(永続)', apply: (s) => (s.might += 0.1) },
  { id: 'b_cd', name: '時の祝福', icon: '速', color: '#5df2ff', desc: '攻撃間隔 -6%(永続)', apply: (s) => (s.cooldown *= 0.94) },
  { id: 'b_area', name: '大地の祝福', icon: '広', color: '#b98bff', desc: '攻撃範囲 +10%(永続)', apply: (s) => (s.area += 0.1) },
  { id: 'b_hp', name: '生命の祝福', icon: '命', color: '#ff4f6a', desc: '最大HP +30 して全回復', apply: (s, g) => { s.maxHp += 30; if (g) g.player.hp = 1e9; } },
  { id: 'b_move', name: '風の祝福', icon: '疾', color: '#9cff6b', desc: '移動速度 +8%(永続)', apply: (s) => (s.move += 0.08) },
  { id: 'b_luck', name: '星の祝福', icon: '運', color: '#ffe14d', desc: '会心率 +5%、会心ダメージ +30%', apply: (s) => { s.crit += 0.05; s.critMult += 0.3; } },
  { id: 'b_xp', name: '知恵の祝福', icon: '智', color: '#6bffd8', desc: '獲得経験値 +15%(永続)', apply: (s) => (s.growth += 0.15) },
  { id: 'b_gold', name: '富の祝福', icon: '金', color: '#ffd24a', desc: 'ゴールド +300 を即座に獲得', apply: (s, g) => { if (g) g.addGold(300, true); } },
];

export const HEROES = {
  knight: { name: '騎士 アルド', weapon: 'blades', desc: '頑丈な体と回転する刃で群れの中を突き進む。', perk: '最大HP +30 / 鉄壁 +1', stats: { maxHp: 30, armor: 1 }, unlock: null },
  mage: { name: '魔導士 リセ', weapon: 'bolt', desc: '追尾する魔弾の名手。打たれ弱いが攻撃が速い。', perk: '攻撃間隔 -12% / 最大HP -10', stats: { cooldown: 0.88, maxHp: -10 }, unlock: 'mage' },
  ranger: { name: '狩人 カイ', weapon: 'arrows', desc: '足が速く、矢の雨で道を切り開く。', perk: '移動速度 +12% / 回収範囲 +30%', stats: { move: 0.12, magnet: 0.3 }, unlock: 'ranger' },
  alchemist: { name: '錬金術師 ノア', weapon: 'firebomb', desc: '炎で一帯を焼き払う。宝探しも得意。', perk: '範囲 +15% / ゴールド +30%', stats: { area: 0.15, greed: 0.3 }, unlock: 'alchemist' },
};

// 敵:hp 基本値 / spd 速度 / dmg 接触ダメージ / r 半径 / xp / 出現開始(分)
export const ENEMIES = {
  slime: { hp: 9, spd: 3.1, dmg: 6, r: 0.5, xp: 1, cap: 500, from: 0 },
  bat: { hp: 6, spd: 4.8, dmg: 5, r: 0.45, xp: 1, cap: 400, from: 0.7, erratic: true },
  goblin: { hp: 22, spd: 3.3, dmg: 9, r: 0.55, xp: 2, cap: 400, from: 2 },
  skeleton: { hp: 32, spd: 3.0, dmg: 11, r: 0.55, xp: 2, cap: 400, from: 3 },
  wolf: { hp: 26, spd: 5.4, dmg: 10, r: 0.6, xp: 2, cap: 300, from: 2.5, charger: true },
  beetle: { hp: 85, spd: 2.3, dmg: 14, r: 0.8, xp: 4, cap: 200, from: 5 },
  eye: { hp: 30, spd: 2.2, dmg: 8, r: 0.6, xp: 3, cap: 120, from: 4, shooter: true },
  ghost: { hp: 24, spd: 3.6, dmg: 9, r: 0.55, xp: 2, cap: 300, from: 3.5, erratic: true },
  golem: { hp: 260, spd: 1.9, dmg: 22, r: 1.1, xp: 10, cap: 80, from: 7 },
  crystal: { hp: 45, spd: 3.0, dmg: 12, r: 0.6, xp: 3, cap: 250, from: 4, splits: true },
  imp: { hp: 34, spd: 4.4, dmg: 12, r: 0.55, xp: 3, cap: 300, from: 5 },
  // ボス
  treant: { hp: 1, spd: 2.4, dmg: 18, r: 1.8, xp: 0, cap: 2, boss: true, title: '森の古樹 ドゥルーグ', model: 'treant' },
  witch: { hp: 1, spd: 3.4, dmg: 16, r: 1.4, xp: 0, cap: 2, boss: true, title: '氷晶の魔女 セレスタ', model: 'witch' },
  wyrm: { hp: 1, spd: 3.0, dmg: 22, r: 1.9, xp: 0, cap: 2, boss: true, title: '砂喰らいの大蛇 ザハク', model: 'wyrm' },
  voidking: { hp: 1, spd: 2.8, dmg: 26, r: 2.0, xp: 0, cap: 1, boss: true, title: '虚ろの王 ネフティス', model: 'voidking' },
};
// バイオームごとの出現表(重み)
export const SPAWN_TABLE = {
  meadow: { slime: 10, bat: 5, goblin: 4, wolf: 2, beetle: 1, eye: 1, imp: 1, golem: 0.3 },
  forest: { goblin: 8, bat: 5, slime: 4, beetle: 4, ghost: 2, wolf: 2, eye: 2, golem: 0.5 },
  desert: { skeleton: 9, beetle: 4, bat: 3, eye: 3, imp: 2, golem: 0.6, goblin: 2 },
  snow: { wolf: 9, ghost: 4, skeleton: 3, crystal: 2, eye: 1, golem: 0.6 },
  ash: { imp: 8, golem: 2, skeleton: 3, eye: 3, bat: 3, beetle: 2 },
  crystal: { crystal: 8, ghost: 4, eye: 3, imp: 2, bat: 3, golem: 0.8 },
};
export const NIGHT_EXTRA = { skeleton: 5, ghost: 4, bat: 4 };
export const BOSS_ORDER = ['treant', 'witch', 'wyrm'];

export const SHOP = [
  { id: 'might', name: '剛力', icon: '力', desc: 'ダメージ +5%', max: 5, cost: 120 },
  { id: 'maxhp', name: '頑強', icon: '命', desc: '最大HP +10', max: 5, cost: 100 },
  { id: 'regen', name: '再生', icon: '癒', desc: '毎秒HP回復 +0.15', max: 3, cost: 180 },
  { id: 'armor', name: '装甲', icon: '盾', desc: '被ダメージ -1', max: 3, cost: 250 },
  { id: 'move', name: '俊足', icon: '疾', desc: '移動速度 +4%', max: 3, cost: 150 },
  { id: 'cooldown', name: '速詠', icon: '速', desc: '攻撃間隔 -3%', max: 3, cost: 240 },
  { id: 'area', name: '拡張', icon: '広', desc: '攻撃範囲 +5%', max: 3, cost: 200 },
  { id: 'magnet', name: '磁力', icon: '磁', desc: '回収範囲 +15%', max: 3, cost: 100 },
  { id: 'growth', name: '成長', icon: '智', desc: '獲得経験値 +5%', max: 5, cost: 150 },
  { id: 'greed', name: '強欲', icon: '金', desc: '獲得ゴールド +10%', max: 5, cost: 130 },
  { id: 'luck', name: '幸運', icon: '運', desc: '会心率 +2%', max: 3, cost: 200 },
  { id: 'reroll', name: '再抽選', icon: '巡', desc: 'リロール回数 +1', max: 5, cost: 160 },
  { id: 'banish', name: '封印', icon: '封', desc: '除外回数 +1', max: 3, cost: 200 },
  { id: 'revive', name: '再起', icon: '甦', desc: '復活 +1(1ランに1回)', max: 1, cost: 1500 },
  { id: 'choice', name: '天啓', icon: '啓', desc: 'レベルアップの選択肢 +1', max: 1, cost: 2500 },
];

export const ACHIEVEMENTS = [
  { id: 'kill1k', name: '千の屍', desc: '累計1000体を倒す', unlock: 'mage', unlockText: '魔導士リセ 解放', check: (m, r) => m.totalKills >= 1000 },
  { id: 'surv8', name: '生き延びる者', desc: '1ランで8分生き残る', unlock: 'ranger', unlockText: '狩人カイ 解放', check: (m, r) => r && r.time >= 480 },
  { id: 'seal1', name: '封印破り', desc: '封印塔を1つ壊す', unlock: 'alchemist', unlockText: '錬金術師ノア 解放', check: (m) => m.totalSeals >= 1 },
  { id: 'lv20', name: '熟達', desc: '1ランでレベル20に到達', unlock: 'w_frost', unlockText: '武器「氷輪」解放', check: (m, r) => r && r.level >= 20 },
  { id: 'chest10', name: '宝探し', desc: '累計10個の宝箱を開ける', unlock: 'w_boomerang', unlockText: '武器「戻り刃」解放', check: (m) => m.totalChests >= 10 },
  { id: 'boss3', name: '覇者の証', desc: '累計3体のボスを倒す', unlock: 'w_meteor', unlockText: '武器「隕星」解放', check: (m) => m.totalBosses >= 3 },
  { id: 'evolve', name: '進化', desc: '武器を進化させる', unlock: null, unlockText: '報酬 500G', gold: 500, check: (m) => m.totalEvolves >= 1 },
  { id: 'combo500', name: '止まらない', desc: '500コンボを達成', unlock: null, unlockText: '報酬 400G', gold: 400, check: (m, r) => r && r.maxCombo >= 500 },
  { id: 'fever3', name: '熱狂', desc: '1ランでフィーバーを3回発動', unlock: null, unlockText: '報酬 400G', gold: 400, check: (m, r) => r && r.fevers >= 3 },
  { id: 'kill3k', name: '殲滅', desc: '1ランで3000体を倒す', unlock: null, unlockText: '報酬 800G', gold: 800, check: (m, r) => r && r.kills >= 3000 },
  { id: 'explore', name: '冒険者', desc: '1ランで5種類の地域を訪れる', unlock: null, unlockText: '報酬 500G', gold: 500, check: (m, r) => r && r.biomes >= 5 },
  { id: 'win', name: '虚ろを祓う者', desc: '虚ろの王を倒す', unlock: null, unlockText: '報酬 3000G', gold: 3000, check: (m) => m.totalWins >= 1 },
  { id: 'surv20', name: '果てなき旅路', desc: '1ランで20分生き残る', unlock: null, unlockText: '報酬 1500G', gold: 1500, check: (m, r) => r && r.time >= 1200 },
  { id: 'relic5', name: '秘宝蒐集', desc: '1ランで秘宝を5つ集める', unlock: null, unlockText: '報酬 1000G', gold: 1000, check: (m, r) => r && r.relics >= 5 },
];
