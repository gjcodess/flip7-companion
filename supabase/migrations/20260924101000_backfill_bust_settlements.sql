-- Backfill rounds that were busted before automatic bust confirmation was added.
update public.round_players
set confirmed_at = coalesce(confirmed_at, now())
where status = 'busted' and confirmed_at is null;

update public.game_rounds gr
set status = 'review', review_started_at = coalesce(review_started_at, now())
where gr.status = 'active'
  and not exists (
    select 1 from public.round_players rp
    where rp.round_id = gr.id and rp.confirmed_at is null
  );

update public.rooms r
set status = 'round_review'
from public.game_rounds gr
where gr.room_id = r.id
  and gr.status = 'review'
  and r.status = 'active';
