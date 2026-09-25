# Human review workflow

CortiFree uses human approval before publishing.

1. The daily autonomy cron runs only when local time in `Europe/Paris` is 10:00.
2. Generated and rendered carousels enter `AWAITING_REVIEW` / `READY_FOR_REVIEW`.
3. The dashboard carousel modal supports **Approve**, **Request changes**, and **Reject**.
4. Freeform change requests are planned by OpenAI on Vercel into a targeted patch. Unspecified slides are preserved.
5. Railway executes the structured patch and rerenders the draft, which returns to `AWAITING_REVIEW`.
6. Explicit approval records the reviewer and computes the next valid publishing slot between 18:00 and 23:00 `America/New_York`.
7. Publishing queries require `status=APPROVED`, `review_status=APPROVED`, `requires_human_approval=true`, and a non-null `approved_at`.

The existing `/api/carousels/[id]/approve` endpoint is QA-only. It cannot grant human approval. Human approval is handled by `/api/review/approve`.

Worker jobs:
- `APPLY_REVIEW_PATCH`
- `SCHEDULE_APPROVED_POST`
- `HEALTHCHECK`

Safety gates such as `DRY_RUN`, `AUTONOMY_AUTO_PUBLISH`, and the production gate continue to apply after human approval.
