/** 新しいセルを塗ったときの演出（音・振動） */
let ctx: AudioContext | null = null;

const SOUND_KEY = 'scratch.sound';
export const soundSetting = {
  get: () => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  },
  set: (on: boolean) => {
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
      /* noop */
    }
  },
};

/** iOS Safari ではユーザー操作の中で AudioContext を作る必要がある */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.12) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, start);
  o.frequency.exponentialRampToValueAtTime(freq * 1.5, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

let lastPlayed = 0;
/** 新規セルの「カリッ」音。連続しすぎないよう間引く */
export function celebrate(count: number) {
  const now = performance.now();
  if (now - lastPlayed < 250) return;
  lastPlayed = now;
  if (soundSetting.get() && ctx) {
    const t = ctx.currentTime;
    const notes = count >= 5 ? [784, 988, 1175, 1568] : [880, 1320];
    notes.forEach((f, i) => tone(f, t + i * 0.06, 0.12));
  }
  // Android Chrome 等で有効（iOS Safari は非対応なので無視される）
  try {
    navigator.vibrate?.(count >= 5 ? [30, 40, 30] : 25);
  } catch {
    /* noop */
  }
}
