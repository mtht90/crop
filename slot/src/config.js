// =====================================================================
//  SLOT — 全チューニング項目
//  演出・確率・素材パス・物語 (台詞/演出の振り分け) はここだけ触れば磨き込めるようにしてある。
//  URL に #debug を付けるか G キーで lil-gui パネルが開き、ライブ調整できる。
// =====================================================================

export const CONFIG = {
  // ---------------------------------------------------------------
  // 素材パス (すべて外部素材。出典は CREDITS.md)
  // ---------------------------------------------------------------
  assets: {
    hdri: 'assets/hdri/neon_photostudio_2k.hdr.b64.txt',
    textures: {
      // ambientCG の PBR セット。maps に列挙したファイル (<名前>.jpg) だけ読む
      brushedMetal: { dir: 'assets/textures/Metal009/', maps: ['Color', 'NormalGL', 'Roughness', 'Metalness'] },
      scratchedMetal: { dir: 'assets/textures/Metal032/', maps: ['Color', 'NormalGL', 'Roughness', 'Metalness'] },
      carpet: { dir: 'assets/textures/Carpet016/', maps: ['Color', 'NormalGL', 'Roughness'] },
      leather: { dir: 'assets/textures/Leather037/', maps: ['NormalGL', 'Roughness'] },
    },
    models: {
      coin: 'assets/models/platformer/coin-gold.gltf.json',
      hall: [ // 背景のアーケードホールに並べる筐体
        'assets/models/arcade/gambling-machine.gltf.json',
        'assets/models/arcade/arcade-machine.gltf.json',
        'assets/models/arcade/claw-machine.gltf.json',
        'assets/models/arcade/pinball.gltf.json',
        'assets/models/arcade/dance-machine.gltf.json',
        'assets/models/arcade/vending-machine.gltf.json',
        'assets/models/arcade/prize-wheel.gltf.json',
      ],
      // 液晶内の 3D 舞台 (シルエット表示)
      story: {
        mech: 'assets/models/story/Mech_Frog.gltf.json',
        enemy: 'assets/models/story/Enemy_Large.gltf.json',
        flyer: 'assets/models/story/Enemy_Flying.gltf.json',
        city: [
          'assets/models/city/building-skyscraper-a.gltf.json', 'assets/models/city/building-skyscraper-b.gltf.json',
          'assets/models/city/building-skyscraper-c.gltf.json', 'assets/models/city/building-skyscraper-d.gltf.json',
          'assets/models/city/building-skyscraper-e.gltf.json', 'assets/models/city/low-detail-building-a.gltf.json',
          'assets/models/city/low-detail-building-c.gltf.json', 'assets/models/city/low-detail-building-e.gltf.json',
          'assets/models/city/low-detail-building-g.gltf.json', 'assets/models/city/low-detail-building-wide-a.gltf.json',
        ],
      },
    },
    // 登場人物の立ち絵 (Justin Nichols / CC-BY-SA 3.0)
    cast: {
      commander: 'assets/images/cast/commander.png',
      vice: 'assets/images/cast/securityofficer.png',
      operator: 'assets/images/cast/husk.png',
      pilot: 'assets/images/cast/pilot.png',
      girl: 'assets/images/cast/psion.png',
    },
    // リール図柄スキン。'twemoji' (高解像度ベクター) / 'pixel' (Cougarmint ドット絵)
    symbolSkin: 'twemoji',
    symbolImages: {
      twemoji: {
        bell: 'assets/images/twemoji/bell.svg',
        suika: 'assets/images/twemoji/watermelon.svg',
        cherry: 'assets/images/twemoji/cherry.svg',
        replay: 'assets/images/twemoji/replay.svg',
        star: 'assets/images/twemoji/star.svg',
        fire: 'assets/images/twemoji/fire.svg',
        bolt: 'assets/images/twemoji/bolt.svg',
        gem: 'assets/images/twemoji/gem.svg',
        clover: 'assets/images/twemoji/clover.svg',
      },
      pixel: {
        red7: 'assets/images/cougarmint/Lucky7.png',
        blue7: 'assets/images/cougarmint/Lucky7_rainbow.png',
        bar: 'assets/images/cougarmint/Bar3.png',
        bell: 'assets/images/cougarmint/bell.png',
        suika: 'assets/images/cougarmint/melon.png',
        cherry: 'assets/images/cougarmint/cherries.png',
        replay: 'assets/images/cougarmint/clover.png',
      },
    },
    fonts: {
      display: { family: 'Bungee', url: 'assets/fonts/bungee-400.woff2', weight: 400 },
      ui: { family: 'Orbitron', url: 'assets/fonts/orbitron-900.woff2', weight: 900 },
      uiLight: { family: 'Orbitron', url: 'assets/fonts/orbitron-500.woff2', weight: 500 },
      seg: { family: 'DSEG7', url: 'assets/fonts/dseg7-700.woff2', weight: 700 },
    },
    // 日本語フォント (Google Fonts から配信。index.html の <link> で読み込む)
    jpFonts: {
      mincho: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif', // タイトルカード
      gothic: '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif',   // 台詞
    },
    sfx: {
      medal_in: 'assets/audio/sfx/medal_in.mp3',
      medal_out: 'assets/audio/sfx/medal_out.mp3',
      medal_pay: 'assets/audio/sfx/medal_pay.mp3',
      lever: 'assets/audio/sfx/lever.mp3',
      lever_click: 'assets/audio/sfx/lever_click.mp3',
      reel_stop: 'assets/audio/sfx/reel_stop.mp3',
      button: 'assets/audio/sfx/button.mp3',
      reel_spin: 'assets/audio/sfx/reel_spin.mp3',
      reach: 'assets/audio/sfx/reach.mp3',
      yokoku: 'assets/audio/sfx/yokoku.mp3',
      flash: 'assets/audio/sfx/flash.mp3',
      freeze: 'assets/audio/sfx/freeze.mp3',
      shatter: 'assets/audio/sfx/shatter.mp3',
      charge: 'assets/audio/sfx/charge.mp3',
      fanfare_reg: 'assets/audio/sfx/fanfare_reg.mp3',
      fanfare_big: 'assets/audio/sfx/fanfare_big.mp3',
      bonus_end: 'assets/audio/sfx/bonus_end.mp3',
      bell: 'assets/audio/sfx/bell.mp3',
      replay: 'assets/audio/sfx/replay.mp3',
      small_win: 'assets/audio/sfx/small_win.mp3',
      alarm: 'assets/audio/sfx/alarm.mp3',
      siren: 'assets/audio/sfx/siren.mp3',
      tick: 'assets/audio/sfx/tick.mp3',
      glitch: 'assets/audio/sfx/glitch.mp3',
      title_hit: 'assets/audio/sfx/title_hit.mp3',
      explosion: 'assets/audio/sfx/explosion.mp3',
      lose: 'assets/audio/sfx/lose.mp3',
      cutin: 'assets/audio/sfx/cutin.mp3',
      beam: 'assets/audio/sfx/beam.mp3',
      launch: 'assets/audio/sfx/launch.mp3',
      hangar: 'assets/audio/sfx/hangar.mp3',
      computer: 'assets/audio/sfx/computer.mp3',
      window: 'assets/audio/sfx/window.mp3',
    },
    bgm: {
      big: 'assets/audio/bgm/level3.mp3',
      reg: 'assets/audio/bgm/level1.mp3',
    },
  },

  // ---------------------------------------------------------------
  // 図柄・リール配列 (21コマ / 下から上へ index が増える = 上段が index+1)
  //   R=赤7 B=青7 A=BAR L=ベル S=スイカ C=チェリー P=リプレイ
  // ---------------------------------------------------------------
  symbols: {
    R: { name: 'red7', label: '赤7' },
    B: { name: 'blue7', label: '青7' },
    A: { name: 'bar', label: 'BAR' },
    L: { name: 'bell', label: 'ベル' },
    S: { name: 'suika', label: 'スイカ' },
    C: { name: 'cherry', label: 'チェリー' },
    P: { name: 'replay', label: 'リプレイ' },
  },
  reels: {
    strips: [
      'PLRCPLSAPLBCPLSRPLACL', // 左
      'LPRSLPABLPSRLPASLPBRP', // 中
      'LSPRLAPSLBPRLSPALRPBS', // 右
    ],
    maxSlip: 4,             // 引き込み最大コマ数 (実機準拠: 190ms 以内に 4 コマ)
    rpm: 80,                // 回転速度
    spinUpMs: 180,          // 加速時間 (実機はほぼ即座に定速)
    stopMs: 120,            // 停止までの減速時間
    bounce: 0.05,           // 停止時のオーバーシュート量 (コマ)。実機はわずかに“カクッ”
    bounceMs: 110,          // バウンド収束時間
    minGameMs: 4100,        // ウェイト (1G 最短時間 / 実機 4.1 秒)
    backlight: 1.0,         // バックライト標準輝度 (1=素材色そのまま)
  },

  // 有効ライン (行 index: 0=下段 1=中段 2=上段) 左→右
  lines: [
    [1, 1, 1], [2, 2, 2], [0, 0, 0], [2, 1, 0], [0, 1, 2],
  ],

  // ---------------------------------------------------------------
  // 役と配当
  // ---------------------------------------------------------------
  roles: {
    BIG: { combos: ['RRR', 'BBB', 'RRB', 'RBR', 'BRR', 'BBR', 'BRB', 'RBB'], pay: 0, bonus: 'BIG' }, // 異色7揃いも BIG
    REG: { combos: ['RRA', 'BBA'], pay: 0, bonus: 'REG' },
    SUIKA: { combos: ['SSS'], pay: 10 },
    BELL: { combos: ['LLL'], pay: 8 },
    REPLAY: { combos: ['PPP'], pay: 0, replay: true },
    CHERRY: { leftAny: 'C', pay: 2 }, // 左リール枠内チェリーで成立
    BONUS_BELL: { combos: ['LLL'], pay: 15 }, // ボーナス中の特別ベル
  },
  bet: 3,

  // ---------------------------------------------------------------
  // 内部抽選テーブル (分母表記)。設定 1-6
  //   キーは「成立フラグ」。'+' は重複当選 (小役 + ボーナス)
  // ---------------------------------------------------------------
  setting: 4,
  probability: {
    1: { BIG: 300, REG: 480, 'CHERRY+BIG': 1600, 'SUIKA+BIG': 2400, 'CHERRY+REG': 2400, REPLAY: 7.3, BELL: 7.6, SUIKA: 64, CHERRY: 36 },
    2: { BIG: 290, REG: 440, 'CHERRY+BIG': 1500, 'SUIKA+BIG': 2300, 'CHERRY+REG': 2200, REPLAY: 7.3, BELL: 7.5, SUIKA: 64, CHERRY: 36 },
    3: { BIG: 280, REG: 400, 'CHERRY+BIG': 1400, 'SUIKA+BIG': 2200, 'CHERRY+REG': 2000, REPLAY: 7.3, BELL: 7.4, SUIKA: 62, CHERRY: 35 },
    4: { BIG: 268, REG: 360, 'CHERRY+BIG': 1300, 'SUIKA+BIG': 2000, 'CHERRY+REG': 1800, REPLAY: 7.3, BELL: 7.2, SUIKA: 60, CHERRY: 35 },
    5: { BIG: 255, REG: 320, 'CHERRY+BIG': 1200, 'SUIKA+BIG': 1800, 'CHERRY+REG': 1600, REPLAY: 7.3, BELL: 7.1, SUIKA: 58, CHERRY: 34 },
    6: { BIG: 240, REG: 280, 'CHERRY+BIG': 1000, 'SUIKA+BIG': 1600, 'CHERRY+REG': 1400, REPLAY: 7.3, BELL: 7.0, SUIKA: 56, CHERRY: 33 },
  },
  // ボーナス中の抽選 (比率)
  bonusTable: { BONUS_BELL: 0.86, REPLAY: 0.09, NONE: 0.05 },
  bonus: {
    BIG: { maxPay: 300, maxGames: 60, bgm: 'big' },
    REG: { maxPay: 104, maxGames: 12, bgm: 'reg' },
  },

  // ---------------------------------------------------------------
  // 遊技設定
  // ---------------------------------------------------------------
  play: {
    startMedals: 500,
    lendAmount: 500,
    autoBet: true,           // 前回ベットを自動で掛ける
    assistAlignAfterNotice: true, // 告知後はボーナス図柄を自動で引き込む (目押しアシスト)
    persist: true,           // 持ちメダル・履歴を localStorage に保存
  },

  // ---------------------------------------------------------------
  // 演出 (予告・告知・フリーズ)
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // 物語演出 (液晶)
  //   1ゲーム = レバーON → 第1停止 → 第2停止 → 第3停止 の4拍で昇格していく
  // ---------------------------------------------------------------
  story: {
    // 登場人物 (立ち絵キーは assets.cast)
    cast: {
      commander: { name: '司令', full: 'クロガネ司令', color: '#e8c070' },
      vice: { name: '副司令', full: 'ハヤセ副司令', color: '#9fb8d0' },
      operator: { name: '管制官', full: '管制官 シオン', color: '#8fe0ff' },
      pilot: { name: 'パイロット', full: 'ミナト', color: '#ff9a7a' },
      girl: { name: '???', full: '???', color: '#ffffff' },
    },
    // 台詞。色 = 期待度 (blue < green < red < gold < rainbow)
    lines: {
      blue: [
        ['operator', '第三区画に微弱な反応。確認します'],
        ['vice', '警戒を怠るな'],
        ['operator', '観測データ、異常なし'],
        ['pilot', '待機中。いつでも出られます'],
      ],
      green: [
        ['operator', '未確認反応、市街地へ接近中!'],
        ['vice', 'この数値は…ありえん'],
        ['commander', '迎撃準備を'],
        ['pilot', '機体の調子は悪くない'],
      ],
      red: [
        ['operator', '反応増大! パターン赤です!'],
        ['commander', '全機、出撃せよ'],
        ['pilot', '私がやる!'],
        ['vice', '第七防衛線まで後退させるな!'],
      ],
      gold: [
        ['commander', '…勝てる'],
        ['pilot', 'これで終わりにする!'],
        ['commander', '作戦を最終段階へ移行する'],
      ],
      rainbow: [['girl', '…来るよ']],
    },
    // 結果に応じた台詞色の振り分け (重み)
    lineColor: {
      win: { blue: 4, green: 14, red: 40, gold: 32, rainbow: 10 },
      lose: { blue: 58, green: 30, red: 11.5, gold: 0.5, rainbow: 0 },
    },
    // シナリオの振り分け (フラグ別の重み)
    //   none     : 何もなし
    //   cutin    : 人物カットイン (停止毎に色が昇格しうる)
    //   group    : 群予告 (警告ウィンドウ乱舞) → カットイン
    //   caution  : CAUTION帯 → EMERGENCY帯 → タイトルカード → 結果
    //   battle   : SPリーチ「迎撃戦」(侵蝕体接近 → 兵器出撃 → ロックオン → 決着)
    //   final    : 最終決戦 (暗転 → 3,2,1 カウント → 決着)
    //   girl     : 謎の少女 (プレミア / 確定)
    //   freeze   : フリーズ (確定)
    //   zone     : 前兆ゾーン 2〜5G (警戒態勢ステージ) → 最終ゲームで battle / final
    scenarios: {
      NONE:   { none: 87, cutin: 9, group: 2.4, caution: 0.8, battle: 0.35, final: 0.04, zone: 0.4 },
      REPLAY: { none: 80, cutin: 14, group: 4, caution: 2 },
      BELL:   { none: 82, cutin: 13, group: 4, caution: 1 },
      CHERRY: { none: 35, cutin: 37, group: 15, caution: 8, battle: 5 },
      SUIKA:  { none: 30, cutin: 33, group: 20, caution: 10, battle: 7 },
      BONUS:  { cutin: 8, group: 6, caution: 16, battle: 22, final: 16, girl: 4, freeze: 8, zone: 20 },
    },
    zoneLength: [2, 5],    // 前兆ゾーンのゲーム数
    revival: 0.18,         // ボーナス当選時、一度「撤退」を見せてから逆転する確率
    stageChange: 0.04,     // 通常時のステージチェンジ率 (ボーナス持ち越し中は 0.3)
  },

  effects: {
    reachSlowFactor: 0.55,  // 7テンパイ時の第3リール回転速度係数 (演出)
    bloom: { strength: 0.42, radius: 0.4, threshold: 0.92 },
    shake: { decay: 2.2, maxOffset: 0.06, maxRoll: 0.025 },
    // navigator.vibrate パターン (ms)
    vibrate: {
      button: [8],
      lever: [14],
      stop: [12],
      yokokuWeak: [20],
      yokokuMid: [30, 40, 30],
      yokokuStrong: [60, 40, 60, 40, 120],
      cutin: [18, 30, 18],
      title: [90],
      win: [120, 40, 120, 40, 260],
      lose: [40],
      reach: [25, 25, 25, 25, 25],
      notice: [90, 50, 90, 50, 90, 50, 120, 40, 420],
      push: [20, 30, 20],
      pushHit: [70],
      freeze: [600, 120, 120, 80, 120, 80, 800],
      bonusStart: [160, 50, 160, 50, 160, 50, 160, 50, 260, 60, 900],
      payout: [6],
    },
    haptics: true,
  },

  // ---------------------------------------------------------------
  // カメラ・レンダリング
  // ---------------------------------------------------------------
  render: {
    exposure: 0.9,
    pixelRatioMax: 2,
    envIntensity: 0.45,
    camera: { fov: 34, pos: [0, 1.38, 3.05], target: [0, 1.18, 0], parallax: 0.12 },
    hall: true,      // 背景のアーケードホール (Kenney GLB)
    neighbors: true, // 島の隣台 (自台クローン)。#lite で両方オフ
    lcdFps: 60,      // 液晶 3D 舞台の描画レート
  },
  audio: { master: 0.85, sfx: 1.0, bgm: 0.45 },
};

// ラベル → 図柄キー
export const SYM = Object.fromEntries(Object.keys(CONFIG.symbols).map((k) => [k, k]));
