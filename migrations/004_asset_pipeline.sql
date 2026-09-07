create extension if not exists pgcrypto;

-- The production project originally had a smaller Drive index table. Keep its
-- bigint primary key and expand it in place so this migration is safe on both
-- the legacy database and a fresh installation.
alter table assets add column if not exists path text;
alter table assets add column if not exists relative_path text;
alter table assets add column if not exists persona_id text;
alter table assets add column if not exists source_type text not null default 'stock';
alter table assets add column if not exists width integer not null default 0;
alter table assets add column if not exists height integer not null default 0;
alter table assets add column if not exists hash text;
alter table assets add column if not exists indexed_at timestamptz not null default now();
alter table assets add column if not exists last_used_at timestamptz;
alter table assets add column if not exists use_count integer not null default 0;
alter table assets add column if not exists enabled boolean not null default true;
alter table assets add column if not exists storage_bucket text;
alter table assets add column if not exists storage_path text;
alter table assets add column if not exists public_url text;
alter table assets add column if not exists subcategory text not null default 'general';
alter table assets add column if not exists orientation text not null default 'portrait';
alter table assets add column if not exists framing text not null default 'medium';
alter table assets add column if not exists activity text not null default 'lifestyle';
alter table assets add column if not exists mood text not null default 'calm';
alter table assets add column if not exists colors jsonb not null default '[]'::jsonb;
alter table assets add column if not exists tags jsonb not null default '[]'::jsonb;
alter table assets add column if not exists metadata jsonb not null default '{}'::jsonb;

update assets set path = coalesce(path, drive_path, 'legacy://' || id::text);
update assets set relative_path = coalesce(relative_path, drive_path, filename, id::text);
update assets set hash = coalesce(hash, md5(coalesce(drive_path, filename, id::text)));
create unique index if not exists assets_path_unique_idx on assets(path);
create index if not exists assets_category_subcategory_idx on assets(category, subcategory) where enabled = true;
create index if not exists assets_usage_idx on assets(use_count, last_used_at) where enabled = true;

create table if not exists carousel_slides (
  id uuid primary key default gen_random_uuid(),
  carousel_id text not null references carousels(id) on delete cascade,
  position integer not null,
  template_id text not null,
  headline text not null,
  subheadline text,
  body text,
  asset_requirement jsonb not null default '{}'::jsonb,
  asset_id bigint references assets(id),
  rendered_url text,
  render_metadata jsonb not null default '{}'::jsonb,
  unique(carousel_id, position)
);

create table if not exists asset_usage_history (
  id uuid primary key default gen_random_uuid(),
  asset_id bigint not null references assets(id) on delete cascade,
  carousel_id text not null references carousels(id) on delete cascade,
  slide_position integer not null,
  match_score numeric not null default 0,
  matched_terms jsonb not null default '[]'::jsonb,
  used_at timestamptz not null default now(),
  unique(carousel_id, slide_position)
);

alter table carousel_slides add column if not exists rendered_url text;
alter table carousel_slides add column if not exists render_metadata jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cortifree-assets',
  'cortifree-assets',
  true,
  20971520,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
