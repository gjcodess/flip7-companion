begin;

create or replace function private.cleanup_expired_rooms(p_retention_days integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_rooms integer;
  v_deleted_guests integer;
begin
  if p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'Retention period must be between 1 and 365 days';
  end if;

  delete from public.rooms
  where (
    status = 'completed'
    and completed_at is not null
    and completed_at < now() - make_interval(days => p_retention_days)
  )
  or (
    status = 'abandoned'
    and coalesce(host_offline_since, updated_at, created_at) < now() - make_interval(days => p_retention_days)
  );
  get diagnostics v_deleted_rooms = row_count;

  delete from auth.users u
  where u.is_anonymous = true
    and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => p_retention_days)
    and not exists (
      select 1
      from public.room_members rm
      where rm.user_id = u.id
    );
  get diagnostics v_deleted_guests = row_count;

  return v_deleted_rooms + v_deleted_guests;
end;
$$;

revoke all on function private.cleanup_expired_rooms(integer) from public;

select cron.schedule(
  'flip7-cleanup-expired-rooms',
  '15 3 * * *',
  $$select private.cleanup_expired_rooms(5);$$
);

commit;
