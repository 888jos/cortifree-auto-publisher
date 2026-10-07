-- Every CortiFree table is read and written by server routes and the worker
-- with the service-role key, which bypasses RLS. Nothing uses the anon key for
-- data, so direct PostgREST access is closed on every table that the migrations
-- did not already lock down (several were created without RLS).
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts', 'ai_usage_logs', 'asset_usage_history', 'assets', 'carousel_slides',
    'carousels', 'image_generation_jobs', 'image_generation_usage', 'persona_performance',
    'persona_scene_templates', 'personas', 'platform_posts', 'publish_jobs', 'render_jobs',
    'system_logs', 'template_performance', 'topic_performance', 'visual_references'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end $$;
