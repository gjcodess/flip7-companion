-- Treat an automatic bust as a settled result and open review when every player is settled.
create or replace function private.confirm_bust_and_open_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.game_rounds;
begin
  if new.status = 'busted' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists round_players_confirm_bust on public.round_players;
create trigger round_players_confirm_bust
before update of status on public.round_players
for each row
execute function private.confirm_bust_and_open_review();

create or replace function private.open_review_when_settled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.confirmed_at is not null and new.status <> 'active'
    and not exists (
      select 1 from public.round_players
      where round_id = new.round_id and confirmed_at is null
    ) then
    update public.game_rounds
    set status = 'review', review_started_at = coalesce(review_started_at, now())
    where id = new.round_id and status = 'active';
    update public.rooms r
    set status = 'round_review'
    from public.game_rounds gr
    where gr.id = new.round_id and r.id = gr.room_id and r.status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists round_players_open_review on public.round_players;
create trigger round_players_open_review
after update of confirmed_at, status on public.round_players
for each row
execute function private.open_review_when_settled();
