// ゲームデータ定義：街・住民・荷物・改善アイテム
'use strict';

const DATA = {};

// ---- 時間 ----
DATA.START_TIME = 9 * 60;      // 出発 9:00
DATA.SHIFT_END = 19 * 60;      // 定時 19:00
DATA.HARD_END = 21 * 60;       // 強制帰庫 21:00
DATA.MIN_PER_TILE = 0.8;       // 1マスあたりの運転時間（分）

DATA.WINDOWS = {
  none: { label: '指定なし', short: '指定なし', from: null, to: null },
  am: { label: '午前中', short: '午前', from: 9 * 60, to: 12 * 60 },
  w1214: { label: '12〜14時', short: '12-14', from: 12 * 60, to: 14 * 60 },
  w1416: { label: '14〜16時', short: '14-16', from: 14 * 60, to: 16 * 60 },
  w1618: { label: '16〜18時', short: '16-18', from: 16 * 60, to: 18 * 60 },
  w1820: { label: '18〜20時', short: '18-20', from: 18 * 60, to: 20 * 60 },
};

// ---- 地図 ----
// 36 x 26 マス。道路は2車線（2マス幅）。
DATA.MAP_W = 36;
DATA.MAP_H = 26;
DATA.ROADS_H = [5, 14, 23];        // 横道路の上側の行（y, y+1 が道路）
DATA.ROADS_V = [1, 12, 23, 33];    // 縦道路の左側の列（x, x+1 が道路）

// 建物。y は屋根の上端、h は屋根の高さ（その下1行が正面の壁）。
// row: 'n' 北（道路 y=5 に面する）, 1 中段（y=14）, 2 下段（y=23）
DATA.BUILDINGS = [
  { id: 'office', name: 'あおば運輸 あおば町営業所', kind: 'office', x: 4, w: 6, row: 'n', roof: 'gray', wall: 'glass' },
  { id: 'park', name: 'あおば中央公園', kind: 'park', x: 14, w: 8, row: 'n' },
  { id: 'nakamura', name: '中村さん宅', kind: 'house', x: 26, w: 3, row: 'n', roof: 'beige', wall: 'beige', addr: 'あおば町3-1-2' },
  { id: 'ogawa', name: '小川さん宅', kind: 'house', x: 29, w: 3, row: 'n', roof: 'red', wall: 'red', addr: 'あおば町3-1-5' },

  { id: 'tanaka', name: '田中さん宅', kind: 'house', x: 4, w: 3, row: 1, roof: 'red', wall: 'red', addr: 'あおば町1-2-3' },
  { id: 'sato_k', name: '佐藤さん宅', kind: 'house', x: 7, w: 2, row: 1, roof: 'gray', wall: 'gray', addr: 'あおば町1-2-5' },
  { id: 'sato_m', name: '佐藤さん宅', kind: 'house', x: 9, w: 2, row: 1, roof: 'beige', wall: 'beige', addr: 'あおば町1-2-6' },
  { id: 'komorebi', name: '喫茶こもれび', kind: 'shop', x: 15, w: 3, row: 1, roof: 'beige', wall: 'beige', awning: 'green', addr: 'あおば町2-2-1' },
  { id: 'maison', name: 'メゾンあおば', kind: 'apart', x: 18, w: 4, row: 1, roof: 'red', wall: 'red', tall: true, addr: 'あおば町2-2-4' },
  { id: 'suzuki', name: '鈴木さん宅', kind: 'house', x: 26, w: 3, row: 1, roof: 'gray', wall: 'beige', addr: 'あおば町3-2-2' },
  { id: 'ito', name: '伊藤さん宅', kind: 'house', x: 29, w: 3, row: 1, roof: 'red', wall: 'gray', addr: 'あおば町3-2-7' },

  { id: 'grand', name: 'グランあおば', kind: 'mansion', x: 4, w: 5, row: 2, roof: 'light', wall: 'glass', tall: true, addr: 'あおば町1-3-1' },
  { id: 'yoshida', name: '吉田さん宅', kind: 'house', x: 9, w: 2, row: 2, roof: 'red', wall: 'red', addr: 'あおば町1-3-8' },
  { id: 'hanamaru', name: '花屋はなまる', kind: 'shop', x: 15, w: 3, row: 2, roof: 'gray', wall: 'gray', awning: 'orange', addr: 'あおば町2-3-2' },
  { id: 'watanabe', name: '渡辺さん宅', kind: 'house', x: 18, w: 2, row: 2, roof: 'beige', wall: 'beige', addr: 'あおば町2-3-5' },
  { id: 'kato', name: '加藤さん宅', kind: 'house', x: 20, w: 2, row: 2, roof: 'gray', wall: 'red', addr: 'あおば町2-3-6' },
  { id: 'kobayashi', name: '小林さん宅', kind: 'house', x: 26, w: 4, row: 2, roof: 'red', wall: 'beige', addr: 'あおば町3-3-1', hiddenEntrance: true },
  { id: 'matsumoto', name: 'ベーカリー松本', kind: 'shop', x: 30, w: 2, row: 2, roof: 'beige', wall: 'red', awning: 'orange', addr: 'あおば町3-3-4' },
];

