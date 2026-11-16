import { BUILDINGS, JOBS, RIVALS, UNITS, type BuildingId, type JobId, type Res, type UnitId } from './data';

export interface Construction {
  id: number;
  building: BuildingId;
  slot: number;
  progress: number; // 0..1
  time: number; // 必要秒数（大工0人時）
}

export interface GameState {
  version: number;
  res: Record<Res, number>;
  jobs: Record<JobId, number>;
  buildings: Record<BuildingId, number>;
  // 建物ごとに使ったスロット（見た目の配置用）
  placed: { building: BuildingId; slot: number; variant: number }[];
  constructions: Construction[];
  units: Record<UnitId, number>;
  research: string[];
  forts: Record<string, number>; // rival id -> 攻略済み拠点数
  // 統計（この治世）
  reignGold: number;
  reignStart: number;
  // 統計（全期間）
  stats: {
    allGold: number;
    clicks: number;
    crits: number;
    goldens: number;
    duck: number;
    prestiges: number;
    battlesWon: number;
    battlesLost: number;
    playTime: number;
  };
  crownsTotal: number;
  crownsSpent: number;
  perks: string[];
  achievements: string[];
  frenzyUntil: number; // game time (sec)
  time: number; // 経過ゲーム時間（秒）
  lastSave: number; // Date.now()
  nextId: number;
  kingName: number; // 何代目
  tutorial: number;
}

export const SAVE_KEY = 'chiisana-oukoku/save/v1';
export const STATE_VERSION = 1;

function zero<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

export function newState(): GameState {
  return {
    version: STATE_VERSION,
    res: { gold: 0, wood: 0, meat: 0 },
    jobs: zero(JOBS.map((j) => j.id)),
    buildings: zero(BUILDINGS.map((b) => b.id)),
    placed: [],
    constructions: [],
    units: zero(UNITS.map((u) => u.id)),
    research: [],
    forts: Object.fromEntries(RIVALS.map((r) => [r.id, 0])),
    reignGold: 0,
    reignStart: Date.now(),
    stats: { allGold: 0, clicks: 0, crits: 0, goldens: 0, duck: 0, prestiges: 0, battlesWon: 0, battlesLost: 0, playTime: 0 },
    crownsTotal: 0,
    crownsSpent: 0,
    perks: [],
    achievements: [],
    frenzyUntil: 0,
    time: 0,
    lastSave: Date.now(),
    nextId: 1,
    kingName: 1,
    tutorial: 0,
  };
}

/** 保存データを読み込み、欠けている項目を既定値で補う（将来の項目追加に強くする）。 */
export function hydrate(raw: unknown): GameState {
  const base = newState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<GameState>;
  const merged: GameState = {
    ...base,
    ...r,
    res: { ...base.res, ...(r.res ?? {}) },
    jobs: { ...base.jobs, ...(r.jobs ?? {}) },
    buildings: { ...base.buildings, ...(r.buildings ?? {}) },
    units: { ...base.units, ...(r.units ?? {}) },
    forts: { ...base.forts, ...(r.forts ?? {}) },
    stats: { ...base.stats, ...(r.stats ?? {}) },
    placed: Array.isArray(r.placed) ? r.placed : [],
    constructions: Array.isArray(r.constructions) ? r.constructions : [],
    research: Array.isArray(r.research) ? r.research : [],
    perks: Array.isArray(r.perks) ? r.perks : [],
    achievements: Array.isArray(r.achievements) ? r.achievements : [],
    version: STATE_VERSION,
  };
  for (const k of Object.keys(merged.res) as Res[]) if (!isFinite(merged.res[k]) || merged.res[k] < 0) merged.res[k] = 0;
  return merged;
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function exportSave(s: GameState): string {
  const json = serialize(s);
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSave(text: string): GameState {
  const json = decodeURIComponent(escape(atob(text.trim())));
  return hydrate(JSON.parse(json));
}
