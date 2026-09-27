import { itemDef, type ItemDef, type AuthSpec } from '../data/items';
import { Rng, nicePrice } from '../core/util';
import type { Defect, ItemState } from './state';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'J';

export const GRADE_MULT: Record<Grade, number> = { S: 1, A: 0.85, B: 0.68, C: 0.5, D: 0.33, J: 0.18 };
export const GRADE_LABEL: Record<Grade, string> = {
  S: '新品同様', A: '美品', B: '良品', C: '使用感あり', D: '難あり', J: 'ジャンク',
};
export const GRADE_COLOR: Record<Grade, string> = { S: '#ffd84a', A: '#7ee081', B: '#6cc4ff', C: '#c8c8c8', D: '#ff9f5a', J: '#ff5a6a' };

/** 汚れを含めた見た目の状態値 */
export const effectiveCondition = (it: Pick<ItemState, 'condition' | 'dirt'>) => Math.max(0, it.condition - it.dirt * 28);

export function gradeOf(cond: number, working = true): Grade {
  if (!working) return 'J';
  if (cond >= 92) return 'S';
  if (cond >= 80) return 'A';
  if (cond >= 65) return 'B';
  if (cond >= 45) return 'C';
  if (cond >= 25) return 'D';
  return 'J';
}

export const itemGrade = (it: ItemState) => gradeOf(effectiveCondition(it), !itemDef(it.defId).electronic || it.working);

function accessoryMult(def: ItemDef, have: string[]) {
  const all = def.accessories ?? [];
  if (!all.length) return 1;
  const missing = all.filter((a) => !have.includes(a)).length;
  return 1 - missing * 0.07;
}

/** 本当の市場価値 (売値の基準)。trend は相場倍率 */
export function trueValue(it: ItemState, trend: number): number {
  const def = itemDef(it.defId);
  let v = def.base * trend * GRADE_MULT[itemGrade(it)] * accessoryMult(def, it.accessories);
  if (!it.authentic) v *= 0.05;
  return Math.max(10, v);
}

/** 本物・動作品だと仮定した価値 (売り手や素人の見立て) */
export function claimedValue(it: ItemState, trend: number): number {
  const def = itemDef(it.defId);
  const cond = effectiveCondition(it);
  return Math.max(10, def.base * trend * GRADE_MULT[gradeOf(cond, true)] * accessoryMult(def, it.accessories));
}

/**
 * プレイヤーが把握している情報だけで見積もった価値。
 * 見つけた傷だけを反映し、未テストの家電は動作品扱い、偽物判定したものは偽物扱い。
 */
export function knownValue(it: ItemState, trend: number): { value: number; grade: Grade; certain: boolean } {
  const def = itemDef(it.defId);
  const foundPenalty = it.defects.filter((d) => d.found).reduce((s, d) => s + d.severity, 0);
  const cond = Math.max(0, 100 - foundPenalty - it.dirt * 28);
  const working = def.electronic ? (it.tested ? it.working : true) : true;
  const grade = gradeOf(cond, working);
  let v = def.base * trend * GRADE_MULT[grade] * accessoryMult(def, it.accessories);
  if (it.verdict === 'fake') v *= 0.05;
  const certain = it.defects.every((d) => d.found) && (!def.electronic || it.tested) && (!def.auth || it.verdict !== null);
  return { value: Math.max(10, v), grade, certain };
}

// ───── 真贋 ─────
export const CHECK_TABLE = ['K', 'M', 'P', 'R', 'T', 'V', 'X', 'Z', 'B', 'D'];

/** 数字 4 桁の合計の一の位 → 末尾のチェック文字 */
export function checkLetter(digits: string) {
  const sum = [...digits].reduce((s, c) => s + Number(c), 0);
  return CHECK_TABLE[sum % 10];
}

export function makeSerial(spec: AuthSpec, rng: Rng, valid: boolean) {
  const digits = Array.from({ length: 4 }, () => rng.int(0, 9)).join('');
  let letter = checkLetter(digits);
  if (!valid) {
    const others = CHECK_TABLE.filter((c) => c !== letter);
    letter = rng.pick(others);
  }
  return spec.serial.replace('####', digits).replace('@', letter);
}

export function serialValid(spec: AuthSpec, serial: string) {
  const prefix = spec.serial.split('-')[0];
  const m = serial.match(/^([A-Z]+)-(\d{4})-([A-Z])$/);
  if (!m || m[1] !== prefix) return false;
  return checkLetter(m[2]) === m[3];
}

export function markValid(spec: AuthSpec, mark: string) {
  return mark === spec.mark;
}

export function weightDeviation(spec: AuthSpec, w: number) {
  return (w - spec.weight) / spec.weight;
}

// ───── 生成 ─────
export interface GenOptions {
  /** 状態の良さ 0..1 */
  careful: number;
  fakeRate: number;
  day: number;
}

export function generateItem(def: ItemDef, rng: Rng, opt: GenOptions, uid: string): ItemState {
  // 状態: careful が高いほど良い
  const base = 55 + opt.careful * 40 + rng.gauss(0, 12);
  const targetCond = Math.max(8, Math.min(100, base));
  const defects: Defect[] = [];
  let remaining = 100 - targetCond;
  const kinds: Defect['kind'][] = ['scratch', 'dent', 'crack', 'fade'];
  while (remaining > 4 && defects.length < 6) {
    const sev = Math.round(Math.min(remaining, rng.range(5, 18)));
    defects.push({ kind: rng.pick(kinds), severity: sev, seed: rng.int(1, 1e9), found: false });
    remaining -= sev;
  }
  const condition = 100 - defects.reduce((s, d) => s + d.severity, 0);
  const dirt = Math.max(0, Math.min(1, rng.range(0, 1.1 - opt.careful * 0.7)));
  const working = def.electronic ? rng.chance(0.62 + opt.careful * 0.3) : true;
  const accessories = (def.accessories ?? []).filter(() => rng.chance(0.35 + opt.careful * 0.5));

  let authentic = true;
  let mark = '';
  let serial = '';
  let weight = 0;
  if (def.auth) {
    authentic = !rng.chance(opt.fakeRate);
    const spec = def.auth;
    if (authentic) {
      mark = spec.mark;
      serial = makeSerial(spec, rng, true);
      weight = Math.round(spec.weight * (1 + rng.range(-0.012, 0.012)));
    } else {
      // 偽物は最低 1 つはボロが出る
      const tells = rng.shuffle(['mark', 'serial', 'weight'] as const).slice(0, rng.int(1, 3));
      mark = tells.includes('mark') ? rng.pick(spec.fakeMarks) : spec.mark;
      serial = makeSerial(spec, rng, !tells.includes('serial'));
      const dev = tells.includes('weight') ? rng.pick([-1, 1]) * rng.range(0.06, 0.22) : rng.range(-0.012, 0.012);
      weight = Math.round(spec.weight * (1 + dev));
    }
  }
  return {
    uid, defId: def.id, condition, dirt, dirtSeed: rng.int(1, 1e9), defects, working, accessories,
    authentic, mark, serial, weight, variant: rng.int(0, 3), cost: 0, price: null, tested: false, verdict: null,
    repaired: false, loc: { type: 'stock' }, day: opt.day,
  };
}

/** 推奨販売価格 (相場の 100%) */
export const suggestPrice = (v: number) => nicePrice(v);
