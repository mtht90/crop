// 効果音と環境音(OpenGameArt の CC0 素材)。Web Audio で鳴らす。
const FILES = {
  skip_06: 'skip_06.mp3',
  skip_09: 'skip_09.mp3',
  skip_10: 'skip_10.mp3',
  skip_14: 'skip_14.mp3',
  skip_15: 'skip_15.mp3',
  skip_02: 'skip_02.mp3',
  skip_08: 'skip_08.mp3',
  sink: 'sink.mp3',
  plunk: 'plunk.mp3',
  bubble: 'bubble.mp3',
  throw: 'throw.mp3',
  throw2: 'throw2.mp3',
  ding_nice: 'ding_nice.mp3',
  ding_great: 'ding_great.mp3',
  ding_excellent: 'ding_excellent.mp3',
  amb_birds: 'amb_birds.mp3',
  amb_water: 'amb_water.mp3',
};
const HEAVY_SKIPS = ['skip_02', 'skip_08', 'skip_14'];
const LIGHT_SKIPS = ['skip_06', 'skip_09', 'skip_10', 'skip_15'];

export function createAudio() {
  let ctx = null;
  let master = null;
  const raw = {};
  const buffers = {};
  let muted = false;
  try {
    muted = localStorage.getItem('skip-stone:muted') === '1';
  } catch {}

  // 音声ファイルは先にダウンロードだけしておく(デコードは AudioContext ができてから)
  const fetched = Promise.all(
    Object.entries(FILES).map(async ([k, f]) => {
      try {
        const res = await fetch(new URL(`../assets/audio/${f}`, import.meta.url));
        raw[k] = await res.arrayBuffer();
      } catch (e) {
        console.warn('audio load failed', f, e);
      }
    }),
  );

  async function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    // iOS は無音を一度鳴らすと確実に解除される
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(master);
    s.start(0);
    await fetched;
    await Promise.all(
      Object.entries(raw).map(async ([k, ab]) => {
        try {
          buffers[k] = await ctx.decodeAudioData(ab.slice(0));
        } catch (e) {
          console.warn('decode failed', k, e);
        }
      }),
    );
    startAmbience();
  }

  function play(name, { vol = 1, rate = 1, pan = 0, when = 0 } = {}) {
    if (!ctx || !buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    let node = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(master);
    src.start(ctx.currentTime + when);
  }

  function loop(name, vol) {
    if (!buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2.5);
    src.connect(g).connect(master);
    src.start();
  }

  function startAmbience() {
    loop('amb_water', 0.32);
    loop('amb_birds', 0.22);
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  return {
    unlock,
    get muted() {
      return muted;
    },
    setMuted(m) {
      muted = m;
      try {
        localStorage.setItem('skip-stone:muted', m ? '1' : '0');
      } catch {}
      if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
    },
    throw(power) {
      play(Math.random() < 0.5 ? 'throw' : 'throw2', { vol: 0.5 + power * 0.4, rate: 0.85 + power * 0.3 });
    },
    /** index: 何回目の跳ねか / speed: 水平速度 / pan: 左右 */
    skip(index, speed, pan) {
      const heavy = speed > 9;
      const vol = Math.min(1, 0.35 + speed / 18);
      const rate = Math.min(1.7, 0.9 + index * 0.025 + (heavy ? 0 : 0.15) + Math.random() * 0.08);
      play(pick(heavy ? HEAVY_SKIPS : LIGHT_SKIPS), { vol, rate, pan });
    },
    sink(steep) {
      play(steep ? 'plunk' : 'sink', { vol: 0.9, rate: 0.95 + Math.random() * 0.1 });
      play('bubble', { vol: 0.5, rate: 0.9, when: 0.25 });
    },
    judge(kind) {
      play(`ding_${kind}`, { vol: kind === 'excellent' ? 0.75 : 0.6 });
    },
    bonus() {
      play('ding_excellent', { vol: 0.55, rate: 1.5 });
    },
    tick() {
      play('skip_10', { vol: 0.25, rate: 2.2 });
    },
  };
}
