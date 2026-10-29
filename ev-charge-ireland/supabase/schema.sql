-- Shared "I'm heading here" data for Charge Ireland.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Stores no personal data: just a charger position, an arrival time and a
-- random token that only the announcing phone knows (used to cancel).

create table if not exists public.intents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  station_id text not null check (char_length(station_id) <= 100),
  lat double precision not null check (lat between 51 and 56),
  lon double precision not null check (lon between -11 and -5),
  eta timestamptz not null,
  token uuid not null,
  cancelled boolean not null default false,
  -- Arrival must be soon: stops stale or far-future entries.
  constraint eta_window check (eta between created_at - interval '5 minutes' and created_at + interval '4 hours')
);

create index if not exists intents_eta_idx on public.intents (eta);

alter table public.intents enable row level security;

-- Visitors may read recent intents (never the cancel token) and add new ones.
revoke all on public.intents from anon, authenticated;
grant select (id, station_id, lat, lon, eta, cancelled) on public.intents to anon, authenticated;
grant insert (station_id, lat, lon, eta, token) on public.intents to anon, authenticated;

drop policy if exists "read recent intents" on public.intents;
create policy "read recent intents" on public.intents
  for select to anon, authenticated
  using (eta > now() - interval '2 hours');

drop policy if exists "announce intent" on public.intents;
create policy "announce intent" on public.intents
  for insert to anon, authenticated
  with check (cancelled = false);

-- Cancelling needs the token the phone kept when announcing.
create or replace function public.cancel_intent(p_id uuid, p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update intents set cancelled = true where id = p_id and token = p_token;
$$;

revoke all on function public.cancel_intent(uuid, uuid) from public;
grant execute on function public.cancel_intent(uuid, uuid) to anon, authenticated;
