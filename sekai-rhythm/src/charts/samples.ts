import { ChartData } from '../core/chart';
import { NEON, STARLIGHT, Song } from '../music/song';
import { Diff, arrange, densityLevel } from './arranger';

/** 内蔵デモ譜面（内蔵シンセ曲。楽譜から譜面を作るのでノーツは必ず鳴っている音の上に来る） */

let cache: ChartData[] | null = null;

export function builtinCharts(): ChartData[] {
  if (cache) return cache.map((c) => JSON.parse(JSON.stringify(c)));
  const make = (song: Song, diff: Diff) => {
    const id = `demo-${song.id}-${diff}`;
    const c = arrange(song, diff, 1, id);
    c.level = densityLevel(c, song.bpm, diff);
    return c;
  };
  cache = [
    make(STARLIGHT, 'normal'),
    make(STARLIGHT, 'hard'),
    make(STARLIGHT, 'expert'),
    make(STARLIGHT, 'master'),
    make(NEON, 'hard'),
    make(NEON, 'expert'),
    make(NEON, 'master'),
  ];
  return builtinCharts();
}