// ---- 住民 ----
// home: 在宅しやすい時間帯 [開始時, 終了時, 在宅率]。範囲外は awayRate。
// okihai: null=置き配不可, それ以外は指定場所
// face: 似顔絵 [肌, ズボン, シャツ[列,行], 髪[列,行] or null]
DATA.OKIHAI_PLACES = ['玄関前', '宅配ボックス', 'メーターボックス', '物置'];

DATA.RESIDENTS = [
  {
    id: 'tanaka', b: 'tanaka', name: '田中 ハナ', role: '一人暮らしのおばあちゃん',
    home: [[9, 10, 0.95], [11, 21, 0.95]], awayRate: 0.2, okihai: null, phone: true,
    face: [0, 2, [14, 0], [19, 8]],
    lines: [
      'あら、新しい配達の方？ ご苦労さまねえ。',
      'いつもありがとうね。これ、みかん。休憩のときに食べてちょうだい。',
      '孫から荷物かしら。あなたの顔を見ると安心するわ。',
    ],
    absentNote: '10時台は病院に通っていることが多いようだ。',
  },
  {
    id: 'sato_k', b: 'sato_k', name: '佐藤 健一', role: '会社員',
    home: [[0, 8.5, 0.9], [18.5, 24, 0.9]], awayRate: 0.05, okihai: '宅配ボックス', phone: true,
    face: [1, 7, [14, 5], [23, 4]],
    lines: [
      '遅くまでご苦労さまです。いつも昼間いなくてすみません。',
      'あ、夜に来てくれたんですね。助かります。',
      'いつも宅配ボックスに入れてくれてありがとうございます。',
    ],
  },
  {
    id: 'sato_m', b: 'sato_m', name: '佐藤 美咲', role: '在宅で翻訳の仕事',
    home: [[0, 24, 0.85]], awayRate: 0.85, okihai: '玄関前', phone: false,
    face: [0, 4, [10, 1], [20, 1]],
    lines: [
      'はい、佐藤です。…あ、隣の佐藤さんとよく間違えられるんですよ。',
      'お隣と同じ苗字だから、確認してもらえると助かります。',
      'いつも丁寧にありがとうございます。仕事の資料、待ってたんです。',
    ],
  },
  {
    id: 'komorebi', b: 'komorebi', name: '森 達也', role: '喫茶こもれびのマスター',
    home: [[10, 19, 0.98]], awayRate: 0.1, okihai: null, phone: true, business: true,
    face: [1, 0, [6, 4], [24, 4]],
    lines: [
      'いらっしゃい…じゃなくて配達か。コーヒー豆だね、ありがとう。',
      'お、今日もご苦労さん。一杯飲んでいく時間はないか。',
      '君が来ると、もうそんな時間かって思うよ。今度の休みに飲みにおいで。',
    ],
    absentNote: '開店は10時から。',
  },
  {
    id: 'yamamoto', b: 'maison', room: '201', name: '山本 蓮', role: '大学生',
    home: [[13, 24, 0.85]], awayRate: 0.15, okihai: '玄関前', phone: true,
    face: [2, 5, [10, 2], [24, 0]],
    lines: [
      '…ふぁ、寝てました。あ、ゲームだ！ ありがとうございます！',
      'あ、いつもの配達さん。またゲーム頼んじゃいました。',
      'テスト終わったんで、今日は起きてましたよ！',
    ],
    absentNote: '午前中は寝ているか大学に行っているらしい。',
  },
  {
    id: 'okada', b: 'maison', room: '102', name: '岡田 恵', role: '看護師（夜勤あり）',
    home: [[8, 12, 0.8], [17, 20, 0.6]], awayRate: 0.25, okihai: 'メーターボックス', phone: true,
    face: [0, 9, [16, 1], [19, 4]],
    lines: [
      'はい…夜勤明けで寝てて。メーターボックスでも大丈夫ですからね。',
      'いつもありがとう。メーターボックスの扉、少し固いでしょう。',
      'この前は再配達ありがとう。助かりました。',
    ],
  },
  {
    id: 'suzuki', b: 'suzuki', name: '鈴木 さくら', role: '二児の母',
    home: [[9, 13, 0.9], [15.5, 21, 0.9]], awayRate: 0.15, okihai: '玄関前', phone: true,
    face: [1, 3, [7, 0], [21, 1]],
    lines: [
      'はーい！ ちょっと待ってくださいね！（子どもの声が聞こえる）',
      '助かります、オムツ切らしてて。いつもありがとう！',
      '子どもたちが「トラックのお兄さん来た！」って窓から見てるんですよ。',
    ],
    absentNote: '14時前後は子どものお迎えで留守にしがち。',
  },
  {
    id: 'ito', b: 'ito', name: '伊藤 誠', role: '柴犬のコタロウと暮らす',
    home: [[0, 24, 0.7]], awayRate: 0.7, okihai: '物置', phone: false, dog: true,
    face: [2, 8, [8, 5], [23, 1]],
    lines: [
      'コラ、コタロウ！ 吠えるな！ …すみませんね、はい、ハンコ。',
      'コタロウがもう吠えなくなってきましたよ。顔を覚えたみたいだ。',
      'コタロウ、配達さんにしっぽ振ってる。すっかり友だちだな。',
    ],
  },
  {
    id: 'takahashi', b: 'grand', room: '503', name: '高橋 ゆい', role: 'IT企業でリモートワーク',
    home: [[0, 24, 0.9]], awayRate: 0.9, okihai: '宅配ボックス', phone: true, meeting: true,
    face: [0, 1, [14, 3], [19, 0]],
    lines: [
      '（インターホン越しに）はい…すみません、会議中なので宅配ボックスにお願いできますか。',
      'ありがとうございます、今日は会議が早く終わったので。',
      'いつもの方ですね。オートロック、わかりにくくてすみません。',
    ],
  },
  {
    id: 'ishii', b: 'grand', room: '201', name: '石井 大輔', role: '単身赴任中',
    home: [[0, 8, 0.9], [19, 24, 0.9]], awayRate: 0.05, okihai: '宅配ボックス', phone: true,
    face: [1, 6, [15, 6], [25, 4]],
    lines: [
      'あ、どうも。単身赴任で昼はいないんですよ。',
      '夜に受け取れて助かりました。家族からの荷物なんです。',
      'あ、いつもの方。妻が送ってくれた漬物です、よかったら少し。',
    ],
  },
  {
    id: 'yoshida', b: 'yoshida', name: '吉田 茂', role: '老夫婦で暮らす元大工',
    home: [[0, 24, 0.9]], awayRate: 0.9, okihai: null, phone: true,
    face: [1, 2, [10, 5], [21, 8]],
    lines: [
      'おう、ご苦労さん。重いだろう、玄関の中に置いてくれ。',
      'あんた、荷物の持ち方がうまくなったな。腰は大事にしろよ。',
      '台車の車輪、油を差してやろうか。…冗談だ、がんばれよ。',
    ],
  },
  {
    id: 'hanamaru', b: 'hanamaru', name: '花屋はなまる（店長 西村）', role: '花屋',
    home: [[9, 18, 0.98]], awayRate: 0.05, okihai: null, phone: true, business: true,
    face: [0, 3, [6, 6], [20, 4]],
    lines: [
      'ありがとうございます！ 鉢、割れてないかな…よし、大丈夫。',
      'いつも丁寧に運んでくれるから安心してるの。',
      '店先の花、少し持っていきなさいな。営業所に飾ってちょうだい。',
    ],
    absentNote: '営業は9時〜18時。',
  },
  {
    id: 'watanabe', b: 'watanabe', name: '渡辺 隆', role: '工場で夜勤',
    home: [[0, 24, 0.75]], awayRate: 0.75, okihai: '玄関前', phone: false, sleeper: true,
    face: [2, 7, [14, 7], [23, 0]],
    lines: [
      '…はい（眠そうだ）。あ、どうも。',
      '昼間は寝てるけど、呼び鈴は鳴らしていいからね。',
      '最近は昼過ぎに起きるようにしてるんだ。また頼むよ。',
    ],
  },
  {
    id: 'kato', b: 'kato', name: '加藤 翔太', role: 'フリーランスのデザイナー',
    home: [[11, 24, 0.8]], awayRate: 0.3, okihai: '玄関前', phone: true,
    face: [0, 0, [16, 6], [25, 0]],
    lines: [
      'お疲れさまです！ 新しいタブレットだ、待ってました。',
      'あ、こんにちは。今日もいい天気ですね。',
      'この前描いた町の地図、営業所に貼ってもらえたら嬉しいな。',
    ],
  },
  {
    id: 'kobayashi', b: 'kobayashi', name: '小林 正夫', role: '庭いじりが趣味',
    home: [[0, 24, 0.8]], awayRate: 0.8, okihai: '物置', phone: true,
    face: [1, 8, [8, 6], [19, 9]],
    lines: [
      '裏の勝手口にまわってくれたんだね。表の門は開かないんだよ。',
      'ちゃんと勝手口から来てくれるね。もう覚えたか。',
      'うちのトマトが採れたんだ。持って帰りな。',
    ],
  },
  {
    id: 'matsumoto', b: 'matsumoto', name: '松本 亜紀', role: 'ベーカリーの店主',
    home: [[7, 17, 0.98]], awayRate: 0.05, okihai: null, phone: true, business: true,
    face: [0, 1, [14, 4], [20, 0]],
    lines: [
      '小麦粉の配達、ありがとう！ これで明日も焼けるわ。',
      'ちょうど焼きたてなの。メロンパン、ひとつどうぞ。',
      'あなたの配達ルート、うちのパンの焼き上がりに合わせてくれてるでしょ？',
    ],
    absentNote: '17時で閉店する。',
  },
  {
    id: 'nakamura', b: 'nakamura', name: '中村 陽子', role: '書道教室の先生',
    home: [[9, 15, 0.85], [17, 21, 0.85]], awayRate: 0.2, okihai: null, phone: true,
    face: [0, 5, [10, 5], [21, 4]],
    lines: [
      'まあ、ご丁寧に。墨と半紙ね。',
      '15時からは教室で手が離せないことが多いのよ。',
      'あなたの字、伝票のサインが前よりきれいになったわね。',
    ],
    absentNote: '15〜17時は教室で出られないことが多い。',
  },
  {
    id: 'ogawa', b: 'ogawa', name: '小川 翼', role: '高校生と母の二人暮らし',
    home: [[16, 22, 0.9]], awayRate: 0.2, okihai: '玄関前', phone: true,
    face: [2, 4, [6, 0], [26, 1]],
    lines: [
      'あ、母宛てですか？ 僕が受け取ります。',
      'ネットで買った参考書です。ありがとうございます。',
      '将来、配達のバイトしてみようかな。大変そうだけど。',
    ],
  },
];

