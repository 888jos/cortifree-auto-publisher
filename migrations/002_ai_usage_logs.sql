create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  model text not null,
  carousel_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 8) not null default 0 check (estimated_cost_usd >= 0),
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_created_at_idx on ai_usage_logs(created_at desc);
create index if not exists ai_usage_logs_carousel_id_idx on ai_usage_logs(carousel_id);

alter table ai_usage_logs enable row level security;
revoke all on table ai_usage_logs from anon, authenticated;
