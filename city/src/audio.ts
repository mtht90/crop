// 効果音と BGM。最初にどこかをタップしたときに音を有効にする（ブラウザの決まり）。
import { BGM, SFX, type SfxKey } from './config/audio';
import { loadPack } from './render/pack';

class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sfxRaw: Map<string, ArrayBuffer> | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmCurrent = '';
  private bgmLoading = false;
  private wantNight = false;
  volumes = { bgm: 0.5, sfx: 0.7, muted: false };

  constructor() {
    const unlock = () => {
      this.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    void loadPack(`${import.meta.env.BASE_URL}assets/sfx.pack`).then((p) => (this.sfxRaw = p)).catch(() => {});
  }

  private start() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.sfxGain = this.ctx.createGain();
    this.bgmGain = this.ctx.createGain();
    this.sfxGain.connect(this.ctx.destination);
    this.bgmGain.connect(this.ctx.destination);
    this.applyVolumes();
    void this.playBgm();
  }

  setVolumes(v: { bgm: number; sfx: number; muted: boolean }) {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.sfxGain || !this.bgmGain) return;
    const m = this.volumes.muted ? 0 : 1;
    this.sfxGain.gain.value = this.volumes.sfx * m;
    this.bgmGain.gain.value = this.volumes.bgm * 0.6 * m;
  }

  private async decode(key: string, data: ArrayBuffer | undefined): Promise<AudioBuffer | null> {
    if (!this.ctx || !data) return null;
    const cached = this.buffers.get(key);
    if (cached) return cached;
    try {
      const buf = await this.ctx.decodeAudioData(data.slice(0));
      this.buffers.set(key, buf);
      return buf;
    } catch {
      return null;
    }
  }

  async play(key: SfxKey) {
    if (!this.ctx || !this.sfxGain || this.volumes.muted || this.volumes.sfx <= 0) return;
    if (!(key in SFX)) return;
    const buf = await this.decode('sfx:' + key, this.sfxRaw?.get(key));
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start();
  }

  /** 昼・夜で曲を変える */
  setNight(night: boolean) {
    if (this.wantNight === night) return;
    this.wantNight = night;
    void this.playBgm();
  }

  private async playBgm() {
    if (!this.ctx || !this.bgmGain || this.bgmLoading) return;
    const list = BGM.filter((b) => (b.when === 'night') === this.wantNight);
    const pick = list[Math.floor(Math.random() * list.length)];
    if (!pick || pick.id === this.bgmCurrent) return;
    this.bgmLoading = true;
    try {
      let buf = this.buffers.get('bgm:' + pick.id) ?? null;
      if (!buf) {
        const p = await loadPack(`${import.meta.env.BASE_URL}assets/bgm-${pick.id}.pack`);
        buf = await this.decode('bgm:' + pick.id, p.get('music'));
      }
      if (!buf || !this.ctx) return;
      const old = this.bgmSource;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.bgmGain);
      src.onended = () => {
        if (this.bgmSource === src) {
          this.bgmCurrent = '';
          void this.playBgm();
        }
      };
      src.start();
      this.bgmSource = src;
      this.bgmCurrent = pick.id;
      if (old) {
        old.onended = null;
        try { old.stop(); } catch { /* 停止済み */ }
      }
    } catch {
      // 読み込めなくてもゲームは続ける
    } finally {
      this.bgmLoading = false;
    }
  }
}

export const audio = new AudioManager();
