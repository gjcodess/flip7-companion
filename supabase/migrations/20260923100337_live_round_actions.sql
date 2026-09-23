begin;

alter table public.room_members add column last_seen_at timestamptz not null default now();
alter table public.round_players add column second_chance_count integer not null default 0 check (second_chance_count >= 0);
update public.room_members set final_score = 0 where final_score is null;
alter table public.room_members alter column final_score set default 0;
alter table public.room_members alter column final_score set not null;

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
      and private.is_room_member(r.id)
      and (
        rp.user_id = (select auth.uid())
        or r.host_user_id = (select auth.uid())
        or rp.status = 'active'
        or gr.status = 'finalized'
      )
  );
$$;

create or replace function private.recalculate_round_player(p_round_player_id uuid)
returns public.round_players
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.round_players;
  v_numbers integer := 0;
  v_modifiers integer := 0;
  v_number_count integer := 0;
  v_multiplier boolean := false;
  v_bonus integer := 0;
begin
  select * into v_player from public.round_players where id = p_round_player_id for update;
  if not found then raise exception 'Round player not found'; end if;

  select
    coalesce(sum((split_part(card_code, ':', 2))::integer) filter (where card_code like 'number:%'), 0),
    count(*) filter (where card_code like 'number:%'),
    coalesce(sum(case card_code
      when 'modifier:plus2' then 2 when 'modifier:plus4' then 4 when 'modifier:plus6' then 6
      when 'modifier:plus8' then 8 when 'modifier:plus10' then 10 else 0 end), 0),
    coalesce(bool_or(card_code = 'modifier:x2'), false)
  into v_numbers, v_number_count, v_modifiers, v_multiplier
  from public.round_cards
  where round_player_id = p_round_player_id and voided_at is null;

  if v_number_count >= 7 then v_bonus := 15; end if;

  update public.round_players
  set number_total = v_numbers,
      modifier_total = v_modifiers,
      has_multiplier = v_multiplier,
      flip_seven_bonus = v_bonus,
      round_score = case when status = 'busted' then 0 else (v_numbers * case when v_multiplier then 2 else 1 end) + v_modifiers + v_bonus end
  where id = p_round_player_id
  returning * into v_player;
  return v_player;
end;
$$;

