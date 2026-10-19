import { Save } from './Save';

/** Major pentatonic steps in semitones; chains climb this ladder so long links "sing". */
const PENTA = [0, 2, 4, 7, 9];
function pentaSemis(step: number): number {
  const oct = Math.floor(step / PENTA.length);
  return oct * 12 + PENTA[step % PENTA.length];
}
const semi = (s: number) => Math.pow(2, s / 12);

interface PlayOpts {
  vol?: number;
  rate?: number;
  delay?: number;
  pan?: number;
  /** Send amount into the reverb bus (0..1). */
  wet?: number;
}

class AudioEngine {
  ctx: AudioContext;
  private master: GainNode;
  private sfxBus: GainNode;
  private bgmBus: GainNode;
  private bgmFilter: BiquadFilterNode;
  private reverb: ConvolverNode;
  private reverbIn: GainNode;
  private noise: AudioBuffer;
  private buffers = new Map<string, AudioBuffer>();
  private bgm: { name: string; el: HTMLAudioElement; node: MediaElementAudioSourceNode; gain: GainNode } | null = null;
  private unlocked = false;
  private lastPlay = new Map<string, number>();

  constructor() {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master = c.createGain();
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.bgmFilter = c.createBiquadFilter();
    this.bgmFilter.type = 'lowpass';
    this.bgmFilter.frequency.value = 20000;
    this.bgmFilter.Q.value = 0.7;
    this.bgmBus = c.createGain();
    this.bgmFilter.connect(this.bgmBus).connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6, 2.8);
    this.reverbIn = c.createGain();
    this.reverbIn.gain.value = 0.32;
    this.reverbIn.connect(this.reverb).connect(this.sfxBus);
    this.noise = this.makeNoise(2);
    this.applyVolumes();
  }

  applyVolumes(): void {
    const s = Save.data.settings;
    this.sfxBus.gain.value = s.sfx;
    this.bgmBus.gain.value = s.bgm * 0.55;
  }

  /** Must be called from a user gesture (iOS/Chrome autoplay policy). */
  unlock(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (this.bgm?.el.paused) void this.bgm.el.play().catch(() => {});
    if (this.unlocked) return;
    this.unlocked = true;
    // Play a silent buffer to fully unlock iOS.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
  }

  async loadAll(map: Record<string, string>, onProgress?: (p: number) => void): Promise<void> {
    const entries = Object.entries(map);
    let done = 0;
    await Promise.all(
      entries.map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          const arr = await res.arrayBuffer();
          const buf = await this.ctx.decodeAudioData(arr);
          this.buffers.set(name, buf);
        } catch (e) {
          console.warn('audio load failed', name, e);
        }
        done++;
        onProgress?.(done / entries.length);
      }),
    );
  }

  private get now(): number {
    return this.ctx.currentTime;
  }

  private out(pan: number, wet: number): AudioNode {
    const g = this.ctx.createGain();
    let node: AudioNode = g;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.reverbIn);
    }
    return g;
  }

  play(name: string, o: PlayOpts = {}): void {
    const buf = this.buffers.get(name);
    if (!buf || this.ctx.state !== 'running') return;
    // Avoid phasey stacking of the exact same sample within a few ms.
    const t = performance.now();
    if ((this.lastPlay.get(name) ?? 0) > t - 18 && !o.delay) return;
    this.lastPlay.set(name, t);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = this.out(o.pan ?? 0, o.wet ?? 0.15) as GainNode;
    g.gain.value = o.vol ?? 1;
    src.connect(g);
    src.start(this.now + (o.delay ?? 0));
  }

  // ---------------------------------------------------------------- music
  // Music is streamed through <audio> elements instead of being decoded up front:
  // a decoded minute of stereo audio costs ~20MB, which is enough to get a mobile
  // WebView killed.
  private musicUrls = new Map<string, string>();

  registerMusic(map: Record<string, string>): void {
    for (const [k, v] of Object.entries(map)) this.musicUrls.set(k, v);
  }

  music(name: string, fade = 0.8, vol = 1): void {
    if (this.bgm?.name === name) return;
    this.stopMusic(fade);
    const url = this.musicUrls.get(name);
    if (!url) return;
    const el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    (el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = false;
    (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
    let node: MediaElementAudioSourceNode;
    try {
      node = this.ctx.createMediaElementSource(el);
    } catch {
      return;
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.now);
    g.gain.exponentialRampToValueAtTime(vol, this.now + fade);
    node.connect(g).connect(this.bgmFilter);
    void el.play().catch(() => {
      /* will start on the next user gesture via unlock() */
    });
    this.bgm = { name, el, node, gain: g };
  }

  stopMusic(fade = 0.6): void {
    if (!this.bgm) return;
    const { el, node, gain } = this.bgm;
    gain.gain.cancelScheduledValues(this.now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), this.now);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.now + fade);
    window.setTimeout(() => {
      el.pause();
      el.removeAttribute('src');
      el.load();
      node.disconnect();
      gain.disconnect();
    }, (fade + 0.05) * 1000);
    this.bgm = null;
  }

  musicRate(rate: number): void {
    if (this.bgm) this.bgm.el.playbackRate = rate;
  }

  /** Muffles the music (e.g. pause, cut-ins). freq 20000 = open. */
  musicFilter(freq: number, time = 0.25): void {
    const f = this.bgmFilter.frequency;
    f.cancelScheduledValues(this.now);
    f.setValueAtTime(f.value, this.now);
    f.exponentialRampToValueAtTime(Math.max(60, freq), this.now + time);
  }

  /** Temporarily dips the music so a big moment cuts through. */
  duck(amount = 0.35, hold = 0.4, release = 0.6): void {
    if (!this.bgm) return;
    const g = this.bgm.gain.gain;
    g.cancelScheduledValues(this.now);
    g.setValueAtTime(g.value, this.now);
    g.linearRampToValueAtTime(amount, this.now + 0.04);
    g.setValueAtTime(amount, this.now + hold);
    g.linearRampToValueAtTime(1, this.now + hold + release);
  }

  // ------------------------------------------------------------ synthesis
  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number, dest: AudioNode, freqEnd?: number): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    const g = this.ctx.createGain();
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private noiseBurst(t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, dest: AudioNode, q = 1): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private ok(): boolean {
    return this.ctx.state === 'running';
  }

  /** The note played when a piece joins the chain. step = index in chain. */
  link(step: number, pan = 0): void {
    if (!this.ok()) return;
    const t = this.now;
    const s = pentaSemis(Math.min(step, 22));
    const f = 523.25 * semi(s);
    const d = this.out(pan, 0.35);
    this.tone('sine', f, t, 0.32, 0.004, 0.32, d);
    this.tone('triangle', f * 2, t, 0.08, 0.002, 0.12, d);
    this.tone('sine', f * 3.01, t, 0.04, 0.002, 0.08, d);
    this.play('pluck1', { vol: 0.35, rate: semi(s - 5), pan, wet: 0.1 });
  }

  /** Short descending blip when backing out of the chain. */
  unlink(): void {
    if (!this.ok()) return;
    const d = this.out(0, 0.1);
    this.tone('sine', 700, this.now, 0.12, 0.003, 0.08, d, 420);
  }

  /** Bubble pop. step makes successive pops climb. size>1 for big pieces. */
  pop(step: number, size = 1, pan = 0): void {
    if (!this.ok()) return;
    const t = this.now;
    const s = pentaSemis(Math.min(step, 20));
    const base = 380 * semi(s) / Math.sqrt(size);
    const d = this.out(pan, 0.25);
    this.tone('sine', base, t, 0.4, 0.002, 0.09, d, base * 2.6);
    this.tone('square', base * 2, t, 0.03, 0.001, 0.03, d, base * 4);
    this.noiseBurst(t, 0.035, 0.18, 'highpass', 3000, 6000, d);
  }

  sparkle(pan = 0): void {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pan, 0.6);
    const notes = [24, 28, 31, 36];
    notes.forEach((n, i) => this.tone('sine', 523.25 * semi(n), t + i * 0.045, 0.08, 0.002, 0.25, d));
  }

  whoosh(dur = 0.45, up = true): void {
    if (!this.ok()) return;
    const d = this.out(0, 0.3);
    this.noiseBurst(this.now, dur, 0.5, 'bandpass', up ? 300 : 3000, up ? 4000 : 250, d, 1.4);
  }

  explosion(big = false): void {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(0, 0.35);
    this.noiseBurst(t, big ? 1.1 : 0.7, 0.9, 'lowpass', 5000, 120, d, 0.8);
    this.tone('sine', big ? 110 : 140, t, 0.9, 0.004, big ? 0.6 : 0.4, d, 35);
    this.tone('triangle', 60, t, 0.5, 0.004, 0.5, d, 30);
  }

  /** Rising synth sweep, used before fever/skills. */
  riser(dur = 0.8): void {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(0, 0.4);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(f).connect(g).connect(d);
    o.start(t);
    o.stop(t + dur + 0.1);
    this.noiseBurst(t, dur, 0.12, 'bandpass', 500, 8000, d, 2);
  }

  /** Bright major chord stab (fever start / big moments). */
  chord(root = 0): void {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(0, 0.5);
    [0, 4, 7, 12, 16].forEach((n, i) => {
      this.tone('sawtooth', 261.63 * semi(root + n), t + i * 0.012, 0.05, 0.01, 0.7, d);
      this.tone('sine', 261.63 * semi(root + n), t, 0.08, 0.01, 0.9, d);
    });
  }

  /** Snare-ish tick for drum rolls. */
  snare(vol = 0.4): void {
    if (!this.ok()) return;
    const d = this.out(0, 0.2);
    this.noiseBurst(this.now, 0.08, vol, 'highpass', 1500, 3000, d);
    this.tone('triangle', 220, this.now, vol * 0.5, 0.002, 0.05, d, 120);
  }

  coin(i = 0): void {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(0, 0.3);
    this.tone('square', 987.77 * semi(i % 3), t, 0.06, 0.002, 0.06, d);
    this.tone('square', 1318.5 * semi(i % 3), t + 0.06, 0.06, 0.002, 0.2, d);
  }

  /** Count-up tick with climbing pitch. */
  countTick(p: number): void {
    if (!this.ok()) return;
    const d = this.out(0, 0.05);
    this.tone('square', 600 + p * 900, this.now, 0.035, 0.001, 0.03, d);
  }

  // -------------------------------------------------------------- helpers
  private makeNoise(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const b = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
}

export const Sound = new AudioEngine();

export function haptic(ms: number | number[]): void {
  if (!Save.data.settings.haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
