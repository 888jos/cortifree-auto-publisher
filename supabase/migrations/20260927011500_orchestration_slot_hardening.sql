-- CortiFree orchestration slot hardening.
-- Keep provider/upload-post state untouched.

update public.content_slots
set status = 'EXPIRED',
    updated_at = now()
where workspace_id = 'cortifree'
  and status = 'OPEN'
  and scheduled_for < now();

comment on table public.content_slots is
  'Canonical CortiFree production demand. REST/NO_POST calendar days are intentionally not materialized as production slots; runtime fallback generation must respect those calendar blocks.';
