// WebAudio による効果音・BGM 管理。音源はすべて public/assets/sounds（Kenney CC0 / OpenGameArt CC0）。

const SFX = {
  launch: ['chip-lay-1', 'chip-lay-2', 'chip-lay-3'],
  clink: ['chips-collide-1', 'chips-collide-2', 'chips-collide-3', 'chips-collide-4'],
  win: ['chips-handle-1', 'chips-handle-2', 'chips-handle-3'],
  stack: ['chips-stack-1', 'chips-stack-2', 'chips-stack-3'],
  checker: ['confirmation_002'],
  reelTick: ['tick_001', 'tick_002'],
  reelStop: ['impactMetal_light_001'],
  click: ['click_002'],
  error: ['switch_002'],
  reach: ['phaserUp3'],
  smallWin: ['jingles_PIZZI01'],
  bigWin: ['jingles_SAX02'],
  ballRelease: ['impactBell_heavy_000'],
  ballDrop: ['impactPlate_light_000'],
  jpChance: ['powerUp2'],
  jpTick: ['pepSound1'],
  jpWin: ['jingles_STEEL00'],
  jpMiss: ['threeTone1'],
  fanfare: ['jingles_HIT00'],
  start: ['jingles_NES03'],
} as const;

export type SfxName = keyof typeof SFX;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private bgmGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private lastPlayed = new Map<string, number>();
  private bgmSource: AudioBufferSourceNode | null = null;
  muted = false;

  constructor(private base: string) {}

  /** ユーザー操作後に呼ぶ（自動再生ポリシー対策） */
  async unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.22;
    this.bgmGain.connect(this.master);
    const names = new Set<string>(Object.values(SFX).flat());
    names.add('bgm_backup_plan');
    await Promise.all([...names].map((n) => this.load(n)));
    this.startBgm();
  }

  private async load(name: string): Promise<void> {
    if (!this.ctx) return;
    try {
      const res = await fetch(`${this.base}assets/sounds/${name}.mp3`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch (e) {
      console.warn('sound load failed', name, e);
    }
  }

  play(name: SfxName, opts: { volume?: number; rate?: number; minInterval?: number } = {}): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < (opts.minInterval ?? 0.03)) return;
    this.lastPlayed.set(name, now);
    const list = SFX[name];
    const buf = this.buffers.get(list[Math.floor(Math.random() * list.length)]);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  private startBgm(): void {
    if (!this.ctx || this.bgmSource) return;
    const buf = this.buffers.get('bgm_backup_plan');
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.bgmGain);
    src.start();
    this.bgmSource = src;
  }

  /** 演出中はBGMを下げる */
  duckBgm(seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.bgmGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.05, t + 0.2);
    g.setValueAtTime(0.05, t + seconds);
    g.linearRampToValueAtTime(0.22, t + seconds + 1);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.value = muted ? 0 : 1;
  }
}
