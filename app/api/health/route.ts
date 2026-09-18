import { convexConfigured, getConvexCounts } from "../../lib/data-backend";
import { googleServiceAccountConfigured } from "../../lib/google/auth";
import { productionGateStatus } from "../../../src/autonomy/production-gate";

function hostname(value?: string) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET() {
  const backendConfigured = convexConfigured();
  const expectedHost = (process.env.CORTIFREE_CANONICAL_HOST || "cortifree-auto-publisher.vercel.app").toLowerCase();
  const deployedHost = hostname(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? hostname(process.env.NEXT_PUBLIC_APP_URL);
  const local = deployedHost === "localhost" || deployedHost === "127.0.0.1";
  const domainIsolationOk = !deployedHost || local || deployedHost === expectedHost;
  let counts: Record<string, number> | null = null;
  let convexLive = false;
  let convexError: string | null = null;
  if (backendConfigured) {
    try {
      counts = await getConvexCounts();
      convexLive = true;
    } catch (error) {
      convexError = error instanceof Error ? error.message : String(error);
    }
  }
  const editorialReady = Boolean(
    counts &&
    (counts.personas ?? 0) >= 16 &&
    (counts.accounts ?? 0) >= 16 &&
    (counts.content_topics ?? 0) >= 500 &&
    (counts.content_hooks ?? 0) >= 200 &&
    (counts.content_ctas ?? 0) >= 30
  );
  const googleSyncConfigured = googleServiceAccountConfigured();
  const ok = backendConfigured && convexLive && domainIsolationOk;
  const p0Ready = ok && editorialReady && googleSyncConfigured;
  const production = backendConfigured && convexLive ? await productionGateStatus().catch((error) => ({ ready: false, blockers: ["PRODUCTION_GATE_ERROR"], warnings: [], checks: { error: error instanceof Error ? error.message : String(error) } })) : { ready: false, blockers: ["CONVEX_NOT_LIVE"], warnings: [], checks: {} };

  return Response.json(
    {
      ok,
      p0Ready,
      service: "cortifree-auto-publisher",
      workspace: "cortifree",
      backend: "convex",
      backendConfigured,
      convexLive,
      convexError,
      counts,
      editorialReady,
      googleSyncConfigured,
      runtimeTruth: "convex",
      jsonFallbackEnabled: process.env.ALLOW_RUNTIME_JSON_FALLBACK === "true",
      domainIsolationOk,
      expectedHost,
      deployedHost,
      legacySupabaseRuntimeEnabled: false,
      dryRun: process.env.DRY_RUN !== "false",
      productionReady: production.ready,
      productionBlockers: production.blockers,
      productionWarnings: production.warnings,
      productionChecks: production.checks,
    },
    { status: ok ? 200 : 503 },
  );
}
