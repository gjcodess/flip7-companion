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
  v_card public.round_cards;
  v_event_type text;
  v_target_user_id uuid;
  v_target_player public.round_players;
  v_second_chance_used boolean := false;
begin
  select rc.*
    into v_card
  from public.round_cards rc
  join public.round_players rp on rp.id = rc.round_player_id
  join public.game_rounds gr on gr.id = rp.round_id
  where rc.id = p_card_id
    and gr.room_id = p_room_id
    and gr.status in ('active','review')
    and (rc.voided_at is null or (
      coalesce((select (ge.payload->>'second_chance_used')::boolean from public.game_events ge where ge.id = rc.source_event_id), false)
      and not exists (
        select 1
        from public.game_events correction
        where correction.round_id = gr.id
          and correction.event_type = 'card_corrected'
          and correction.payload->>'card_id' = rc.id::text
      )
    ))
  for update;
  if not found then raise exception 'Card cannot be corrected'; end if;
  select ge.event_type, ge.target_user_id, coalesce((ge.payload->>'second_chance_used')::boolean, false)
    into v_event_type, v_target_user_id, v_second_chance_used
  from public.game_events ge
  where ge.id = v_card.source_event_id;

  select rp.* into v_player
  from public.round_cards rc
  join public.round_players rp on rp.id = rc.round_player_id
  where rc.id = p_card_id;
  if v_player.user_id <> v_actor and not private.is_room_host(p_room_id) then raise exception 'Only the player or host can correct a card'; end if;
  select gr.id into v_round_id from public.game_rounds gr where gr.room_id = p_room_id and gr.status in ('active','review') order by gr.number desc limit 1;

  if v_card.card_code = 'action:second_chance' and v_target_user_id is not null then
    select rp.* into v_target_player
    from public.round_players rp
    where rp.round_id = v_player.round_id and rp.user_id = v_target_user_id
    for update;
    if found then
      update public.round_players
      set second_chance_count = greatest(0, second_chance_count - 1), confirmed_at = null
      where id = v_target_player.id;
    end if;
  elsif v_second_chance_used then
    update public.round_players
    set second_chance_count = second_chance_count + 1, confirmed_at = null
    where id = v_player.id;
  end if;

  update public.round_cards set voided_at = coalesce(voided_at, now()) where id = p_card_id;
  update public.round_players
  set status = 'active', confirmed_at = null, busted_at = null, frozen_at = null
  where id = v_player.id;
  perform private.recalculate_round_player(v_player.id);
  if v_target_player.id is not null then perform private.recalculate_round_player(v_target_player.id); end if;
  perform private.log_room_event(p_room_id, v_round_id, v_actor, v_player.user_id, p_client_event_id, 'card_corrected', jsonb_build_object('card_id', p_card_id, 'restored_second_chance', v_second_chance_used));
end;
$$;

revoke all on function public.void_round_card(uuid, uuid, uuid) from public;
grant execute on function public.void_round_card(uuid, uuid, uuid) to authenticated;
