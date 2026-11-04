import type { SupportEffect, SupportKind } from '../core/types';

export interface Buff {
  kind: SupportKind;
  value: number;
  remaining: number;
  duration: number;
}

export type StackingRule = 'refresh' | 'stack';

export interface BaseStats {
  damage: number;
  attackInterval: number;
  moveSpeed: number;
}

/** 回復・シールドを受け取れる対象 */
export interface Supportable {
  hp: number;
  maxHp: number;
  shield: number;
  buffs: BuffSet;
}

/** ユニット1体が持つ時間制バフの集合 */
export class BuffSet {
  buffs: Buff[] = [];

  /** 時間制バフを追加。同じ種類の重ねがけは stacking ルールに従う。 */
  add(kind: SupportKind, value: number, duration: number, stacking: StackingRule): Buff {
    const existing = this.buffs.find((b) => b.kind === kind);
    if (existing && stacking === 'refresh') {
      existing.remaining = Math.max(existing.remaining, duration);
      existing.duration = Math.max(existing.duration, duration);
      existing.value = Math.max(existing.value, value);
      return existing;
    }
    const buff = { kind, value, remaining: duration, duration };
    this.buffs.push(buff);
    return buff;
  }

  /** 時間を進め、切れたバフを返す */
  update(dt: number): Buff[] {
    const expired: Buff[] = [];
    for (const b of this.buffs) {
      b.remaining -= dt;
      if (b.remaining <= 0) expired.push(b);
    }
    if (expired.length) this.buffs = this.buffs.filter((b) => b.remaining > 0);
    return expired;
  }

  has(kind: SupportKind): boolean {
    return this.buffs.some((b) => b.kind === kind);
  }

  /** 種類ごとの効果量合計（stack 時は加算） */
  total(kind: SupportKind): number {
    let v = 0;
    for (const b of this.buffs) if (b.kind === kind) v += b.value;
    return v;
  }
}

/** 基礎値 × バフで現在の能力値を算出する（毎フレーム呼ぶ想定） */
export function computeStats(base: BaseStats, buffs: BuffSet): BaseStats {
  const atk = 1 + buffs.total('attack');
  const haste = 1 + buffs.total('haste');
  return {
    damage: base.damage * atk,
    attackInterval: base.attackInterval / haste,
    moveSpeed: base.moveSpeed * haste,
  };
}

/**
 * サポート効果を対象に適用する。
 * 戻り値は回復量（heal）またはシールド量（shield）。
 */
export function applySupport(target: Supportable, effect: SupportEffect, stacking: StackingRule): number {
  switch (effect.kind) {
    case 'heal': {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * effect.value);
      return target.hp - before;
    }
    case 'shield': {
      const amount = target.maxHp * effect.value;
      const hadShield = target.buffs.has('shield');
      target.buffs.add('shield', effect.value, effect.duration, stacking);
      if (stacking === 'stack' || !hadShield) target.shield += amount;
      else target.shield = Math.max(target.shield, amount);
      return amount;
    }
    case 'attack':
    case 'haste':
      target.buffs.add(effect.kind, effect.value, effect.duration, stacking);
      return effect.value;
  }
}

/** バフ更新。シールドの効果時間が切れたら残りシールドも消す。 */
export function updateBuffs(target: Supportable, dt: number): Buff[] {
  const expired = target.buffs.update(dt);
  if (expired.some((b) => b.kind === 'shield') && !target.buffs.has('shield')) target.shield = 0;
  return expired;
}
