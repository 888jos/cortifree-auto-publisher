-- The web/worker runtime accesses this table through service-role server routes.
-- Keep direct anon/authenticated access closed, consistent with the rest of CortiFree.
ALTER TABLE public.image_recovery_manifest ENABLE ROW LEVEL SECURITY;
