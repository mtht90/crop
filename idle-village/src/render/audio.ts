// 効果音とBGM(Ninja Adventure / CC0)
import Phaser from 'phaser';

const SFX = ['chop', 'mine', 'hammer', 'fall', 'coin', 'splash', 'hit', 'heal', 'built', 'birth', 'horn', 'stage', 'click', 'upgrade', 'bird', 'pop'];
const BGM = { day: ['bgm_day1', 'bgm_day2', 'bgm_day3', 'bgm_day4'], night: ['bgm_night1', 'bgm_night2'], raid: ['bgm_raid'] };
type Mood = keyof typeof BGM;

export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

export class AudioMgr {
  private scene: Phaser.Scene | null = null;
  private last = new Map<string, number>();
  private music: Phaser.Sound.BaseSound | null = null;
  private waves: Phaser.Sound.BaseSound | null = null;
  private mood: Mood | null = null;
  private trackIdx = 0;
  settings: AudioSettings;

  constructor() {
    let saved: Partial<AudioSettings> = {};
    try {
      saved = JSON.parse(localStorage.getItem('kurashi-audio') ?? '{}');
    } catch {
      /* 無視 */
    }
    this.settings = { music: 0.45, sfx: 0.7, muted: false, ...saved };
  }

  static preload(scene: Phaser.Scene) {
    for (const k of SFX) scene.load.audio(k, `assets/audio/${k}.mp3`);
    for (const list of Object.values(BGM)) for (const k of list) scene.load.audio(k, `assets/audio/${k}.mp3`);
    scene.load.audio('waves', 'assets/audio/waves.mp3');
  }

  attach(scene: Phaser.Scene) {
    this.scene = scene;
    scene.sound.pauseOnBlur = false;
  }

  save() {
    try {
      localStorage.setItem('kurashi-audio', JSON.stringify(this.settings));
    } catch {
      /* 無視 */
    }
    this.applyVolumes();
  }

  private applyVolumes() {
    const m = this.settings.muted ? 0 : this.settings.music;
    if (this.music) (this.music as Phaser.Sound.WebAudioSound).setVolume(m);
    if (this.waves) (this.waves as Phaser.Sound.WebAudioSound).setVolume((this.settings.muted ? 0 : this.settings.sfx) * 0.35);
  }

  play(key: string, vol = 0.5) {
    if (!this.scene || this.settings.muted || this.settings.sfx <= 0) return;
    const now = performance.now();
    if ((this.last.get(key) ?? 0) > now - 90) return;
    this.last.set(key, now);
    try {
      this.scene.sound.play(key, { volume: vol * this.settings.sfx, detune: Phaser.Math.Between(-120, 120) });
    } catch {
      /* 音が鳴らせない環境 */
    }
  }

  /** 昼・夜・襲撃に合わせてBGMを切り替える */
  setMood(mood: Mood) {
    if (!this.scene) return;
    if (!this.waves) {
      this.waves = this.scene.sound.add('waves', { loop: true, volume: 0 });
      this.waves.play();
      this.applyVolumes();
    }
    if (this.mood === mood && this.music?.isPlaying) return;
    this.mood = mood;
    const list = BGM[mood];
    const key = list[this.trackIdx++ % list.length];
    const old = this.music;
    if (old) {
      this.scene.tweens.add({ targets: old, volume: 0, duration: 1500, onComplete: () => old.destroy() });
    }
    const m = this.scene.sound.add(key, { loop: false, volume: 0 });
    m.once('complete', () => {
      if (this.music === m) {
        this.mood = null; // 次の曲へ
      }
    });
    m.play();
    this.music = m;
    const target = this.settings.muted ? 0 : this.settings.music;
    this.scene.tweens.add({ targets: m, volume: target, duration: 2000 });
  }
}
