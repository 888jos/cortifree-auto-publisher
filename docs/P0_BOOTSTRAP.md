# CortiFree P0 bootstrap

This runbook activates the P0 infrastructure that is already implemented in code. It does **not** enable social publishing.

## Required product isolation

Use the dedicated CortiFree Supabase project. Do not reuse the Cocorise project.

Required GitHub repository secrets:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — the CortiFree Supabase project (server-side only).
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — dedicated CortiFree Google service account.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — private key for that service account.

## Google permissions

Share these resources with `GOOGLE_SERVICE_ACCOUNT_EMAIL`:

1. `CortiFree Content DB` — reader is sufficient for runtime sync.
   - Spreadsheet ID: `1XqgyMRj_jUU3FkKg4HzEORMz3Jl8pHpKuBrXkmfw4Qw`
2. `CORTIFREE_CONTENT` — reader on the root folder so children can be traversed and downloaded.
   - Folder ID: `1I7OJ8juCsXINUMNJZ5IO5qhIrjYJlqi_`

No Cocorise Sheet/Drive folder should be shared with the CortiFree service account.

## One-click bootstrap

Run the GitHub Action **Bootstrap CortiFree P0**.

The workflow:

1. typechecks the repository;
2. upserts the Google Sheet control plane into Supabase;
3. copies Drive images into the `cortifree-assets` storage bucket in idempotent batches;
4. verifies safe table counts;
5. runs the sanitized P0 readiness report.

Schema migrations in `supabase/migrations/` are applied separately and are never run by this workflow.

Safe defaults remain:

- `DRY_RUN=true`
- `AUTONOMY_AUTO_APPROVE=false`
- `AUTONOMY_AUTO_PUBLISH=false`
- `ALLOW_RUNTIME_JSON_FALLBACK=false`

## Expected minimum counts

- personas >= 16
- accounts >= 16
- content_topics >= 500
- content_hooks >= 200
- content_ctas >= 30
- assets >= 300
- visual_references >= 150

The current editorial targets are 16 personas, 16 accounts, 576 topic/angle rows, 240 hooks and 30 CTAs.

## After bootstrap

Only after the bootstrap is green:

1. set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and `CORTIFREE_ALLOWED_EMAILS` in the canonical CortiFree Vercel project;
2. set the Google service-account credentials in Vercel for scheduled Google→Supabase sync;
3. set `CRON_SECRET`;
4. map one real Upload-Post profile to `CF_EN_01`;
5. keep publishing disabled while the 20-carousel acceptance gate is executed.
