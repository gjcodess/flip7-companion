begin;

create extension if not exists pgcrypto;

create type public.room_status as enum ('lobby', 'active', 'round_review', 'completed', 'abandoned');
create type public.member_status as enum ('pending', 'approved', 'removed', 'left');
create type public.round_status as enum ('active', 'review', 'finalized');
create type public.player_round_status as enum ('active', 'stayed', 'busted', 'frozen');
create type public.card_kind as enum ('number', 'modifier', 'action');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 24),
  avatar_color text not null default '#57b8d7' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null references public.profiles(id),
  target_score integer not null check (target_score between 50 and 500),
  status public.room_status not null default 'lobby',
  round_number integer not null default 0 check (round_number >= 0),
  state_version bigint not null default 0 check (state_version >= 0),
  host_offline_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('host', 'player')),
  status public.member_status not null default 'pending',
  joined_at timestamptz not null default now(),
  approved_at timestamptz,
  removed_at timestamptz,
  final_score integer,
  final_place integer,
  stats_counted boolean not null default false,
  primary key (room_id, user_id),
  check ((role = 'host' and status = 'approved') or role = 'player')
);

create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  number integer not null check (number > 0),
  dealer_user_id uuid references public.profiles(id),
  status public.round_status not null default 'active',
  started_at timestamptz not null default now(),
  review_started_at timestamptz,
  finalized_at timestamptz,
  unique (room_id, number)
);

create table public.round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.player_round_status not null default 'active',
  number_total integer not null default 0,
  modifier_total integer not null default 0,
  has_multiplier boolean not null default false,
  flip_seven_bonus integer not null default 0,
  round_score integer not null default 0,
  total_score integer not null default 0,
  confirmed_at timestamptz,
  frozen_at timestamptz,
  busted_at timestamptz,
  unique (round_id, user_id)
);

create table public.round_cards (
  id uuid primary key default gen_random_uuid(),
  round_player_id uuid not null references public.round_players(id) on delete cascade,
  card_code text not null check (card_code ~ '^(number:(?:[0-9]|1[0-2])|modifier:(?:plus2|plus4|plus6|plus8|plus10|x2)|action:(?:second_chance|freeze|flip_three))$'),
  kind public.card_kind not null,
  sequence integer not null check (sequence > 0),
  source_event_id uuid,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (round_player_id, sequence)
);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid references public.game_rounds(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  client_event_id uuid not null,
  event_type text not null check (event_type in (
    'card_recorded', 'card_corrected', 'action_targeted', 'bust_confirmed',
    'player_stayed', 'round_confirmed', 'round_reopened', 'member_approved',
    'member_removed', 'host_transferred', 'match_abandoned', 'round_finalized'
  )),
  payload jsonb not null default '{}'::jsonb,
  state_version bigint not null,
  created_at timestamptz not null default now(),
  unique (room_id, client_event_id),
  unique (room_id, state_version)
);

create index room_members_user_id_idx on public.room_members(user_id);
create index game_rounds_room_id_idx on public.game_rounds(room_id, number desc);
create index round_players_round_id_idx on public.round_players(round_id);
create index round_cards_round_player_id_idx on public.round_cards(round_player_id, sequence);
create index game_events_room_id_idx on public.game_events(room_id, state_version);

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger rooms_touch_updated_at
before update on public.rooms
for each row execute function private.touch_updated_at();

create or replace function private.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile
after insert on auth.users
for each row execute function private.create_profile_for_user();

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and user_id = (select auth.uid())
      and status in ('pending', 'approved')
  );
$$;

create or replace function private.is_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.rooms
    where id = p_room_id
      and host_user_id = (select auth.uid())
  );
$$;

