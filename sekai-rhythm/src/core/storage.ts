import { ChartData, normalizeChart } from './chart';
import { Settings, normalizeSettings } from './settings';

declare global {
  interface Window {
    /** Electron の preload から渡される API（ブラウザ実行時は undefined） */
    sekaiNative?: {
      isElectron: true;
      readStore(name: string): Promise<string | null>;
      writeStore(name: string, data: string): Promise<void>;
      toggleFullscreen(): void;
    };
  }
}

export interface BestScore {
  score: number;
  rank: string;
  fullCombo: boolean;
  allPerfect: boolean;
  maxCombo: number;
  playedAt: number;
}

async function readStore(name: string): Promise<unknown> {
  try {
    const text = window.sekaiNative
      ? await window.sekaiNative.readStore(name)
      : localStorage.getItem('sekai-rhythm:' + name);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.warn('store read failed', name, e);
    return null;
  }
}

async function writeStore(name: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data);
  if (window.sekaiNative) await window.sekaiNative.writeStore(name, text);
  else localStorage.setItem('sekai-rhythm:' + name, text);
}

let chartCache: ChartData[] | null = null;

export const storage = {
  async getCharts(): Promise<ChartData[]> {
    if (chartCache) return chartCache;
    const raw = await readStore('charts');
    const list: ChartData[] = [];
    if (Array.isArray(raw)) {
      for (const c of raw) {
        try {
          list.push(normalizeChart(c));
        } catch (e) {
          console.warn('skip broken chart', e);
        }
      }
    }
    chartCache = list;
    return list;
  },

  async saveChart(chart: ChartData): Promise<void> {
    const list = await this.getCharts();
    const copy: ChartData = JSON.parse(JSON.stringify(chart));
    delete copy.builtin;
    const i = list.findIndex((c) => c.id === copy.id);
    if (i >= 0) list[i] = copy;
    else list.push(copy);
    await writeStore('charts', list);
  },

  async deleteChart(id: string): Promise<void> {
    const list = await this.getCharts();
    chartCache = list.filter((c) => c.id !== id);
    await writeStore('charts', chartCache);
  },

  async getSettings(): Promise<Settings> {
    return normalizeSettings(await readStore('settings'));
  },

  async saveSettings(s: Settings): Promise<void> {
    await writeStore('settings', s);
  },

  async getScores(): Promise<Record<string, BestScore>> {
    const raw = await readStore('scores');
    return raw && typeof raw === 'object' ? (raw as Record<string, BestScore>) : {};
  },

  /** ベストを更新したら true */
  async submitScore(chartId: string, s: BestScore): Promise<boolean> {
    const all = await this.getScores();
    const prev = all[chartId];
    const merged: BestScore = prev
      ? {
          score: Math.max(prev.score, s.score),
          rank: s.score > prev.score ? s.rank : prev.rank,
          fullCombo: prev.fullCombo || s.fullCombo,
          allPerfect: prev.allPerfect || s.allPerfect,
          maxCombo: Math.max(prev.maxCombo, s.maxCombo),
          playedAt: s.playedAt,
        }
      : s;
    all[chartId] = merged;
    await writeStore('scores', all);
    return s.score > 0 && (!prev || s.score > prev.score);
  },
};
