-- Bring the Supabase runtime schema in line with the autonomy/publishing code.
alter table public.content_accounts
  add column if not exists daily_target integer not null default 1,
  add column if not exists posting_slots text[] not null default '{}'::text[],
  add column if not exists enabled boolean not null default true,
  add column if not exists secondary_pillar_ids text[] not null default '{}'::text[],
  add column if not exists ready_buffer_days integer not null default 3,
  add column if not exists warmup_status text not null default 'CREATED',
  add column if not exists created_at timestamptz not null default now();

update public.content_accounts
set
  daily_target = greatest(0, least(2, coalesce(round(posts_per_day)::integer, 1))),
  enabled = active,
  secondary_pillar_ids = case
    when coalesce(btrim(secondary_pillars), '') = '' then '{}'::text[]
    else regexp_split_to_array(secondary_pillars, '\\s*[|,]\\s*')
  end,
  warmup_status = case upper(coalesce(status, ''))
    when 'ACTIVE' then 'ACTIVE'
    when 'WARMING' then 'WARMING'
    when 'PAUSED' then 'PAUSED'
    when 'ERROR' then 'ERROR'
    else 'CREATED'
  end;

create table if not exists public.carousel_ideas (
  id text primary key,
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  account_id text not null,
  persona_id text not null,
  pillar_id text,
  content_type text not null,
  topic_id text,
  topic text not null,
  angle text,
  hook_id text,
  hook_formula text,
  final_hook text,
  cta_id text,
  cta_text text,
  visual_ref_id text,
  combo_key text,
  strategy text,
  status text not null default 'QUEUED',
  seed text,
  acceptance_batch_id text,
  carousel_id text references public.carousels(id) on delete set null,
  source_winner_id text references public.carousels(id) on delete set null,
  render_status text,
  last_error text,
  started_at timestamptz,
  generated_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carousel_ideas enable row level security;
revoke all on table public.carousel_ideas from anon, authenticated;
grant select, insert, update, delete on table public.carousel_ideas to service_role;

create index if not exists carousel_ideas_account_status_idx
  on public.carousel_ideas(account_id, status, created_at);
create index if not exists carousel_ideas_source_winner_idx
  on public.carousel_ideas(source_winner_id)
  where source_winner_id is not null;
create index if not exists carousel_ideas_combo_idx
  on public.carousel_ideas(combo_key, created_at desc)
  where combo_key is not null;

alter table public.carousels
  add column if not exists pillar_id text,
  add column if not exists cta_id text,
  add column if not exists strategy text,
  add column if not exists source_idea_id text,
  add column if not exists combo_key text,
  add column if not exists is_winner boolean not null default false,
  add column if not exists performance_score numeric,
  add column if not exists winner_at timestamptz;

create index if not exists carousels_winner_idx
  on public.carousels(is_winner, winner_at desc)
  where is_winner = true;

alter table public.publish_jobs
  add column if not exists published_at timestamptz;

alter table public.analytics_snapshots
  add column if not exists publish_job_id bigint references public.publish_jobs(id) on delete set null,
  add column if not exists snapshot_label text,
  add column if not exists age_hours numeric,
  add column if not exists published_at timestamptz;

create unique index if not exists analytics_snapshots_job_label_unique
  on public.analytics_snapshots(publish_job_id, snapshot_label)
  where publish_job_id is not null and snapshot_label is not null;

-- These tables are accessed through the workspace-aware backend adapter.
alter table public.content_config
  add column if not exists workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree');
alter table public.content_performance
  add column if not exists workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree');
alter table public.content_sync_runs
  add column if not exists workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree');
alter table public.content_generation_qa
  add column if not exists workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree');
alter table public.content_asset_usage
  add column if not exists workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree');

create index if not exists content_performance_workspace_posted_idx
  on public.content_performance(workspace_id, account_id, posted_at desc);
