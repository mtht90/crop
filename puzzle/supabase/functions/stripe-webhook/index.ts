// Stripe webhook: records paid Checkout sessions in public.purchases (once per session).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy without JWT verification (Stripe can't send one); the Stripe signature is checked instead.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PACK_BY_ID } from '../_shared/packs.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2025-02-24.acacia' });
const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? '', secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return new Response('bad signature', { status: 400 });
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== 'paid') return new Response('pending', { status: 200 });
    const pack = PACK_BY_ID[s.metadata?.pack ?? ''];
    const claim = s.metadata?.claim_hash ?? '';
    // the amount must match the pack (a session can't be re-priced, but check anyway)
    if (!pack || !/^[0-9a-f]{64}$/.test(claim) || s.amount_total !== pack.jpy) {
      console.error('unexpected session', s.id);
      return new Response('ignored', { status: 200 });
    }
    const { error } = await db.from('purchases').upsert(
      { session_id: s.id, claim_hash: claim, pack: pack.id, coins: pack.coins, lives: pack.lives, amount_jpy: pack.jpy },
      { onConflict: 'session_id', ignoreDuplicates: true },
    );
    if (error) {
      console.error(error);
      return new Response('db error', { status: 500 });
    }
  }
  return new Response('ok', { status: 200 });
});