// ---- 荷物の中身テンプレート ----
// size: 60/80/100/120/140, weight: 1軽 2普通 3重, flags: fragile, cool, heavy, upright
DATA.ITEMS = [
  { name: '書籍', size: 60, weight: 2, flags: [] },
  { name: '衣類', size: 80, weight: 1, flags: [] },
  { name: '日用品（まとめ買い）', size: 100, weight: 2, flags: [] },
  { name: 'ゲームソフト', size: 60, weight: 1, flags: [] },
  { name: 'お米 10kg', size: 100, weight: 3, flags: ['heavy'] },
  { name: '飲料水 2L×6本', size: 100, weight: 3, flags: ['heavy'] },
  { name: 'ワイン 2本', size: 80, weight: 2, flags: ['fragile', 'upright'] },
  { name: '食器セット', size: 80, weight: 2, flags: ['fragile'] },
  { name: '冷凍食品', size: 80, weight: 2, flags: ['cool'] },
  { name: '生鮮セット（産地直送）', size: 80, weight: 2, flags: ['cool'] },
  { name: '鉢植え', size: 100, weight: 2, flags: ['fragile', 'upright'] },
  { name: 'デスクチェア', size: 140, weight: 3, flags: ['heavy'] },
  { name: '電子レンジ', size: 120, weight: 3, flags: ['fragile', 'heavy'] },
  { name: 'タブレット', size: 60, weight: 1, flags: ['fragile'] },
  { name: 'コーヒー豆', size: 60, weight: 1, flags: [] },
  { name: '小麦粉 25kg', size: 120, weight: 3, flags: ['heavy'] },
  { name: 'オムツ（箱）', size: 120, weight: 1, flags: [] },
  { name: '墨と半紙', size: 60, weight: 1, flags: [] },
  { name: '参考書', size: 60, weight: 2, flags: [] },
  { name: 'ふるさとの野菜', size: 100, weight: 2, flags: ['cool'] },
  { name: '工具セット', size: 80, weight: 3, flags: ['heavy'] },
  { name: 'ドッグフード', size: 100, weight: 3, flags: ['heavy'] },
];