create or replace function private.log_room_event(
  p_room_id uuid,
  p_round_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_client_event_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.game_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.game_events;
  v_version bigint;
begin
  update public.rooms set state_version = state_version + 1 where id = p_room_id returning state_version into v_version;
  insert into public.game_events (room_id, round_id, actor_user_id, target_user_id, client_event_id, event_type, payload, state_version)
  values (p_room_id, p_round_id, p_actor_user_id, p_target_user_id, p_client_event_id, p_event_type, p_payload, v_version)
  returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.record_round_card(
  p_room_id uuid,
  p_card_code text,
  p_target_user_id uuid default null,
  p_confirm_bust boolean default false,
  p_client_event_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_round public.game_rounds;
  v_actor_player public.round_players;
  v_target_player public.round_players;
  v_kind public.card_kind;
  v_duplicate boolean := false;
  v_card public.round_cards;
  v_event public.game_events;
begin
  if v_actor is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_actor and status = 'approved') then
    raise exception 'Only approved players can record cards';
  end if;
  select * into v_round from public.game_rounds where room_id = p_room_id and status = 'active' order by number desc limit 1 for update;
  if not found then raise exception 'There is no active round'; end if;
  select * into v_actor_player from public.round_players where round_id = v_round.id and user_id = v_actor for update;
  if v_actor_player.status <> 'active' then raise exception 'Your round is already settled'; end if;

  v_kind := case when p_card_code like 'number:%' then 'number'::public.card_kind when p_card_code like 'modifier:%' then 'modifier'::public.card_kind when p_card_code like 'action:%' then 'action'::public.card_kind else null end;
  if p_card_code !~ '^(number:(?:[0-9]|1[0-2])|modifier:(?:plus2|plus4|plus6|plus8|plus10|x2)|action:(?:second_chance|freeze|flip_three))$' then
    raise exception 'Unknown card';
  end if;

  if p_target_user_id is not null then
    select * into v_target_player from public.round_players where round_id = v_round.id and user_id = p_target_user_id for update;
    if not found then raise exception 'Choose an approved player at this table'; end if;
  end if;
  if v_kind = 'action' and p_target_user_id is null then raise exception 'Choose a player for this action card'; end if;

  if v_kind = 'number' then
    select exists(select 1 from public.round_cards where round_player_id = v_actor_player.id and card_code = p_card_code and voided_at is null) into v_duplicate;
    if v_duplicate and not p_confirm_bust and v_actor_player.second_chance_count = 0 then
      return jsonb_build_object('needs_bust_confirmation', true, 'card_code', p_card_code);
    end if;
  end if;

  insert into public.round_cards (round_player_id, card_code, kind, sequence)
  values (v_actor_player.id, p_card_code, v_kind, (select coalesce(max(sequence), 0) + 1 from public.round_cards where round_player_id = v_actor_player.id))
  returning * into v_card;

  if v_duplicate and v_actor_player.second_chance_count > 0 then
    update public.round_cards set voided_at = now() where id = v_card.id;
    update public.round_players set second_chance_count = second_chance_count - 1 where id = v_actor_player.id;
  elsif v_duplicate then
    update public.round_players set status = 'busted', busted_at = now(), confirmed_at = null where id = v_actor_player.id;
  end if;

  if p_card_code = 'action:second_chance' then
    update public.round_players set second_chance_count = second_chance_count + 1, confirmed_at = null where id = v_target_player.id;
  elsif p_card_code = 'action:freeze' then
    update public.round_players set status = 'frozen', frozen_at = now(), confirmed_at = null where id = v_target_player.id;
    perform private.recalculate_round_player(v_target_player.id);
  end if;

  perform private.recalculate_round_player(v_actor_player.id);
  v_event := private.log_room_event(p_room_id, v_round.id, v_actor, p_target_user_id, p_client_event_id,
    case when v_duplicate and v_actor_player.second_chance_count = 0 then 'bust_confirmed' else case when v_kind = 'action' then 'action_targeted' else 'card_recorded' end end,
    jsonb_build_object('card_code', p_card_code, 'card_id', v_card.id, 'second_chance_used', v_duplicate and v_actor_player.second_chance_count > 0));
  update public.round_cards set source_event_id = v_event.id where id = v_card.id;
  return jsonb_build_object('needs_bust_confirmation', false, 'card_id', v_card.id, 'event_id', v_event.id);
end;
$$;

create or replace function public.void_round_card(p_room_id uuid, p_card_id uuid, p_client_event_id uuid default gen_random_uuid())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_round_id uuid;
  v_player public.round_players;
begin
  select gr.id into v_round_id
  from public.round_cards rc join public.round_players rp on rp.id = rc.round_player_id join public.game_rounds gr on gr.id = rp.round_id
  where rc.id = p_card_id and gr.room_id = p_room_id and rc.voided_at is null and gr.status in ('active','review') for update;
  if not found then raise exception 'Card cannot be corrected'; end if;
  select rp.* into v_player from public.round_cards rc join public.round_players rp on rp.id = rc.round_player_id where rc.id = p_card_id;
  if v_player.user_id <> v_actor and not private.is_room_host(p_room_id) then raise exception 'Only the player or host can correct a card'; end if;
  update public.round_cards set voided_at = now() where id = p_card_id;
  update public.round_players set status = 'active', confirmed_at = null, busted_at = null, frozen_at = null where id = v_player.id;
  perform private.recalculate_round_player(v_player.id);
  perform private.log_room_event(p_room_id, v_round_id, v_actor, v_player.user_id, p_client_event_id, 'card_corrected', jsonb_build_object('card_id', p_card_id));
end;
$$;

create or replace function public.stay_in_round(p_room_id uuid, p_client_event_id uuid default gen_random_uuid())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_actor uuid := (select auth.uid()); v_round public.game_rounds; v_player public.round_players;
begin
  select * into v_round from public.game_rounds where room_id = p_room_id and status = 'active' order by number desc limit 1 for update;
  select * into v_player from public.round_players where round_id = v_round.id and user_id = v_actor for update;
  if not found or v_player.status <> 'active' then raise exception 'Only active players can stay'; end if;
  update public.round_players set status = 'stayed', confirmed_at = null where id = v_player.id;
  perform private.recalculate_round_player(v_player.id);
  perform private.log_room_event(p_room_id, v_round.id, v_actor, null, p_client_event_id, 'player_stayed');
end;
$$;

create or replace function public.confirm_round_result(p_room_id uuid, p_client_event_id uuid default gen_random_uuid())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_actor uuid := (select auth.uid()); v_round public.game_rounds; v_player public.round_players;
begin
  select * into v_round from public.game_rounds where room_id = p_room_id and status = 'active' order by number desc limit 1 for update;
  select * into v_player from public.round_players where round_id = v_round.id and user_id = v_actor for update;
  if not found or v_player.status = 'active' then raise exception 'Stay, freeze, or confirm your bust before confirming'; end if;
  update public.round_players set confirmed_at = now() where id = v_player.id;
  perform private.log_room_event(p_room_id, v_round.id, v_actor, null, p_client_event_id, 'round_confirmed');
  if not exists(select 1 from public.round_players where round_id = v_round.id and confirmed_at is null) then
    update public.game_rounds set status = 'review', review_started_at = now() where id = v_round.id;
    update public.rooms set status = 'round_review' where id = p_room_id;
  end if;
end;
$$;

create or replace function public.finalize_round(p_room_id uuid, p_client_event_id uuid default gen_random_uuid())
returns public.game_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_round public.game_rounds; v_next public.game_rounds; v_winner_count integer;
begin
  if not private.is_room_host(p_room_id) then raise exception 'Only the host can finalize this round'; end if;
  select * into v_round from public.game_rounds where room_id = p_room_id and status = 'review' order by number desc limit 1 for update;
  if not found then raise exception 'This round is not ready for finalization'; end if;
  update public.room_members rm set final_score = rm.final_score + rp.round_score
  from public.round_players rp where rp.round_id = v_round.id and rp.user_id = rm.user_id and rm.room_id = p_room_id;
  update public.round_players rp set total_score = rm.final_score from public.room_members rm where rp.round_id = v_round.id and rm.room_id = p_room_id and rm.user_id = rp.user_id;
  update public.game_rounds set status = 'finalized', finalized_at = now() where id = v_round.id;
  select count(*) into v_winner_count from public.room_members where room_id = p_room_id and final_score >= (select target_score from public.rooms where id = p_room_id);
  perform private.log_room_event(p_room_id, v_round.id, (select auth.uid()), null, p_client_event_id, 'round_finalized');
  if v_winner_count > 0 then
    update public.rooms set status = 'completed', completed_at = now() where id = p_room_id;
    return null;
  end if;
  update public.rooms set status = 'active', round_number = v_round.number + 1 where id = p_room_id;
  insert into public.game_rounds (room_id, number, dealer_user_id) values (p_room_id, v_round.number + 1, (select host_user_id from public.rooms where id = p_room_id)) returning * into v_next;
  insert into public.round_players (round_id, user_id, total_score) select v_next.id, user_id, coalesce(final_score, 0) from public.room_members where room_id = p_room_id and status = 'approved';
  return v_next;
end;
$$;

create or replace function public.heartbeat_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.room_members set last_seen_at = now() where room_id = p_room_id and user_id = (select auth.uid()) and status = 'approved';
end;
$$;

create or replace function public.transfer_host_if_stale(p_room_id uuid, p_client_event_id uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_current uuid; v_next uuid;
begin
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = (select auth.uid()) and status = 'approved') then
    raise exception 'Only approved players can check host transfer';
  end if;
  select host_user_id into v_current from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if coalesce((select last_seen_at from public.room_members where room_id = p_room_id and user_id = v_current), now()) > now() - interval '5 minutes' then return v_current; end if;
  select user_id into v_next from public.room_members where room_id = p_room_id and status = 'approved' and user_id <> v_current order by joined_at limit 1;
  if v_next is null then return v_current; end if;
  update public.rooms set host_user_id = v_next, host_offline_since = now() where id = p_room_id;
  update public.room_members set role = case when user_id = v_next then 'host' else 'player' end where room_id = p_room_id and user_id in (v_current, v_next);
  perform private.log_room_event(p_room_id, null, (select auth.uid()), v_next, p_client_event_id, 'host_transferred', jsonb_build_object('previous_host', v_current));
  return v_next;
end;
$$;

alter publication supabase_realtime add table public.rooms, public.room_members, public.game_rounds, public.round_players, public.round_cards, public.game_events;

revoke all on function private.recalculate_round_player(uuid) from public;
revoke all on function private.log_room_event(uuid, uuid, uuid, uuid, uuid, text, jsonb) from public;
revoke all on function public.record_round_card(uuid, text, uuid, boolean, uuid) from public;
revoke all on function public.void_round_card(uuid, uuid, uuid) from public;
revoke all on function public.stay_in_round(uuid, uuid) from public;
revoke all on function public.confirm_round_result(uuid, uuid) from public;
revoke all on function public.finalize_round(uuid, uuid) from public;
revoke all on function public.heartbeat_room(uuid) from public;
revoke all on function public.transfer_host_if_stale(uuid, uuid) from public;
grant execute on function public.record_round_card(uuid, text, uuid, boolean, uuid) to authenticated;
grant execute on function public.void_round_card(uuid, uuid, uuid) to authenticated;
grant execute on function public.stay_in_round(uuid, uuid) to authenticated;
grant execute on function public.confirm_round_result(uuid, uuid) to authenticated;
grant execute on function public.finalize_round(uuid, uuid) to authenticated;
grant execute on function public.heartbeat_room(uuid) to authenticated;
grant execute on function public.transfer_host_if_stale(uuid, uuid) to authenticated;

commit;
