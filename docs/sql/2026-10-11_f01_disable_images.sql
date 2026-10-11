-- F01 (CF_AUTO_CF_E2E_IDEA_E2E_SIX_20261010F_01_P01_F01) : images refusées par l'opérateur.
-- Rien n'est supprimé : enabled = false + raison dans metadata.disabled_reason.
-- À exécuter dans l'éditeur SQL Supabase (projet adwyqshphctqbdfckvno). Idempotent.

begin;

-- 1. Images (assets)
with reasons(id, reason) as (values
  (2378, 'OPERATOR_F01: yeux et peau qui font IA'),
  (2416, 'OPERATOR_F01: yeux et peau qui font IA'),
  (2116, 'OPERATOR_F01: peau irréaliste, visage coupé'),
  (2376, 'OPERATOR_F01: regard qui fixe l''objectif'),
  (2252, 'OPERATOR_F01: collage IA sans rapport avec sa référence (VR029)'),
  (2126, 'OPERATOR_F01: repassage, généré depuis VR181 mal étiquetée « packing suitcase »'),
  (2187, 'OPERATOR_F01: repassage, généré depuis VR181 mal étiquetée « packing suitcase »'),
  (2281, 'OPERATOR_F01: repassage, généré depuis VR181 mal étiquetée « packing suitcase »'),
  (2404, 'OPERATOR_F01: repassage, généré depuis VR181 mal étiquetée « packing suitcase »'),
  (2117, 'COLLAGE_MULTI_PANEL: collage généré (VR116)'),
  (2118, 'COLLAGE_MULTI_PANEL: collage généré (VR097)'),
  (2220, 'COLLAGE_MULTI_PANEL: collage généré (VR029)'),
  (2325, 'COLLAGE_MULTI_PANEL: collage généré (VR199)'),
  -- Trouvé en plus par la détection : deux photos sur fond crème (VR029).
  (2185, 'COLLAGE_MULTI_PANEL: deux photos sur fond crème (VR029)')
)
update assets a
set enabled = false,
    metadata = coalesce(a.metadata, '{}'::jsonb)
      || jsonb_build_object('disabled_reason', r.reason, 'disabled_at', now(), 'disabled_by', 'operator_review_2026-10-11')
from reasons r
where a.id = r.id and a.workspace_id = 'cortifree';

-- 2. Référence Pinterest mal étiquetée. disabled_reason survit à la synchro du
--    Sheet (qui réécrit enabled et qa_flag) : le code la refuse tant que la clé existe.
update visual_references
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('disabled_reason', 'WRONG_LABEL: montre du repassage, étiquetée « packing suitcase on bed »', 'disabled_at', now())
where id = 'VR181' and workspace_id = 'cortifree';

-- 3. (Recommandé) Références qui ont produit des collages : le pipeline les
--    refuse désormais tout seul au prochain collage, ceci le fait tout de suite.
update visual_references
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('image_layout', 'collage_or_multi_panel', 'disabled_reason', 'COLLAGE_REFERENCE: ses images générées sont des collages', 'disabled_at', now())
where id in ('VR029', 'VR116', 'VR097', 'VR199') and workspace_id = 'cortifree';

commit;

-- Contrôle
select id, enabled, metadata->>'disabled_reason' as reason from assets
where id in (2378,2416,2116,2376,2252,2126,2187,2281,2404,2117,2118,2220,2325,2185) order by id;
select id, enabled, metadata->>'disabled_reason' as reason from visual_references
where id in ('VR181','VR029','VR116','VR097','VR199') order by id;

-- Ensuite (après redéploiement Railway du worker) : redécrire les images générées
-- (position du visage + détection de collage, schéma observable_v3).
-- insert into worker_jobs (workspace_id, kind, idempotency_key, payload, priority, max_attempts)
-- values ('cortifree', 'GENERATED_ASSET_RETAG', 'retag-observable-v3-2026-10-11', '{"limit":400}', 8, 3);
