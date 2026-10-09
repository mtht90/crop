// =====================================================================
//  DOPAMINE 7 — 全チューニング項目
//  演出・確率・素材パスはここだけ触れば磨き込めるようにしてある。
//  ?debug を URL に付けるか G キーで lil-gui パネルが開き、ライブ調整できる。
// =====================================================================

export const CONFIG = {
  // ---------------------------------------------------------------
  // 素材パス (すべて外部素材。出典は CREDITS.md)
  // ---------------------------------------------------------------
  assets: {
    hdri: 'assets/hdri/neon_photostudio_2k.hdr',
    textures: {
      // ambientCG の PBR セット。maps に列挙したファイル (<名前>.jpg) だけ読む
      brushedMetal: { dir: 'assets/textures/Metal009/', maps: ['Color', 'NormalGL', 'Roughness', 'Metalness'] },
      scratchedMetal: { dir: 'assets/textures/Metal032/', maps: ['Color', 'NormalGL', 'Roughness', 'Metalness'] },
      carpet: { dir: 'assets/textures/Carpet016/', maps: ['Color', 'NormalGL', 'Roughness'] },
      leather: { dir: 'assets/textures/Leather037/', maps: ['NormalGL', 'Roughness'] },
    },
    models: {
      coin: 'assets/models/platformer/coin-gold.glb',
      hall: [ // 背景のアーケードホールに並べる筐体
        'assets/models/arcade/gambling-machine.glb',
        'assets/models/arcade/arcade-machine.glb',
        'assets/models/arcade/claw-machine.glb',
        'assets/models/arcade/pinball.glb',
        'assets/models/arcade/dance-machine.glb',
        'assets/models/arcade/vending-machine.glb',
        'assets/models/arcade/prize-wheel.glb',
      ],
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
    spinUpMs: 260,          // 加速時間
    stopMs: 120,            // 停止までの減速時間
    bounce: 0.18,           // 停止時のオーバーシュート量 (コマ)
    bounceMs: 230,          // バウンド収束時間
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
    BIG: { combos: ['RRR', 'BBB'], pay: 0, bonus: 'BIG' },
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
  effects: {
    // レバーON 予告の選択率 (フラグ毎、重み)
    yokoku: {
      NONE:   { none: 86, weak: 11, mid: 2.6, strong: 0.4 },
      REPLAY: { none: 78, weak: 16, mid: 5, strong: 1 },
      BELL:   { none: 80, weak: 15, mid: 4.5, strong: 0.5 },
      CHERRY: { none: 20, weak: 40, mid: 32, strong: 8 },
      SUIKA:  { none: 15, weak: 35, mid: 38, strong: 12 },
      BONUS:  { none: 30, weak: 18, mid: 24, strong: 28 }, // ボーナス成立ゲーム
    },
    // ボーナス成立時のフリーズ確率 (BIG / REG)
    freeze: { BIG: 1 / 10, REG: 1 / 40 },
    // ボーナス告知タイミング (重み)
    notice: { lever: 22, thirdStop: 58, nextLever: 20 },
    // 告知の当該ゲーム以外の“ガセ”連続演出は無し: 告知=100% 確定
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
      reach: [25, 25, 25, 25, 25],
      notice: [200, 60, 200],
      freeze: [600, 120, 120, 80, 120, 80, 800],
      bonusStart: [100, 50, 100, 50, 300],
      payout: [6],
    },
    haptics: true,
  },

  // ---------------------------------------------------------------
  // カメラ・レンダリング
  // ---------------------------------------------------------------
  render: {
    exposure: 0.8,
    pixelRatioMax: 2,
    envIntensity: 0.45,
    camera: { fov: 34, pos: [0, 1.38, 3.05], target: [0, 1.18, 0], parallax: 0.12 },
    hall: true,      // 背景のアーケードホール (Kenney GLB)
    neighbors: true, // 島の隣台 (自台クローン)。?lite で両方オフ
  },
  audio: { master: 0.85, sfx: 1.0, bgm: 0.45 },
};

// ラベル → 図柄キー
export const SYM = Object.fromEntries(Object.keys(CONFIG.symbols).map((k) => [k, k]));
