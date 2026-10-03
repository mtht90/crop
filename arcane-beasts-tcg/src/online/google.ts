// Google Identity Services: loads Google's script on demand and draws the
// official "Sign in with Google" button. The ID token it returns goes to our
// server, which verifies it (server/google.ts).

interface Gis {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; use_fedcm_for_prompt?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    };
  };
}

let loading: Promise<Gis> | null = null;

function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  loading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google?.accounts?.id ? resolve(w.google) : reject(new Error('gis')));
    s.onerror = () => {
      loading = null;
      reject(new Error('gis'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** draw the button into `el`; resolves false when Google's script cannot be loaded */
export async function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (credential: string) => void, width: number): Promise<boolean> {
  try {
    const gis = await loadGis();
    gis.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
    el.innerHTML = '';
    gis.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', locale: 'ja', width: Math.max(200, Math.min(400, Math.round(width))) });
    return true;
  } catch {
    return false;
  }
}
