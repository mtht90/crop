// =====================================================================
//  DARKNIGHT (液晶 AT 機) の全チューニング項目
//   6.5 号機風: 通常 → (前兆) → CZ「DARK GATE」→ バトル → AT「DARKNIGHT RUSH」
//   AT 中は押し順ベルをナビ。レア役で上乗せ、上乗せ特化「LIMIT BREAK」、天井 800G
//   リール制御・お金・画面まわりはジャグラー型 (CONFIG) を土台にして、違うところだけ上書きする
// =====================================================================
import { CONFIG } from '../config.js';

const base = structuredClone(CONFIG);

const dk = (n) => `assets/audio/sfx/${n}.mp3`;

export const DCONFIG = {
  ...base,
  id: 'darknight',
  title: 'DARKNIGHT',
  store: 'slot.darknight.v1',
  // 素材 (出典は CREDITS.md)。ジャグラー型の素材に DARKNIGHT 専用のものを足す
  assets: {
    ...base.assets,
    uiImages: { ...base.assets.uiImages, push: 'assets/images/kenney-ui/button_red_round_gloss.png' },
    characters: 'assets/models/darknight', // Quaternius の騎士・モンスター (glTF)
    sfx: {
      ...base.assets.sfx,
      dk_slash: dk('dk_knifeSlice'), dk_slash2: dk('dk_knifeSlice2'), dk_draw: dk('dk_drawKnife1'),
      dk_chop: dk('dk_chop'), dk_metal: dk('dk_metalPot2'),
      dk_push: dk('dk_push_click_a'), dk_pop: dk('dk_push_switch_b'),
      v_fight: dk('dkv_fight'), v_ready: dk('dkv_ready'), v_win: dk('dkv_you_win'), v_lose: dk('dkv_you_lose'),
      v_final: dk('dkv_final_round'), v_prepare: dk('dkv_prepare_yourself'), v_flawless: dk('dkv_flawless_victory'),
      v_combo: dk('dkv_combo'), v_multi: dk('dkv_multi_kill'), v_winner: dk('dkv_winner'),
      v_battle: dk('dkv_battle_mode'), v_begin: dk('dkv_begin'), v_over: dk('dkv_game_over'),
    },
    bgm: {
      dk_normal: 'assets/audio/bgm/dk_normal.mp3', // 通常時
      dk_battle: 'assets/audio/bgm/dk_battle.mp3', // CZ・バトル
      dk_at: 'assets/audio/bgm/dk_at.mp3',         // AT
    },
  },
  // 筐体: リールの上に筐体幅いっぱいの 16:9 大型液晶。その分だけ背が高い
  dim: { top: 2.43, lcdY: 1.855, lcdW: 0.82, lcdH: 0.46, slotX: 0.17 }, // メダル投入口は PUSH ボタンに場所を譲る
  render: {
    ...base.render,
    neighbors: false,   // 島の隣台はジャグラー型の島だけ (DARKNIGHT は単独)
    hall: false,        // 背景のアーケード筐体も出さない (暗い空間に台だけを浮かべる)
    frame: { halfH: 0.94, ty: 1.84, halfHPortrait: 0.84, tyPortrait: 1.92 },
  },
  audio: { ...base.audio, normalBgm: 0.5 },
  // 図柄: R=DARK7 A=BAR(剣) L=ベル S=クリスタル(スイカ役) C=チェリー P=リプレイ
  symbols: {
    R: { name: 'red7', label: '7' },
    A: { name: 'bar', label: 'BAR' },
    L: { name: 'bell', label: 'ベル' },
    S: { name: 'gem', label: 'クリスタル' },
    C: { name: 'cherry', label: 'チェリー' },
    P: { name: 'replay', label: 'リプレイ' },
  },
  reels: {
    ...base.reels,
    strips: [
      'LPCRLPSLPALPCSLPRLPAS', // 左 (チェリーは左のみ)
      'PLSRPLAPLSPLRPLASPLAS', // 中
      'LPSRLPALPSLPRLPASLPAR', // 右
    ],
  },
  roles: {
    SEVEN: { combos: ['RRR'], pay: 0 },               // AT 開始ゲームの 7 揃い (疑似ボーナス)
    CHANCE: { combos: ['AAA'], pay: 1 },              // チャンス目 (BAR 揃い)
    SUIKA: { combos: ['SSS'], pay: 5 },               // クリスタル (スイカ役)
    BELL: { combos: ['LLL'], pay: 9 },                // 押し順ベル (正解したときだけ揃う)
    REPLAY: { combos: ['PPP'], pay: 0, replay: true },
    CHERRY: { leftAny: 'C', pay: 2 },
  },
  roleSets: {
    normal: ['SEVEN', 'CHANCE', 'SUIKA', 'BELL', 'REPLAY', 'CHERRY'],
    bonus: ['SEVEN', 'CHANCE', 'SUIKA', 'BELL', 'REPLAY', 'CHERRY'],
  },
  tenpaiRoles: [],
  // 押し順ベル: 6 通りの押し順 (左中右 / 左右中 / 中左右 / 中右左 / 右左中 / 右中左)
  naviOrders: ['LCR', 'LRC', 'CLR', 'CRL', 'RLC', 'RCL'],
  // 成立フラグ → 揃える役
  flagRole: { REPLAY: 'REPLAY', W_CHERRY: 'CHERRY', S_CHERRY: 'CHERRY', SUIKA: 'SUIKA', CHANCE: 'CHANCE', SEVEN: 'SEVEN' },
  // 小役の抽選 (分母)。設定差は AT 抽選側に持たせる
  smallProb: {
    REPLAY: 7.3,
    NAVI: 1.6,            // 押し順ベル合算 (6 通りに等分)
    W_CHERRY: 110,         // 弱チェリー
    S_CHERRY: 420,         // 強チェリー
    SUIKA: 85,
    CHANCE: 230,
  },
  settingOdds: base.settingOdds,

  // ---------------- AT ----------------
  at: {
    ceiling: 800,                               // 天井 (AT 間のゲーム数)
    // 通常時の内部モード (天井の手前で CZ が来やすいかを決める)。背景で示唆する
    modes: { A: 60, B: 25, C: 12, HEAVEN: 3 },
    // CZ の直撃抽選 (毎ゲーム、分母)。設定・モード別
    czDirect: {
      1: { A: 520, B: 380, C: 260, HEAVEN: 90 }, 2: { A: 500, B: 370, C: 250, HEAVEN: 88 },
      3: { A: 460, B: 340, C: 235, HEAVEN: 84 }, 4: { A: 410, B: 310, C: 210, HEAVEN: 78 },
      5: { A: 360, B: 280, C: 190, HEAVEN: 70 }, 6: { A: 310, B: 240, C: 165, HEAVEN: 60 },
    },
    // レア役での CZ 当選率 / AT 直撃率
    rareCz: { W_CHERRY: 0.06, SUIKA: 0.1, CHANCE: 0.3, S_CHERRY: 0.5 },
    rareAt: { S_CHERRY: 0.3, CHANCE: 0.03 },
    // CZ「DARK GATE」(10G) の成功率 (設定別)
    czGames: 10,
    czWin: { 1: 0.34, 2: 0.37, 3: 0.41, 4: 0.46, 5: 0.51, 6: 0.57 },
    zenchou: [3, 10],                           // 前兆の長さ (G)
    // AT「DARKNIGHT RUSH」
    atGames: 33,                                // 初期ゲーム数
    atFirstAdd: { 0: 50, 20: 30, 50: 15, 100: 5 }, // 初回の上乗せ (G: 重み)
    // 上乗せ (G: 重み) と当選率
    addRate: { W_CHERRY: 0.4, SUIKA: 0.5, CHANCE: 0.8, S_CHERRY: 1 },
    addTable: { 10: 45, 20: 30, 30: 15, 50: 8, 100: 2 },
    lbRate: { S_CHERRY: 1, CHANCE: 0.15, normal: 1 / 900 }, // 上乗せ特化 LIMIT BREAK の突入率
    lbGames: 5,
    lbAdd: { 10: 40, 20: 30, 30: 18, 50: 10, 100: 2 },
    cap: 2400,                                   // 有利区間の上限 (AT 中の純増枚数)
  },

  bonus: { BIG: { maxPay: 0, maxGames: 0, bgm: 'dk_at' }, REG: { maxPay: 0, maxGames: 0, bgm: 'dk_at' } },
};
