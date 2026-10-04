/**
 * Sound effects: CC0 samples by Kenney (kenney.nl) where available, with a
 * synthesized fallback for cues without a sample (or if decoding fails).
 * BGM: CC0 chiptunes by Juhani Junkala (synthesized loop until they load).
 */
export type Sfx =
  | 'punch'
  | 'heavy'
  | 'shot'
  | 'bigshot'
  | 'guard'
  | 'guardbreak'
  | 'whoosh'
  | 'dash'
  | 'jump'
  | 'land'
  | 'beep'
  | 'go'
  | 'ko'
  | 'ringout'
  | 'ult'
  | 'reload'
  | 'select'
  | 'squeak';

const SAMPLES: Partial<Record<Sfx, { files: string[]; layer?: boolean; gain?: number }>> = {
  punch: { files: ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002', 'impactPunch_medium_003'] },
  heavy: { files: ['impactPunch_heavy_000', 'impactPunch_heavy_001', 'impactPunch_heavy_002'], gain: 1.2 },
  shot: { files: ['laserSmall_000', 'laserSmall_001', 'laserSmall_002'], gain: 0.5 },
  bigshot: { files: ['laserLarge_000', 'laserLarge_001'], gain: 0.8 },
  guard: { files: ['forceField_000', 'forceField_001'], gain: 0.7 },
  guardbreak: { files: ['impactGlass_heavy_000'] },
  land: { files: ['impactSoft_heavy_000', 'impactSoft_heavy_001'], gain: 0.6 },
  ko: { files: ['lowFrequency_explosion_000', 'explosionCrunch_000'], layer: true, gain: 1.2 },
  ringout: { files: ['phaserDown1'], gain: 0.7 },
  ult: { files: ['powerUp7'], gain: 0.8 },
  select: { files: ['select_001'], gain: 0.7 },
  beep: { files: ['tick_002'], gain: 0.8 },
  go: { files: ['confirmation_001'] },
  reload: { files: ['impactMetal_light_000'], gain: 0.6 },
};

export class AudioEngine {
  private buffers = new Map<string, AudioBuffer>();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer: number | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicKind: 'menu' | 'battle' | null = null;
  private nextNote = 0;
  private step = 0;
  volume = 0.7;
  musicVolume = 0.35;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void this.loadSamples();
  }

  private async loadSamples() {
    const ctx = this.ctx!;
    const names = new Set([...Object.values(SAMPLES).flatMap((s) => s!.files), 'bgm_menu', 'bgm_battle']);
    await Promise.all(
      [...names].map(async (n) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}assets/audio/${n}.mp3`);
          this.buffers.set(n, await ctx.decodeAudioData(await res.arrayBuffer()));
          // Swap the synthesized placeholder for the real track once it arrives.
          if (n === `bgm_${this.musicKind}` && this.musicTimer !== null) this.startMusic(this.musicKind!);
        } catch {
          /* fall back to the synthesized cue */
        }
      }),
    );
  }

  private playSample(name: Sfx, intensity: number) {
    const spec = SAMPLES[name];
    if (!spec) return false;
    const files = spec.layer ? spec.files : [spec.files[Math.floor(Math.random() * spec.files.length)]];
    const bufs = files.map((f) => this.buffers.get(f)).filter((b): b is AudioBuffer => !!b);
    if (!bufs.length) return false;
    const ctx = this.ctx!;
    for (const b of bufs) {
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = ctx.createGain();
      g.gain.value = (spec.gain ?? 1) * Math.min(1.4, intensity);
      src.connect(g).connect(this.sfxBus);
      src.start();
    }
    return true;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, when = 0, bus?: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, when = 0, bus?: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.003, peak, dur);
    src.connect(bq).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name: Sfx, intensity = 1) {
    if (!this.ctx) return;
    if (this.playSample(name, intensity)) return;
    const k = intensity;
    switch (name) {
      case 'punch':
        this.tone('sine', 180, 50, 0.12, 0.9 * k);
        this.burst(0.08, 0.6 * k, 'bandpass', 2200, 600, 0.8);
        break;
      case 'heavy':
        this.tone('sine', 140, 35, 0.35, 1.0);
        this.tone('square', 90, 40, 0.15, 0.25);
        this.burst(0.25, 0.8, 'lowpass', 4000, 200, 0.7);
        this.burst(0.06, 0.6, 'highpass', 3000, 3000);
        break;
      case 'shot':
        this.tone('square', 1400, 300, 0.07, 0.18);
        this.burst(0.06, 0.35, 'bandpass', 5000, 1500, 1.2);
        break;
      case 'bigshot':
        this.tone('sawtooth', 600, 60, 0.4, 0.4);
        this.burst(0.35, 0.7, 'lowpass', 6000, 300);
        break;
      case 'guard':
        this.tone('triangle', 1600, 1200, 0.18, 0.35);
        this.tone('sine', 2400, 2000, 0.12, 0.15);
        this.burst(0.05, 0.3, 'highpass', 4000, 4000);
        break;
      case 'guardbreak':
        this.burst(0.4, 0.8, 'bandpass', 3000, 400, 0.6);
        this.tone('triangle', 900, 200, 0.4, 0.4);
        break;
      case 'whoosh':
        this.burst(0.16, 0.25 * k, 'bandpass', 600, 2500, 1.5);
        break;
      case 'dash':
        this.burst(0.22, 0.35, 'bandpass', 400, 3000, 1.2);
        break;
      case 'jump':
        this.tone('sine', 300, 600, 0.12, 0.2);
        break;
      case 'land':
        this.tone('sine', 120, 50, 0.1, 0.4 * k);
        this.burst(0.08, 0.2 * k, 'lowpass', 800, 200);
        break;
      case 'beep':
        this.tone('square', 880, 880, 0.15, 0.2);
        break;
      case 'go':
        this.tone('square', 1320, 1320, 0.4, 0.25);
        this.tone('square', 660, 660, 0.4, 0.2);
        break;
      case 'ko':
        this.tone('sine', 100, 30, 1.0, 1.0);
        this.burst(0.8, 0.8, 'lowpass', 3000, 100);
        this.tone('sawtooth', 300, 80, 0.6, 0.25);
        break;
      case 'ringout':
        this.tone('sine', 1200, 200, 1.0, 0.35);
        break;
      case 'ult':
        for (let i = 0; i < 5; i++) this.tone('square', 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.08, 0.15, i * 0.05);
        this.burst(0.5, 0.4, 'bandpass', 500, 5000, 1);
        break;
      case 'reload':
        this.tone('square', 600, 600, 0.03, 0.15);
        this.tone('square', 900, 900, 0.03, 0.15, 0.12);
        break;
      case 'squeak':
        // Toy hammer "piko!": two quick rising chirps.
        this.tone('square', 900, 1800, 0.06, 0.25 * k);
        this.tone('sine', 1300, 2600, 0.08, 0.3 * k, 0.05);
        break;
      case 'select':
        this.tone('triangle', 660, 990, 0.1, 0.25);
        break;
    }
  }

  /** Simple upbeat chiptune-ish loop as placeholder BGM. */
  startMusic(kind: 'menu' | 'battle') {
    this.musicKind = kind;
    if (!this.ctx) return;
    const track = this.buffers.get(`bgm_${kind}`);
    if (track) {
      // CC0 chiptune by Juhani Junkala, looped.
      this.stopMusic();
      const src = this.ctx.createBufferSource();
      src.buffer = track;
      src.loop = true;
      // Skip MP3 encoder padding at the edges for a cleaner loop.
      src.loopStart = 0.05;
      src.loopEnd = Math.max(0.1, track.duration - 0.05);
      src.connect(this.musicBus);
      src.start(0, 0.05);
      this.musicSource = src;
      return;
    }
    if (!this.ctx) return;
    this.stopMusic();
    const ctx = this.ctx;
    const bpm = kind === 'battle' ? 150 : 112;
    const stepDur = 60 / bpm / 4;
    const prog = kind === 'battle' ? [0, 0, 5, 3] : [0, 5, 3, 4];
    const scale = [0, 2, 4, 5, 7, 9, 11];
    const root = kind === 'battle' ? 45 : 50; // MIDI
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    this.nextNote = ctx.currentTime + 0.1;
    this.step = 0;
    const schedule = () => {
      while (this.nextNote < ctx.currentTime + 0.2) {
        const t = this.nextNote - ctx.currentTime;
        const bar = Math.floor(this.step / 16) % prog.length;
        const s16 = this.step % 16;
        const chordRoot = root + scale[prog[bar] % 7] + (prog[bar] >= 7 ? 12 : 0);
        // Bass on 8ths.
        if (s16 % 2 === 0) this.tone('triangle', mtof(chordRoot - 12 + (s16 % 8 === 6 ? 7 : 0)), mtof(chordRoot - 12), stepDur * 1.6, 0.35, t, this.musicBus);
        // Arpeggio.
        if (kind === 'battle' || s16 % 2 === 0) {
          const arp = [0, 4, 7, 12, 7, 4][s16 % 6];
          this.tone('square', mtof(chordRoot + 12 + arp), mtof(chordRoot + 12 + arp), stepDur * 0.8, 0.06, t, this.musicBus);
        }
        // Drums.
        if (s16 % 4 === 0) this.tone('sine', 150, 40, 0.12, 0.6, t, this.musicBus);
        if (kind === 'battle' && s16 % 8 === 4) this.burst(0.12, 0.35, 'bandpass', 1800, 900, 0.8, t, this.musicBus);
        if (s16 % 2 === 1) this.burst(0.03, 0.08, 'highpass', 8000, 8000, 1, t, this.musicBus);
        this.nextNote += stepDur;
        this.step++;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 50);
  }

  stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
      this.musicSource = null;
    }
  }
}

export const audio = new AudioEngine();
