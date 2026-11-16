// WebAudio ベースの音響。BGMはクロスフェード、効果音は音程を少し揺らし、同時発音数を制限する。
const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

const SFX = ['mine1', 'clink1', 'clink2', 'clink3', 'coin1', 'coin2', 'coin3', 'coins1', 'coins2', 'chop', 'wood', 'page1', 'page2', 'page3',
  'open', 'close', 'click', 'select', 'error', 'confirm', 'build_done', 'upgrade', 'levelup', 'achievement', 'swing1', 'swing2', 'swing3',
  'unsheathe', 'clash', 'bow', 'magic', 'leather', 'cloth', 'door'] as const;
export type SfxKey = (typeof SFX)[number];

export const FIELD_TRACKS = ['old_tower_inn', 'bards_tale', 'minstrel_dance', 'market_day', 'harvest_season', 'exploration'];
export const TRACK_TITLES: Record<string, string> = {
  old_tower_inn: 'The Old Tower Inn', bards_tale: "The Bard's Tale", minstrel_dance: 'Minstrel Dance', market_day: 'Market Day',
  harvest_season: 'Harvest Season', exploration: 'Exploration', battle: 'Battle', kings_feast: "King's Feast", rejoicing: 'Rejoicing',
};

export interface AudioSettings {
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, number>();
  private lastPlay = new Map<string, number>();
  private music: { key: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private playlist: string[] = [];
  private playlistTimer: number | undefined;
  private mode: 'field' | 'battle' | 'ceremony' = 'field';
  settings: AudioSettings = { music: 0.55, sfx: 0.8, ambience: 0.35, muted: false };
  onTrack?: (title: string) => void;

  /** ユーザー操作の中で呼ぶ（ブラウザの自動再生制限） */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    // 軽いコンプレッサーで音割れを防ぐ
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.applySettings();
    SFX.forEach((k) => this.load(`sfx/${k}`));
    this.startAmbience();
    this.nextFieldTrack(true);
  }

  applySettings() {
    if (!this.ctx) return;
    const m = this.settings.muted ? 0 : 1;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.music * m, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx * m, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.settings.ambience * m, t, 0.05);
  }

  private load(path: string): Promise<AudioBuffer | null> {
    const hit = this.loading.get(path);
    if (hit) return hit;
    const p = fetch(BASE + path + '.mp3')
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx!.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(path, buf);
        return buf;
      })
      .catch(() => null);
    this.loading.set(path, p);
    return p;
  }

  sfx(key: SfxKey | string, opts: { vol?: number; rate?: number; jitter?: number; maxVoices?: number; minGap?: number } = {}) {
    if (!this.ctx || this.settings.muted) return;
    const buf = this.buffers.get(`sfx/${key}`);
    if (!buf) return;
    const now = this.ctx.currentTime;
    const gap = opts.minGap ?? 0.03;
    if (now - (this.lastPlay.get(key) ?? -1) < gap) return;
    const maxV = opts.maxVoices ?? 4;
    if ((this.voices.get(key) ?? 0) >= maxV) return;
    this.lastPlay.set(key, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const j = opts.jitter ?? 0.06;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const g = this.ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    src.connect(g).connect(this.sfxBus);
    this.voices.set(key, (this.voices.get(key) ?? 0) + 1);
    src.onended = () => this.voices.set(key, Math.max(0, (this.voices.get(key) ?? 1) - 1));
    src.start();
  }

  private async startAmbience() {
    const buf = await this.load('ambience/waves');
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 4);
    src.connect(g).connect(this.ambBus);
    src.start();
  }

  private async playMusic(key: string, loop: boolean, fade = 2.5) {
    if (!this.ctx) return;
    const buf = await this.load(`music/${key}`);
    if (!buf || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.src.stop(t + fade + 0.1);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + fade);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.music = { key, src, gain: g };
    this.onTrack?.(TRACK_TITLES[key] ?? key);
    return buf.duration;
  }

  /** フィールド曲をシャッフル再生。ループ曲は2周したら次の曲へ。 */
  private async nextFieldTrack(first = false) {
    clearTimeout(this.playlistTimer);
    if (this.mode !== 'field') return;
    if (!this.playlist.length) {
      this.playlist = [...FIELD_TRACKS].sort(() => Math.random() - 0.5);
      if (first) this.playlist.unshift('old_tower_inn');
    }
    const key = this.playlist.shift()!;
    const dur = (await this.playMusic(key, true, first ? 3 : 4)) ?? 60;
    const plays = dur < 100 ? 2 : 1;
    this.playlistTimer = window.setTimeout(() => this.nextFieldTrack(), (dur * plays - 4) * 1000);
  }

  battle() {
    this.mode = 'battle';
    clearTimeout(this.playlistTimer);
    this.playMusic('battle', true, 1.2);
  }
  async sting(key: 'victory' | 'defeat') {
    this.mode = 'battle';
    clearTimeout(this.playlistTimer);
    const dur = (await this.playMusic(key, false, 0.6)) ?? 10;
    this.playlistTimer = window.setTimeout(() => this.field(), Math.min(dur, 14) * 1000);
  }
  ceremony() {
    this.mode = 'ceremony';
    clearTimeout(this.playlistTimer);
    this.playMusic('kings_feast', true, 2);
  }
  field() {
    if (this.mode === 'field' && this.music) return;
    this.mode = 'field';
    this.nextFieldTrack();
  }
  skipTrack() {
    if (this.mode === 'field') this.nextFieldTrack();
  }
}
