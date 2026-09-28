// ============================================================================
// Effect quality + haptics preferences
//
//   full  everything on
//   lite  lighter 3D (lower resolution, fewer stars/particles)
//   auto  starts full on capable devices; drops to lite for good once the
//         cinematic measures sustained slow frames on this device
// ============================================================================
export type FxLevel = "auto" | "full" | "lite";

const AUTO_KEY = "arcane-beasts-autolite";
let level: FxLevel = "auto";
let haptics = true;

function guessLite(): boolean {
  try {
    if (localStorage.getItem(AUTO_KEY) === "1") return true;
  } catch {
    /* storage unavailable */
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  return (
    cores <= 2 ||
    mem <= 2 ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
let autoLite = typeof window !== "undefined" ? guessLite() : false;

export function configureFx(l: FxLevel, vibrate: boolean) {
  level = l;
  haptics = vibrate;
}
export const fxLevel = () => level;
export const liteFx = () => level === "lite" || (level === "auto" && autoLite);
/** 1 for full effects, smaller for lite (particle counts etc.) */
export const fxScale = () => (liteFx() ? 0.45 : 1);

/** called by the cinematic with its average frame time */
export function reportFrameTime(avgMs: number) {
  if (level !== "auto" || autoLite || avgMs < 45) return;
  autoLite = true;
  try {
    localStorage.setItem(AUTO_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}
export function resetAutoFx() {
  autoLite = false;
  try {
    localStorage.removeItem(AUTO_KEY);
  } catch {
    /* storage unavailable */
  }
  autoLite = guessLite();
}

export const canVibrate = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
export function vibrate(pattern: number | number[]) {
  if (!haptics || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* not allowed */
  }
}
