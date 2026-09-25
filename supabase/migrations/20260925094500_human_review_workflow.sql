alter table public.carousels
  add column if not exists review_status text not null default 'AWAITING_REVIEW',
  add column if not exists review_notes text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists scheduled_for timestamptz,
  add column if not exists generation_batch_date date,
  add column if not exists source_timezone text not null default 'Europe/Paris',
  add column if not exists publish_timezone text not null default 'America/New_York',
  add column if not exists publish_window_start time not null default '18:00',
  add column if not exists publish_window_end time not null default '23:00',
  add column if not exists requires_human_approval boolean not null default true,
  add column if not exists auto_post_without_approval boolean not null default false,
  add column if not exists revision_count integer not null default 0,
  add column if not exists current_version integer not null default 1,
  add column if not exists last_review_action text,
  add column if not exists locked_structure boolean not null default false;

alter table public.carousel_slides
  add column if not exists version integer not null default 1,
  add column if not exists copy_locked boolean not null default false,
  add column if not exists visual_locked boolean not null default false,
  add column if not exists visual_intent text,
  add column if not exists selected_visual_reference_id text,
  add column if not exists status text not null default 'CURRENT';


alter table public.publish_jobs
  add column if not exists account_id text,
  add column if not exists platform text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists external_id text,
  add column if not exists idempotency_key text,
  add column if not exists attempts integer not null default 0,
  add column if not exists provider_request_id text,
  add column if not exists provider_job_id text,
  add column if not exists last_error text,
  add column if not exists post_url text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists publish_jobs_idempotency_key_idx
  on public.publish_jobs (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.carousel_review_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  carousel_id text not null references public.carousels(id) on delete cascade,
  actor text not null default 'admin',
  event_type text not null,
  target_scope text not null default 'carousel',
  slide_index integer,
  feedback_text text,
  patch_plan jsonb not null default '{}'::jsonb,
  before_version integer,
  after_version integer,
  created_at timestamptz not null default now()
);

alter table public.carousel_review_events enable row level security;

create index if not exists carousel_review_events_carousel_created_idx
  on public.carousel_review_events (carousel_id, created_at desc);
create index if not exists carousels_review_status_idx
  on public.carousels (review_status, created_at desc);
create index if not exists carousels_scheduled_for_idx
  on public.carousels (scheduled_for)
  where scheduled_for is not null;

update public.carousels
set review_status = case
  when status = 'APPROVED' then 'APPROVED'
  when status = 'SCHEDULED' then 'SCHEDULED'
  when status = 'POSTED' then 'POSTED'
  when status = 'REJECTED' then 'REJECTED'
  else 'AWAITING_REVIEW'
end
where review_status is null or review_status = '';
