let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 出力までの遅延（秒） */
export function outputLatency(c: AudioContext): number {
  return (c.outputLatency || 0) + (c.baseLatency || 0);
}

let noise: AudioBuffer | null = null;
export function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  noise = buf;
  return buf;
}
