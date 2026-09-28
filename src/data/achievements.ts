import { Decimal } from '../core/decimal';
import { fmt, fmtInt, fmtTime } from '../core/format';
import type { Game } from '../core/game';
import { BUILDINGS } from './buildings';

export type AchCategory =
  | '星屑' | '生産' | '施設' | 'クリック' | '彗星' | 'アップグレード'
  | '転生' | '研究' | 'チャレンジ' | '遠征' | '時間' | '秘密';

export interface AchDef {
  id: string;
  category: AchCategory;
  name: string;
  desc: string;
  icon: string;
  secret?: boolean;
  check: (g: Game) => boolean;
}

function expSteps(): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 20; k++) out.push(k);
  for (let k = 25; k <= 300; k += 5) out.push(k);
  for (let k = 400; k <= 1000; k += 100) out.push(k);
  for (let k = 2000; k <= 10000; k += 1000) out.push(k);
  out.push(1e5, 1e6);
  return out;
}

const STARDUST_NAMES = ['ひとかけら', '手のひらの星', '星の砂浜', '小さな星座', '輝く川', '星の海'];
const BUILDING_STEPS = [1, 10, 25, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 1000];

function buildAchievements(): AchDef[] {
  const list: AchDef[] = [];
  const push = (a: AchDef) => list.push(a);

  // 総獲得星屑
  expSteps().forEach((k, i) => {
    const target = Decimal.pow(10, k);
    push({
      id: `te${k}`,
      category: '星屑',
      name: `${STARDUST_NAMES[Math.min(i, STARDUST_NAMES.length - 1)]} ${fmt(target)}`,
      desc: `累計で ${fmt(target)} の星屑を獲得する`,
      icon: '✨',
      check: (g) => g.s.stats.totalEarned.gte(target),
    });
  });

  // 毎秒生産
  expSteps()
    .filter((k) => k <= 3000)
    .forEach((k) => {
      const target = Decimal.pow(10, k);
      push({
        id: `sp${k}`,
        category: '生産',
        name: `秒速 ${fmt(target)}`,
        desc: `毎秒 ${fmt(target)} 以上の星屑を生産する`,
        icon: '⚡',
        check: (g) => g.s.stats.maxSps.gte(target),
      });
    });

  // 施設ごとの所持数
  for (const b of BUILDINGS) {
    for (const n of BUILDING_STEPS) {
      push({
        id: `b${b.index}_${n}`,
        category: '施設',
        name: n === 1 ? `はじめての${b.name}` : `${b.name} ×${n}`,
        desc: `${b.name}を ${n} 基所持する`,
        icon: b.icon,
        check: (g) => g.s.buildings[b.index] >= n,
      });
    }
  }

  // 合計施設数
  for (const n of [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000]) {
    push({
      id: `ball${n}`,
      category: '施設',
      name: `宇宙開発計画 ${fmtInt(n)}`,
      desc: `施設を合計 ${fmtInt(n)} 基所持する`,
      icon: '🏗️',
      check: (g) => g.totalBuildings() >= n,
    });
  }

  // クリック
  for (const n of [1, 100, 500, 1000, 5000, 1e4, 5e4, 1e5, 5e5, 1e6]) {
    push({
      id: `cl${n}`,
      category: 'クリック',
      name: n === 1 ? 'はじめの一押し' : `連打 ${fmtInt(n)}`,
      desc: `累計 ${fmtInt(n)} 回クリックする`,
      icon: '👆',
      check: (g) => g.s.stats.clicks >= n,
    });
  }
  for (let k = 3; k <= 60; k += 3) {
    const target = Decimal.pow(10, k);
    push({
      id: `ce${k}`,
      category: 'クリック',
      name: `黄金の指 ${fmt(target)}`,
      desc: `クリックで累計 ${fmt(target)} の星屑を得る`,
      icon: '🖐️',
      check: (g) => g.s.stats.clickEarned.gte(target),
    });
  }

  // 彗星
  for (const n of [1, 7, 25, 77, 150, 300, 777, 1500, 3000, 7777]) {
    push({
      id: `co${n}`,
      category: '彗星',
      name: n === 1 ? '流れ星に願いを' : `彗星ハンター ${n}`,
      desc: `彗星を ${n} 個つかまえる`,
      icon: '☄️',
      check: (g) => g.s.stats.comets >= n,
    });
  }

  // アップグレード
  for (const n of [1, 10, 25, 50, 100, 200, 300, 400, 500, 600, 700]) {
    push({
      id: `up${n}`,
      category: 'アップグレード',
      name: `技術革新 ${n}`,
      desc: `1 周回でアップグレードを ${n} 個購入する`,
      icon: '🔧',
      check: (g) => g.s.upgrades.length >= n,
    });
  }

  // 転生
  const layers: Array<[string, string, string, (g: Game) => number, number[]]> = [
    ['sn', '超新星', '💥', (g) => g.s.stats.snTotal, [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]],
    ['ga', '銀河崩壊', '🌌', (g) => g.s.stats.galaxyTotal, [1, 2, 5, 10, 25, 50, 100, 250]],
    ['cr', 'ビッグクランチ', '🌀', (g) => g.s.stats.crunchTotal, [1, 2, 5, 10, 25, 50]],
    ['mv', '多元宇宙転生', '♾️', (g) => g.s.stats.mvTotal, [1, 2, 5, 10, 25]],
  ];
  for (const [key, label, icon, get, steps] of layers) {
    for (const n of steps) {
      push({
        id: `p${key}${n}`,
        category: '転生',
        name: n === 1 ? `はじめての${label}` : `${label} ${n} 回`,
        desc: `${label}を累計 ${n} 回行う`,
        icon,
        check: (g) => get(g) >= n,
      });
    }
  }
  const currencies: Array<[string, string, string, (g: Game) => Decimal, number, number, number]> = [
    ['cores', '星核', '⭐', (g) => g.s.sn.coresTotal, 0, 30, 3],
    ['dm', 'ダークマター', '🌑', (g) => g.s.galaxy.dmTotal, 0, 20, 2],
    ['ent', 'エントロピー', '🔥', (g) => g.s.crunch.entTotal, 0, 15, 3],
    ['sh', '次元の欠片', '💎', (g) => g.s.mv.shardsTotal, 0, 10, 2],
  ];
  for (const [key, label, icon, get, from, to, step] of currencies) {
    for (let k = from; k <= to; k += step) {
      const target = Decimal.pow(10, k);
      push({
        id: `cur${key}${k}`,
        category: '転生',
        name: `${label}コレクター ${fmt(target)}`,
        desc: `${label}を累計 ${fmt(target)} 獲得する`,
        icon,
        check: (g) => get(g).gte(target),
      });
    }
  }
  for (const sec of [3600, 600, 60, 10]) {
    push({
      id: `fast${sec}`,
      category: '転生',
      name: `電撃超新星 ${fmtTime(sec)}`,
      desc: `${fmtTime(sec)} 以内に超新星を起こす`,
      icon: '⏱️',
      check: (g) => g.s.sn.bestTime <= sec,
    });
  }

  // 研究
  for (const n of [1, 5, 10, 25, 50, 100, 200, 500]) {
    push({
      id: `rs${n}`,
      category: '研究',
      name: `探究者 ${n}`,
      desc: `研究を累計 ${n} 回完了する`,
      icon: '🔬',
      check: (g) => g.s.stats.researchDone >= n,
    });
  }

  // チャレンジ
  for (const n of [1, 5, 10, 20, 30, 40]) {
    push({
      id: `ch${n}`,
      category: 'チャレンジ',
      name: `試練の踏破者 ${n}`,
      desc: `チャレンジを合計 ${n} 段階クリアする`,
      icon: '🏆',
      check: (g) => g.totalChallengeCompletions() >= n,
    });
  }

  // 遠征
  for (const n of [1, 10, 50, 100, 500, 1000]) {
    push({
      id: `ex${n}`,
      category: '遠征',
      name: `航海者 ${n}`,
      desc: `遠征を ${n} 回完了する`,
      icon: '🚀',
      check: (g) => g.s.stats.expeditionsDone >= n,
    });
  }
  for (const n of [1, 5, 10, 20, 30, 40]) {
    push({
      id: `rl${n}`,
      category: '遠征',
      name: `遺物蒐集家 ${n}`,
      desc: `${n} 種類の遺物を発見する`,
      icon: '🏺',
      check: (g) => Object.keys(g.s.expeditions.relics).length >= n,
    });
  }

  // 時間
  const H = 3600;
  for (const sec of [H, 6 * H, 24 * H, 72 * H, 168 * H, 336 * H, 720 * H, 1440 * H, 2160 * H, 4320 * H, 8760 * H]) {
    push({
      id: `pt${sec}`,
      category: '時間',
      name: `星を見守る者 ${fmtTime(sec)}`,
      desc: `合計 ${fmtTime(sec)} プレイする (放置時間を含む)`,
      icon: '🕰️',
      check: (g) => g.s.stats.playTime + g.s.stats.offlineTime >= sec,
    });
  }
  for (const n of [1, 10, 100]) {
    push({
      id: `off${n}`,
      category: '時間',
      name: `おかえりなさい ${n}`,
      desc: `放置報酬を ${n} 回受け取る`,
      icon: '🛏️',
      check: (g) => g.s.stats.offlineReturns >= n,
    });
  }

  // 秘密
  push({
    id: 'sec_title',
    category: '秘密',
    name: '星を見上げて',
    desc: 'タイトルをクリックする',
    icon: '🔭',
    secret: true,
    check: (g) => g.flags.has('title'),
  });
  push({
    id: 'sec_news',
    category: '秘密',
    name: '宇宙ニュース中毒',
    desc: 'ニュースを 50 本読む',
    icon: '📰',
    secret: true,
    check: (g) => g.newsCount >= 50,
  });
  push({
    id: 'sec_noclick',
    category: '秘密',
    name: '見ているだけ',
    desc: 'この周回で 1 度もクリックせずに 1兆 の星屑を得る',
    icon: '🧘',
    secret: true,
    check: (g) => g.s.run.clicks === 0 && g.s.run.earned.gte(1e12),
  });
  push({
    id: 'sec_export',
    category: '秘密',
    name: 'バックアップは大事',
    desc: 'セーブデータをエクスポートする',
    icon: '💾',
    secret: true,
    check: (g) => g.flags.has('export'),
  });

  return list;
}

export const ACHIEVEMENTS: AchDef[] = buildAchievements();
export const ACH_MAP: Map<string, AchDef> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
