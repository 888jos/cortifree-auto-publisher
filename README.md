# CortiFree Auto Publisher

Projet indépendant de publication de carrousels CortiFree. Supabase est le backend runtime canonique pour les données et les fichiers. `DRY_RUN=true` et `REQUIRE_APPROVAL=true` restent les défauts de sécurité.

## Démarrage

```bash
npm install
cp .env.example .env
npm run doctor
npm run personas:validate
npm run carousel:create -- --account CF_EN_01 --id CF_TEST_001
npm run carousel:render -- --id CF_TEST_001
npm run publish:dry -- --id CF_TEST_001
npm test
```

Le renderer est un pipeline SVG déterministe + Sharp : il ne lance pas de navigateur headless. Le modèle `CarouselSpec` est validé par Zod avant le rendu, les contraintes de template sont refusées avant écriture, et la QA vérifie chaque PNG en 1080×1350.

## Conventions de sécurité

Les MASTER et le Drive ne sont jamais modifiés par le scanner. Les clés Supabase, OpenAI et ModelArk restent uniquement côté serveur. Le dashboard et les API sont protégés par `CORTIFREE_ADMIN_PASSWORD` (ou, à défaut, `CORTIFREE_ADMIN_TOKEN`). Aucun appel externe de publication n’est déclenché tant que `DRY_RUN=true`.

## Supabase

Les routes sous `app/api` lisent et écrivent dans le projet Supabase CortiFree. Les tables multi-workspace sont forcées sur `workspace_id=cortifree`; les tables éditoriales dédiées (`content_*` et `editorial_records`) n’acceptent pas de redirection vers un autre produit. `DATA_BACKEND=convex` reste disponible uniquement comme mode de rollback explicite.

```bash
npm run typecheck
npm test
supabase migration list
```

