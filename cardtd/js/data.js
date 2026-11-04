/* カードTD — ゲームデータ(数値はすべて叩き台。企画書の値に合わせてある) */
window.CTD = window.CTD || {};

(function (CTD) {
  'use strict';

  // ---- 試合ルール ----
  CTD.RULES = {
    matchTime: 180,          // 3分
    startMana: 5,
    maxMana: 10,
    // [開始秒, 1マナあたりの秒数]
    regen: [[0, 6], [60, 5], [120, 4], [150, 3]],
    cooldownPerCost: 3,      // クールダウン = コスト × 3秒
    killBonusDiv: 3,         // 撃破ボーナス = 倒した敵のコスト / 3(切り捨て)
    deckSize: 12,
    maxCopies: 3,
    handSize: 5,
    castleHp: 3000,
    castleArrow: { dmg: 16, interval: 1.25, range: 210 },
    laneLength: 1000,        // 城の正面同士の距離(ワールド座標)
    center: 500,
    playerZone: [40, 500],   // 自陣(中央線から自分側の半分)
    enemyZone: [500, 960],
  };

  CTD.regenInterval = function (t) {
    let iv = CTD.RULES.regen[0][1];
    for (const [start, sec] of CTD.RULES.regen) if (t >= start) iv = sec;
    return iv;
  };

  // ---- カード(18枚) ----
  // 絵はすべて企画書の素材パック(assets/ に変換済み)。
  // hp / atk / int(攻撃間隔 秒) / range(射程) / speed(移動 単位/秒)。道の長さは 1000
  const C = [
    // id, 名前, 素材, 役割, コスト, 特徴, ステータス
    ['sword_knight', '剣の騎士', '2D Fantasy Knight', '壁役', 3, '安くて硬い基本カード',
      { hp: 480, atk: 28, int: 1.1, range: 30, speed: 40 }],
    ['dual_dagger', '双短剣の女戦士', '2D Fantasy Woman Warrior', '一点突破', 3, '足が速く、遠距離役を優先して狙う',
      { hp: 270, atk: 24, int: 0.55, range: 28, speed: 74, assassin: true }],
    ['bow_woman', '弓の女戦士', '2D Fantasy Woman Warrior', '遠距離', 3, '後ろから撃つ。飛行に強い',
      { hp: 180, atk: 34, int: 1.25, range: 250, speed: 44, ranged: 'arrow', hitsAir: true, vsAir: 1.8 }],
    ['orc_warrior', 'オーク戦士', 'Free 2D Orcs', '数で押す', 3, '2体同時に出る',
      { hp: 230, atk: 26, int: 1.0, range: 30, speed: 50, count: 2 }],
    ['lance_knight', '槍の騎士', '2D Fantasy Knight', '対大型', 4, '大型の敵に追加ダメージ',
      { hp: 440, atk: 34, int: 1.1, range: 48, speed: 44, vsLarge: 3.0 }],
    ['axe_knight', '斧の騎士', '2D Fantasy Knight', '高火力', 4, '攻撃は強いが足が遅い',
      { hp: 500, atk: 86, int: 1.6, range: 32, speed: 32 }],
    ['shield_woman', '剣と盾の女戦士', '2D Fantasy Woman Warrior', '盾役', 4, '遠距離攻撃を軽減',
      { hp: 640, atk: 24, int: 1.1, range: 30, speed: 38, rangedResist: 0.35 }],
    ['orc_thrower', 'オーク投石兵', 'Free 2D Orcs', '遠距離', 4, '岩を投げる。一撃が重く、飛行にも当たる',
      { hp: 260, atk: 72, int: 2.0, range: 230, speed: 40, ranged: 'rock', hitsAir: true }],
    ['ice_fairy', '氷の妖精', '2D Fantasy Fairy', '飛行・足止め', 4, '範囲内の敵を遅くする',
      { hp: 210, atk: 18, int: 1.6, range: 200, speed: 46, flying: true, ranged: 'frost', hitsAir: true, splash: 90, slow: { mul: 0.45, time: 2.6 } }],
    ['leaf_fairy', '森の妖精', '2D Fantasy Fairy', '飛行・回復', 4, '近くの味方を回復',
      { hp: 220, atk: 12, int: 1.2, range: 160, speed: 46, flying: true, ranged: 'leaf', hitsAir: true, heal: { amount: 34, interval: 1.4, radius: 180 } }],
    ['fire_fairy', '炎の妖精', '2D Fantasy Fairy', '飛行・範囲攻撃', 5, '群れに強い',
      { hp: 240, atk: 46, int: 1.8, range: 210, speed: 44, flying: true, ranged: 'fire', hitsAir: true, splash: 80 }],
    ['orc_captain', 'オーク隊長', 'Free 2D Orcs', '強化役', 5, '近くの味方の攻撃力を上げる',
      { hp: 660, atk: 40, int: 1.0, range: 32, speed: 42, aura: { kind: 'might', radius: 160, value: 0.35 } }],
    ['lance_hk', '重装槍騎士', 'Free 2D Knight Sprite Sheets', '突進', 5, '最初の一撃で敵を押し返す',
      { hp: 700, atk: 52, int: 1.1, range: 46, speed: 46, charge: { speed: 120, push: 90, stun: 0.6 } }],
    ['troll', 'トロール', '2D Fantasy Trolls', '大型', 6, '城へのダメージが大きい',
      { hp: 1250, atk: 62, int: 1.5, range: 40, speed: 30, large: true, castleMul: 3 }],
    ['axe_hk', '重装斧騎士', 'Free 2D Knight Sprite Sheets', '超重量の壁', 6, 'とても硬い。遠距離攻撃を軽減',
      { hp: 1700, atk: 44, int: 1.5, range: 36, speed: 24, large: true, rangedResist: 0.5 }],
    ['club_troll', '棍棒トロール', '2D Fantasy Trolls', '大型・範囲', 7, '周りの敵をまとめて叩く',
      { hp: 1450, atk: 64, int: 1.7, range: 46, speed: 28, large: true, splash: 85 }],
    ['troll_chief', 'トロールの長', '2D Fantasy Trolls', '大型・最重量', 8, '最も硬い大型',
      { hp: 2600, atk: 74, int: 1.6, range: 46, speed: 26, large: true, castleMul: 1.5 }],
    ['gold_hk', '黄金の重装騎士', 'Free 2D Knight Sprite Sheets', '切り札', 8, '最強クラス。枠が長く止まる',
      { hp: 1900, atk: 120, int: 1.3, range: 42, speed: 34, large: true, splash: 55, rangedResist: 0.6 }],
  ];

  CTD.CARDS = {};
  CTD.CARD_ORDER = [];
  for (const [id, name, pack, role, cost, desc, st] of C) {
    const rarity = cost <= 3 ? 'common' : cost <= 5 ? 'rare' : 'epic';
    CTD.CARDS[id] = Object.assign({ id, name, pack, role, cost, desc, rarity, count: 1 }, st);
    CTD.CARD_ORDER.push(id);
  }

  CTD.RARITY = {
    common: { name: 'コモン', color: '#9fb4c8', rate: 0.70 },
    rare: { name: 'レア', color: '#4fa8ff', rate: 0.25 },
    epic: { name: 'エピック', color: '#c86bff', rate: 0.05 },
  };

  // ---- 収集 ----
  CTD.ECONOMY = {
    currency: '魔晶石',
    startGems: 300,
    packCost: 100,
    packSize: 3,
    firstClear: 100,
    perNewStar: 30,
    replayWin: 20,
  };

  // スターター12枚(デッキ1つ分)
  CTD.STARTER = [
    'sword_knight', 'sword_knight',
    'orc_warrior', 'orc_warrior',
    'bow_woman', 'bow_woman',
    'dual_dagger', 'dual_dagger',
    'lance_knight',
    'axe_knight',
    'shield_woman',
    'orc_thrower',
  ];

  // ---- ステージ(3ワールド × 5) ----
  // skill: CPUの賢さ 0〜1。enemyHp: 相手の城のHP倍率
  const D = (...g) => g.flatMap(([id, n]) => Array(n).fill(id));
  CTD.WORLDS = [
    { id: 1, name: '草原', bg: 'meadow', theme: '基本操作を覚える' },
    { id: 2, name: '森', bg: 'forest', theme: '飛行や群れなど、相性で崩しにくる相手' },
    { id: 3, name: 'エルフの国', bg: 'elven', theme: '大型・切り札を使う強いCPU' },
  ];

  CTD.STAGES = [
    { id: '1-1', world: 1, name: 'はじめての出撃', skill: 0.0, enemyHp: 0.5, maxUnits: 1, tutorial: 1,
      deck: D(['orc_warrior', 4], ['sword_knight', 4], ['bow_woman', 4]) },
    { id: '1-2', world: 1, name: 'マナとクールダウン', skill: 0.08, enemyHp: 0.6, maxUnits: 2, tutorial: 2,
      deck: D(['orc_warrior', 4], ['sword_knight', 3], ['bow_woman', 3], ['dual_dagger', 2]) },
    { id: '1-3', world: 1, name: '相性を知る', skill: 0.14, enemyHp: 0.7, maxUnits: 3, tutorial: 3,
      deck: D(['orc_warrior', 4], ['leaf_fairy', 2], ['ice_fairy', 2], ['sword_knight', 3], ['troll', 1]) },
    { id: '1-4', world: 1, name: 'オークの斥候', skill: 0.28, enemyHp: 0.85, maxUnits: 4,
      deck: D(['orc_warrior', 4], ['orc_thrower', 4], ['sword_knight', 2], ['bow_woman', 2]) },
    { id: '1-5', world: 1, name: 'オーク隊長の砦', skill: 0.38, enemyHp: 1.0, boss: true,
      deck: D(['orc_captain', 2], ['orc_warrior', 4], ['orc_thrower', 3], ['axe_knight', 1], ['sword_knight', 2]) },

    { id: '2-1', world: 2, name: '押し寄せる群れ', skill: 0.42, enemyHp: 1.0, hint: '群れが多い。範囲攻撃が効く',
      deck: D(['orc_warrior', 4], ['dual_dagger', 3], ['sword_knight', 3], ['bow_woman', 2]) },
    { id: '2-2', world: 2, name: '妖精の羽音', skill: 0.48, enemyHp: 1.0, hint: '飛行が多い。弓と投石で落とせる',
      deck: D(['fire_fairy', 2], ['ice_fairy', 3], ['leaf_fairy', 3], ['sword_knight', 2], ['shield_woman', 2]) },
    { id: '2-3', world: 2, name: '影の狩人', skill: 0.58, enemyHp: 1.15, hint: '双短剣が弓兵を狙う。壁で守ろう',
      deck: D(['dual_dagger', 4], ['bow_woman', 3], ['shield_woman', 3], ['leaf_fairy', 2]) },
    { id: '2-4', world: 2, name: '凍える小径', skill: 0.6, enemyHp: 1.05, hint: '足止めと回復で粘る相手',
      deck: D(['ice_fairy', 3], ['leaf_fairy', 3], ['shield_woman', 3], ['axe_hk', 1], ['bow_woman', 2]) },
    { id: '2-5', world: 2, name: '森の主', skill: 0.66, enemyHp: 1.1, boss: true, hint: 'トロールは硬い。槍の騎士で崩す',
      deck: D(['troll', 2], ['leaf_fairy', 2], ['ice_fairy', 2], ['orc_captain', 2], ['bow_woman', 2], ['orc_thrower', 2]) },

    { id: '3-1', world: 3, name: '白銀の突撃', skill: 0.7, enemyHp: 1.1, hint: '重装槍騎士が前線を押し返す',
      deck: D(['lance_hk', 3], ['lance_knight', 3], ['bow_woman', 3], ['fire_fairy', 2], ['shield_woman', 1]) },
    { id: '3-2', world: 3, name: 'トロールの橋', skill: 0.75, enemyHp: 1.15, hint: '大型が城を叩く。対大型を用意',
      deck: D(['troll', 2], ['club_troll', 2], ['orc_warrior', 4], ['orc_thrower', 2], ['orc_captain', 2]) },
    { id: '3-3', world: 3, name: '妖精の塔', skill: 0.84, enemyHp: 1.35, hint: '範囲攻撃が多い。群れは不利',
      deck: D(['fire_fairy', 3], ['ice_fairy', 3], ['leaf_fairy', 2], ['shield_woman', 3], ['lance_knight', 1]) },
    { id: '3-4', world: 3, name: '鋼の行軍', skill: 0.86, enemyHp: 1.25, hint: '重装騎士は遠距離に強い',
      deck: D(['gold_hk', 2], ['axe_hk', 2], ['axe_knight', 2], ['lance_knight', 2], ['sword_knight', 2], ['bow_woman', 2]) },
    { id: '3-5', world: 3, name: 'エルフの王城', skill: 0.95, enemyHp: 1.35, boss: true, hint: '全力で来る。デッキの弱点をなくそう',
      deck: D(['troll_chief', 1], ['gold_hk', 1], ['lance_hk', 1], ['club_troll', 1], ['fire_fairy', 2], ['ice_fairy', 1], ['leaf_fairy', 1], ['bow_woman', 2], ['shield_woman', 1], ['dual_dagger', 1]) },
  ];

  // チュートリアル(1-1〜1-3)。at = 試合経過秒、cond = 条件
  CTD.TUTORIAL = {
    1: [
      { at: 0.2, text: '手札のカードを、青く光る自陣までドラッグして兵士を出そう。' },
      { at: 0.2, cond: 'firstPlay', text: '兵士は自動で前進して戦う。相手の城を壊せば勝ち!' },
      { at: 22, text: 'カードはタップして選び、場所をタップしても出せる。' },
    ],
    2: [
      { at: 0.2, text: '上のゲージがマナ。時間で貯まり、カード左上の数字ぶん使う。' },
      { at: 0.2, cond: 'firstPlay', text: '出した枠はクールダウン中。重いカードほど長く止まる。' },
      { at: 60, text: '1分ごとにマナの回復が速くなる。終盤は激しくなるぞ。' },
    ],
    3: [
      { at: 0.2, text: '飛んでいる妖精は地上の剣では斬れない。弓や投石で落とそう。' },
      { at: 0.2, cond: 'enemyLarge', text: '大型が来た!槍の騎士は大型に大ダメージ。' },
      { at: 40, text: '敵を倒すとマナが少し増える(コストの1/3)。' },
    ],
  };
})(window.CTD);
