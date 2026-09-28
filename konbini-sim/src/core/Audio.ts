import * as THREE from 'three';
import type { Assets, SfxId } from './Assets';

type Loop = { stop: () => void; setVolume: (v: number) => void; setPosition?: (p: THREE.Vector3) => void };

/**
 * WebAudio based sound system.
 * - Recorded CC0 samples (footsteps, impacts, coins …) are played from buffers.
 * - Store-specific sounds (door chime, barcode beep, fryer, fluorescent hum,
 *   in-store music) are synthesised so they are original and royalty free.
 */
export class Audio {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  ambBus: GainNode;
  private buffers = new Map<SfxId, AudioBuffer>();
  private noiseBuf: AudioBuffer;
  private listenerPos = new THREE.Vector3();
  private music: Loop | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.bus(0.9);
    this.musicBus = this.bus(0.25);
    this.ambBus = this.bus(0.6);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private bus(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.master);
    return g;
  }

  async decode(assets: Assets): Promise<void> {
    await Promise.all(
      [...assets.sfx.entries()].map(async ([id, ab]) => {
        try {
          this.buffers.set(id, await this.ctx.decodeAudioData(ab.slice(0)));
        } catch {
          /* unsupported codec – sound simply stays silent */
        }
      }),
    );
  }

  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setVolumes(master: number, music: number): void {
    this.master.gain.value = master;
    this.musicBus.gain.value = 0.25 * music;
  }

  updateListener(cam: THREE.Camera): void {
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(this.listenerPos);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  private spatial(pos?: THREE.Vector3, refDistance = 1.5): AudioNode {
    if (!pos) return this.sfxBus;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.2;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.sfxBus);
    return p;
  }

  play(id: SfxId, opts: { pos?: THREE.Vector3; volume?: number; rate?: number } = {}): void {
    const buf = this.buffers.get(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.spatial(opts.pos));
    src.start();
  }

  // ---------------------------------------------------------------- synths

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  /** Original two-phrase entrance chime (bell-like FM tones). */
  doorChime(pos?: THREE.Vector3): void {
    const dest = this.spatial(pos, 3);
    const t = this.ctx.currentTime + 0.02;
    const notes = [76, 72, 74, 67, 67, 74, 76, 72];
    notes.forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      const st = t + i * 0.26;
      this.tone(f, st, 1.1, 'sine', 0.16, dest);
      this.tone(f * 2.76, st, 0.35, 'sine', 0.03, dest); // inharmonic partial -> bell colour
    });
  }

  scanBeep(pos?: THREE.Vector3): void {
    const t = this.ctx.currentTime;
    this.tone(2350, t, 0.09, 'square', 0.05, this.spatial(pos));
  }

  errorBuzz(): void {
    const t = this.ctx.currentTime;
    this.tone(180, t, 0.25, 'sawtooth', 0.06, this.sfxBus);
    this.tone(150, t + 0.12, 0.25, 'sawtooth', 0.06, this.sfxBus);
  }

  registerOpen(pos?: THREE.Vector3): void {
    const t = this.ctx.currentTime;
    const d = this.spatial(pos);
    this.tone(1320, t, 0.12, 'triangle', 0.08, d);
    this.tone(1760, t + 0.1, 0.18, 'triangle', 0.08, d);
    this.play('drawer', { pos, volume: 0.6 });
  }

  printer(pos?: THREE.Vector3): void {
    const n = this.noise(0.6, 2500, 'bandpass', 0.12, pos);
    setTimeout(() => n.stop(), 600);
  }

  uiConfirm(): void {
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.1, 'sine', 0.08, this.sfxBus);
    this.tone(1320, t + 0.07, 0.14, 'sine', 0.08, this.sfxBus);
  }

  cashIn(): void {
    const t = this.ctx.currentTime;
    this.tone(1568, t, 0.25, 'sine', 0.07, this.sfxBus);
    this.tone(2093, t + 0.08, 0.4, 'sine', 0.07, this.sfxBus);
    this.play('coins', { volume: 0.7 });
  }

  noise(dur: number, freq: number, type: BiquadFilterType, vol: number, pos?: THREE.Vector3, q = 1): Loop {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(pos ? this.spatial(pos, 2) : this.ambBus);
    src.start();
    if (dur > 0) src.stop(this.ctx.currentTime + dur);
    return { stop: () => src.stop(), setVolume: (v) => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1) };
  }

  /** Crackling oil. Volume follows `setVolume` (0 = idle, 1 = frying). */
  fryerLoop(pos: THREE.Vector3): Loop {
    const base = this.noise(0, 4200, 'highpass', 0, pos, 0.5);
    let alive = true;
    let level = 0;
    const g = this.ctx.createGain();
    g.connect(this.spatial(pos, 2));
    const crackle = () => {
      if (!alive) return;
      if (level > 0.01) {
        const t = this.ctx.currentTime;
        for (let i = 0; i < 6; i++) {
          const s = this.ctx.createBufferSource();
          s.buffer = this.noiseBuf;
          const ff = this.ctx.createBiquadFilter();
          ff.type = 'bandpass';
          ff.frequency.value = 2000 + Math.random() * 5000;
          const gg = this.ctx.createGain();
          const st = t + Math.random() * 0.1;
          gg.gain.setValueAtTime(0.0001, st);
          gg.gain.linearRampToValueAtTime(0.25 * level * Math.random(), st + 0.003);
          gg.gain.exponentialRampToValueAtTime(0.0001, st + 0.03);
          s.connect(ff).connect(gg).connect(g);
          s.start(st, Math.random());
          s.stop(st + 0.05);
        }
      }
      setTimeout(crackle, 100);
    };
    crackle();
    return {
      stop: () => {
        alive = false;
        base.stop();
      },
      setVolume: (v) => {
        level = v;
        base.setVolume(v * 0.05);
      },
    };
  }

  /** Fluorescent-light + refrigeration hum that sits under everything. */
  ambience(): Loop {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(1, t + 2);
    g.connect(this.ambBus);
    const oscs: OscillatorNode[] = [];
    for (const [f, v] of [[100, 0.012], [200, 0.006], [300, 0.003], [120, 0.004]] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start();
      oscs.push(o);
    }
    const air = this.noise(0, 500, 'lowpass', 0.012);
    return {
      stop: () => {
        oscs.forEach((o) => o.stop());
        air.stop();
      },
      setVolume: (v) => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3),
    };
  }

  rainLoop(): Loop {
    const a = this.noise(0, 1800, 'lowpass', 0, undefined, 0.3);
    const b = this.noise(0, 6000, 'highpass', 0, undefined, 0.3);
    return {
      stop: () => {
        a.stop();
        b.stop();
      },
      setVolume: (v) => {
        a.setVolume(v * 0.22);
        b.setVolume(v * 0.05);
      },
    };
  }

  /**
   * Gentle generative in-store music: a looping jazzy chord progression with
   * soft electric-piano voicing and a walking bass. Entirely procedural.
   */
  startMusic(): void {
    if (this.music) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    out.connect(lp).connect(this.musicBus);
    const prog = [
      [62, 65, 69, 72], // Dm9-ish
      [67, 71, 74, 77], // G7
      [60, 64, 67, 71], // Cmaj7
      [57, 60, 64, 67], // Am7
      [65, 69, 72, 76], // Fmaj7
      [64, 67, 71, 74], // Em7
      [62, 65, 69, 72], // Dm7
      [67, 71, 74, 77], // G7
    ];
    const bpm = 92;
    const beat = 60 / bpm;
    let bar = 0;
    let next = ctx.currentTime + 0.2;
    let alive = true;
    const ep = (midi: number, t: number, dur: number, vol: number) => {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const m = ctx.createOscillator();
      m.frequency.value = f * 2;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.2, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
      m.connect(mg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      m.start(t);
      o.stop(t + dur + 0.05);
      m.stop(t + dur + 0.05);
    };
    const schedule = () => {
      if (!alive) return;
      while (next < ctx.currentTime + 1.5) {
        const chord = prog[bar % prog.length];
        // comp: two chord hits per bar with a little swing
        ep(chord[0], next, beat * 1.8, 0.05);
        chord.slice(1).forEach((n, i) => ep(n, next + i * 0.012, beat * 1.8, 0.035));
        chord.slice(1).forEach((n, i) => ep(n, next + beat * 2.62 + i * 0.01, beat * 1.2, 0.028));
        // bass walk
        const root = chord[0] - 24;
        [0, 7, 12, 10].forEach((iv, i) => ep(root + iv, next + i * beat, beat * 0.9, 0.09));
        // occasional melody note
        if (Math.random() < 0.7) {
          const mel = chord[Math.floor(Math.random() * 4)] + 12;
          ep(mel, next + beat * (Math.random() < 0.5 ? 1.5 : 3), beat * 1.5, 0.03);
        }
        next += beat * 4;
        bar++;
      }
      setTimeout(schedule, 400);
    };
    schedule();
    this.music = { stop: () => (alive = false), setVolume: (v) => (out.gain.value = v) };
  }

  stopMusic(): void {
    this.music?.stop();
    this.music = null;
  }

  carPass(): void {
    const n = this.noise(4, 300, 'lowpass', 0);
    const t = this.ctx.currentTime;
    n.setVolume(0);
    // swell up then fade: the returned setVolume uses setTargetAtTime
    setTimeout(() => n.setVolume(0.25), 50);
    setTimeout(() => n.setVolume(0.0), 2200);
    void t;
  }
}