create or replace function private.can_view_round_player_cards(p_round_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.round_players rp
    join public.game_rounds gr on gr.id = rp.round_id
    join public.rooms r on r.id = gr.room_id
    where rp.id = p_round_player_id
      and (
        rp.user_id = (select auth.uid())
        or r.host_user_id = (select auth.uid())
        or rp.status = 'active'
        or gr.status = 'finalized'
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.game_rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.round_cards enable row level security;
alter table public.game_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.rooms, public.room_members, public.game_rounds, public.round_players, public.round_cards, public.game_events to authenticated;
grant update (display_name, avatar_color) on public.profiles to authenticated;

create policy "authenticated users can read profiles"
on public.profiles for select to authenticated using (true);

create policy "users can update their profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "members can read their rooms"
on public.rooms for select to authenticated
using (private.is_room_member(id));

create policy "members can read room members"
on public.room_members for select to authenticated
using (private.is_room_member(room_id));

create policy "members can read rounds"
on public.game_rounds for select to authenticated
using (private.is_room_member(room_id));

create policy "members can read round players"
on public.round_players for select to authenticated
using (exists (
  select 1 from public.game_rounds gr
  where gr.id = round_players.round_id
    and private.is_room_member(gr.room_id)
));

create policy "authorized users can read visible cards"
on public.round_cards for select to authenticated
using (private.can_view_round_player_cards(round_player_id));

create policy "members can read room events"
on public.game_events for select to authenticated
using (private.is_room_member(room_id));

create or replace function public.create_room(p_target_score integer, p_display_name text default null)
returns public.rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if p_target_score not between 50 and 500 then
    raise exception 'Target score must be between 50 and 500';
  end if;

  update public.profiles
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
  where id = (select auth.uid());

  loop
    v_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    begin
      insert into public.rooms (code, host_user_id, target_score)
      values (v_code, (select auth.uid()), p_target_score)
      returning * into v_room;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, role, status, approved_at)
  values (v_room.id, (select auth.uid()), 'host', 'approved', now());

  return v_room;
end;
$$;

create or replace function public.request_room_join(p_room_code text, p_display_name text default null)
returns public.rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  select * into v_room from public.rooms where code = upper(trim(p_room_code));
  if not found or v_room.status <> 'lobby' then
    raise exception 'Room is unavailable';
  end if;

  update public.profiles
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
  where id = (select auth.uid());

  insert into public.room_members (room_id, user_id)
  values (v_room.id, (select auth.uid()))
  on conflict (room_id, user_id) do update
    set status = case when public.room_members.status = 'removed' then 'pending' else public.room_members.status end,
        removed_at = null;

  return v_room;
end;
$$;

create or replace function public.approve_room_member(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.is_room_host(p_room_id) then
    raise exception 'Only the host can approve players';
  end if;

  update public.room_members
  set status = 'approved', approved_at = now()
  where room_id = p_room_id and user_id = p_user_id and status = 'pending';

  if not found then
    raise exception 'Pending player not found';
  end if;
end;
$$;

create or replace function public.start_match(p_room_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.game_rounds;
  v_player_count integer;
begin
  if not private.is_room_host(p_room_id) then
    raise exception 'Only the host can start the match';
  end if;

  perform 1 from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then
    raise exception 'Room is not ready to start';
  end if;

  select count(*) into v_player_count from public.room_members
  where room_id = p_room_id and status = 'approved';
  if v_player_count not between 3 and 18 then
    raise exception 'A match needs between 3 and 18 approved players';
  end if;

  update public.rooms set status = 'active', round_number = 1, state_version = state_version + 1
  where id = p_room_id;

  insert into public.game_rounds (room_id, number, dealer_user_id)
  values (p_room_id, 1, (select host_user_id from public.rooms where id = p_room_id))
  returning * into v_round;

  insert into public.round_players (round_id, user_id)
  select v_round.id, user_id from public.room_members
  where room_id = p_room_id and status = 'approved';

  return v_round;
end;
$$;

revoke all on function private.touch_updated_at() from public;
revoke all on function private.create_profile_for_user() from public;
revoke all on function private.is_room_member(uuid) from public;
revoke all on function private.is_room_host(uuid) from public;
revoke all on function private.can_view_round_player_cards(uuid) from public;
revoke all on function public.create_room(integer, text) from public;
revoke all on function public.request_room_join(text, text) from public;
revoke all on function public.approve_room_member(uuid, uuid) from public;
revoke all on function public.start_match(uuid) from public;
grant execute on function public.create_room(integer, text) to authenticated;
grant execute on function public.request_room_join(text, text) to authenticated;
grant execute on function public.approve_room_member(uuid, uuid) to authenticated;
grant execute on function public.start_match(uuid) to authenticated;

commit;
