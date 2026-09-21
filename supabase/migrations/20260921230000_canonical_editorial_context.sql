alter table carousels add column if not exists topic_id text;
alter table carousels add column if not exists hook_id text;
alter table carousels add column if not exists format_id text;
alter table carousels add column if not exists editorial_context jsonb not null default '{}'::jsonb;
alter table carousels add column if not exists brand_integration_id text;
create index if not exists carousels_editorial_link_idx on carousels(workspace_id, account_id, persona_id, format_id, topic_id, hook_id);
create table if not exists content_language_bank (
  term_id text primary key,
  profile_id text not null default 'GENZ_GIRLY_US',
  term text not null,
  category text not null,
  audience text,
  tone text,
  example_usage text,
  related_search_intent text,
  freshness text,
  expires_at timestamptz,
  safe_for_health boolean not null default true,
  weight numeric not null default 1,
  active boolean not null default true,
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree')
);
