-- In-game shop (coins and lives) for ぷにっと討伐バトル. Run once in Supabase: SQL Editor → paste → Run.
-- Purchases are written only by the stripe-webhook Edge Function (service role) after Stripe confirms
-- payment. The game collects them with a secret that never leaves the device except when claiming;
-- each purchase stores only the secret's SHA-256 (claim_hash), so nobody else can claim it.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.purchases (
  id          bigserial   primary key,
  session_id  text        not null unique,          -- Stripe Checkout session (one row per payment)
  claim_hash  text        not null,
  pack        text        not null,
  coins       integer     not null default 0 check (coins >= 0),
  lives       integer     not null default 0 check (lives >= 0),
  amount_jpy  integer     not null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index if not exists purchases_claim on public.purchases (claim_hash) where claimed_at is null;
alter table public.purchases enable row level security;
revoke all on public.purchases from anon, authenticated;

-- Hands out everything paid for and not yet collected by this device, and marks it collected.
create or replace function public.claim_purchases(p_secret text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  h text;
  c integer;
  l integer;
  n integer;
begin
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception 'invalid secret';
  end if;
  h := encode(extensions.digest(p_secret, 'sha256'), 'hex');
  with done as (
    update public.purchases set claimed_at = now()
    where claim_hash = h and claimed_at is null
    returning coins, lives
  )
  select coalesce(sum(coins), 0)::int, coalesce(sum(lives), 0)::int, count(*)::int into c, l, n from done;
  return json_build_object('coins', c, 'lives', l, 'count', n);
end
$$;
grant execute on function public.claim_purchases(text) to anon;
