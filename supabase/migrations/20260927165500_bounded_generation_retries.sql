alter table if exists public.carousel_ideas
  add column if not exists generation_attempts integer not null default 0;

create index if not exists idx_carousel_ideas_failed_generation_retry
  on public.carousel_ideas (workspace_id, status, generation_attempts, updated_at)
  where status = 'FAILED';
