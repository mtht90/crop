/** 音源に追従するゲーム時計。performance.now() で補間しつつ、音源の位置へ滑らかに寄せる */
export class GameClock {
  private base = 0;
  private wallBase = performance.now();
  private running = false;

  now(): number {
    return this.running ? this.base + (performance.now() - this.wallBase) / 1000 : this.base;
  }

  /** イベントの timeStamp（performance.now 基準）をゲーム時刻に変換 */
  at(wallMs: number): number {
    if (!this.running) return this.base;
    return this.base + (wallMs - this.wallBase) / 1000;
  }

  get isRunning() {
    return this.running;
  }

  set(t: number) {
    this.base = t;
    this.wallBase = performance.now();
  }

  start() {
    if (this.running) return;
    this.wallBase = performance.now();
    this.running = true;
  }

  pause() {
    if (!this.running) return;
    this.base = this.now();
    this.running = false;
  }

  /** 音源の位置 media に合わせる */
  sync(media: number) {
    if (!this.running) {
      this.set(media);
      this.start();
      return;
    }
    const err = media - this.now();
    if (Math.abs(err) > 0.12) this.set(media);
    else this.base += err * 0.08;
  }
}
