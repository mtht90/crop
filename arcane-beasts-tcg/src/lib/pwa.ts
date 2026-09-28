// ============================================================================
// Installable app (PWA): service worker registration + the install prompt.
// Only active in the standalone build served from its own site; inside the
// claude.ai Artifact frame there is nothing to install.
// ============================================================================
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

export const inFrame = () => {
  try {
    return window.top !== window;
  } catch {
    return true;
  }
};
export const isInstalled = () => window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPromptInstall = () => !!deferred;
/** whether this build can be installed at all (own site, not the Artifact frame) */
export const pwaAvailable = () => import.meta.env.MODE !== 'artifact' && !inFrame() && 'serviceWorker' in navigator;

export function initPwa() {
  if (!pwaAvailable() || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((f) => f());
  return outcome === 'accepted';
}

export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
