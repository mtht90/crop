import { ChartData, Difficulty, FlickDir, NoteData, SlidePointData, emptyChart } from '../core/chart';

/** 内蔵デモ譜面（内蔵シンセ曲で遊べる。YouTube 不要） */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GenOpts {
  id: string;
  title: string;
  bpm: number;
  lengthBeats: number;
  difficulty: Difficulty;
  level: number;
  seed: number;
  dense: boolean;
}

function generate(o: GenOpts): ChartData {
  const r = rng(o.seed);
  const notes: NoteData[] = [];
  const K = (k: number) => k * 2;
  const tap = (beat: number, lane: number, width: number, critical = false) =>
    notes.push({ type: 'single', kind: 'tap', beat, lane, width, ...(critical ? { critical } : {}) });
  const flick = (beat: number, lane: number, width: number, dir: FlickDir, critical = false) =>
    notes.push({ type: 'single', kind: 'flick', beat, lane, width, dir, ...(critical ? { critical } : {}) });
  const trace = (beat: number, lane: number, width: number) => notes.push({ type: 'single', kind: 'trace', beat, lane, width });
  const slide = (pts: [number, number, number, boolean?][], opts: { critical?: boolean; endFlick?: FlickDir } = {}) => {
    const points: SlidePointData[] = pts.map(([beat, lane, width, visible]) => ({ beat, lane, width, visible: visible !== false }));
    notes.push({ type: 'slide', points, ...opts });
  };

  const patterns: ((b0: number, chorus: boolean) => void)[] = [
    // A: ジグザグ連打
    (b0, chorus) => {
      const seq = [0, 5, 1, 4, 2, 3, 2, 4, 1, 5, 0, 3, 1, 4, 2, 5];
      const step = o.dense ? 0.5 : 1;
      let i = Math.floor(r() * 4);
      for (let b = b0; b < b0 + 7; b += step) tap(b, K(seq[i++ % seq.length]), 2);
      flick(b0 + 7, 4, 4, 'up', chorus);
    },
    // B: 同時押し
    (b0) => {
      const ks = [0, 1, 2, 1];
      for (let i = 0; i < 7; i++) {
        const k = ks[i % 4];
        tap(b0 + i, K(k), 2);
        tap(b0 + i, K(5 - k), 2);
        if (o.dense && i % 2 === 1) tap(b0 + i + 0.5, K(2 + (i % 4 === 1 ? 0 : 1)), 2);
      }
      flick(b0 + 7, 0, 3, 'left');
      flick(b0 + 7, 9, 3, 'right');
    },
    // C: 片手スライド + 片手タップ
    (b0, chorus) => {
      slide([
        [b0, 0, 3],
        [b0 + 2, 2, 3, true],
        [b0 + 3.5, 0, 3],
      ]);
      const step = o.dense ? 0.5 : 1;
      let i = 0;
      for (let b = b0; b < b0 + 3.6; b += step) tap(b, K(3 + (i++ % 3)), 2);
      slide(
        [
          [b0 + 4, 9, 3],
          [b0 + 6, 7, 3, true],
          [b0 + 7.5, 9, 3],
        ],
        { endFlick: 'right', critical: chorus },
      );
      i = 0;
      for (let b = b0 + 4; b < b0 + 7.6; b += step) tap(b, K(2 - (i++ % 3)), 2);
    },
    // D: なぞり
    (b0) => {
      const step = o.dense ? 0.25 : 0.5;
      let k = 0;
      for (let b = b0; b < b0 + 2 - 1e-6; b += step) trace(b, K(Math.min(5, k++)), 2);
      tap(b0 + 3, 4, 4);
      k = 5;
      for (let b = b0 + 4; b < b0 + 6 - 1e-6; b += step) trace(b, K(Math.max(0, k--)), 2);
      flick(b0 + 7, 4, 4, 'up');
    },
    // E: タップ → フリック
    (b0, chorus) => {
      for (let p = 0; p < 4; p++) {
        const b = b0 + p * 2;
        const left = p % 2 === 0;
        tap(b, K(left ? 1 : 4), 2);
        if (o.dense) tap(b + 0.5, K(left ? 2 : 3), 2);
        flick(b + 1, left ? 0 : 8, 4, left ? 'left' : 'right', chorus && p === 3);
      }
    },
    // F: 大きく動くスライド
    (b0, chorus) => {
      slide(
        [
          [b0, 4, 4],
          [b0 + 2, 0, 4, true],
          [b0 + 4, 8, 4, true],
          [b0 + 6, 2, 4, false],
          [b0 + 7.5, 4, 4],
        ],
        { endFlick: 'up', critical: chorus },
      );
    },
  ];

  const order = o.dense ? [0, 2, 1, 4, 3, 5, 2, 0] : [1, 2, 4, 0, 5, 2, 3, 4];
  for (let b0 = 8, p = 0; b0 + 8 <= o.lengthBeats; b0 += 8, p++) {
    const chorus = Math.floor(p / 4) % 2 === 1;
    const pat = patterns[order[(p + Math.floor(r() * 2)) % order.length]];
    pat(b0, chorus);
  }
  flick(o.lengthBeats, 2, 8, 'up', true);

  return emptyChart({
    id: o.id,
    title: o.title,
    artist: 'Sekai Rhythm（内蔵シンセ）',
    charter: 'デモ',
    difficulty: o.difficulty,
    level: o.level,
    audio: { type: 'synth', lengthBeats: o.lengthBeats, seed: o.seed },
    offset: 0,
    bpms: [{ beat: 0, bpm: o.bpm }],
    notes,
    builtin: true,
  });
}

export function builtinCharts(): ChartData[] {
  return [
    generate({ id: 'demo-starlight-normal', title: 'Starlight Signal（デモ）', bpm: 128, lengthBeats: 136, difficulty: 'normal', level: 12, seed: 7, dense: false }),
    generate({ id: 'demo-starlight-expert', title: 'Starlight Signal（デモ）', bpm: 128, lengthBeats: 136, difficulty: 'expert', level: 24, seed: 7, dense: true }),
    generate({ id: 'demo-neon-master', title: 'Neon Parade（デモ）', bpm: 168, lengthBeats: 232, difficulty: 'master', level: 29, seed: 21, dense: true }),
  ];
}
