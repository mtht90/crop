import type { Game } from '../core/game';

export interface NewsItem {
  text: string;
  cond?: (g: Game) => boolean;
}

const b = (i: number, n = 1) => (g: Game) => g.s.buildings[i] >= n;

export const NEWS: NewsItem[] = [
  { text: '宇宙ニュース: 謎の人物が宇宙で星屑を拾い始めたとの目撃情報。' },
  { text: '天文台「最近、夜空が少しだけ暗くなった気がする」' },
  { text: '専門家「星屑は拾っても拾っても減らない。多分」' },
  { text: '採掘ドローン組合が結成。要求は「充電時間の確保」。', cond: b(1, 10) },
  { text: '小惑星リグの騒音に近隣の彗星から苦情が殺到。', cond: b(2, 10) },
  { text: '軌道ステーションで初の結婚式。引き出物は星屑。', cond: b(3, 5) },
  { text: '月面基地の食堂、名物は「星屑カレー」。', cond: b(4, 1) },
  { text: '火星コロニーで星屑マラソン開催。完走者はゼロ。', cond: b(6, 5) },
  { text: 'ガス巨星精製所「臭いは気にしないでください」', cond: b(7, 1) },
  { text: '宇宙エレベーターの待ち時間、最長 3 年に。', cond: b(9, 10) },
  { text: '反物質工場で小規模な対消滅。被害は星屑 1 粒。', cond: b(10, 1) },
  { text: 'ダイソン・スウォームにより、近隣星系で日照不足が問題に。', cond: b(13, 1) },
  { text: 'ワームホール・ゲートから「間違えて」別の宇宙の荷物が届く。', cond: b(14, 1) },
  { text: '量子計算群、星屑の最適な集め方を計算中。完了予定は宇宙の終わり。', cond: b(16, 1) },
  { text: 'ダイソン球の完成により、恒星が「暗くて怖い」とコメント。', cond: b(19, 1) },
  { text: 'ブラックホール発電所の職員、休暇から戻ったら 30 年経っていた。', cond: b(20, 1) },
  { text: '星雲農園、今年は豊作。', cond: b(22, 1) },
  { text: '時間結晶炉が昨日の星屑を明日に届けてしまうトラブル。', cond: b(24, 1) },
  { text: 'マトリョーシカ・ブレイン「この宇宙は星屑でできている」と結論。', cond: b(26, 1) },
  { text: '宇宙ひも織機で編まれたマフラー、重さ 10 の 20 乗トン。', cond: b(29, 1) },
  { text: '因果律プロセッサの導入により、このニュースは既に読まれた。', cond: b(35, 1) },
  { text: '多元宇宙ブリッジの向こうから「うちの星屑を返せ」との抗議。', cond: b(36, 1) },
  { text: '創世記エンジン、新しい宇宙を試作。名前はまだない。', cond: b(38, 1) },
  { text: '無限の特異点「……」', cond: b(39, 1) },
  { text: '超新星爆発の目撃情報。原因は「星屑の取りすぎ」との見方も。', cond: (g) => g.s.stats.snTotal >= 1 },
  { text: '星核の価格が高騰。宝石店から星核のショーケースが消える。', cond: (g) => g.s.stats.snTotal >= 5 },
  { text: '研究者「研究とは、待つことである」', cond: (g) => g.s.stats.researchDone >= 1 },
  { text: '遠征艦隊、お土産に謎の遺物を持ち帰る。用途は不明。', cond: (g) => g.s.stats.expeditionsDone >= 1 },
  { text: '銀河が 1 つ行方不明に。警察は事件と事故の両面で捜査。', cond: (g) => g.s.stats.galaxyTotal >= 1 },
  { text: 'ダークマター、ついに観測される。見えないけど。', cond: (g) => g.s.stats.galaxyTotal >= 1 },
  { text: 'チャレンジ挑戦者「制限があるほど燃える」', cond: (g) => g.totalChallengeCompletions() >= 1 },
  { text: '宇宙が一度閉じて、また開いた。誰も気づいていない。', cond: (g) => g.s.stats.crunchTotal >= 1 },
  { text: '別の宇宙のあなたから手紙が届く。「そっちの星屑、多くない?」', cond: (g) => g.s.stats.mvTotal >= 1 },
  { text: '彗星評論家「最近の彗星は捕まりやすい」', cond: (g) => g.s.stats.comets >= 10 },
  { text: 'ヒント: 放置している間も星屑は貯まります。' },
  { text: 'ヒント: 彗星をクリックすると、良いことが起こります。' },
  { text: 'ヒント: 設定からセーブデータをエクスポートできます。' },
  { text: 'ヒント: 施設を一定数そろえると強化アップグレードが解放されます。' },
  { text: 'ヒント: 実績を解除するたびに生産量が少しずつ増えます。' },
];

export function pickNews(g: Game, rnd = Math.random): string {
  const pool = NEWS.filter((n) => !n.cond || n.cond(g));
  return pool[Math.floor(rnd() * pool.length)].text;
}
