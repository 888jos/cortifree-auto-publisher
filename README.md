# CortiFree Auto Publisher

Projet indépendant de publication de carrousels CortiFree. Le Milestone 1 est volontairement local et sans publication réelle : les assets sont lus via `DRIVE_ROOT`, les sorties de test vont vers le Drive local, et `DRY_RUN=true` reste le défaut.

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

Les MASTER et le Drive ne sont jamais modifiés par le scanner. Les clés et tokens restent dans l’environnement. OpenAI et Supabase sont isolés dans des modules serveur; aucun secret n’est envoyé au navigateur. Aucun appel externe de publication n’est déclenché tant que `DRY_RUN=true`.

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

Apply `migrations/002_ai_usage_logs.sql` to Supabase before enabling AI cost tracking. Pricing lives in one module and must be reviewed periodically. The API key is server-only and is never returned by `/api/ai/status` or exposed through a `NEXT_PUBLIC_*` variable. Social publishing remains protected by `DRY_RUN=true`.

Upload-Post is shared at the provider level, so CortiFree only exposes profiles listed in `CORTIFREE_UPLOAD_POST_PROFILES` and explicitly mapped to a `CF_*` account in Supabase. An empty allowlist intentionally means zero CortiFree publishing profiles; Cocorise profiles are never selected as a fallback.

## Structure

- `src/domain.ts` : schémas Zod stricts.
- `src/personas/loader.ts` : mapping P01..P16 ↔ nom ↔ dossier, avec erreur explicite.
- `src/assets/scanner.ts` : scan idempotent, hash SHA-256, dimensions et index local.
- `src/render/` : tokens de design, registre de templates, SVG + Sharp et QA.
- `migrations/001_initial.sql` : schéma Supabase CortiFree séparé.
- `config/accounts.json` : configuration de comptes, non hardcodée dans le moteur.
