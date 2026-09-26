-- A carousel cannot enter human review or approval without one distinct final
-- render per generated slide. Repair historical rows first, then enforce it.

with invalid as (
  select c.id
  from public.carousels c
  where c.workspace_id = 'cortifree'
    and c.status in ('READY_FOR_REVIEW', 'APPROVED')
    and (
      jsonb_typeof(c.spec -> 'generated_slides') <> 'array'
      or jsonb_array_length(coalesce(c.spec -> 'generated_slides', '[]'::jsonb)) = 0
      or (
        select count(*)
        from public.carousel_slides s
        where s.carousel_id = c.id
          and s.workspace_id = c.workspace_id
          and coalesce(s.status, 'CURRENT') = 'CURRENT'
          and s.rendered_url like 'https://%'
      ) <> jsonb_array_length(coalesce(c.spec -> 'generated_slides', '[]'::jsonb))
      or (
        select count(distinct s.rendered_url)
        from public.carousel_slides s
        where s.carousel_id = c.id
          and s.workspace_id = c.workspace_id
          and coalesce(s.status, 'CURRENT') = 'CURRENT'
          and s.rendered_url like 'https://%'
      ) <> jsonb_array_length(coalesce(c.spec -> 'generated_slides', '[]'::jsonb))
    )
)
update public.carousels c
set status = 'DRAFT',
    review_status = 'NEEDS_RENDER',
    approved_by = null,
    approved_at = null,
    scheduled_for = null,
    last_review_action = 'STATE_REPAIRED_MISSING_RENDER',
    updated_at = now()
from invalid
where c.id = invalid.id;

update public.carousels
set review_status = case
  when status = 'APPROVED' then 'APPROVED'
  when status = 'READY_FOR_REVIEW' then 'AWAITING_REVIEW'
  when status = 'SCHEDULED' then 'SCHEDULED'
  when status = 'POSTED' then 'POSTED'
  when status = 'REJECTED' then 'REJECTED'
  when status = 'DRAFT' and last_review_action = 'STATE_REPAIRED_MISSING_RENDER' then 'NEEDS_RENDER'
  else review_status
end,
updated_at = now()
where workspace_id = 'cortifree'
  and (
    (status = 'APPROVED' and review_status <> 'APPROVED')
    or (status = 'READY_FOR_REVIEW' and review_status <> 'AWAITING_REVIEW')
    or (status = 'SCHEDULED' and review_status <> 'SCHEDULED')
    or (status = 'POSTED' and review_status <> 'POSTED')
    or (status = 'REJECTED' and review_status <> 'REJECTED')
  );

create or replace function public.enforce_carousel_render_review_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_count integer;
  rendered_count integer;
  distinct_url_count integer;
begin
  if new.workspace_id <> 'cortifree' then
    return new;
  end if;

  if new.status in ('READY_FOR_REVIEW', 'APPROVED') then
    expected_count := case
      when jsonb_typeof(new.spec -> 'generated_slides') = 'array'
        then jsonb_array_length(new.spec -> 'generated_slides')
      else 0
    end;
    select count(*), count(distinct rendered_url)
      into rendered_count, distinct_url_count
    from public.carousel_slides
    where carousel_id = new.id
      and workspace_id = new.workspace_id
      and coalesce(status, 'CURRENT') = 'CURRENT'
      and rendered_url like 'https://%';
    if expected_count = 0 or rendered_count <> expected_count or distinct_url_count <> expected_count then
      raise exception 'RENDER_REQUIRED: carousel % expects % distinct final PNGs and has %', new.id, expected_count, rendered_count;
    end if;
  end if;

  if new.status = 'APPROVED' then new.review_status := 'APPROVED'; end if;
  if new.status = 'READY_FOR_REVIEW' then new.review_status := 'AWAITING_REVIEW'; end if;
  if new.status = 'SCHEDULED' then new.review_status := 'SCHEDULED'; end if;
  if new.status = 'POSTED' then new.review_status := 'POSTED'; end if;
  if new.status = 'REJECTED' then new.review_status := 'REJECTED'; end if;
  return new;
end;
$$;

drop trigger if exists carousels_render_review_integrity on public.carousels;
create trigger carousels_render_review_integrity
before insert or update of status, review_status, spec
on public.carousels
for each row execute function public.enforce_carousel_render_review_integrity();

comment on function public.enforce_carousel_render_review_integrity() is
  'Prevents READY_FOR_REVIEW/APPROVED carousel states unless every generated slide has one distinct final HTTPS render.';
