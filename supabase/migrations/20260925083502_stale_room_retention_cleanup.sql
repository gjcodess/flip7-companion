begin;

create or replace function private.cleanup_expired_rooms(p_retention_days integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
  v_deleted_rooms integer := 0;
  v_deleted_guests integer := 0;
  v_rows integer := 0;
begin
  if p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'Retention period must be between 1 and 365 days';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  delete from public.rooms
  where (
    status = 'completed'
    and completed_at is not null
    and completed_at < v_cutoff
  )
  or (
    status = 'abandoned'
    and coalesce(host_offline_since, updated_at, created_at) < v_cutoff
  );
  get diagnostics v_rows = row_count;
  v_deleted_rooms := v_deleted_rooms + v_rows;

  -- Keep a live room while any approved player is still sending heartbeats.
  delete from public.rooms r
  where r.status in ('active', 'round_review')
    and not exists (
      select 1
      from public.room_members rm
      where rm.room_id = r.id
        and rm.status = 'approved'
        and rm.last_seen_at >= v_cutoff
    );
  get diagnostics v_rows = row_count;
  v_deleted_rooms := v_deleted_rooms + v_rows;

  -- Keep a lobby while its metadata or membership activity is recent.
  delete from public.rooms r
  where r.status = 'lobby'
    and greatest(
      coalesce(r.updated_at, r.created_at),
      coalesce((select max(rm.joined_at) from public.room_members rm where rm.room_id = r.id), r.created_at),
      coalesce((select max(rm.approved_at) from public.room_members rm where rm.room_id = r.id), r.created_at)
    ) < v_cutoff;
  get diagnostics v_rows = row_count;
  v_deleted_rooms := v_deleted_rooms + v_rows;

  -- Guest accounts are removed only when old and detached from all retained rooms.
  delete from auth.users u
  where u.is_anonymous = true
    and coalesce(u.last_sign_in_at, u.created_at) < v_cutoff
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

select cron.unschedule(jobid)
from cron.job
where jobname = 'flip7-cleanup-expired-rooms';

select cron.schedule(
  'flip7-cleanup-expired-rooms',
  '15 3 * * *',
  $$select private.cleanup_expired_rooms(5);$$
);

commit;
