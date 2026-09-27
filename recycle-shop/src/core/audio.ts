import { ASSET_ROOT } from './assets';

type SfxName =
  | 'pickup' | 'place' | 'place2' | 'remove' | 'rotate' | 'toggle' | 'coin' | 'success' | 'swap' | 'land'
  | 'press' | 'release' | 'break' | 'jump' | 'equip' | 'thud';

const SFX_FILES: Record<SfxName, string> = {
  pickup: 'placement-a.ogg',
  place: 'placement-b.ogg',
  place2: 'placement-c.ogg',
  remove: 'removal-a.ogg',
  rotate: 'rotate.ogg',
  toggle: 'toggle.ogg',
  coin: 'plat-coin.ogg',
  success: 'tile-match.ogg',
  swap: 'tile-swap.ogg',
  land: 'tile-land.ogg',
  press: 'button-press.ogg',
  release: 'button-release.ogg',
  break: 'plat-break.ogg',
  jump: 'plat-jump.ogg',
  equip: 'fps-weapon_change.ogg',
  thud: 'plat-land.ogg',
};

/**
 * WebAudio ベースのサウンド管理。
 * 効果音は Kenney / three.js の外部素材。ドアベル・レジ音など素材が無いものだけ簡易シンセで補う。
 */
class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  volumes = { master: 0.8, sfx: 0.9, music: 0.35, ambience: 0.5 };

  /** ユーザー操作後に呼ぶ (自動再生ポリシー対策) */
  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    this.ambBus = this.ctx.createGain(); this.ambBus.connect(this.master);
    this.applyVolumes();
    const files = new Set([...Object.values(SFX_FILES), 'ambience.ogg', 'bgm-project-utopia.ogg', 'plat-walking.ogg']);
    await Promise.all([...files].map((f) => this.load(f)));
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music;
    this.ambBus.gain.value = this.volumes.ambience;
  }

  private async load(file: string) {
    if (!this.ctx || this.buffers.has(file)) return;
    try {
      const res = await fetch(`${ASSET_ROOT}audio/${file}`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(file, buf);
    } catch (e) {
      console.warn('audio load failed', file, e);
    }
  }

  play(name: SfxName, opts: { volume?: number; rate?: number } = {}) {
    const buf = this.ctx && this.buffers.get(SFX_FILES[name]);
    if (!this.ctx || !buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  loop(key: string, file: string, bus: 'music' | 'ambience' | 'sfx', volume = 1) {
    if (!this.ctx || this.loops.has(key)) return;
    const buf = this.buffers.get(file);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 1.5);
    src.connect(g).connect(bus === 'music' ? this.musicBus : bus === 'ambience' ? this.ambBus : this.sfxBus);
    src.start();
    this.loops.set(key, { src, gain: g });
  }

  setLoopVolume(key: string, v: number) {
    const l = this.loops.get(key);
    if (l && this.ctx) l.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  stopLoop(key: string) {
    const l = this.loops.get(key);
    if (!l || !this.ctx) return;
    l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    l.src.stop(this.ctx.currentTime + 1.5);
    this.loops.delete(key);
  }

  // ---- 素材に無い音の簡易シンセ ----
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  doorBell() {
    this.tone(1318.5, 1.2, 'sine', 0.18);
    this.tone(1046.5, 1.4, 'sine', 0.16, 0.18);
    this.tone(2637, 0.6, 'sine', 0.04);
  }

  scanBeep() { this.tone(1760, 0.09, 'square', 0.06); }

  errorBuzz() { this.tone(160, 0.25, 'sawtooth', 0.08); this.tone(150, 0.25, 'sawtooth', 0.06, 0.05); }

  register() {
    this.play('coin', { volume: 0.9 });
    this.tone(2093, 0.5, 'triangle', 0.08, 0.05);
    this.tone(2637, 0.6, 'triangle', 0.07, 0.12);
  }

  scrub() { this.play('swap', { volume: 0.25, rate: 1.8 }); }
}

export const audio = new AudioManager();
