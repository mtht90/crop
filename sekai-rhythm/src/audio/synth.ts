import { TimingMap } from '../core/chart';
import { audioCtx, noiseBuffer, outputLatency } from './context';
import { MusicSource } from './music';

/** 内蔵デモ曲：WebAudio でその場で演奏する J-POP 風トラック（王道進行） */

const PROG: number[][] = [
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 65], // G7
  [52, 55, 59, 62], // Em7
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 65], // G7
  [48, 52, 55, 59], // Cmaj7
  [48, 52, 55, 59],
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SynthMusic implements MusicSource {
  readonly kind = 'synth' as const;
  private ctx = audioCtx();
  private master: GainNode | null = null;
  private volume: number;
  private pos = 0;
  private startCtx = 0;
  private playing = false;
  private nextStep = 0;
  private timer: number | null = null;
  private melody: number[][] = [];

  constructor(
    private timing: TimingMap,
    private lengthBeats: number,
    seed: number,
    volume: number,
  ) {
    this.volume = volume;
    // 2小節ごとのメロディ（8分音符 x16、-1 = 休符）
    const r = rng(seed);
    let idx = 3;
    for (let phrase = 0; phrase < 4; phrase++) {
      const notes: number[] = [];
      for (let i = 0; i < 16; i++) {
        if (i % 4 !== 0 && r() < 0.3) {
          notes.push(-1);
          continue;
        }
        idx = Math.max(0, Math.min(PENTA.length - 1, idx + Math.floor(r() * 5) - 2));
        notes.push(PENTA[idx]);
      }
      this.melody.push(notes);
    }
  }

  async prepare(at: number): Promise<void> {
    this.pos = at;
  }

  duration(): number {
    return this.timing.beatToTime(this.lengthBeats + 4);
  }

  private stepTime(step: number): number {
    return this.timing.beatToTime(step / 4);
  }

  play() {
    if (this.playing) return;
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = (this.volume / 100) * 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.startCtx = c.currentTime + 0.06;
    this.playing = true;
    // 開始位置以降の最初の16分
    this.nextStep = Math.max(0, Math.ceil(this.timing.timeToBeat(this.pos) * 4 - 1e-6));
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  pause() {
    if (!this.playing) return;
    this.pos = this.currentPos();
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const m = this.master;
    if (m) {
      m.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      setTimeout(() => m.disconnect(), 100);
    }
    this.master = null;
  }

  seek(t: number) {
    const was = this.playing;
    if (was) this.pause();
    this.pos = t;
    if (was) this.play();
  }

  private currentPos(): number {
    return this.pos + (this.ctx.currentTime - this.startCtx);
  }

  mediaTime(): number | null {
    if (!this.playing || this.ctx.currentTime < this.startCtx) return null;
    return this.currentPos() - outputLatency(this.ctx);
  }

  stalled(): boolean {
    return this.playing && this.ctx.currentTime < this.startCtx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = (v / 100) * 0.8;
  }

  destroy() {
    this.pause();
  }

  private toCtx(t: number) {
    return this.startCtx + (t - this.pos);
  }

  private schedule() {
    if (!this.playing) return;
    const horizon = this.currentPos() + 0.2;
    while (this.stepTime(this.nextStep) < horizon) {
      const step = this.nextStep++;
      const t = this.stepTime(step);
      if (t >= this.pos - 0.001) this.playStep(step, this.toCtx(t));
    }
  }

  private playStep(step: number, t: number) {
    const endStep = this.lengthBeats * 4;
    if (step > endStep) return;
    const beatLen = this.stepTime(step + 4) - this.stepTime(step);
    const measure = Math.floor(step / 16);
    const inMeasure = step % 16;
    const chord = PROG[measure % PROG.length];
    if (step === endStep) {
      this.crash(t);
      this.kick(t);
      this.pad(t, chord.map((n) => n + 0), beatLen * 4);
      this.bass(t, chord[0] - 12, beatLen * 3);
      return;
    }
    const block = measure < 2 ? 'intro' : Math.floor((measure - 2) / 8) % 2 === 0 ? 'verse' : 'chorus';
    const lastOfBlock = measure >= 2 && (measure - 2) % 8 === 7;
    const firstOfBlock = measure >= 2 && (measure - 2) % 8 === 0;

    if (inMeasure === 0) this.pad(t, chord, beatLen * 4);
    if (block === 'intro') {
      if (step % 2 === 0) this.hat(t, false, 0.5);
      this.arp(t, chord, step, 0.5);
      if (measure === 1 && inMeasure >= 12) this.snare(t, 0.3 + (inMeasure - 12) * 0.1);
      return;
    }
    if (firstOfBlock && inMeasure === 0) this.crash(t);
    // ドラム
    if (inMeasure % 4 === 0) this.kick(t);
    if (block === 'chorus' && inMeasure === 10) this.kick(t);
    if (lastOfBlock && inMeasure >= 12) this.snare(t, 0.35 + (inMeasure - 12) * 0.12);
    else if (inMeasure === 4 || inMeasure === 12) this.snare(t, 0.6);
    if (step % 2 === 0) this.hat(t, block === 'chorus' && step % 4 === 2, 1);
    // ベース（8分）
    if (step % 2 === 0) {
      const oct = block === 'chorus' && step % 4 === 2 ? 12 : 0;
      this.bass(t, chord[0] - 12 + oct, beatLen * 0.45);
    }
    this.arp(t, chord, step, block === 'chorus' ? 0.8 : 0.6);
    // メロディ
    if (block === 'chorus' && step % 2 === 0) {
      const phrase = this.melody[Math.floor(measure / 2) % this.melody.length];
      const n = phrase[((measure % 2) * 16 + inMeasure) / 2];
      if (n > 0) this.lead(t, n, beatLen * 0.45);
    }
  }

  private out(): GainNode {
    return this.master!;
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noise(t: number, dur: number): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = noiseBuffer(this.ctx);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur + 0.05);
    return n;
  }

  private kick(t: number) {
    const o = this.osc('sine', 150, t, 0.35);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.9, 0.002, 0.3)).connect(this.out());
  }

  private snare(t: number, vol: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.7;
    this.noise(t, 0.2).connect(f).connect(this.env(t, 0.6 * vol, 0.001, 0.16)).connect(this.out());
    const o = this.osc('triangle', 210, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    o.connect(this.env(t, 0.35 * vol, 0.001, 0.1)).connect(this.out());
  }

  private hat(t: number, open: boolean, vol: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const d = open ? 0.22 : 0.04;
    this.noise(t, d).connect(f).connect(this.env(t, 0.16 * vol, 0.001, d)).connect(this.out());
  }

  private crash(t: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4500;
    this.noise(t, 1.6).connect(f).connect(this.env(t, 0.22, 0.002, 1.5)).connect(this.out());
  }

  private bass(t: number, midi: number, dur: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(250, t + dur);
    this.osc('sawtooth', mtof(midi), t, dur).connect(f).connect(this.env(t, 0.28, 0.005, dur)).connect(this.out());
  }

  private pad(t: number, chord: number[], dur: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.12);
    g.gain.setValueAtTime(0.05, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.out());
    for (const n of chord) {
      for (const det of [-7, 7]) {
        const o = this.osc('sawtooth', mtof(n + 12), t, dur);
        o.detune.value = det;
        o.connect(f);
      }
    }
  }

  private arp(t: number, chord: number[], step: number, vol: number) {
    const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    const n = chord[pattern[step % 8]] + 24;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    this.osc('square', mtof(n), t, 0.13).connect(f).connect(this.env(t, 0.045 * vol, 0.002, 0.12)).connect(this.out());
  }

  private lead(t: number, midi: number, dur: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 4200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.setValueAtTime(0.08, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    f.connect(g).connect(this.out());
    const a = this.osc('sawtooth', mtof(midi), t, dur + 0.1);
    const b = this.osc('square', mtof(midi) * 1.003, t, dur + 0.1);
    a.connect(f);
    b.connect(f);
  }
}