// 住民ごとの「頼みがちな」もの（常連らしさ）
DATA.FAVORITES = {
  tanaka: ['ふるさとの野菜', '衣類', '日用品（まとめ買い）'],
  komorebi: ['コーヒー豆', '食器セット'],
  yamamoto: ['ゲームソフト', 'デスクチェア'],
  suzuki: ['オムツ（箱）', '飲料水 2L×6本'],
  ito: ['ドッグフード'],
  hanamaru: ['鉢植え'],
  kato: ['タブレット'],
  kobayashi: ['工具セット'],
  matsumoto: ['小麦粉 25kg'],
  nakamura: ['墨と半紙'],
  ogawa: ['参考書'],
  takahashi: ['生鮮セット（産地直送）', '電子レンジ'],
  yoshida: ['お米 10kg', 'ワイン 2本'],
};

DATA.SENDERS = ['あおば通販', 'ミドリ書店オンライン', 'ふるさと便', 'スマイルマート', 'ホシノ家電', '実家より', 'ハルカゼ食品', 'まるいち商事'];

DATA.FLAG_LABEL = {
  fragile: { label: 'ワレモノ', cls: 'flag-fragile', tip: '上に荷物を載せないこと' },
  upright: { label: '天地無用', cls: 'flag-upright', tip: '上に荷物を載せないこと' },
  heavy: { label: '重量物', cls: 'flag-heavy', tip: '下段に積むこと' },
  cool: { label: 'クール', cls: 'flag-cool', tip: '保冷ボックスに入れること' },
};

