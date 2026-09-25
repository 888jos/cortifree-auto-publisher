-- CortiFree security and performance cleanup applied to production on 2026-09-25.
-- Runtime data cleanup is intentionally kept out of schema migrations.

alter table public.content_language_bank enable row level security;
revoke all on table public.content_language_bank from anon, authenticated;

create index if not exists accounts_persona_id_idx
  on public.accounts(persona_id);

create index if not exists asset_usage_history_asset_id_idx
  on public.asset_usage_history(asset_id);

create index if not exists carousel_slides_asset_id_idx
  on public.carousel_slides(asset_id);

create index if not exists carousels_persona_id_idx
  on public.carousels(persona_id);

create index if not exists content_accounts_persona_id_idx
  on public.content_accounts(persona_id);

create index if not exists image_generation_usage_job_id_idx
  on public.image_generation_usage(job_id);

create index if not exists publish_jobs_carousel_id_idx
  on public.publish_jobs(carousel_id);
