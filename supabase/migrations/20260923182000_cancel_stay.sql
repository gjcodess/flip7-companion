-- Let a player undo an accidental Stay / Bank before confirming the round.
create or replace function public.cancel_stay(
  p_room_id uuid,
  p_client_event_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_round public.game_rounds;
  v_player public.round_players;
begin
  if v_actor is null then raise exception 'Authentication is required'; end if;
  select * into v_round from public.game_rounds
    where room_id = p_room_id and status = 'active'
    order by number desc limit 1 for update;
  if not found then raise exception 'There is no active round'; end if;
  select * into v_player from public.round_players
    where round_id = v_round.id and user_id = v_actor for update;
  if not found or v_player.status <> 'stayed' or v_player.confirmed_at is not null then
    raise exception 'Only an unconfirmed stay can be canceled';
  end if;

  update public.round_players
  set status = 'active', confirmed_at = null, busted_at = null, frozen_at = null
  where id = v_player.id;
  perform private.recalculate_round_player(v_player.id);
  perform private.log_room_event(p_room_id, v_round.id, v_actor, null, p_client_event_id, 'stay_canceled', '{}'::jsonb);
end;
$$;

revoke all on function public.cancel_stay(uuid, uuid) from public;
grant execute on function public.cancel_stay(uuid, uuid) to authenticated;
