begin;

create extension if not exists pg_cron;

create or replace function private.cleanup_expired_rooms(p_retention_days integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
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

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_expired_rooms(integer) from public;

select cron.schedule(
  'flip7-cleanup-expired-rooms',
  '15 3 * * *',
  $$select private.cleanup_expired_rooms(5);$$
);

commit;