Vercel utilise `npm run vercel-build`, `DATA_BACKEND=supabase`, `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Les migrations versionnées vivent dans `supabase/migrations/`; elles doivent être vérifiées avant application. Le build Vercel ne déploie jamais le schéma.

## OpenAI Setup

1. Create an OpenAI API key.
2. Add `OPENAI_API_KEY` to `.env.local`.
3. Add `OPENAI_API_KEY` in Vercel Environment Variables.
4. Redeploy.
5. Open `/api/ai/status`.
6. Verify `configured=true`.

The Content Studio then uses one structured Responses API call with `gpt-5.6-luna` to create a complete carousel. `gpt-5.6-terra` reviews a configurable 20% sample after deterministic validation. If AI is disabled, unconfigured, unavailable, or returns an invalid result, the deterministic generator keeps the draft flow working and reports that fallback was used.

Optional settings (defaults are already safe):

```bash
OPENAI_MODEL_PRIMARY=gpt-5.6-luna
OPENAI_MODEL_QA=gpt-5.6-terra
AI_GENERATION_ENABLED=true
OPENAI_QA_ENABLED=true
OPENAI_QA_SAMPLE_RATE=0.20
OPENAI_MAX_MONTHLY_USD=15
OPENAI_TIMEOUT_MS=45000
```

AI cost tracking is stored in the Supabase `ai_usage_logs` table. Pricing lives in one module and must be reviewed periodically. The API key is server-only and is never returned by `/api/ai/status` or exposed through a `NEXT_PUBLIC_*` variable. Social publishing remains protected by `DRY_RUN=true`.

Upload-Post is shared at the provider level, so CortiFree only exposes profiles listed in `CORTIFREE_UPLOAD_POST_PROFILES` and explicitly mapped to a `CF_*` account in Supabase. An empty allowlist intentionally means zero CortiFree publishing profiles; Cocorise profiles are never selected as a fallback.

## Persona Images

The image system treats the persona MASTER as identity (`WHO`) and a visual reference only as pose, outfit, setting, framing and light (`HOW + WHERE`). Bootstrap and inspect the local Drive library without changing any MASTER:

```bash
npm run personas:bootstrap
npm run personas:validate
npm run refs:bootstrap
npm run refs:import-pinterest
npm run refs:scan
```

Run `npm run personas:sync` from a trusted machine with the Supabase service-role credentials. Images are stored in the `cortifree-assets` bucket and every shared database row is forced into `workspace_id=cortifree`.

Vision tagging is paid and deliberately requires explicit IDs:

```bash
npm run refs:analyze -- --ids MIRROR_001,MORNING_HOME_001
```

Seedream generation has three independent locks: `IMAGE_GENERATION_ENABLED=false`, `IMAGE_GENERATION_DAILY_CAP_USD=0`, and the Content Studio confirmation flow. Set a verified model ID and a manually reviewed unit cost before changing either lock. Never add a `NEXT_PUBLIC_MODELARK_API_KEY` variable. ModelArk documentation currently prohibits restricted Seedream models in the EU and on the EU market; keep this provider disabled for France/EU deployments and select a legally available provider before a real test.

The Asset Library exposes Stock, Persona Generated, protected Masters and Visual References. Content Studio can create or regenerate one image, while Batch personas only queues confirmed jobs (maximum 100); it does not execute them automatically.

## Structure

- `src/domain.ts` : schémas Zod stricts.
- `src/personas/loader.ts` : mapping P01..P16 ↔ nom ↔ dossier, avec erreur explicite.
- `src/assets/scanner.ts` : scan idempotent, hash SHA-256, dimensions et index local.
- `src/visual-references/` : scan, hash dedupe, naming and reference search.
- `src/image-generation/` : provider boundary, stable identity prompt, retry and budget guards.
- `scripts/sync-persona-image-assets.ts` : synchronisation non destructive Drive vers le stockage runtime.
- `src/render/` : tokens de design, registre de templates, SVG + Sharp et QA.
- `supabase/migrations/` : historique SQL canonique et versionné.
- `app/lib/data-backend.ts` : accès serveur Supabase, avec rollback Convex explicite.
- `src/runtime/config.ts` : comptes/personas/editorial lus depuis le backend configuré. Les JSON locaux sont uniquement un fallback d'urgence opt-in.


## Isolation CortiFree / Cocorise

CortiFree est un service autonome et ne dépend d'aucune ressource Cocorise en production.

- Vercel attendu : `cortifree-auto-publisher.vercel.app` ou une valeur explicitement définie dans `CORTIFREE_CANONICAL_HOST`.
- Projet Vercel attendu : `prj_VAzxY6ziL68xkWugWCdw6ympilER`; `scripts/vercel-ignore.mjs` bloque les builds provenant du projet Cocorise.
- Supabase : projet CortiFree `adwyqshphctqbdfckvno`, clé service-role strictement serveur.
- Workspace runtime : `cortifree`.
- Convex : mode de rollback optionnel, jamais sélectionné sans `DATA_BACKEND=convex`.
- Upload-Post : seuls les profils explicitement listés dans `CORTIFREE_UPLOAD_POST_PROFILES` sont éligibles.
- Aucune variable `NEXT_PUBLIC_COCORISE_URL` n'est autorisée dans ce repo.

Le endpoint `/api/health` renvoie HTTP 503 si le déploiement CortiFree est branché sur un hostname Vercel différent du hostname canonique. Cette vérification existe précisément pour empêcher un nouveau déploiement de CortiFree dans le projet Cocorise.


### Database deployment boundary

Vercel builds **must not apply Supabase migrations**. The Vercel build command is only `next build`. Apply reviewed migrations in a separate database workflow or through the Supabase CLI from an explicitly linked context.

This prevents a wrongly linked Vercel project from mutating another product's database. Vercel runtime needs only the CortiFree Supabase URL and server-only service-role key.




## Production gate

Même si `AUTONOMY_AUTO_PUBLISH=true`, CortiFree refuse de programmer une publication tant que le gate de production n'est pas vert.

Le gate vérifie notamment :
- Supabase live et banques éditoriales chargées ;
- 16 personas et 16 comptes ;
- Google Sheet/Drive synchronisés récemment ;
- 16 persona masters ;
- au moins un compte de publication actif avec profil Upload-Post ;
- clé Upload-Post et clé OpenAI présentes ;
- cache persona au-dessus du minimum pour les personas effectivement publiés ;
- gate d'acceptance enregistré avec au moins 20 carrousels revus et 15 utilisables ;
- `CRON_SECRET` présent.

Endpoints privés :
- `GET /api/production-gate`
- `GET|POST /api/acceptance/gate`

Workflow manuel :
- `Generate CortiFree acceptance 20` crée 20 carrousels en dry-run pour la revue initiale.
