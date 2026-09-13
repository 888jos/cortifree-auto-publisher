create table if not exists visual_references (
  id text primary key,
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  category text not null,
  source_url text,
  source_platform text not null default 'local',
  storage_path text,
  thumbnail_url text,
  pose text not null default '',
  framing text not null default '',
  outfit text not null default '',
  environment text not null default '',
  lighting text not null default '',
  mood jsonb not null default '[]'::jsonb,
  orientation text not null default 'portrait',
  tags jsonb not null default '[]'::jsonb,
  good_for jsonb not null default '[]'::jsonb,
  file_hash text,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists visual_references_hash_idx
  on visual_references(workspace_id, file_hash) where file_hash is not null;
create index if not exists visual_references_search_idx
  on visual_references(workspace_id, category, enabled);

alter table image_generation_jobs add column if not exists workspace_id text not null default 'cortifree';
alter table image_generation_jobs add column if not exists category text not null default 'other';
alter table image_generation_jobs add column if not exists scene text not null default '';
alter table image_generation_jobs add column if not exists attempt_count integer not null default 0;
alter table image_generation_jobs add column if not exists cost_estimate_usd numeric(12, 8) not null default 0;
alter table image_generation_jobs add column if not exists started_at timestamptz;
alter table image_generation_jobs add column if not exists updated_at timestamptz not null default now();
alter table image_generation_jobs add column if not exists input jsonb not null default '{}'::jsonb;
alter table image_generation_jobs add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table image_generation_jobs drop constraint if exists image_generation_jobs_visual_reference_id_fkey;
alter table image_generation_jobs alter column visual_reference_id type text using visual_reference_id::text;

alter table assets add column if not exists scene text not null default '';
alter table assets add column if not exists pose text not null default '';
alter table assets add column if not exists outfit text not null default '';
alter table assets add column if not exists environment text not null default '';
alter table assets add column if not exists lighting text not null default '';
alter table assets add column if not exists good_for jsonb not null default '[]'::jsonb;

create table if not exists persona_scene_templates (
  id text primary key,
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  category text not null,
  scene_description text not null,
  recommended_reference_categories jsonb not null default '[]'::jsonb,
  recommended_framing text,
  recommended_outfit text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists image_generation_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  job_id uuid references image_generation_jobs(id) on delete set null,
  persona_id text,
  provider text not null,
  model text not null,
  images_generated integer not null default 0,
  estimated_cost_usd numeric(12, 8) not null default 0,
  created_at timestamptz not null default now()
);

insert into persona_scene_templates (id, category, scene_description, recommended_reference_categories, recommended_framing, recommended_outfit)
values
  ('MIRROR_SELFIE', 'other', 'Casual mirror selfie in a believable home interior', '["mirror_selfie"]', 'full_body', 'casual neutral'),
  ('MORNING_KITCHEN', 'home', 'Quiet morning preparing a drink in a bright kitchen', '["morning_home","kitchen"]', 'medium', 'soft homewear'),
  ('BEDROOM_MORNING', 'home', 'Natural morning light in a lived-in bedroom', '["bedroom","morning_home"]', 'wide', 'soft homewear'),
  ('COZY_NIGHT', 'home', 'Calm evening wind-down with warm practical lighting', '["night_cozy","bedroom"]', 'medium', 'cozy layers'),
  ('COFFEE_WALK', 'outdoors', 'Walking outdoors with a takeaway coffee', '["coffee_cafe","outdoors_walk"]', 'full_body', 'casual streetwear'),
  ('CITY_WALK', 'outdoors', 'Candid city walk in soft daylight', '["outdoors_walk"]', 'full_body', 'casual streetwear'),
  ('SKINCARE', 'self_care', 'Simple skincare routine in a clean bathroom', '["self_care"]', 'medium', 'neutral loungewear'),
  ('BREAKFAST', 'food', 'Preparing a realistic nourishing breakfast', '["food_grocery","kitchen"]', 'medium', 'casual homewear'),
  ('LAPTOP_JOURNAL', 'work_study', 'Focused desk moment with laptop and journal', '["work_study"]', 'medium', 'casual neutral'),
  ('PILATES', 'fitness', 'Natural pilates session with believable form', '["fitness_pilates"]', 'full_body', 'minimal activewear'),
  ('GROCERY', 'food', 'Candid healthy grocery shopping moment', '["food_grocery"]', 'medium', 'casual everyday'),
  ('SIGNATURE', 'other', 'Persona signature lifestyle scene', '["hero_misc"]', 'medium', 'persona signature style')
on conflict (id) do update set
  category = excluded.category,
  scene_description = excluded.scene_description,
  recommended_reference_categories = excluded.recommended_reference_categories,
  recommended_framing = excluded.recommended_framing,
  recommended_outfit = excluded.recommended_outfit,
  updated_at = now();
