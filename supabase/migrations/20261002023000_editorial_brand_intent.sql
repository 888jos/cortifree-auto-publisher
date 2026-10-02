-- Preserve editorial promo intent between planning slots and generated ideas.
alter table if exists public.carousel_ideas
  add column if not exists brand_required boolean not null default false,
  add column if not exists brand_integration jsonb not null default '{}'::jsonb,
  add column if not exists app_screenshot_required boolean not null default false,
  add column if not exists copy_bank_seed_id text;

comment on column public.carousel_ideas.brand_required is 'Whether this idea should mention/integrate CortiFree. False means editorial-only copy.';
comment on column public.carousel_ideas.brand_integration is 'Planning metadata for natural CortiFree integration; never implies a screenshot exists.';
comment on column public.carousel_ideas.app_screenshot_required is 'True only when a real approved app-screen asset is available and required.';
comment on column public.carousel_ideas.copy_bank_seed_id is 'Optional product-integration copy reference id; style reference only, never verbatim requirement.';
