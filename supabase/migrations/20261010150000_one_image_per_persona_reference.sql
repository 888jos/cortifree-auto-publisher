-- One generated image per persona (group master) and Pinterest reference.
-- Reusing a reference for the same face only produces a near-duplicate.
-- Failed and cancelled jobs produced nothing, so they do not count. A
-- trigger (not a unique index) because 49 historical duplicates exist.
create or replace function public.reject_duplicate_persona_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.visual_reference_id is null or new.status in ('FAILED', 'CANCELLED') then
    return new;
  end if;
  if exists (
    select 1 from public.image_generation_jobs j
    where j.workspace_id = new.workspace_id
      and j.persona_id = new.persona_id
      and j.visual_reference_id = new.visual_reference_id
      and j.status in ('PENDING', 'RETRY', 'RUNNING', 'READY', 'DONE')
      and j.id is distinct from new.id
  ) then
    raise exception 'DUPLICATE_PERSONA_REFERENCE: % already used reference %', new.persona_id, new.visual_reference_id
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists image_generation_jobs_unique_persona_reference on public.image_generation_jobs;
create trigger image_generation_jobs_unique_persona_reference
  before insert or update of status, persona_id, visual_reference_id on public.image_generation_jobs
  for each row execute function public.reject_duplicate_persona_reference();
