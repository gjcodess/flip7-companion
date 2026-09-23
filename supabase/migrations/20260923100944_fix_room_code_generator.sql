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
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
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

revoke all on function public.create_room(integer, text) from public;
grant execute on function public.create_room(integer, text) to authenticated;
