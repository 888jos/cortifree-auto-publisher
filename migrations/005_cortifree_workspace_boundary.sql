-- CortiFree and Cocorise share one Supabase project for billing only.
-- CortiFree owns the tables below; every row is explicitly namespaced so an
-- API query can never accidentally aggregate another product's data.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'personas',
    'accounts',
    'assets',
    'content_formats',
    'carousel_ideas',
    'carousels',
    'carousel_slides',
    'image_generation_jobs',
    'render_jobs',
    'publish_jobs',
    'platform_posts',
    'analytics_snapshots',
    'template_performance',
    'topic_performance',
    'persona_performance',
    'system_logs',
    'ai_usage_logs',
    'asset_usage_history'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'alter table public.%I add column if not exists workspace_id text not null default %L',
        table_name,
        'cortifree'
      );
      execute format(
        'update public.%I set workspace_id = %L where workspace_id is distinct from %L',
        table_name,
        'cortifree',
        'cortifree'
      );
      execute format(
        'create index if not exists %I on public.%I (workspace_id)',
        table_name || '_workspace_idx',
        table_name
      );
    end if;
  end loop;
end $$;

-- These are CortiFree-owned tables. The constraint makes the boundary hard,
-- rather than relying only on each caller remembering a filter.
do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'personas', 'accounts', 'assets', 'content_formats', 'carousel_ideas',
    'carousels', 'carousel_slides', 'image_generation_jobs', 'render_jobs',
    'publish_jobs', 'platform_posts', 'analytics_snapshots',
    'template_performance', 'topic_performance', 'persona_performance',
    'system_logs', 'ai_usage_logs', 'asset_usage_history'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      constraint_name := table_name || '_cortifree_workspace_check';
      if not exists (
        select 1
        from pg_constraint
        where conname = constraint_name
          and conrelid = to_regclass('public.' || table_name)
      ) then
        execute format(
          'alter table public.%I add constraint %I check (workspace_id = %L)',
          table_name,
          constraint_name,
          'cortifree'
        );
      end if;
    end if;
  end loop;
end $$;
