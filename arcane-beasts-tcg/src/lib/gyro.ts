// ============================================================================
// Device tilt → card shine. Cards that follow the pointer (interactive) also
// follow the phone's tilt, relative to how it is being held (the neutral pose
// drifts slowly so it never feels stuck). iOS asks for permission, which has
// to happen inside a tap, so start() is called from the first pointerdown.
// ============================================================================
type Listener = (x: number, y: number) => void; // 0…1, 0.5 = level

const subs = new Set<Listener>();
let enabled = true;
let started = false;
let base: { a: number; b: number } | null = null;
let pos = { x: 0.5, y: 0.5 };
let raf = 0;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function onOrient(e: DeviceOrientationEvent) {
  if (!enabled || e.beta == null || e.gamma == null) return;
  // map to screen axes: the game is played in landscape
  const angle = (screen.orientation?.angle ??
    (window as unknown as { orientation?: number }).orientation ??
    0) as number;
  let a = e.gamma; // left/right
  let b = e.beta; // forward/back
  if (angle === 90) [a, b] = [e.beta, -e.gamma];
  else if (angle === -90 || angle === 270) [a, b] = [-e.beta, e.gamma];
  if (!base) base = { a, b };
  base.a += (a - base.a) * 0.008;
  base.b += (b - base.b) * 0.008;
  pos = {
    x: 0.5 + clamp((a - base.a) / 22) * 0.5,
    y: 0.5 + clamp((b - base.b) / 22) * 0.5,
  };
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      subs.forEach((f) => f(pos.x, pos.y));
    });
}

export function setGyroEnabled(on: boolean) {
  enabled = on;
  if (!on) subs.forEach((f) => f(0.5, 0.5));
}

export async function startGyro() {
  if (started || !enabled || typeof window === "undefined") return;
  const DOE = (
    window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
    }
  ).DeviceOrientationEvent;
  if (!DOE) return;
  started = true;
  if (typeof DOE.requestPermission === "function") {
    try {
      if ((await DOE.requestPermission()) !== "granted") return;
    } catch {
      return;
    }
  }
  window.addEventListener("deviceorientation", onOrient);
}

export function onGyro(fn: Listener) {
  subs.add(fn);
  return () => void subs.delete(fn);
}
