-- Weekly ranking for ぷにっと討伐バトル. Run once in Supabase: SQL Editor → paste → Run.
-- Weeks start Monday 00:00 JST. Each player keeps their best score of the week.
-- Clients can only read the table; writes go through submit_score(), which validates them.

create table if not exists public.weekly_scores (
  week       date        not null,
  player_id  uuid        not null,
  name       text        not null check (char_length(name) between 1 and 12),
  score      bigint      not null check (score >= 0),
  char_id    text,
  updated_at timestamptz not null default now(),
  primary key (week, player_id)
);
create index if not exists weekly_scores_rank on public.weekly_scores (week, score desc);

alter table public.weekly_scores enable row level security;
drop policy if exists "anyone can read scores" on public.weekly_scores;
create policy "anyone can read scores" on public.weekly_scores for select using (true);
-- no insert/update/delete policies: only the functions below can write
grant select on public.weekly_scores to anon;
revoke insert, update, delete on public.weekly_scores from anon;

create or replace function public.current_week() returns date
language sql stable as $$
  select (date_trunc('week', now() at time zone 'Asia/Tokyo'))::date
$$;

-- Records a round. Keeps the week's best, rejects impossible scores and rapid-fire submits.
create or replace function public.submit_score(p_player uuid, p_name text, p_score bigint, p_char text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  w date := public.current_week();
  prev public.weekly_scores;
begin
  if p_score is null or p_score < 0 or p_score > 200000000 then
    raise exception 'invalid score';
  end if;
  p_name := left(btrim(coalesce(p_name, '')), 12);
  if p_name = '' then
    raise exception 'name required';
  end if;
  select * into prev from public.weekly_scores where week = w and player_id = p_player;
  -- a round takes 90 seconds or more
  if found and prev.updated_at > now() - interval '30 seconds' then
    raise exception 'too fast';
  end if;
  insert into public.weekly_scores (week, player_id, name, score, char_id)
  values (w, p_player, p_name, p_score, left(p_char, 32))
  on conflict (week, player_id) do update set
    name = excluded.name,
    char_id = case when excluded.score > public.weekly_scores.score then excluded.char_id else public.weekly_scores.char_id end,
    score = greatest(public.weekly_scores.score, excluded.score),
    updated_at = now();
  return json_build_object('week', w);
end
$$;

-- A player's rank in a week (null when they didn't play).
create or replace function public.my_rank(p_player uuid, p_week date)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'rank', (select count(*) + 1 from public.weekly_scores s2 where s2.week = p_week and s2.score > s.score),
    'total', (select count(*) from public.weekly_scores s3 where s3.week = p_week),
    'score', s.score)
  from public.weekly_scores s
  where s.week = p_week and s.player_id = p_player
$$;

grant execute on function public.submit_score(uuid, text, bigint, text) to anon;
grant execute on function public.my_rank(uuid, date) to anon;
