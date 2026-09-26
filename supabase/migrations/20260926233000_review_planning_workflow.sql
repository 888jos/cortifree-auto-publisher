alter table public.carousels
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists approved_version integer,
  add column if not exists rejection_reason_code text,
  add column if not exists rejection_action text;

create index if not exists carousels_review_queue_persona_idx
  on public.carousels (review_status, persona_id, created_at desc);

create index if not exists carousels_planning_persona_idx
  on public.carousels (persona_id, scheduled_for)
  where scheduled_for is not null;

update public.carousels
set approved_version = current_version
where status in ('APPROVED','SCHEDULED','PUBLISHED')
  and approved_version is null;
