-- Keep assistant-curated creative references explicit without pretending they
-- received human approval. This status is accepted by the runtime few-shot
-- loader but remains distinguishable in review/audit surfaces.
alter table public.editorial_golden_examples
  drop constraint if exists editorial_golden_examples_approval_status_check;

alter table public.editorial_golden_examples
  add constraint editorial_golden_examples_approval_status_check
  check (
    approval_status = any (
      array[
        'proposed'::text,
        'human_review'::text,
        'human_approved'::text,
        'assistant_curated'::text,
        'rejected'::text,
        'deprecated'::text
      ]
    )
  );
