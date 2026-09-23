-- Award the Flip 7 bonus when seven number cards are present.
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
      round_score = case when status = 'busted' then 0 else (v_numbers + v_modifiers) * case when v_multiplier then 2 else 1 end + v_bonus end
  where id = p_round_player_id
  returning * into v_player;
  return v_player;
end;
$$;
