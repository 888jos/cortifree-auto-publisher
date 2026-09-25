create table if not exists public.image_recovery_manifest (
  usage_id uuid primary key,
  workspace_id text not null default 'cortifree',
  persona_id text not null,
  usage_at timestamptz not null,
  object_name text,
  object_at timestamptz,
  md5 text,
  bytes bigint,
  lag_s numeric,
  category text,
  scene text,
  status text not null,
  existing_asset_id bigint,
  existing_drive_file_id text,
  existing_filename text,
  existing_category text,
  recovered_drive_file_id text,
  recovered_drive_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.image_recovery_manifest
  add column if not exists workspace_id text not null default 'cortifree';

create index if not exists image_recovery_manifest_status_idx
  on public.image_recovery_manifest (workspace_id, status, usage_at);

create index if not exists image_recovery_manifest_md5_idx
  on public.image_recovery_manifest (workspace_id, md5);
