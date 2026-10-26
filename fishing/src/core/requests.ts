import type { NpcDef } from '../data/npcs';
import { SPECIES_BY_ID } from '../data/species';
import { priceOf } from '../sim/individual';
import { Rng } from '../sim/rng';
import type { SaveData } from './save';

/** 納品依頼：species を count 匹（minLength cm 以上） */
export interface FishRequest {
  species: string;
  count: number;
  /** 0 = 大きさ不問 */
  minLength: number;
  reward: number;
}

export interface RequestState {
  /** 依頼を出した日 */
  day: number;
  req: FishRequest;
  done: boolean;
  /** これまでに達成した回数 */
  total: number;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** その日の依頼を決める（同じ日・同じ人なら同じ依頼） */
export function makeRequest(npc: NpcDef, day: number, total: number): FishRequest {
  const rng = new Rng((hashStr(npc.id) ^ Math.imul(day, 2654435761) ^ Math.imul(total + 1, 40503)) >>> 0);
  const pool = npc.pool.filter((p) => SPECIES_BY_ID[p.species]);
  const pick = rng.weighted(pool, (p) => p.weight ?? 1) ?? pool[0];
  const s = SPECIES_BY_ID[pick.species];
  const count = rng.int(pick.count[0], pick.count[1]);
  const size = pick.size ?? 'any';
  const minLength = size === 'any' ? 0 : Math.max(s.length.min, Math.round((size === 'good' ? s.length.mean : s.length.mean + s.length.sd * 1.2) / 5) * 5);
  // 報酬：基準の売値 × 匹数 × 人ごとの倍率。大きさ指定は上乗せ
  const sizeMult = size === 'any' ? 1 : size === 'good' ? 1.6 : 2.6;
  const reward = Math.max(100, Math.round((s.price * count * npc.rewardMult * sizeMult + 80) / 10) * 10);
  return { species: pick.species, count, minLength, reward };
}

/** 今日の依頼（日が変わっていれば新しい依頼に入れ替える） */
export function currentRequest(save: SaveData, npc: NpcDef, day: number): RequestState {
  const st = save.requests[npc.id];
  if (st && st.day === day) return st;
  const total = st?.total ?? 0;
  const next: RequestState = { day, req: makeRequest(npc, day, total), done: false, total };
  save.requests[npc.id] = next;
  return next;
}

/** 依頼に使えるクーラーの魚（安いものから） */
export function matchingFish(save: SaveData, req: FishRequest): SaveData['cooler'] {
  return save.cooler
    .filter((f) => f.speciesId === req.species && f.length >= req.minLength)
    .sort((a, b) => priceOf(SPECIES_BY_ID[a.speciesId], a) - priceOf(SPECIES_BY_ID[b.speciesId], b));
}

/** 納品する。揃っていなければ null */
export function deliver(save: SaveData, npc: NpcDef, day: number): number | null {
  const st = currentRequest(save, npc, day);
  if (st.done) return null;
  const fish = matchingFish(save, st.req).slice(0, st.req.count);
  if (fish.length < st.req.count) return null;
  const uids = new Set(fish.map((f) => f.uid));
  save.cooler = save.cooler.filter((f) => !uids.has(f.uid));
  save.money += st.req.reward;
  save.stats.earned += st.req.reward;
  st.done = true;
  st.total++;
  return st.req.reward;
}

/** 「ブリ 1匹（60cm以上）」の形 */
export function requestLabel(req: FishRequest): string {
  const s = SPECIES_BY_ID[req.species];
  return `${s?.name ?? req.species} ${req.count}匹${req.minLength ? `（${req.minLength}cm以上）` : ''}`;
}
