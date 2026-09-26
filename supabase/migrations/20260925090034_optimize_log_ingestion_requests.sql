begin;

-- Read snapshots replace several sequential Data API calls while retaining the
-- caller's existing RLS permissions.
create or replace function public.get_room_snapshot(p_room_code text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'host_user_id', r.host_user_id,
      'target_score', r.target_score,
      'status', r.status,
      'round_number', r.round_number
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'room_id', rm.room_id,
          'user_id', rm.user_id,
          'role', rm.role,
          'status', rm.status,
          'final_score', rm.final_score,
          'profiles', case
            when p.id is null then null
            else jsonb_build_object('display_name', p.display_name, 'avatar_color', p.avatar_color)
          end
        )
        order by rm.joined_at
      )
      from public.room_members rm
      left join public.profiles p on p.id = rm.user_id
      where rm.room_id = r.id
    ), '[]'::jsonb)
  )
  from public.rooms r
  where r.code = upper(trim(p_room_code));
$$;

create or replace function public.get_live_round_snapshot(p_room_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with latest_round as (
    select gr.id, gr.number, gr.status
    from public.game_rounds gr
    where gr.room_id = p_room_id
    order by gr.number desc
    limit 1
  )
  select jsonb_build_object(
    'id', lr.id,
    'number', lr.number,
    'status', lr.status,
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'user_id', rp.user_id,
          'status', rp.status,
          'round_score', rp.round_score,
          'total_score', rp.total_score,
          'flip_seven_bonus', rp.flip_seven_bonus,
          'second_chance_count', rp.second_chance_count,
          'confirmed_at', rp.confirmed_at,
          'profiles', case
            when p.id is null then null
            else jsonb_build_object('display_name', p.display_name, 'avatar_color', p.avatar_color)
          end
        )
        order by rp.id
      )
      from public.round_players rp
      left join public.profiles p on p.id = rp.user_id
      where rp.round_id = lr.id
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rc.id,
          'round_player_id', rc.round_player_id,
          'card_code', rc.card_code,
          'sequence', rc.sequence,
          'source_event_id', rc.source_event_id,
          'voided_at', rc.voided_at,
          'voided_by_second_chance', (
            rc.voided_at is not null
            and rc.source_event_id is not null
            and coalesce(source_event.payload ->> 'second_chance_used' = 'true', false)
          )
        )
        order by rc.sequence
      )
      from public.round_cards rc
      left join public.game_events source_event on source_event.id = rc.source_event_id
      where rc.round_player_id in (
        select rp.id
        from public.round_players rp
        where rp.round_id = lr.id
      )
      and not exists (
        select 1
        from public.game_events correction
        where correction.round_id = lr.id
          and correction.event_type = 'card_corrected'
          and correction.payload ->> 'card_id' = rc.id::text
      )
    ), '[]'::jsonb)
  )
  from latest_round lr;
$$;

create or replace function public.get_round_scores_snapshot(p_room_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'roundNumber', gr.number,
      'userId', rp.user_id,
      'score', rp.round_score
    )
    order by gr.number, rp.user_id
  ), '[]'::jsonb)
  from public.game_rounds gr
  join public.round_players rp on rp.round_id = gr.id
  where gr.room_id = p_room_id
    and gr.status = 'finalized';
$$;

-- Preserve the existing heartbeat and host-transfer rules while making them a
-- single client request.
create or replace function public.sync_room_presence(p_room_id uuid, p_client_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_user_id uuid;
begin
  perform public.heartbeat_room(p_room_id);
  v_host_user_id := public.transfer_host_if_stale(p_room_id, p_client_event_id);
  return v_host_user_id;
end;
$$;

revoke all on function public.get_room_snapshot(text) from public, anon;
revoke all on function public.get_live_round_snapshot(uuid) from public, anon;
revoke all on function public.get_round_scores_snapshot(uuid) from public, anon;
revoke all on function public.sync_room_presence(uuid, uuid) from public, anon;

grant execute on function public.get_room_snapshot(text) to authenticated;
grant execute on function public.get_live_round_snapshot(uuid) to authenticated;
grant execute on function public.get_round_scores_snapshot(uuid) to authenticated;
grant execute on function public.sync_room_presence(uuid, uuid) to authenticated;

commit;
