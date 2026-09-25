create table if not exists public.analytics_snapshots (
  id text primary key,
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  content_kind text not null default 'carousel' check (content_kind in ('carousel','video','image','other')),
  carousel_id text references public.carousels(id) on delete set null,
  account_id text,
  platform text not null,
  provider_request_id text,
  platform_post_id text,
  profile_username text,
  post_url text,
  media_type text,
  captured_at timestamptz not null default now(),
  views bigint not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  favorites bigint not null default 0,
  profile_views bigint not null default 0,
  new_followers bigint not null default 0,
  watch_time_minutes numeric,
  average_view_duration_seconds numeric,
  average_view_percentage numeric,
  full_video_watched_rate numeric,
  total_time_watched numeric,
  performance_score numeric not null default 0,
  retention jsonb not null default '[]'::jsonb,
  impression_sources jsonb not null default '{}'::jsonb,
  audience_types jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists analytics_snapshots_carousel_captured_idx
  on public.analytics_snapshots(carousel_id, captured_at desc);
create index if not exists analytics_snapshots_account_captured_idx
  on public.analytics_snapshots(account_id, captured_at desc);
create index if not exists analytics_snapshots_platform_post_idx
  on public.analytics_snapshots(platform, platform_post_id, captured_at desc);
create index if not exists analytics_snapshots_score_idx
  on public.analytics_snapshots(performance_score desc, captured_at desc);

alter table public.analytics_snapshots enable row level security;
revoke all on table public.analytics_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.analytics_snapshots to service_role;

comment on table public.analytics_snapshots is
  'Canonical CortiFree per-post analytics snapshots for carousels and videos, populated from Upload-Post live analytics.';
