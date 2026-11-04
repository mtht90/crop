export interface ManaConfig {
  max: number;
  start: number;
  regenSeconds: number;
}

/** マナ（コスト）。小数で連続的に回復する。 */
export class ManaSystem {
  value: number;
  multiplier = 1;

  constructor(readonly config: ManaConfig) {
    this.value = config.start;
  }

  update(dt: number): void {
    this.value = Math.min(this.config.max, this.value + (dt / this.config.regenSeconds) * this.multiplier);
  }

  canAfford(cost: number): boolean {
    return this.value + 1e-9 >= cost;
  }

  /** あと何マナで使えるか（0 なら使用可能） */
  shortfall(cost: number): number {
    return Math.max(0, cost - this.value);
  }

  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.value = Math.max(0, this.value - cost);
    return true;
  }
}
