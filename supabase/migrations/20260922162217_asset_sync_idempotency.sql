-- Additive sync keys. No Drive objects or existing runtime IDs are deleted.
alter table if exists assets add column if not exists drive_file_id text;
alter table if exists assets add column if not exists drive_md5 text;
alter table if exists assets add column if not exists drive_modified_time timestamptz;
alter table if exists visual_references add column if not exists drive_file_id text;

-- These keys make concurrent retries converge on the same runtime row.
create unique index if not exists assets_workspace_drive_file_unique
  on assets(workspace_id, drive_file_id)
  where drive_file_id is not null;

create unique index if not exists assets_stock_workspace_md5_unique
  on assets(workspace_id, drive_md5)
  where source_type = 'stock' and drive_md5 is not null;

create unique index if not exists visual_references_workspace_drive_file_unique
  on visual_references(workspace_id, drive_file_id)
  where drive_file_id is not null;

create index if not exists assets_workspace_filename_search_idx
  on assets(workspace_id, lower(filename));

create index if not exists visual_references_workspace_hash_search_idx
  on visual_references(workspace_id, file_hash)
  where file_hash is not null;

