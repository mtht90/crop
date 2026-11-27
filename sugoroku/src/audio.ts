// BGM と効果音。ブラウザの制約で、最初のクリック後に鳴らし始める。

const SFX = [
  'dice_roll', 'click', 'hover', 'slide', 'thud', 'coin1', 'coin2', 'coins_pour', 'coins_several', 'coin_single', 'gems',
  'coin_echo', 'buy', 'select', 'build', 'fanfare', 'levelup', 'bonus', 'monopoly', 'win', 'lose', 'dragon', 'thief',
  'trap', 'spell0', 'spell1', 'spell2', 'spell3', 'spell4', 'step0', 'step1', 'step2', 'epic', 'card',
] as const;
export type Sfx = (typeof SFX)[number];
export type Bgm = 'title' | 'main1' | 'main2' | 'main3' | 'finale';

class AudioSystem {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sfxGain!: GainNode;
  private bgmEl: HTMLAudioElement | null = null;
  private bgmName: Bgm | null = null;
  sfxVolume = 0.8;
  bgmVolume = 0.45;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.muted ? 0 : this.sfxVolume;
    this.sfxGain.connect(this.ctx.destination);
    for (const name of SFX) {
      fetch(`./audio/sfx/${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => this.buffers.set(name, buf))
        .catch(() => {});
    }
    if (this.bgmName) this.playBgm(this.bgmName, true);
  }

  play(name: Sfx, opts: { volume?: number; rate?: number; delay?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfxGain);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
  }

  playBgm(name: Bgm, force = false) {
    if (this.bgmName === name && !force && this.bgmEl) return;
    this.bgmName = name;
    if (!this.ctx) return; // unlock 後に再生
    const old = this.bgmEl;
    const el = new Audio(`./audio/bgm/${name}.mp3`);
    el.loop = true;
    el.volume = 0;
    this.bgmEl = el;
    void el.play().catch(() => {});
    this.fade(el, this.muted ? 0 : this.bgmVolume, 1200);
    if (old) {
      this.fade(old, 0, 1000);
      setTimeout(() => old.pause(), 1100);
    }
  }

  private fade(el: HTMLAudioElement, to: number, ms: number) {
    const from = el.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.sfxGain) this.sfxGain.gain.value = m ? 0 : this.sfxVolume;
    if (this.bgmEl) this.bgmEl.volume = m ? 0 : this.bgmVolume;
  }
}

export const audio = new AudioSystem();
