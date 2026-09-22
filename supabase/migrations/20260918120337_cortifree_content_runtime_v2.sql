create table if not exists public.content_config (
  key text primary key,
  value text,
  value_type text not null default 'string',
  description text,
  source text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_personas (
  persona_id text primary key,
  name text not null,
  age integer,
  background text,
  skin text,
  hair text,
  eyes text,
  face text,
  build text,
  situation text,
  visual_style text,
  signature_scene text,
  primary_topics text,
  voice text,
  cta_style text,
  medical_guardrails text,
  master_prompt text,
  identity_reference_prompt text,
  negative_prompt text,
  persona_drive_folder_id text,
  config_drive_file_id text,
  active boolean not null default true,
  weight numeric not null default 1,
  workspace_id text not null default 'cortifree',
  updated_at timestamptz not null default now()
);

create table if not exists public.content_accounts (
  account_id text primary key,
  persona_id text references public.content_personas(persona_id) on update cascade,
  platform text not null default 'tiktok',
  username text,
  display_name text,
  bio text,
  language text not null default 'en',
  market text not null default 'global',
  primary_pillar_id text,
  secondary_pillars text,
  upload_post_profile text,
  platform_account_id text,
  status text not null default 'PLANNED',
  posting_enabled boolean not null default false,
  posts_per_day numeric not null default 1,
  timezone text not null default 'UTC',
  promo_ratio numeric not null default 0.10,
  persona_ratio numeric not null default 0.60,
  pillar_mix jsonb not null default '{}'::jsonb,
  format_mix jsonb not null default '{}'::jsonb,
  last_posted_at timestamptz,
  failure_count integer not null default 0,
  active boolean not null default true,
  weight numeric not null default 1,
  workspace_id text not null default 'cortifree',
  updated_at timestamptz not null default now()
);

create table if not exists public.content_formats (
  format_id text primary key,
  name text not null,
  objective text,
  min_slides integer not null default 5,
  max_slides integer not null default 8,
  slide_structure text,
  hook_family text,
  cta_type text,
  image_strategy text,
  preferred_template_family text,
  eligible_pillars text,
  cooldown_days integer not null default 5,
  weight numeric not null default 1,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (min_slides > 0 and max_slides >= min_slides)
);

create table if not exists public.content_pillars (
  pillar_id text primary key,
  name text not null,
  purpose text,
  keywords text,
  visual_bucket text,
  preferred_formats text,
  persona_ids text,
  weight numeric not null default 1,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_topics (
  topic_id text primary key,
  pillar_id text references public.content_pillars(pillar_id) on update cascade,
  topic text not null,
  angle text not null,
  target_problem text,
  target_emotion text,
  eligible_formats text,
  eligible_personas text,
  season text not null default 'evergreen',
  priority text not null default 'MEDIUM',
  weight numeric not null default 1,
  cooldown_days integer not null default 14,
  use_count integer not null default 0,
  last_used_at timestamptz,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_hooks (
  hook_id text primary key,
  hook_family text not null,
  formula text not null,
  required_variables text[] not null default '{}'::text[],
  optional_variables text[] not null default '{}'::text[],
  emotion text,
  intensity text,
  compatible_formats text,
  compatible_pillars text,
  persona_fit text,
  weight numeric not null default 1,
  cooldown_days integer not null default 7,
  use_count integer not null default 0,
  last_used_at timestamptz,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_ctas (
  cta_id text primary key,
  cta_family text not null,
  text text not null,
  intent text,
  compatible_formats text,
  weight numeric not null default 1,
  cooldown_days integer not null default 3,
  use_count integer not null default 0,
  last_used_at timestamptz,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_claim_rules (
  rule_id text primary key,
  topic text not null,
  risk_level text not null,
  claim_type text,
  allowed_wording text,
  avoid_wording text,
  example_safe text,
  requires_source boolean not null default false,
  source_ids text[] not null default '{}'::text[],
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_health_sources (
  source_id text primary key,
  topic text not null,
  organization text,
  title text not null,
  url text not null,
  evidence_level text,
  last_reviewed date,
  allowed_claims text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_template_specs (
  template_id text primary key,
  family text,
  role text,
  headline_max_chars integer,
  body_max_chars integer,
  image_required boolean not null default true,
  person_preferred boolean not null default false,
  safe_area jsonb not null default '{}'::jsonb,
  layout_version integer not null default 1,
  weight numeric not null default 1,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_performance (
  carousel_id text primary key,
  account_id text,
  persona_id text,
  format_id text,
  pillar_id text,
  topic_id text,
  hook_id text,
  cta_id text,
  platform text,
  posted_at timestamptz,
  views_1h bigint,
  views_24h bigint,
  views_72h bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  profile_visits bigint,
  installs bigint,
  revenue_usd numeric,
  completion_rate numeric,
  engagement_rate numeric,
  save_rate numeric,
  share_rate numeric,
  install_rate numeric,
  performance_score numeric,
  source_post_url text,
  synced_at timestamptz not null default now()
);

create table if not exists public.content_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING',
  source_version text,
  rows_created integer not null default 0,
  rows_updated integer not null default 0,
  rows_skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.content_generation_qa (
  id bigint generated always as identity primary key,
  carousel_id text not null,
  slide_id uuid,
  qa_type text not null,
  status text not null,
  severity text not null default 'WARN',
  reason text,
  details jsonb not null default '{}'::jsonb,
  auto_fixable boolean not null default false,
  fixed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.content_asset_usage (
  id bigint generated always as identity primary key,
  asset_id bigint,
  visual_reference_id text,
  persona_id text,
  account_id text,
  carousel_id text,
  slide_id uuid,
  use_scope text not null default 'network',
  used_at timestamptz not null default now()
);

create index if not exists content_topics_pillar_active_idx on public.content_topics(pillar_id,active);
create index if not exists content_topics_last_used_idx on public.content_topics(last_used_at);
create index if not exists content_hooks_family_active_idx on public.content_hooks(hook_family,active);
create index if not exists content_hooks_last_used_idx on public.content_hooks(last_used_at);
create index if not exists content_ctas_last_used_idx on public.content_ctas(last_used_at);
create index if not exists content_asset_usage_asset_used_idx on public.content_asset_usage(asset_id,used_at desc);
create index if not exists content_asset_usage_ref_used_idx on public.content_asset_usage(visual_reference_id,used_at desc);
create index if not exists content_asset_usage_account_used_idx on public.content_asset_usage(account_id,used_at desc);
create index if not exists content_qa_carousel_status_idx on public.content_generation_qa(carousel_id,status);
create index if not exists content_perf_account_posted_idx on public.content_performance(account_id,posted_at desc);

alter table public.content_config enable row level security;
alter table public.content_personas enable row level security;
alter table public.content_accounts enable row level security;
alter table public.content_formats enable row level security;
alter table public.content_pillars enable row level security;
alter table public.content_topics enable row level security;
alter table public.content_hooks enable row level security;
alter table public.content_ctas enable row level security;
alter table public.content_claim_rules enable row level security;
alter table public.content_health_sources enable row level security;
alter table public.content_template_specs enable row level security;
alter table public.content_performance enable row level security;
alter table public.content_sync_runs enable row level security;
alter table public.content_generation_qa enable row level security;
alter table public.content_asset_usage enable row level security;

revoke all on table
  public.content_config, public.content_personas, public.content_accounts,
  public.content_formats, public.content_pillars, public.content_topics,
  public.content_hooks, public.content_ctas, public.content_claim_rules,
  public.content_health_sources, public.content_template_specs,
  public.content_performance, public.content_sync_runs,
  public.content_generation_qa, public.content_asset_usage
from anon, authenticated;

grant select, insert, update, delete on table
  public.content_config, public.content_personas, public.content_accounts,
  public.content_formats, public.content_pillars, public.content_topics,
  public.content_hooks, public.content_ctas, public.content_claim_rules,
  public.content_health_sources, public.content_template_specs,
  public.content_performance, public.content_sync_runs,
  public.content_generation_qa, public.content_asset_usage
to service_role;

grant usage, select on all sequences in schema public to service_role;
