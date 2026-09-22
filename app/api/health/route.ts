import { backendConfigured as isBackendConfigured, backendMode, getBackendCounts, getBackendPing } from "../../lib/data-backend";
import { googleServiceAccountConfigured, googleServiceAccountIdentity } from "../../lib/google/auth";
import { CORTIFREE_SHEET_ID, readSheetRange } from "../../lib/google/sheets";
import { productionGateStatus } from "../../../src/autonomy/production-gate";
import { isAdminRequest } from "../../lib/admin-auth";

function hostname(value?: string) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return Response.json({
      ok: true,
      service: "cortifree-auto-publisher",
      authentication: "required",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  const backendConfigured = isBackendConfigured();
  const expectedHost = (process.env.CORTIFREE_CANONICAL_HOST || "cortifree-auto-publisher.vercel.app").toLowerCase();
  const deployedHost = hostname(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? hostname(process.env.NEXT_PUBLIC_APP_URL);
  const local = deployedHost === "localhost" || deployedHost === "127.0.0.1";
  const domainIsolationOk = !deployedHost || local || deployedHost === expectedHost;
  let counts: Record<string, number> | null = null;
  let backendLive = false;
  let backendDataReady = false;
  let backendPing: Record<string, unknown> | null = null;
  let backendError: string | null = null;
  let backendDataError: string | null = null;
  if (backendConfigured) {
    try {
      backendPing = await getBackendPing();
      backendLive = true;
    } catch (error) {
      backendError = error instanceof Error ? error.message : String(error);
    }
    if (backendLive) {
      try {
        counts = await getBackendCounts();
        backendDataReady = true;
      } catch (error) {
        backendDataError = error instanceof Error ? error.message : String(error);
      }
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
  let googleReadProbe: Record<string, unknown> = { ok: false, skipped: true };
  if (googleSyncConfigured) {
    try {
      const values = await readSheetRange("00_INDEX", "A1:B2");
      googleReadProbe = { ok: true, rows: values.length, columns: values[0]?.length ?? 0 };
    } catch (error) {
      googleReadProbe = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  const ok = backendConfigured && backendLive && backendDataReady && domainIsolationOk;
  const p0Ready = ok && editorialReady && googleSyncConfigured;
  const production = backendConfigured && backendLive && backendDataReady
    ? await productionGateStatus().catch((error) => ({ ready: false, blockers: ["PRODUCTION_GATE_ERROR"], warnings: [], checks: { error: error instanceof Error ? error.message : String(error) } }))
    : {
        ready: false,
        blockers: [!backendConfigured ? "BACKEND_NOT_CONFIGURED" : !backendLive ? "BACKEND_NOT_LIVE" : "BACKEND_DATA_NOT_READY"],
        warnings: [],
        checks: {},
      };

  return Response.json(
    {
      ok,
      p0Ready,
      service: "cortifree-auto-publisher",
      workspace: "cortifree",
      backend: backendMode(),
      backendConfigured,
      backendLive,
      backendDataReady,
      backendPing,
      backendError,
      backendDataError,
      counts,
      editorialReady,
      googleSyncConfigured,
      googleServiceAccount: googleServiceAccountIdentity(),
      googleSheetId: CORTIFREE_SHEET_ID,
      googleReadProbe,
      runtimeTruth: backendMode(),
      jsonFallbackEnabled: process.env.ALLOW_RUNTIME_JSON_FALLBACK === "true",
      domainIsolationOk,
      expectedHost,
      deployedHost,
      dryRun: process.env.DRY_RUN !== "false",
      productionReady: production.ready,
      productionBlockers: production.blockers,
      productionWarnings: production.warnings,
      productionChecks: production.checks,
    },
    { status: ok ? 200 : 503 },
  );
}
