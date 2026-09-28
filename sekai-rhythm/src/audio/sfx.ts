import { audioCtx } from './context';

export type SfxName = 'tap' | 'critical' | 'flick' | 'tick' | 'trace' | 'good';

/** 効果音をあらかじめ OfflineAudioContext で合成しておく（アセット不要・低遅延） */
export class Sfx {
  private buffers = new Map<SfxName, AudioBuffer>();
  private gain: GainNode;
  private lastPlay = new Map<SfxName, number>();

  constructor(volume: number) {
    const c = audioCtx();
    this.gain = c.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(c.destination);
  }

  set volume(v: number) {
    this.gain.gain.value = v;
  }

  async init(): Promise<void> {
    const sr = audioCtx().sampleRate;
    const render = async (dur: number, build: (c: OfflineAudioContext) => void) => {
      const c = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
      build(c);
      return c.startRendering();
    };
    const noiseSrc = (c: OfflineAudioContext) => {
      const b = c.createBuffer(1, c.length, sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource();
      s.buffer = b;
      return s;
    };
    const tone = (c: OfflineAudioContext, type: OscillatorType, f0: number, f1: number, t: number, peak: number, decay: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + decay);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + decay + 0.01);
    };
    const burst = (c: OfflineAudioContext, filterType: BiquadFilterType, f0: number, f1: number, peak: number, decay: number, q = 1) => {
      const n = noiseSrc(c);
      const f = c.createBiquadFilter();
      f.type = filterType;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, 0);
      f.frequency.exponentialRampToValueAtTime(f1, decay);
      const g = c.createGain();
      g.gain.setValueAtTime(peak, 0);
      g.gain.exponentialRampToValueAtTime(0.0001, decay);
      n.connect(f).connect(g).connect(c.destination);
      n.start();
    };

    const entries: [SfxName, Promise<AudioBuffer>][] = [
      [
        'tap',
        render(0.12, (c) => {
          tone(c, 'sine', 2200, 1400, 0, 0.35, 0.05);
          tone(c, 'triangle', 900, 500, 0, 0.25, 0.04);
          burst(c, 'highpass', 5000, 3000, 0.25, 0.03);
        }),
      ],
      [
        'critical',
        render(0.35, (c) => {
          tone(c, 'sine', 2637, 2637, 0, 0.3, 0.25);
          tone(c, 'sine', 3951, 3951, 0.01, 0.2, 0.3);
          tone(c, 'triangle', 1318, 900, 0, 0.3, 0.06);
          burst(c, 'highpass', 7000, 5000, 0.2, 0.08);
        }),
      ],
      [
        'flick',
        render(0.25, (c) => {
          burst(c, 'bandpass', 1500, 9000, 0.9, 0.16, 1.5);
          tone(c, 'sine', 1200, 2400, 0, 0.18, 0.08);
        }),
      ],
      [
        'tick',
        render(0.1, (c) => {
          tone(c, 'sine', 3200, 2800, 0, 0.16, 0.05);
        }),
      ],
      [
        'trace',
        render(0.08, (c) => {
          tone(c, 'sine', 2600, 2400, 0, 0.14, 0.04);
          burst(c, 'highpass', 6000, 4000, 0.1, 0.02);
        }),
      ],
      [
        'good',
        render(0.1, (c) => {
          tone(c, 'triangle', 700, 400, 0, 0.3, 0.05);
        }),
      ],
    ];
    for (const [name, p] of entries) this.buffers.set(name, await p);
  }

  play(name: SfxName, when = 0) {
    const c = audioCtx();
    const buf = this.buffers.get(name);
    if (!buf) return;
    // 同時に大量に鳴らさない
    const now = c.currentTime;
    if (when === 0 && now - (this.lastPlay.get(name) ?? -1) < 0.012) return;
    this.lastPlay.set(name, now);
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(this.gain);
    s.start(when);
  }
}
