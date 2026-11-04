import Phaser from 'phaser';

const STORAGE_KEY = 'rune-lanes:sound';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * BGM / 効果音のラッパー。素材が未配置（読み込み失敗）でも落ちないようにする。
 * スマホのブラウザは初回タップまで音を出せないため、ロック中の BGM 再生は解除後に行う。
 */
export class Sound {
  static enabled = readEnabled();
  private static bgm: Phaser.Sound.BaseSound | null = null;
  private static bgmKey: string | null = null;
  private static lastPlayed = new Map<string, number>();

  static setEnabled(game: Phaser.Game, on: boolean): void {
    Sound.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      /* 保存できなくても続行 */
    }
    game.sound.mute = !on;
  }

  static apply(game: Phaser.Game): void {
    game.sound.mute = !Sound.enabled;
  }

  static se(scene: Phaser.Scene, key: string | null | undefined, volume = 0.6, minInterval = 0.05): void {
    if (!key || !scene.cache.audio.exists(key)) return;
    // 同じ音の連打で音割れしないよう間引く
    const now = scene.time.now / 1000;
    const last = Sound.lastPlayed.get(key) ?? -1;
    if (now - last < minInterval) return;
    Sound.lastPlayed.set(key, now);
    if (scene.sound.locked) return;
    scene.sound.play(key, { volume });
  }

  static playBgm(scene: Phaser.Scene, key: string, loop = true, volume = 0.45): void {
    if (Sound.bgmKey === key && Sound.bgm?.isPlaying) return;
    Sound.stopBgm();
    if (!scene.cache.audio.exists(key)) return;
    Sound.bgmKey = key;
    const start = () => {
      if (Sound.bgmKey !== key) return;
      Sound.bgm = scene.sound.add(key, { loop, volume });
      Sound.bgm.play();
    };
    if (scene.sound.locked) scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    else start();
  }

  static stopBgm(): void {
    if (Sound.bgm) {
      Sound.bgm.stop();
      Sound.bgm.destroy();
    }
    Sound.bgm = null;
    Sound.bgmKey = null;
  }

  static setBgmRate(rate: number): void {
    const s = Sound.bgm as Phaser.Sound.WebAudioSound | null;
    if (s && 'setRate' in s) s.setRate(rate);
  }
}
