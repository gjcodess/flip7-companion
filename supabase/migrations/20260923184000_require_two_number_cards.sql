-- Stay / Bank requires two number cards; modifiers and action cards do not count.
create or replace function public.stay_in_round(p_room_id uuid, p_client_event_id uuid default gen_random_uuid())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_round public.game_rounds;
  v_player public.round_players;
  v_card_count integer := 0;
begin
  select * into v_round from public.game_rounds where room_id = p_room_id and status = 'active' order by number desc limit 1 for update;
  if not found then raise exception 'There is no active round'; end if;
  select * into v_player from public.round_players where round_id = v_round.id and user_id = v_actor for update;
  if not found or v_player.status <> 'active' then raise exception 'Only active players can stay'; end if;
  select count(*) into v_card_count from public.round_cards where round_player_id = v_player.id and card_code like 'number:%' and voided_at is null;
  if v_card_count < 2 then raise exception 'You need at least 2 number cards before you can stay'; end if;
  update public.round_players set status = 'stayed', confirmed_at = null where id = v_player.id;
  perform private.recalculate_round_player(v_player.id);
  perform private.log_room_event(p_room_id, v_round.id, v_actor, null, p_client_event_id, 'player_stayed');
end;
$$;
