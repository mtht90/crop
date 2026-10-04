export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const saturate = (v: number) => clamp(v, 0, 1);

/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
export type EaseName = keyof typeof ease;

/** Wraps an angle into [-PI, PI]. */
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Critically-damped-ish 1D spring used for secondary motion. */
export class Spring {
  value = 0;
  velocity = 0;
  constructor(
    public stiffness = 180,
    public damping = 14,
    public target = 0,
  ) {}
  update(dt: number) {
    // Sub-step so stiff springs stay stable when the frame rate drops.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  impulse(v: number) {
    this.velocity += v;
  }
}

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
