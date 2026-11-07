import { assets, assetUrl } from './assets/assets';
import { SOUNDS } from './assets/visuals';

/**
 * 効果音・BGM（Web Audio）。ブラウザの制限で、最初のタップ／クリックまでは音が鳴らない。
 * 同じ音が短時間に重なりすぎないよう、音ごとに最短間隔を設ける。
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastPlayed = new Map<string, number>();
  private music: { el: HTMLAudioElement; name: string } | null = null;
  private wantedMusic: string | null = null;
  muted = false;

  /** 最初のユーザー操作で呼ぶ */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.ctx.destination);
    void this.loadAll();
    if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx!;
    await Promise.all(
      SOUNDS.map(async (name) => {
        try {
          const res = await fetch(assetUrl(`sfx/${name}.ogg`));
          if (!res.ok) return;
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* 素材がない・形式に対応していない場合は鳴らさない */
        }
      }),
    );
  }

  play(name: string, volume = 1, minIntervalMs = 40, detune = 0): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < minIntervalMs) return;
    this.lastPlayed.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.detune.value = detune + (Math.random() - 0.5) * 120;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** BGM（public/assets/game/bgm/<name>.mp3 があれば流す。魔王魂の曲を置く想定） */
  playMusic(name: string | null): void {
    this.wantedMusic = name;
    if (!this.ctx || !this.musicGain) return;
    if (this.music?.name === name) return;
    this.music?.el.pause();
    this.music = null;
    if (!name || this.muted || !assets.bgm.includes(name)) return;
    const el = new Audio(assetUrl(`bgm/${name}.mp3`));
    el.loop = true;
    el.addEventListener('error', () => undefined);
    try {
      this.ctx.createMediaElementSource(el).connect(this.musicGain);
    } catch {
      /* 接続できない環境では音量調整なしで流す */
    }
    void el.play().catch(() => undefined);
    this.music = { el, name };
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.music?.el.pause();
    else void this.music?.el.play().catch(() => undefined);
    return this.muted;
  }
}

export const audio = new AudioManager();
