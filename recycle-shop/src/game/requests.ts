import { ITEMS, itemDef, type CategoryId } from '../data/items';
import { nicePrice, uid, type Rng } from '../core/util';
import type { GameModel } from './model';
import type { ItemState } from './state';
import { GRADE_MULT, itemGrade, type Grade } from './valuation';

/** お客さんからの「探し物依頼」 */
export interface RequestState {
  id: string;
  customerName: string;
  archetype: string;
  defId: string;
  minGrade: Grade;
  budget: number;
  /** この日の閉店までに用意する */
  deadline: number;
  status: 'open' | 'coming' | 'done' | 'expired';
  /** 引き取りに来る時刻 (分) */
  visitMinute?: number;
}

const GRADE_ORDER: Grade[] = ['J', 'D', 'C', 'B', 'A', 'S'];
export const gradeAtLeast = (g: Grade, min: Grade) => GRADE_ORDER.indexOf(g) >= GRADE_ORDER.indexOf(min);

export function makeRequest(m: GameModel, rng: Rng, name: string, archetype: string, fav: CategoryId[]): RequestState {
  const pool = ITEMS.filter((d) => d.level <= m.state.level + 1 && fav.includes(d.category));
  const def = rng.weighted(pool.length ? pool : ITEMS.filter((d) => d.level <= m.state.level), (d) => d.weight);
  const minGrade: Grade = rng.pick(['C', 'B', 'B', 'A']);
  // 依頼品は相場より高く買ってくれる
  const budget = nicePrice(def.base * m.trend(def.category) * GRADE_MULT[minGrade] * rng.range(1.3, 1.6));
  return { id: uid('rq'), customerName: name, archetype, defId: def.id, minGrade, budget, deadline: m.state.day + rng.int(2, 4), status: 'open' };
}

/** 依頼に合う手持ちの品 (本物・動作品・グレード条件) */
export function matchRequest(m: GameModel, r: RequestState): ItemState | undefined {
  const def = itemDef(r.defId);
  return m.state.items.find((it) =>
    it.defId === r.defId
    && ['stock', 'fixture', 'bench'].includes(it.loc.type)
    && (!def.electronic || it.working)
    && it.verdict !== 'fake'
    && gradeAtLeast(itemGrade(it), r.minGrade));
}

export const requestLabel = (r: RequestState) => `${itemDef(r.defId).name} (${r.minGrade}以上)`;
