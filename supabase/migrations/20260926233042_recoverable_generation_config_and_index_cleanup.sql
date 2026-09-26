-- Keep generation demand recoverable while the external OpenAI credential is absent.
-- Upload-Post/provider state is intentionally untouched.

update public.carousel_ideas
set status = 'BLOCKED_CONFIG',
    last_error = 'GENERATION_BLOCKED:OPENAI_API_KEY is missing',
    finished_at = null,
    updated_at = now()
where workspace_id = 'cortifree'
  and status = 'QUEUED'
  and carousel_id is null;

update public.content_slots s
set status = 'BLOCKED_CONFIG',
    updated_at = now()
where s.workspace_id = 'cortifree'
  and s.status = 'QUEUED'
  and exists (
    select 1
    from public.carousel_ideas i
    where i.id = s.idea_id
      and i.workspace_id = 'cortifree'
      and i.status = 'BLOCKED_CONFIG'
      and i.carousel_id is null
  );

drop index if exists public.carousels_review_status_idx;
