// Strobe demodulator.
//
// A mechanical strobe tuner spins a patterned disc at exactly the target
// frequency and flashes it with the input signal; the pattern appears to
// drift at a speed proportional to the frequency error. Here the same thing
// is done digitally: the input is mixed with a reference oscillator at k*f0
// for each partial k (quadrature heterodyne), low-pass filtered, and the
// phase of the resulting baseband phasor is the "disc position". It rotates
// at 2*pi*k*(f - f0) rad/s, so drawing a pattern with period L/k offset by
// that phase makes every band drift at the same speed, just like the bands
// on a real strobe disc.

// partial numbers shown on the bands; octaves, like the segment counts on a
// strobe disc (each band has twice the segments of the one above)
const MULT = [1, 2, 4, 8];
const PARTIALS = MULT.length;
const POLES = 4;

class StrobeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.theta = 0;
    // [partial][I/Q][pole]
    this.state = new Float64Array(PARTIALS * 2 * POLES);
    this.setTarget(440);
    this.port.onmessage = (e) => {
      if (e.data && e.data.f0 && e.data.f0 !== this.f0) this.setTarget(e.data.f0);
    };
  }

  setTarget(f0) {
    this.f0 = f0;
    this.dtheta = (2 * Math.PI * f0) / sampleRate;
    // Neighbouring partials sit f0 away; 4 poles at 0.2*f0 gives ~55 dB
    // rejection there while passing a +-30 cent error on the 8th partial.
    const fc = Math.min(0.2 * f0, 200);
    this.alpha = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
    this.state.fill(0);
    this.port.postMessage({ type: 'retarget', f0, frame: currentFrame });
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    const st = this.state;
    const a = this.alpha;
    const twoPi = 2 * Math.PI;
    const nyq = sampleRate * 0.45;
    let theta = this.theta;
    let sumSq = 0;

    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      sumSq += x * x;
      theta += this.dtheta;
      if (theta >= twoPi) theta -= twoPi;
      for (let k = 0; k < PARTIALS; k++) {
        const ph = MULT[k] * theta;
        let vi = x * Math.cos(ph);
        let vq = -x * Math.sin(ph);
        const base = k * 2 * POLES;
        for (let p = 0; p < POLES; p++) {
          const ii = base + p;
          const qi = base + POLES + p;
          st[ii] += a * (vi - st[ii]);
          st[qi] += a * (vq - st[qi]);
          vi = st[ii];
          vq = st[qi];
        }
      }
    }
    this.theta = theta;

    const phase = new Array(PARTIALS);
    const amp = new Array(PARTIALS);
    for (let k = 0; k < PARTIALS; k++) {
      const base = k * 2 * POLES;
      const I = st[base + POLES - 1];
      const Q = st[base + 2 * POLES - 1];
      phase[k] = Math.atan2(Q, I);
      amp[k] = MULT[k] * this.f0 < nyq ? 2 * Math.hypot(I, Q) : 0;
    }
    this.port.postMessage({
      type: 'block',
      frame: currentFrame + ch.length,
      rms: Math.sqrt(sumSq / ch.length),
      phase,
      amp,
    });
    return true;
  }
}

registerProcessor('strobe-processor', StrobeProcessor);
