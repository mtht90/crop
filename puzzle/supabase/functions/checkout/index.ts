// Creates a Stripe Checkout session for one shop pack and returns its URL.
// Body: { pack: string, claimHash: string (sha256 hex of the device's purchase secret), returnUrl: string }
// Secrets: STRIPE_SECRET_KEY. Optional: ALLOWED_ORIGINS (comma-separated; the game's URL).
import Stripe from 'npm:stripe@17.7.0';
import { PACK_BY_ID } from '../_shared/packs.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2025-02-24.acacia' });
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null): Record<string, string> {
  const ok = origin && (allowed.length === 0 || allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin! : allowed[0] ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = { ...cors(origin), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method' }), { status: 405, headers });
  if (allowed.length && (!origin || !allowed.includes(origin))) return new Response(JSON.stringify({ error: 'origin' }), { status: 403, headers });
  try {
    const { pack, claimHash, returnUrl } = await req.json();
    const p = PACK_BY_ID[pack];
    if (!p) return new Response(JSON.stringify({ error: 'pack' }), { status: 400, headers });
    if (typeof claimHash !== 'string' || !/^[0-9a-f]{64}$/.test(claimHash)) return new Response(JSON.stringify({ error: 'claim' }), { status: 400, headers });
    // send the player back to the game (only to an allowed origin when the list is set)
    const back = new URL(typeof returnUrl === 'string' ? returnUrl : origin ?? '');
    if (allowed.length && !allowed.includes(back.origin)) return new Response(JSON.stringify({ error: 'return' }), { status: 400, headers });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'jpy', unit_amount: p.jpy, product_data: { name: `ぷにっと☆バトル ${p.name}` } } }],
      metadata: { pack: p.id, claim_hash: claimHash },
      success_url: `${back.origin}${back.pathname}?shop=paid`,
      cancel_url: `${back.origin}${back.pathname}?shop=cancel`,
      locale: 'ja',
    });
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'failed' }), { status: 500, headers });
  }
});
