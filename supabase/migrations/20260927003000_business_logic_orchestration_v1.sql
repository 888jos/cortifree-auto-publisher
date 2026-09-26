-- CortiFree business orchestration v1
-- Canonical approval integrity, production slots, and sourced health guardrails.
-- Upload-Post/provider tables and automation are intentionally untouched.

alter table public.carousels
  add column if not exists content_hash text,
  add column if not exists approved_hash text,
  add column if not exists concept_id text;

alter table public.carousel_ideas
  add column if not exists slot_id text,
  add column if not exists concept_id text;

create table if not exists public.content_slots (
  id text primary key,
  workspace_id text not null default 'cortifree' check (workspace_id = 'cortifree'),
  account_id text not null,
  persona_id text,
  slot_date date not null,
  slot_time time not null,
  timezone text not null default 'America/New_York',
  scheduled_for timestamptz not null,
  strategy text not null default 'PROVEN',
  pillar_id text,
  concept_id text,
  format_id text,
  topic_id text,
  hook_id text,
  status text not null default 'OPEN',
  idea_id text,
  carousel_id text,
  source text not null default 'content_calendar',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_slots enable row level security;

create unique index if not exists content_slots_account_time_idx
  on public.content_slots (workspace_id, account_id, scheduled_for);
create index if not exists content_slots_status_time_idx
  on public.content_slots (workspace_id, status, scheduled_for);
create index if not exists content_slots_persona_time_idx
  on public.content_slots (workspace_id, persona_id, scheduled_for);

comment on table public.content_slots is
  'Canonical CortiFree production demand. A slot exists before an idea/carousel and stops at PLANNED until a provider layer is explicitly invoked.';

create or replace function public.cortifree_carousel_fingerprint(
  p_account_id text,
  p_persona_id text,
  p_content_type text,
  p_format_id text,
  p_concept_id text,
  p_topic text,
  p_angle text,
  p_caption text,
  p_spec jsonb
) returns text
language sql
immutable
set search_path = public
as $$
  select md5(
    jsonb_build_object(
      'account_id', coalesce(p_account_id, ''),
      'persona_id', coalesce(p_persona_id, ''),
      'content_type', coalesce(p_content_type, ''),
      'format_id', coalesce(p_format_id, ''),
      'concept_id', coalesce(p_concept_id, ''),
      'topic', coalesce(p_topic, ''),
      'angle', coalesce(p_angle, ''),
      'caption', coalesce(p_caption, ''),
      'spec', coalesce(p_spec, '{}'::jsonb)
    )::text
  );
$$;

update public.carousels
set content_hash = public.cortifree_carousel_fingerprint(
  account_id, persona_id, content_type, format_id, concept_id, topic, angle, caption, spec
)
where workspace_id = 'cortifree';

update public.carousels
set approved_hash = content_hash,
    approved_version = coalesce(approved_version, current_version)
where workspace_id = 'cortifree'
  and status = 'APPROVED'
  and approved_at is not null
  and approved_hash is null;

drop trigger if exists carousels_render_review_integrity on public.carousels;
drop trigger if exists cortifree_review_render_integrity on public.carousels;
drop function if exists public.enforce_carousel_render_review_integrity();
drop function if exists public.enforce_cortifree_review_render_integrity();

create or replace function public.enforce_cortifree_carousel_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_count integer;
  rendered_count integer;
  distinct_url_count integer;
  fingerprint text;
  changed boolean := false;
begin
  if new.workspace_id <> 'cortifree' then
    return new;
  end if;

  fingerprint := public.cortifree_carousel_fingerprint(
    new.account_id, new.persona_id, new.content_type, new.format_id, new.concept_id,
    new.topic, new.angle, new.caption, new.spec
  );
  new.content_hash := fingerprint;

  if tg_op = 'UPDATE' then
    changed := old.content_hash is distinct from fingerprint;

    if changed then
      if new.current_version = old.current_version then
        new.current_version := old.current_version + 1;
      end if;
      if new.revision_count = old.revision_count then
        new.revision_count := old.revision_count + 1;
      end if;

      if old.approved_hash is not null and old.approved_hash is distinct from fingerprint then
        new.approved_hash := null;
        new.approved_version := null;
        new.approved_at := null;
        new.approved_by := null;
        new.scheduled_for := null;
        if new.status in ('APPROVED','PLANNED','SCHEDULED') then
          new.status := 'DRAFT';
        end if;
        new.review_status := 'AWAITING_REVIEW';
        new.last_review_action := 'APPROVAL_INVALIDATED_BY_CONTENT_CHANGE';
      elsif old.status = 'READY_FOR_REVIEW' and new.status = 'READY_FOR_REVIEW' then
        new.status := 'DRAFT';
        new.review_status := 'AWAITING_REVIEW';
        new.last_review_action := 'CONTENT_CHANGED_RENDER_REQUIRED';
      end if;
    end if;
  end if;

  if new.status in ('READY_FOR_REVIEW','APPROVED','PLANNED','SCHEDULED') then
    expected_count := case
      when jsonb_typeof(new.spec -> 'generated_slides') = 'array'
        then jsonb_array_length(new.spec -> 'generated_slides')
      else 0
    end;

    select count(*), count(distinct rendered_url)
      into rendered_count, distinct_url_count
    from public.carousel_slides
    where carousel_id = new.id
      and workspace_id = new.workspace_id
      and coalesce(status, 'CURRENT') = 'CURRENT'
      and rendered_url like 'https://%';

    if expected_count = 0 or rendered_count <> expected_count or distinct_url_count <> expected_count then
      raise exception 'RENDER_REQUIRED: carousel % expects % distinct final PNGs and has %',
        new.id, expected_count, rendered_count;
    end if;
  end if;

  if new.status in ('APPROVED','PLANNED','SCHEDULED') then
    if new.approved_hash is null
       or new.approved_hash is distinct from new.content_hash
       or new.approved_version is null
       or new.approved_version <> new.current_version then
      raise exception 'APPROVAL_STALE: carousel % content/version no longer matches its approval', new.id;
    end if;
  end if;

  new.review_status := case
    when new.status = 'READY_FOR_REVIEW' then 'AWAITING_REVIEW'
    when new.status = 'APPROVED' then 'APPROVED'
    when new.status = 'PLANNED' then 'PLANNED'
    when new.status = 'SCHEDULED' then 'SCHEDULED'
    when new.status in ('PUBLISHED','POSTED') then 'PUBLISHED'
    when new.status = 'REJECTED' then 'REJECTED'
    when new.status = 'NEEDS_FIX' then 'NEEDS_FIX'
    when new.status = 'NEEDS_ASSETS' then 'NEEDS_ASSETS'
    when new.status = 'ARCHIVED' then 'ARCHIVED'
    else new.review_status
  end;

  return new;
end;
$$;

create trigger cortifree_carousel_state_integrity
before insert or update of
  account_id, persona_id, content_type, format_id, concept_id,
  topic, angle, caption, spec, status, review_status,
  current_version, revision_count, approved_hash, approved_version
on public.carousels
for each row execute function public.enforce_cortifree_carousel_state();

comment on function public.enforce_cortifree_carousel_state() is
  'Single canonical CortiFree state guard: fingerprints content, invalidates stale approvals, and enforces complete renders before review/approval/planning.';

insert into public.content_slots (
  id, workspace_id, account_id, persona_id, slot_date, slot_time, timezone,
  scheduled_for, strategy, pillar_id, concept_id, topic_id, hook_id, status, source, metadata
)
select
  er.key,
  'cortifree',
  er.data ->> 'account_id',
  nullif(er.data ->> 'persona_id',''),
  (er.data ->> 'date')::date,
  (er.data ->> 'local_time')::time,
  coalesce(nullif(er.data ->> 'timezone',''),'America/New_York'),
  (((er.data ->> 'date')::date + (er.data ->> 'local_time')::time)
    at time zone coalesce(nullif(er.data ->> 'timezone',''),'America/New_York')),
  case
    when row_number() over (partition by er.data ->> 'account_id' order by (er.data ->> 'date')::date, (er.data ->> 'local_time')::time) % 10 between 1 and 7 then 'PROVEN'
    when row_number() over (partition by er.data ->> 'account_id' order by (er.data ->> 'date')::date, (er.data ->> 'local_time')::time) % 10 between 8 and 9 then 'ADJACENT'
    else 'EXPERIMENT'
  end,
  nullif(er.data ->> 'pillar_id',''),
  nullif(er.data ->> 'carousel_type',''),
  nullif(er.data ->> 'topic_id',''),
  nullif(er.data ->> 'hook_id',''),
  case
    when (((er.data ->> 'date')::date + (er.data ->> 'local_time')::time)
      at time zone coalesce(nullif(er.data ->> 'timezone',''),'America/New_York')) < now()
      then 'EXPIRED'
    else 'OPEN'
  end,
  'content_calendar',
  er.data
from public.editorial_records er
where er.kind = 'content_calendar'
  and er.active = true
  and er.data ? 'account_id'
  and er.data ? 'date'
  and er.data ? 'local_time'
on conflict (id) do update set
  account_id = excluded.account_id,
  persona_id = excluded.persona_id,
  slot_date = excluded.slot_date,
  slot_time = excluded.slot_time,
  timezone = excluded.timezone,
  scheduled_for = excluded.scheduled_for,
  pillar_id = excluded.pillar_id,
  concept_id = excluded.concept_id,
  topic_id = excluded.topic_id,
  hook_id = excluded.hook_id,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.content_health_sources
  (source_id, topic, organization, title, url, evidence_level, last_reviewed, allowed_claims, active)
values
  ('SRC_NHLBI_SLEEP_IMPORTANCE','sleep','NIH / NHLBI','How Sleep Works - Why Is Sleep Important?',
   'https://www.nhlbi.nih.gov/health/sleep/why-sleep-important','government_health_guidance','2026-09-27',
   'Sleep supports healthy brain and physical function; inadequate sleep can impair focus and is associated with health risks. Cortisol has a normal daily rhythm and helps promote wakefulness in the morning.',true),
  ('SRC_NHLBI_SLEEP_HABITS','sleep_habits','NIH / NHLBI','Sleep Deprivation and Deficiency - Healthy Sleep Habits',
   'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits','government_health_guidance','2026-09-27',
   'Regular sleep/wake timing and reducing bright artificial light before bed are reasonable sleep-habit suggestions.',true),
  ('SRC_NIMH_STRESS','stress','NIH / NIMH','I''m So Stressed Out!',
   'https://www.nimh.nih.gov/health/publications/so-stressed-out-infographic','government_health_guidance','2026-09-27',
   'Stress is commonly a response to an external cause; regular sleep, exercise, avoiding excess caffeine, journaling and social support are coping options. Persistent symptoms may warrant professional help.',true),
  ('SRC_NCCIH_STRESS','stress_relaxation','NIH / NCCIH','Stress',
   'https://www.nccih.nih.gov/health/stress','government_health_guidance','2026-09-27',
   'Stress triggers a fight-or-flight response. Relaxation and slow/deep breathing may help reduce self-reported stress; evidence for specific outcomes varies.',true),
  ('SRC_CDC_ACTIVITY','physical_activity','CDC','Health Benefits of Physical Activity for Adults',
   'https://www.cdc.gov/physical-activity-basics/health-benefits/adults.html','government_health_guidance','2026-09-27',
   'A session of moderate-to-vigorous physical activity can improve sleep quality and reduce feelings of anxiety; regular activity has broader health benefits.',true),
  ('SRC_FDA_CAFFEINE','caffeine','FDA','Spilling the Beans: How Much Caffeine is Too Much?',
   'https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much','government_health_guidance','2026-09-27',
   'Caffeine sensitivity varies. Too much caffeine can cause insomnia or sleep disruption; the FDA cites 400 mg/day for most adults as an amount not generally associated with negative effects.',true)
on conflict (source_id) do update set
  topic=excluded.topic,
  organization=excluded.organization,
  title=excluded.title,
  url=excluded.url,
  evidence_level=excluded.evidence_level,
  last_reviewed=excluded.last_reviewed,
  allowed_claims=excluded.allowed_claims,
  active=true,
  updated_at=now();

insert into public.content_claim_rules
  (rule_id, topic, risk_level, claim_type, allowed_wording, avoid_wording, example_safe, requires_source, source_ids, active)
values
  ('CLAIM_SLEEP_GENERAL','sleep','low','wellness_context',
   'Use supportive language: sleep supports health, focus and daytime functioning; regular sleep habits may help.',
   'Do not promise that a sleep habit fixes hormones, cures anxiety, treats disease, or guarantees lower cortisol.',
   'keeping my sleep schedule consistent makes my mornings feel less chaotic',true,
   array['SRC_NHLBI_SLEEP_IMPORTANCE','SRC_NHLBI_SLEEP_HABITS'],true),
  ('CLAIM_CORTISOL_RHYTHM','cortisol','medium','physiology_context',
   'You may say cortisol naturally follows a daily rhythm and helps promote wakefulness in the morning.',
   'Do not diagnose high/low cortisol from appearance or symptoms. Do not claim a routine resets, flushes, balances, detoxes or permanently lowers cortisol.',
   'cortisol is supposed to change across the day — one bad morning is not a diagnosis',true,
   array['SRC_NHLBI_SLEEP_IMPORTANCE'],true),
  ('CLAIM_STRESS_RESPONSE','stress','medium','physiology_context',
   'Use: stress is a normal physical and emotional response; long-term stress may contribute to or worsen some symptoms.',
   'Avoid diagnosing chronic stress, adrenal fatigue, hormonal imbalance, or attributing specific symptoms to cortisol without clinical evaluation.',
   'stress can show up in your body, but a symptom alone cannot tell you what your cortisol is doing',true,
   array['SRC_NIMH_STRESS','SRC_NCCIH_STRESS'],true),
  ('CLAIM_BREATHING_RELAXATION','breathing','medium','behavior',
   'Use cautious language: slow/deep breathing or relaxation techniques may help some people feel calmer or reduce self-reported stress.',
   'Do not call breathing a treatment, cure, cortisol hack, or substitute for medical care.',
   'a few slow breaths can be a low-pressure way to downshift when I feel tense',true,
   array['SRC_NCCIH_STRESS'],true),
  ('CLAIM_ACTIVITY','physical_activity','low','behavior',
   'Physical activity can support sleep quality and reduce feelings of anxiety; keep recommendations general and accessible.',
   'Do not promise a workout lowers cortisol by a specific amount or treats a medical condition.',
   'a walk is movement, not a hormone prescription — I use it because it helps me reset',true,
   array['SRC_CDC_ACTIVITY'],true),
  ('CLAIM_CAFFEINE','caffeine','medium','behavior',
   'Use: caffeine sensitivity varies; excess caffeine can disrupt sleep. General advice to notice timing/amount is acceptable.',
   'Do not prescribe a universal caffeine cutoff, diagnose sensitivity, or present 400 mg as a personal safe limit for everyone.',
   'if late caffeine messes with your sleep, moving it earlier is a reasonable experiment',true,
   array['SRC_FDA_CAFFEINE'],true),
  ('CLAIM_NO_DIAGNOSIS','diagnosis','high','safety_boundary',
   'If persistent or concerning symptoms interfere with daily life, suggest discussing them with a qualified health professional.',
   'Never diagnose cortisol imbalance, adrenal fatigue, anxiety disorders, sleep disorders, or other conditions from lifestyle signs, face scans, quizzes, or photos.',
   'persistent symptoms deserve a real clinician, not a carousel diagnosis',false,
   array['SRC_NIMH_STRESS'],true)
on conflict (rule_id) do update set
  topic=excluded.topic,
  risk_level=excluded.risk_level,
  claim_type=excluded.claim_type,
  allowed_wording=excluded.allowed_wording,
  avoid_wording=excluded.avoid_wording,
  example_safe=excluded.example_safe,
  requires_source=excluded.requires_source,
  source_ids=excluded.source_ids,
  active=true,
  updated_at=now();
