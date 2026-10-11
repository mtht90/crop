// ゲームデータ：住民・荷物・改善アイテム
// 街区の指定は lot: '列-行-番号'（列 1〜3 = 丁目, 行 D/C1/C2/B1/B2/A/S, 番号 0〜3）
export const TIME = {
  START: 9 * 60,
  SHIFT_END: 19 * 60,
  HARD_END: 21 * 60,
  SCALE: 15, // 実時間1秒 = ゲーム内15秒
};

export const WINDOWS = {
  none: { label: '指定なし', short: '指定なし', from: null, to: null },
  am: { label: '午前中', short: '午前', from: 9 * 60, to: 12 * 60 },
  w1214: { label: '12〜14時', short: '12-14', from: 12 * 60, to: 14 * 60 },
  w1416: { label: '14〜16時', short: '14-16', from: 14 * 60, to: 16 * 60 },
  w1618: { label: '16〜18時', short: '16-18', from: 16 * 60, to: 18 * 60 },
  w1820: { label: '18〜20時', short: '18-20', from: 18 * 60, to: 20 * 60 },
};

export const OKIHAI_PLACES = ['玄関前', '宅配ボックス', 'メーターボックス', '物置'];

// home: [開始時, 終了時, 在宅率]、範囲外は awayRate
export const RESIDENTS = [
  { id: 'tanaka', lot: '1-B1-1', name: '田中 ハナ', role: '一人暮らしのおばあちゃん', home: [[9, 10, 0.95], [11, 21, 0.95]], awayRate: 0.2, okihai: null, phone: true,
    lines: ['あら、新しい配達の方？ ご苦労さまねえ。', 'いつもありがとうね。これ、みかん。休憩のときに食べてちょうだい。', '孫から荷物かしら。あなたの顔を見ると安心するわ。'] },
  { id: 'sato_k', lot: '1-C1-2', name: '佐藤 健一', role: '会社員', home: [[0, 8.5, 0.9], [18.5, 24, 0.9]], awayRate: 0.05, okihai: '宅配ボックス', phone: true,
    lines: ['遅くまでご苦労さまです。いつも昼間いなくてすみません。', 'あ、夜に来てくれたんですね。助かります。', 'いつも宅配ボックスに入れてくれてありがとうございます。'] },
  { id: 'sato_m', lot: '1-C1-3', name: '佐藤 美咲', role: '在宅で翻訳の仕事', home: [[0, 24, 0.85]], awayRate: 0.85, okihai: '玄関前', phone: false,
    lines: ['はい、佐藤です。…あ、隣の佐藤さんとよく間違えられるんですよ。', 'お隣と同じ苗字だから、確認してもらえると助かります。', 'いつも丁寧にありがとうございます。'] },
  { id: 'komorebi', lot: '1-S-2', name: '森 達也', role: '喫茶こもれびのマスター', home: [[10, 19, 0.98]], awayRate: 0.1, okihai: null, phone: true, business: true,
    lines: ['いらっしゃい…じゃなくて配達か。コーヒー豆だね、ありがとう。', 'お、今日もご苦労さん。一杯飲んでいく時間はないか。', '君が来ると、もうそんな時間かって思うよ。'] },
  { id: 'yamamoto', lot: '2-B2-1', room: '201', name: '山本 蓮', role: '大学生', home: [[13, 24, 0.85]], awayRate: 0.15, okihai: '玄関前', phone: true,
    lines: ['…ふぁ、寝てました。あ、ゲームだ！ ありがとうございます！', 'あ、いつもの配達さん。またゲーム頼んじゃいました。', 'テスト終わったんで、今日は起きてましたよ！'] },
  { id: 'okada', lot: '2-B2-1', room: '102', name: '岡田 恵', role: '看護師（夜勤あり）', home: [[8, 12, 0.8], [17, 20, 0.6]], awayRate: 0.25, okihai: 'メーターボックス', phone: true,
    lines: ['はい…夜勤明けで寝てて。メーターボックスでも大丈夫ですからね。', 'いつもありがとう。メーターボックスの扉、少し固いでしょう。', 'この前は再配達ありがとう。助かりました。'] },
  { id: 'suzuki', lot: '3-B1-0', name: '鈴木 さくら', role: '二児の母', home: [[9, 13, 0.9], [15.5, 21, 0.9]], awayRate: 0.15, okihai: '玄関前', phone: true,
    lines: ['はーい！ ちょっと待ってくださいね！（子どもの声が聞こえる）', '助かります、オムツ切らしてて。いつもありがとう！', '子どもたちが「トラックのお兄さん来た！」って窓から見てるんですよ。'] },
  { id: 'ito', lot: '3-B1-2', name: '伊藤 誠', role: '柴犬のコタロウと暮らす', home: [[0, 24, 0.7]], awayRate: 0.7, okihai: '物置', phone: false, dog: true,
    lines: ['コラ、コタロウ！ 吠えるな！ …すみませんね、はい、ハンコ。', 'コタロウがもう吠えなくなってきましたよ。顔を覚えたみたいだ。', 'コタロウ、配達さんにしっぽ振ってる。すっかり友だちだな。'] },
  { id: 'takahashi', lot: '1-C2-0', room: '503', name: '高橋 ゆい', role: 'IT企業でリモートワーク', home: [[0, 24, 0.9]], awayRate: 0.9, okihai: '宅配ボックス', phone: true, meeting: true,
    lines: ['（インターホン越しに）はい…すみません、会議中なので宅配ボックスにお願いできますか。', 'ありがとうございます、今日は会議が早く終わったので降りてきました。', 'いつもの方ですね。オートロック、わかりにくくてすみません。'] },
  { id: 'ishii', lot: '1-C2-0', room: '201', name: '石井 大輔', role: '単身赴任中', home: [[0, 8, 0.9], [19, 24, 0.9]], awayRate: 0.05, okihai: '宅配ボックス', phone: true,
    lines: ['あ、どうも。単身赴任で昼はいないんですよ。', '夜に受け取れて助かりました。家族からの荷物なんです。', 'あ、いつもの方。妻が送ってくれた漬物です、よかったら少し。'] },
  { id: 'yoshida', lot: '1-A-3', name: '吉田 茂', role: '老夫婦で暮らす元大工', home: [[0, 24, 0.9]], awayRate: 0.9, okihai: null, phone: true,
    lines: ['おう、ご苦労さん。重いだろう、玄関の中に置いてくれ。', 'あんた、荷物の持ち方がうまくなったな。腰は大事にしろよ。', '台車の車輪、油を差してやろうか。…冗談だ、がんばれよ。'] },
  { id: 'hanamaru', lot: '2-S-0', name: '西村 花江', role: '花屋はなまるの店長', home: [[9, 18, 0.98]], awayRate: 0.05, okihai: null, phone: true, business: true,
    lines: ['ありがとうございます！ 鉢、割れてないかな…よし、大丈夫。', 'いつも丁寧に運んでくれるから安心してるの。', '店先の花、少し持っていきなさいな。営業所に飾ってちょうだい。'] },
  { id: 'watanabe', lot: '2-C2-2', name: '渡辺 隆', role: '工場で夜勤', home: [[0, 24, 0.75]], awayRate: 0.75, okihai: '玄関前', phone: false, sleeper: true,
    lines: ['…はい（眠そうだ）。あ、どうも。', '昼間は寝てるけど、呼び鈴は鳴らしていいからね。', '最近は昼過ぎに起きるようにしてるんだ。また頼むよ。'] },
  { id: 'kato', lot: '2-C2-3', name: '加藤 翔太', role: 'フリーランスのデザイナー', home: [[11, 24, 0.8]], awayRate: 0.3, okihai: '玄関前', phone: true,
    lines: ['お疲れさまです！ 新しいタブレットだ、待ってました。', 'あ、こんにちは。今日もいい天気ですね。', 'この前描いた町の地図、営業所に貼ってもらえたら嬉しいな。'] },
  { id: 'kobayashi', lot: '3-D-3', name: '小林 正夫', role: '畑仕事が趣味', home: [[0, 24, 0.8]], awayRate: 0.8, okihai: '物置', phone: true,
    lines: ['畑のほうにいたんだ。よく見つけてくれたね。', 'ちゃんと勝手口のほうから声をかけてくれるね。もう覚えたか。', 'うちのトマトが採れたんだ。持って帰りな。'] },
  { id: 'matsumoto', lot: '1-S-3', name: '松本 亜紀', role: 'ベーカリー松本の店主', home: [[7, 17, 0.98]], awayRate: 0.05, okihai: null, phone: true, business: true,
    lines: ['小麦粉の配達、ありがとう！ これで明日も焼けるわ。', 'ちょうど焼きたてなの。メロンパン、ひとつどうぞ。', 'あなたの配達ルート、うちのパンの焼き上がりに合わせてくれてるでしょ？'] },
  { id: 'nakamura', lot: '2-D-1', name: '中村 陽子', role: '書道教室の先生', home: [[9, 15, 0.85], [17, 21, 0.85]], awayRate: 0.2, okihai: null, phone: true,
    lines: ['まあ、ご丁寧に。墨と半紙ね。', '15時からは教室で手が離せないことが多いのよ。', 'あなたのサイン、前よりきれいになったわね。'] },
  { id: 'ogawa', lot: '3-A-1', name: '小川 翼', role: '高校生と母の二人暮らし', home: [[16, 22, 0.9]], awayRate: 0.2, okihai: '玄関前', phone: true,
    lines: ['あ、母宛てですか？ 僕が受け取ります。', 'ネットで買った参考書です。ありがとうございます。', '将来、配達のバイトしてみようかな。大変そうだけど。'] },
];

