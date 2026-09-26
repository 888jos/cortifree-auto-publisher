update public.carousels
set review_status = 'ARCHIVED',
    updated_at = now()
where workspace_id = 'cortifree'
  and status = 'ARCHIVED'
  and review_status is distinct from 'ARCHIVED';
