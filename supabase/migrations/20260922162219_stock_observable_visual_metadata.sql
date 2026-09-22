-- Observable visual metadata is additive and remains sourced from 08_STOCK_ASSETS.
alter table if exists assets add column if not exists visual_description text not null default '';
alter table if exists assets add column if not exists visible_objects jsonb not null default '[]'::jsonb;
alter table if exists assets add column if not exists visible_actions jsonb not null default '[]'::jsonb;
alter table if exists assets add column if not exists setting text not null default '';
alter table if exists assets add column if not exists people_visibility text not null default '';
alter table if exists assets add column if not exists body_parts_visible jsonb not null default '[]'::jsonb;
alter table if exists assets add column if not exists composition text not null default '';
alter table if exists assets add column if not exists camera_angle text not null default '';
alter table if exists assets add column if not exists lighting text not null default '';
alter table if exists assets add column if not exists dominant_colors jsonb not null default '[]'::jsonb;
alter table if exists assets add column if not exists text_in_image text not null default '';
alter table if exists assets add column if not exists specific_details text not null default '';
alter table if exists assets add column if not exists visual_tagging_schema text not null default '';
alter table if exists assets add column if not exists visual_review_status text not null default '';
alter table if exists assets add column if not exists visual_reviewed_at timestamptz;

create index if not exists assets_stock_visual_schema_idx
  on assets(workspace_id, source_type, enabled)
  where source_type = 'stock';

