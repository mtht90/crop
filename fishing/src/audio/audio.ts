/**
 * 環境音・効果音・BGM。MVPでは WebAudio で合成している。
 * public/assets/audio/<name>.mp3 があれば効果音・BGMはそのファイルを優先して鳴らす（素材差し替え用）。
 */
type Mood = 'day' | 'night' | 'storm' | 'title';

const SCALES: Record<Mood, number[]> = {
  day: [0, 2, 4, 7, 9],
  night: [0, 3, 5, 7, 10],
  storm: [0, 1, 5, 7, 8],
  title: [0, 2, 4, 7, 9],
};
const PROGRESSIONS: Record<Mood, number[][]> = {
  day: [
    [0, 4, 7, 11],
    [5, 9, 12, 16],
    [9, 12, 16, 19],
    [7, 11, 14, 17],
  ],
  night: [
    [0, 3, 7, 10],
    [5, 8, 12, 15],
    [3, 7, 10, 14],
    [8, 12, 15, 19],
  ],
  storm: [
    [0, 3, 7],
    [1, 5, 8],
    [0, 3, 7],
    [-2, 3, 7],
  ],
  title: [
    [0, 4, 7, 11],
    [9, 12, 16, 19],
    [5, 9, 12, 16],
    [7, 11, 14, 17],
  ],
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private bgm!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private wind!: GainNode;
  private windFilter!: BiquadFilterNode;
  private lap!: GainNode;
  private rain!: GainNode;
  private reelGain!: GainNode;
  private dragGain!: GainNode;
  private dragOsc!: OscillatorNode;
  private reelRate = 0;
  private reelNext = 0;
  private mood: Mood = 'title';
  private bgmStep = 0;
  private bgmNext = 0;
  private night = 0;
  private files = new Map<string, AudioBuffer | null>();
  private volumes = { master: 0.8, bgm: 0.5, sfx: 0.8 };

  /** 最初のユーザー操作で呼ぶ */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = this.gain(this.master, 1);
    this.bgm = this.gain(this.master, 0.5);
    this.amb = this.gain(this.master, 0.9);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 風：ブラウンノイズ風に低域へ
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 380;
    this.wind = this.gain(this.amb, 0.0);
    this.loopNoise(this.windFilter);
    this.windFilter.connect(this.wind);
    // 岸に打ち寄せる水音
    const lapF = ctx.createBiquadFilter();
    lapF.type = 'bandpass';
    lapF.frequency.value = 700;
    lapF.Q.value = 0.8;
    this.lap = this.gain(this.amb, 0);
    const lapLfo = ctx.createGain();
    lapLfo.gain.value = 0;
    this.loopNoise(lapF);
    lapF.connect(lapLfo).connect(this.lap);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(lapLfo.gain);
    lapLfo.gain.value = 0.5;
    lfo.start();
    // 雨
    const rainF = ctx.createBiquadFilter();
    rainF.type = 'highpass';
    rainF.frequency.value = 1800;
    this.rain = this.gain(this.amb, 0);
    this.loopNoise(rainF);
    rainF.connect(this.rain);
    // リール音（クリック）・ドラグ音
    this.reelGain = this.gain(this.sfx, 0.5);
    this.dragGain = this.gain(this.sfx, 0);
    this.dragOsc = ctx.createOscillator();
    this.dragOsc.type = 'sawtooth';
    this.dragOsc.frequency.value = 55;
    const dragF = ctx.createBiquadFilter();
    dragF.type = 'bandpass';
    dragF.frequency.value = 2600;
    dragF.Q.value = 2;
    const dragNoise = ctx.createBiquadFilter();
    dragNoise.type = 'bandpass';
    dragNoise.frequency.value = 3200;
    this.loopNoise(dragNoise);
    dragNoise.connect(this.dragGain);
    this.dragOsc.connect(dragF).connect(this.dragGain);
    this.dragOsc.start();
  }

  setVolumes(v: { master: number; bgm: number; sfx: number }): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.bgm.gain.value = this.volumes.bgm * 0.5;
    this.sfx.gain.value = this.volumes.sfx;
  }

  private gain(dest: AudioNode, v: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  private loopNoise(dest: AudioNode): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    src.connect(dest);
  }

  /** 外部音源（public/assets/audio/<name>.mp3）を探す */
  private async file(name: string): Promise<AudioBuffer | null> {
    if (this.files.has(name)) return this.files.get(name)!;
    this.files.set(name, null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/audio/${name}.mp3`);
      if (!res.ok || !res.headers.get('content-type')?.includes('audio')) return null;
      const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      this.files.set(name, buf);
      return buf;
    } catch {
      return null;
    }
  }

  private playFile(name: string, synth: () => void, vol = 1): void {
    if (!this.ctx) return;
    const buf = this.files.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain(this.sfx, vol));
      src.start();
      return;
    }
    if (!this.files.has(name)) void this.file(name);
    synth();
  }

  setAmbient(o: { wind: number; rain: number; night: number; water: number }): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.gain.setTargetAtTime(0.05 + o.wind * 0.35, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(300 + o.wind * 500, t, 0.5);
    this.rain.gain.setTargetAtTime(o.rain * 0.22, t, 0.5);
    this.lap.gain.setTargetAtTime(o.water * (0.06 + o.wind * 0.08), t, 0.5);
    this.night = o.night;
  }

  setMood(m: Mood): void {
    this.mood = m;
  }

  /** 毎フレーム呼ぶ：BGM・リール音・環境の小さな音のスケジュール */
  tick(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // リールのクリック音
    if (this.reelRate > 0) {
      if (this.reelNext < now) this.reelNext = now;
      while (this.reelNext < now + 0.1) {
        this.click(this.reelNext, 0.05, 4200 + Math.random() * 400);
        this.reelNext += 1 / (6 + this.reelRate * 30);
      }
    }
    // 生き物の声
    if (Math.random() < 0.004) {
      if (this.night > 0.6) this.cricket();
      else if (this.night < 0.3 && this.mood !== 'storm') this.bird();
    }
    // BGM（ゆったりした生成音楽）
    if (this.bgmNext < now) this.bgmNext = now + 0.1;
    while (this.bgmNext < now + 0.3) {
      this.bgmBeat(this.bgmNext);
      this.bgmNext += this.mood === 'storm' ? 0.42 : 0.6;
    }
  }

  private bgmBeat(t: number): void {
    const step = this.bgmStep++;
    const prog = PROGRESSIONS[this.mood];
    const chord = prog[Math.floor(step / 8) % prog.length];
    const root = this.mood === 'night' ? 57 : this.mood === 'storm' ? 50 : 60;
    if (step % 8 === 0) {
      for (const n of chord) this.pad(t, root - 12 + n, 4.6, 0.05);
      this.pad(t, root - 24 + chord[0], 4.6, 0.06);
    }
    const density = this.mood === 'storm' ? 0.55 : this.mood === 'night' ? 0.28 : 0.4;
    if (Math.random() < density) {
      const sc = SCALES[this.mood];
      const n = root + sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0);
      this.pluck(t, n, this.mood === 'storm' ? 0.07 : 0.09);
    }
  }

  private midi(n: number): number {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  private pad(t: number, note: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = this.midi(note);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = this.midi(note) * 1.003;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.bgm);
    o.start(t);
    o2.start(t);
    o.stop(t + dur);
    o2.stop(t + dur);
  }

  private pluck(t: number, note: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = this.midi(note);
    const h = ctx.createOscillator();
    h.type = 'sine';
    h.frequency.value = this.midi(note) * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    o.connect(g);
    h.connect(hg).connect(g);
    g.connect(this.bgm);
    o.start(t);
    h.start(t);
    o.stop(t + 1.7);
    h.stop(t + 1.7);
  }

  private click(t: number, vol: number, freq: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(this.reelGain);
    src.start(t, Math.random());
    src.stop(t + 0.04);
  }

  private noiseBurst(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, sweepTo?: number, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private cricket(): void {
    const t = this.ctx!.currentTime;
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 6; i++) this.tone(t + i * 0.07, f, 0.04, 0.012, 'sine', this.amb);
  }

  private bird(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const st = t + i * 0.16;
      const f = 2200 + Math.random() * 1500;
      o.frequency.setValueAtTime(f, st);
      o.frequency.exponentialRampToValueAtTime(f * 1.4, st + 0.08);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.02, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
      o.connect(g).connect(this.amb);
      o.start(st);
      o.stop(st + 0.15);
    }
  }

  // ---------- 効果音 ----------
  cast(): void {
    this.playFile('cast', () => this.noiseBurst(this.ctx!.currentTime, 0.45, 0.25, 'bandpass', 1800, 500));
  }

  splash(size = 1): void {
    this.playFile('splash', () => {
      const t = this.ctx!.currentTime;
      this.noiseBurst(t, 0.25 + size * 0.3, 0.2 + size * 0.25, 'lowpass', 1600 + size * 800, 300);
      this.tone(t, 180 / (0.5 + size), 0.15, 0.08 * size);
    });
  }

  nibble(): void {
    this.playFile('nibble', () => this.tone(this.ctx!.currentTime, 900, 0.05, 0.06, 'triangle'));
  }

  bite(): void {
    this.playFile('bite', () => {
      const t = this.ctx!.currentTime;
      this.tone(t, 600, 0.08, 0.15, 'square');
      this.tone(t + 0.09, 800, 0.1, 0.12, 'square');
    });
  }

  hookset(): void {
    this.playFile('hookset', () => this.noiseBurst(this.ctx!.currentTime, 0.18, 0.3, 'highpass', 1500));
  }

  snap(): void {
    this.playFile('snap', () => {
      const t = this.ctx!.currentTime;
      this.tone(t, 1800, 0.06, 0.3, 'square');
      this.noiseBurst(t, 0.2, 0.35, 'highpass', 4000);
      this.tone(t + 0.1, 220, 0.5, 0.12, 'sawtooth');
      this.tone(t + 0.35, 165, 0.6, 0.1, 'sawtooth');
    });
  }

  miss(): void {
    const t = this.ctx?.currentTime;
    if (t === undefined) return;
    this.tone(t, 400, 0.15, 0.08, 'triangle');
    this.tone(t + 0.15, 300, 0.25, 0.08, 'triangle');
  }

  land(rarity: number): void {
    this.playFile('land', () => {
      const t = this.ctx!.currentTime;
      this.noiseBurst(t, 0.5, 0.35, 'lowpass', 2000, 300);
      const notes = rarity >= 3 ? [72, 76, 79, 84, 88, 91] : rarity >= 2 ? [72, 76, 79, 84] : [72, 76, 79];
      notes.forEach((n, i) => this.tone(t + 0.35 + i * 0.09, this.midi(n), 0.6, 0.12, 'triangle'));
    });
  }

  sparkle(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) this.tone(t + 0.9 + i * 0.06, this.midi(84 + ((i * 5) % 12)), 0.4, 0.06, 'sine');
  }

  coin(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 1320, 0.08, 0.08, 'square');
    this.tone(t + 0.07, 1760, 0.18, 0.08, 'square');
  }

  ui(): void {
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 700, 0.05, 0.05, 'triangle');
  }

  thunder(delay: number, power: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    this.noiseBurst(t, 2.5 + power, 0.5 * power, 'lowpass', 300, 60, this.amb);
    this.noiseBurst(t, 0.4, 0.3 * power, 'lowpass', 1200, 200, this.amb);
  }

  /** 巻き取り速度 0..1（0で停止） */
  setReel(rate: number): void {
    this.reelRate = rate;
  }

  /** ドラグが出ている強さ 0..1 */
  setDrag(level: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.dragGain.gain.setTargetAtTime(level * 0.12, t, 0.03);
    this.dragOsc.frequency.setTargetAtTime(40 + level * 50, t, 0.05);
  }
}
