/** WebAudio wrapper. All sounds are external CC0 files (see CREDITS). */
export class Audio {
  ctx: AudioContext;
  master: GainNode;
  buffers = new Map<string, AudioBuffer>();
  private wind?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };
  private music?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };
  private scrape?: { src: AudioBufferSourceNode; gain: GainNode };
  muted = false;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
  }

  async load(raw: Record<string, ArrayBuffer>) {
    await Promise.all(Object.entries(raw).map(async ([k, b]) => {
      try { this.buffers.set(k, await this.ctx.decodeAudioData(b.slice(0))); } catch (e) { console.warn('audio decode failed', k); }
    }));
  }

  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  play(name: string, { vol = 1, rate = 1, pan = 0, detune = 0 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master);
    src.start();
    return src;
  }

  private loop(name: string, vol: number) {
    const buf = this.buffers.get(name);
    if (!buf) return undefined;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 20000;
    const gain = this.ctx.createGain(); gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { src, gain, filter };
  }

  private started = false;
  startLoops() {
    this.started = true;
    if (!this.wind) this.wind = this.loop('wind.mp3', 0);
    if (!this.music) this.music = this.loop('music_dnb.mp3', 0.0);
    if (!this.scrape) {
      const l = this.loop('sfx_noise_01.mp3', 0);
      if (l) this.scrape = { src: l.src, gain: l.gain };
    }
  }

  /** speed01: 0..1, sliding bool, musicLevel 0..1, muffled for slow-mo/pause */
  update(speed01: number, sliding: boolean, musicLevel: number, muffled: boolean) {
    const t = this.ctx.currentTime;
    if (this.started && !this.music && this.buffers.has('music_dnb.mp3')) this.music = this.loop('music_dnb.mp3', 0);
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(0.15 + speed01 * speed01 * 1.1, t, 0.1);
      this.wind.filter.frequency.setTargetAtTime(500 + speed01 * 7000, t, 0.1);
      this.wind.src.playbackRate.setTargetAtTime(0.8 + speed01 * 0.6, t, 0.2);
    }
    if (this.music) {
      this.music.gain.gain.setTargetAtTime(musicLevel * 0.55, t, 0.3);
      this.music.filter.frequency.setTargetAtTime(muffled ? 600 : 20000, t, 0.15);
    }
    if (this.scrape) {
      this.scrape.gain.gain.setTargetAtTime(sliding ? 0.35 : 0, t, 0.05);
      this.scrape.src.playbackRate.setTargetAtTime(0.6 + speed01 * 0.5, t, 0.1);
    }
  }

  footstep(kind: 'concrete' | 'metal' | 'dirt', speed01: number) {
    const i = 1 + Math.floor(Math.random() * 5);
    const rate = kind === 'metal' ? 1.25 + Math.random() * 0.1 : kind === 'dirt' ? 0.8 + Math.random() * 0.1 : 1 + Math.random() * 0.12;
    this.play(`0${i}-footstep.mp3`, { vol: 0.35 + speed01 * 0.3, rate, pan: (Math.random() - 0.5) * 0.2 });
    if (kind === 'metal') this.play('sfx_metal_04.mp3', { vol: 0.05, rate: 2 + Math.random() * 0.3 });
  }

  toggleMute() { this.muted = !this.muted; this.master.gain.value = this.muted ? 0 : 0.8; }
}
