create table if not exists public.worker_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'cortifree',
  kind text not null,
  resource_id text,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING','RUNNING','RETRY','DONE','FAILED','CANCELLED')),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  worker_id text,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists worker_jobs_idempotency_key_unique
  on public.worker_jobs (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists worker_jobs_poll_idx
  on public.worker_jobs (status, next_attempt_at, priority desc, created_at);

create index if not exists worker_jobs_resource_idx
  on public.worker_jobs (kind, resource_id, status);

alter table public.worker_jobs enable row level security;

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  workspace_id text not null default 'cortifree',
  version text,
  capabilities text[] not null default '{}'::text[],
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists worker_heartbeats_seen_idx
  on public.worker_heartbeats (workspace_id, last_seen_at desc);

alter table public.worker_heartbeats enable row level security;

alter table public.image_generation_jobs
  add column if not exists worker_id text,
  add column if not exists locked_at timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 3,
  add column if not exists priority integer not null default 0;

create index if not exists image_generation_jobs_worker_poll_idx
  on public.image_generation_jobs (status, next_attempt_at, priority desc, created_at);