// 配達先にならない家の表札
export const EXTRA_SURNAMES = ['山田', '木村', '林', '清水', '山口', '松田', '井上', '森田', '池田', '橋本', '石川', '前川', '藤田', '岡本', '後藤', '長谷川', '村田', '近藤', '坂口', '遠藤', '青木', '西田', '福田', '太田', '三浦', '藤原', '岡田', '中島', '原', '小野', '竹内', '金子', '和田', '中山', '石原', '上田', '森本', '柴田', '酒井', '工藤', '横山', '宮崎', '宮本', '内田', '高木', '安藤', '谷口', '大野', '丸山', '今井', '河野', '藤本', '村上', '武田', '上野', '杉山', '増田', '平野', '大塚', '千葉'];

// size: 60/80/100/120/140, weight 1〜3
export const ITEMS = [
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

export const FAVORITES = {
  tanaka: ['ふるさとの野菜', '衣類'], komorebi: ['コーヒー豆', '食器セット'], yamamoto: ['ゲームソフト', 'デスクチェア'],
  suzuki: ['オムツ（箱）', '飲料水 2L×6本'], ito: ['ドッグフード'], hanamaru: ['鉢植え'], kato: ['タブレット'],
  kobayashi: ['工具セット'], matsumoto: ['小麦粉 25kg'], nakamura: ['墨と半紙'], ogawa: ['参考書'],
  takahashi: ['生鮮セット（産地直送）', '電子レンジ'], yoshida: ['お米 10kg', 'ワイン 2本'],
};

export const SENDERS = ['あおば通販', 'ミドリ書店オンライン', 'ふるさと便', 'スマイルマート', 'ホシノ家電', '実家より', 'ハルカゼ食品', 'まるいち商事'];

export const FLAG_LABEL = {
  fragile: { label: 'ワレモノ', cls: 'f-fragile', tip: '上に荷物を載せない・急ブレーキ注意' },
  upright: { label: '天地無用', cls: 'f-fragile', tip: '棚の下段か床に置く' },
  heavy: { label: '重量物', cls: 'f-heavy', tip: '床（下段）に積む' },
  cool: { label: 'クール', cls: 'f-cool', tip: '保冷ボックスに入れる' },
};

// 箱の寸法（m）幅・高さ・奥行
export const BOX_DIMS = {
  60: [0.32, 0.18, 0.24], 80: [0.42, 0.24, 0.32], 100: [0.5, 0.3, 0.38], 120: [0.6, 0.36, 0.46], 140: [0.7, 0.42, 0.52],
};

export const UPGRADES = [
  { id: 'cart', name: '折りたたみ台車', price: 6000, desc: '同じ配達先の荷物を一度に3個まで運べる。重い荷物を持っても歩く速さが落ちない。' },
  { id: 'navi', name: 'カーナビ「まちナビ」', price: 8000, desc: 'ミニマップに次の配達先までのルートを表示し、到着予想時刻がわかる。' },
  { id: 'cooler', name: '大きな保冷ボックス', price: 5000, desc: '保冷ボックスに入れられる荷物が2個から4個に増える。' },
  { id: 'gloves', name: '滑り止め手袋', price: 3000, desc: '荷台の奥から荷物を取り出す時間が半分になる。' },
  { id: 'notify', name: '在宅お知らせサービス', price: 7000, desc: '受取人の在宅しやすい時間帯が伝票に表示される。' },
  { id: 'camera', name: 'バックカメラ', price: 4000, desc: 'バック中に画面下へ後方の映像が表示される。' },
];

export const LEVELS = [0, 120, 300, 550, 900, 1350, 1900, 2600];
export const parcelsForLevel = (lv) => Math.min(9 + lv, 16);