// ---- 改善アイテム ----
DATA.UPGRADES = [
  { id: 'cart', name: '折りたたみ台車', price: 6000, desc: '大きい荷物（120サイズ以上）や同じ配達先への複数個の運搬が速くなる。', effect: '運搬 −2分（大型）' },
  { id: 'shelf', name: '車内の棚', price: 9000, desc: '荷台の横に棚を取り付け、80サイズ以下の荷物を4個まで置ける。どこからでもすぐ取り出せる。', effect: '棚スロット +4' },
  { id: 'gloves', name: '滑り止め手袋と腰サポーター', price: 3000, desc: '荷物の積み直しが手早くなる。', effect: '積み直し −0.5分/個' },
  { id: 'cooler', name: '大きな保冷ボックス', price: 5000, desc: '保冷ボックスの容量が2→4個に増える。', effect: '保冷 +2' },
  { id: 'mapapp', name: '地図アプリ「まちナビ」', price: 8000, desc: '渋滞予測を地図に表示し、到着予想に反映。建物の入口メモも見られる。', effect: '渋滞表示・入口メモ' },
  { id: 'notify', name: '在宅お知らせサービス', price: 7000, desc: '一部の受取人の在宅予定が荷物一覧に表示される。', effect: '在宅予定の表示' },
];

// ---- レベル ----
DATA.LEVELS = [0, 120, 300, 550, 900, 1350, 1900, 2600];
DATA.parcelsForLevel = (lv) => Math.min(9 + lv, 16);
