import { Save } from './Save';

/**
 * Real-money shop (Stripe Checkout through Supabase Edge Functions, see supabase/shop.sql and
 * supabase/functions). Purchases are collected with a secret kept on this device; the server only
 * ever sees its SHA-256 until the device claims. Turned on with VITE_SHOP_ENABLED=1.
 */
const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const Shop = {
  get enabled(): boolean {
    return !!URL_ && !!KEY && import.meta.env.VITE_SHOP_ENABLED === '1';
  },
  /** Stripe test mode: shows a banner (set VITE_SHOP_TEST=1 while using test keys). */
  get test(): boolean {
    return import.meta.env.VITE_SHOP_TEST === '1';
  },
};

function secret(): string {
  if (!Save.data.payKey) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    Save.data.payKey = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    Save.write();
  }
  return Save.data.payKey;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const headers = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

/** Opens Stripe Checkout for a pack. Returns an error message, or never returns (page navigates). */
export async function buy(pack: string): Promise<string | null> {
  if (!Shop.enabled) return 'いまは購入できません';
  try {
    const r = await fetch(`${URL_}/functions/v1/checkout`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ pack, claimHash: await sha256(secret()), returnUrl: location.href.split('?')[0] }),
    });
    const j = (await r.json()) as { url?: string };
    if (!r.ok || !j.url) return '購入ページをひらけませんでした';
    Save.write();
    location.href = j.url;
    return null;
  } catch {
    return 'つうしんできませんでした';
  }
}

/** Collects paid purchases not yet received on this device. */
export async function claimPurchases(): Promise<{ coins: number; lives: number; count: number } | null> {
  if (!Shop.enabled || !Save.data.payKey) return null;
  try {
    const r = await fetch(`${URL_}/rest/v1/rpc/claim_purchases`, { method: 'POST', headers: headers(), body: JSON.stringify({ p_secret: Save.data.payKey }) });
    if (!r.ok) return null;
    const res = (await r.json()) as { coins: number; lives: number; count: number };
    if (res.count > 0) {
      Save.data.coins += res.coins;
      Save.data.lives += res.lives;
      Save.write();
    }
    return res;
  } catch {
    return null;
  }
}
