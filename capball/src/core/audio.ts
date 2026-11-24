// 効果音とBGM。素材が見つからないときは鳴らさずに進める（ゲームは止めない）。
const BASE = import.meta.env.BASE_URL + 'assets/';

export type SeName =
  | 'hit_light' | 'hit_hard' | 'hit_homerun' | 'catch' | 'catch_fast' | 'swing' | 'throw' | 'bounce' | 'slide'
  | 'run' | 'cheer' | 'cheer_big' | 'clap' | 'whistle' | 'ambience' | 'sad' | 'shakin' | 'ui_ok' | 'ui_move'
  | 'ui_cancel' | 'chime';
export type BgmName = 'title' | 'game' | 'win' | 'lose';

const SE_LIST: SeName[] = ['hit_light', 'hit_hard', 'hit_homerun', 'catch', 'catch_fast', 'swing', 'throw', 'bounce', 'slide',
  'run', 'cheer', 'cheer_big', 'clap', 'whistle', 'ambience', 'sad', 'shakin', 'ui_ok', 'ui_move', 'ui_cancel', 'chime'];

class AudioSystem {
  ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master!: GainNode;
  private seGain!: GainNode;
  private bgmGain!: GainNode;
  private bgmSrc: AudioBufferSourceNode | null = null;
  private bgmName: string | null = null;
  private ambSrc: AudioBufferSourceNode | null = null;
  muted = false;

  /** ユーザー操作の中で呼ぶ（モバイルの自動再生制限のため） */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.seGain = this.ctx.createGain();
      this.seGain.gain.value = 0.9;
      this.seGain.connect(this.master);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.42;
      this.bgmGain.connect(this.master);
      this.loadAll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private async load(path: string) {
    if (!this.ctx || this.buffers.has(path)) return this.buffers.get(path);
    try {
      const res = await fetch(BASE + path);
      if (!res.ok) return undefined;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(path, buf);
      return buf;
    } catch {
      return undefined;
    }
  }

  private loadAll() {
    if (import.meta.env.VITE_NO_SE === '1') return; // 効果音を同梱していない版
    for (const n of SE_LIST) this.load(`se/${n}.mp3`);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  play(name: SeName, opts: { volume?: number; rate?: number; delay?: number } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers.get(`se/${name}.mp3`);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.seGain);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
  }

  async bgm(name: BgmName | null, opts: { loop?: boolean; fade?: number } = {}) {
    if (!this.ctx) return;
    if (name === this.bgmName && this.bgmSrc) return;
    const fade = opts.fade ?? 0.6;
    const t = this.ctx.currentTime;
    if (this.bgmSrc) {
      const old = this.bgmSrc;
      const og = (old as unknown as { _g: GainNode })._g;
      og.gain.setValueAtTime(og.gain.value, t);
      og.gain.linearRampToValueAtTime(0, t + fade);
      old.stop(t + fade + 0.05);
      this.bgmSrc = null;
    }
    this.bgmName = name;
    if (!name) return;
    const buf = await this.load(`bgm/${name}.mp3`);
    if (!buf || this.bgmName !== name) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop ?? true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fade);
    (src as unknown as { _g: GainNode })._g = g;
    src.connect(g).connect(this.bgmGain);
    src.start();
    this.bgmSrc = src;
  }

  async ambience(on: boolean) {
    if (!this.ctx) return;
    if (!on) {
      this.ambSrc?.stop();
      this.ambSrc = null;
      return;
    }
    if (this.ambSrc) return;
    const buf = await this.load('se/ambience.mp3');
    if (!buf || this.ambSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.18;
    src.connect(g).connect(this.master);
    src.start();
    this.ambSrc = src;
  }
}

export const audio = new AudioSystem();
