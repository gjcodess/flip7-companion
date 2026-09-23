-- Freeze automatically confirms the targeted player's round result.
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
  values (case when v_kind = 'action' then v_target_player.id else v_actor_player.id end, p_card_code, v_kind, (select coalesce(max(sequence), 0) + 1 from public.round_cards where round_player_id = case when v_kind = 'action' then v_target_player.id else v_actor_player.id end))
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
    update public.round_players set status = 'frozen', frozen_at = now(), confirmed_at = now() where id = v_target_player.id;
    perform private.recalculate_round_player(v_target_player.id);
    if not exists(select 1 from public.round_players where round_id = v_round.id and confirmed_at is null) then
      update public.game_rounds set status = 'review', review_started_at = now() where id = v_round.id;
      update public.rooms set status = 'round_review' where id = p_room_id;
    end if;
  end if;

  perform private.recalculate_round_player(v_actor_player.id);
  v_event := private.log_room_event(p_room_id, v_round.id, v_actor, p_target_user_id, p_client_event_id,
    case when v_duplicate and v_actor_player.second_chance_count = 0 then 'bust_confirmed' else case when v_kind = 'action' then 'action_targeted' else 'card_recorded' end end,
    jsonb_build_object('card_code', p_card_code, 'card_id', v_card.id, 'second_chance_used', v_duplicate and v_actor_player.second_chance_count > 0));
  update public.round_cards set source_event_id = v_event.id where id = v_card.id;
  return jsonb_build_object('needs_bust_confirmation', false, 'card_id', v_card.id, 'event_id', v_event.id);
end;
$$;

