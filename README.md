# CortiFree Auto Publisher

Projet indépendant de publication de carrousels CortiFree. Convex est l'unique backend de l'application pour les données et les fichiers. `DRY_RUN=true` et `REQUIRE_APPROVAL=true` restent les défauts de sécurité.

## Démarrage

```bash
npm install
cp .env.example .env
npx convex dev
npm run doctor
npm run personas:validate
npm run carousel:create -- --account CF_EN_01 --id CF_TEST_001
npm run carousel:render -- --id CF_TEST_001
npm run publish:dry -- --id CF_TEST_001
npm test
```

Le renderer est un pipeline SVG déterministe + Sharp : il ne lance pas de navigateur headless. Le modèle `CarouselSpec` est validé par Zod avant le rendu, les contraintes de template sont refusées avant écriture, et la QA vérifie chaque PNG en 1080×1350.

## Conventions de sécurité

Les MASTER et le Drive ne sont jamais modifiés par le scanner. Les clés et tokens restent dans l’environnement. Le secret backend Convex et la clé OpenAI sont utilisés uniquement côté serveur. Aucun appel externe de publication n’est déclenché tant que `DRY_RUN=true`.

## Convex

Les routes sous `app/api` lisent et écrivent exclusivement dans Convex. Le backend force systématiquement `workspace_id=cortifree`; une requête ne peut pas être redirigée vers les données Cocorise. Les noms de comptes historiques Supabase restent uniquement dans le script d'export ponctuel `scripts/export-cortifree-supabase.ts`.

```bash
npm run convex:dev
npm run convex:export-supabase
npm run convex:migrate-files
npm run convex:deploy
```

Vercel utilise `npm run vercel-build`, `CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL` et `CORTIFREE_BACKEND_SECRET`. L'ancien Supabase doit être conservé en lecture seule pendant la période de retour arrière, mais il n'est plus requis par l'application déployée.

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

AI cost tracking is stored in the Convex `ai_usage_logs` table. Pricing lives in one module and must be reviewed periodically. The API key is server-only and is never returned by `/api/ai/status` or exposed through a `NEXT_PUBLIC_*` variable. Social publishing remains protected by `DRY_RUN=true`.

Upload-Post is shared at the provider level, so CortiFree only exposes profiles listed in `CORTIFREE_UPLOAD_POST_PROFILES` and explicitly mapped to a `CF_*` account in Convex. An empty allowlist intentionally means zero CortiFree publishing profiles; Cocorise profiles are never selected as a fallback.

## Persona Images

The image system treats the persona MASTER as identity (`WHO`) and a visual reference only as pose, outfit, setting, framing and light (`HOW + WHERE`). Bootstrap and inspect the local Drive library without changing any MASTER:

```bash
npm run personas:bootstrap
npm run personas:validate
npm run refs:bootstrap
npm run refs:import-pinterest
npm run refs:scan
```

Run `npm run personas:sync` from a trusted machine with the Convex server credentials. Images are stored in Convex file storage and every database row is forced into `workspace_id=cortifree`.

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
- `scripts/sync-persona-image-assets.ts` : non-destructive Drive to Convex file-storage sync.
- `src/render/` : tokens de design, registre de templates, SVG + Sharp et QA.
- `convex/schema.ts` : schéma de données CortiFree isolé.
- `convex/data.ts` : requêtes, écritures et stockage protégés par secret serveur.
- `config/accounts.json` : configuration de comptes, non hardcodée dans le moteur.
