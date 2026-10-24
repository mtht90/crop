import type { Season, TimeBand, Weather } from '../data/types';
import { SEASONS } from '../data/types';
import type { Rng } from './rng';

/** 現実1秒 = ゲーム内1分 */
export const GAME_MINUTES_PER_SECOND = 1;
export const DAYS_PER_SEASON = 7;

export function timeBandOf(hour: number): TimeBand {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 4 && h < 7) return 'dawn';
  if (h >= 7 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  return 'night';
}

export function seasonOf(day: number): Season {
  return SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % 4];
}

/** 季節ごとの天候遷移表：現在の天候 → 次の1時間の天候の重み */
const TRANSITIONS: Record<Season, Record<Weather, Partial<Record<Weather, number>>>> = {
  spring: {
    sunny: { sunny: 70, cloudy: 22, fog: 4, rain: 4 },
    cloudy: { sunny: 25, cloudy: 50, rain: 18, fog: 5, storm: 2 },
    rain: { cloudy: 30, rain: 58, storm: 7, fog: 5 },
    storm: { rain: 45, storm: 45, cloudy: 10 },
    fog: { fog: 55, cloudy: 30, sunny: 15 },
  },
  summer: {
    sunny: { sunny: 74, cloudy: 18, rain: 5, storm: 3 },
    cloudy: { sunny: 30, cloudy: 40, rain: 20, storm: 10 },
    rain: { cloudy: 30, rain: 50, storm: 15, sunny: 5 },
    storm: { rain: 40, storm: 45, cloudy: 15 },
    fog: { fog: 40, sunny: 40, cloudy: 20 },
  },
  autumn: {
    sunny: { sunny: 68, cloudy: 22, fog: 7, rain: 3 },
    cloudy: { sunny: 25, cloudy: 45, rain: 20, fog: 7, storm: 3 },
    rain: { cloudy: 35, rain: 52, storm: 8, fog: 5 },
    storm: { rain: 50, storm: 40, cloudy: 10 },
    fog: { fog: 60, cloudy: 25, sunny: 15 },
  },
  winter: {
    sunny: { sunny: 65, cloudy: 25, fog: 8, rain: 2 },
    cloudy: { sunny: 25, cloudy: 52, rain: 12, fog: 9, storm: 2 },
    rain: { cloudy: 40, rain: 48, storm: 6, fog: 6 },
    storm: { rain: 45, storm: 40, cloudy: 15 },
    fog: { fog: 62, cloudy: 28, sunny: 10 },
  },
};

export function nextWeather(current: Weather, season: Season, hour: number, rng: Rng): Weather {
  const table = { ...TRANSITIONS[season][current] };
  // 霧は朝に出やすく昼に晴れやすい
  if (timeBandOf(hour) === 'dawn') table.fog = (table.fog ?? 0) * 2.5 + 3;
  if (timeBandOf(hour) === 'day' && current === 'fog') table.sunny = (table.sunny ?? 0) * 2;
  const entries = Object.entries(table) as [Weather, number][];
  return rng.weighted(entries, (e) => e[1])?.[0] ?? current;
}

/** 全体の活性（アタリの頻度に掛かる） */
export function activity(time: TimeBand, weather: Weather, season: Season): number {
  const t = { dawn: 1.4, day: 0.85, dusk: 1.35, night: 0.8 }[time];
  const w = { sunny: 0.9, cloudy: 1.15, rain: 1.25, storm: 0.85, fog: 1.05 }[weather];
  const s = { spring: 1.15, summer: 1.0, autumn: 1.15, winter: 0.7 }[season];
  return t * w * s;
}

export interface ClockState {
  /** 1日目から */
  day: number;
  /** 0..1440 */
  minutes: number;
  weather: Weather;
}

export class GameClock {
  day: number;
  minutes: number;
  weather: Weather;
  private lastHour: number;

  constructor(state: ClockState, private rng: Rng) {
    this.day = state.day;
    this.minutes = state.minutes;
    this.weather = state.weather;
    this.lastHour = Math.floor(this.minutes / 60) + this.day * 24;
  }

  get hour(): number {
    return this.minutes / 60;
  }

  get timeBand(): TimeBand {
    return timeBandOf(this.hour);
  }

  get season(): Season {
    return seasonOf(this.day);
  }

  get label(): string {
    const h = Math.floor(this.minutes / 60);
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** 実時間 dt 秒ぶん進める。天候が変わったら true */
  advance(dtSeconds: number): boolean {
    return this.advanceMinutes(dtSeconds * GAME_MINUTES_PER_SECOND);
  }

  advanceMinutes(mins: number): boolean {
    let changed = false;
    this.minutes += mins;
    while (this.minutes >= 1440) {
      this.minutes -= 1440;
      this.day += 1;
    }
    const hourIndex = Math.floor(this.minutes / 60) + this.day * 24;
    while (this.lastHour < hourIndex) {
      this.lastHour += 1;
      const next = nextWeather(this.weather, this.season, this.lastHour % 24, this.rng);
      if (next !== this.weather) {
        this.weather = next;
        changed = true;
      }
    }
    return changed;
  }

  /** 時刻を直接設定する（天候の遷移は起こさない） */
  setTime(minutes: number): void {
    this.minutes = ((minutes % 1440) + 1440) % 1440;
    this.lastHour = Math.floor(this.minutes / 60) + this.day * 24;
  }

  /** 次の朝5時まで眠る */
  sleep(): void {
    const target = this.minutes < 300 ? 300 - this.minutes : 1440 - this.minutes + 300;
    this.advanceMinutes(target);
  }

  toState(): ClockState {
    return { day: this.day, minutes: this.minutes, weather: this.weather };
  }
}
