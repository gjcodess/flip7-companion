create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_next uuid;
  v_status public.room_status;
begin
  if v_user is null then raise exception 'Authentication is required'; end if;
  select host_user_id, status into v_host, v_status from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_user and status in ('pending','approved')) then
    raise exception 'You are not a member of this room';
  end if;

  update public.round_players rp
  set status = 'frozen', frozen_at = now(), confirmed_at = now()
  from public.game_rounds gr
  where gr.id = rp.round_id
    and gr.room_id = p_room_id
    and gr.status in ('active', 'review')
    and rp.user_id = v_user
    and rp.confirmed_at is null;

  update public.room_members
  set status = 'left', removed_at = now(), role = 'player'
  where room_id = p_room_id and user_id = v_user;

  if v_user = v_host then
    select user_id into v_next
    from public.room_members
    where room_id = p_room_id and status = 'approved'
    order by joined_at
    limit 1;
    if v_next is null then
      update public.rooms set status = 'abandoned', host_offline_since = now() where id = p_room_id;
    else
      update public.rooms set host_user_id = v_next, host_offline_since = null where id = p_room_id;
      update public.room_members set role = case when user_id = v_next then 'host' else 'player' end where room_id = p_room_id and status = 'approved';
    end if;
  end if;
end;
$$;

revoke all on function public.leave_room(uuid) from public;
grant execute on function public.leave_room(uuid) to authenticated;
