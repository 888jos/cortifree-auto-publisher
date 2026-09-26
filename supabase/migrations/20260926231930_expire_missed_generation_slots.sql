-- Expire missed production slots before they can consume generation credits.
-- Provider/upload-post state is intentionally untouched.

with missed as (
  select i.id as idea_id, s.id as slot_id
  from public.carousel_ideas i
  join public.content_slots s on s.id = i.slot_id
  where i.workspace_id = 'cortifree'
    and s.workspace_id = 'cortifree'
    and i.status = 'QUEUED'
    and s.status = 'QUEUED'
    and i.carousel_id is null
    and s.scheduled_for < now()
)
update public.carousel_ideas i
set status = 'EXPIRED_SLOT',
    last_error = 'SLOT_MISSED_BEFORE_GENERATION',
    finished_at = now(),
    updated_at = now()
from missed m
where i.id = m.idea_id;

update public.content_slots s
set status = 'MISSED',
    updated_at = now()
where s.workspace_id = 'cortifree'
  and s.status = 'QUEUED'
  and s.scheduled_for < now()
  and exists (
    select 1
    from public.carousel_ideas i
    where i.id = s.idea_id
      and i.status = 'EXPIRED_SLOT'
      and i.carousel_id is null
  );
