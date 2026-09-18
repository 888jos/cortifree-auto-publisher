import { dataBackend, convexConfigured, getConvexCounts } from "../../app/lib/data-backend";
import { googleServiceAccountConfigured } from "../../app/lib/google/auth";
import { loadRuntimeAccounts, loadRuntimeRows } from "../runtime/config";

type Row = Record<string, unknown>;

function isRecent(value: unknown, maxHours: number) {
  if (!value) return false;
  const ms = Date.now() - Date.parse(String(value));
  return Number.isFinite(ms) && ms >= 0 && ms <= maxHours * 3_600_000;
}

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function boolEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export type ProductionGateStatus = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checks: Record<string, unknown>;
};

export async function productionGateStatus(): Promise<ProductionGateStatus> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, unknown> = {};

  checks.convexConfigured = convexConfigured();
  if (!checks.convexConfigured) blockers.push("CONVEX_NOT_CONFIGURED");

  let counts: Record<string, number> = {};
  if (checks.convexConfigured) {
    try {
      counts = await getConvexCounts();
      checks.convexLive = true;
    } catch (error) {
      checks.convexLive = false;
      checks.convexError = error instanceof Error ? error.message : String(error);
      blockers.push("CONVEX_NOT_LIVE");
    }
  }

  checks.counts = counts;
  if ((counts.personas ?? 0) < 16) blockers.push("PERSONAS_LT_16");
  if ((counts.accounts ?? 0) < 16) blockers.push("ACCOUNTS_LT_16");
  if ((counts.content_topics ?? 0) < 500) blockers.push("TOPICS_LT_500");
  if ((counts.content_hooks ?? 0) < 200) blockers.push("HOOKS_LT_200");
  if ((counts.content_ctas ?? 0) < 30) blockers.push("CTAS_LT_30");
  if ((counts.assets ?? 0) < 300) blockers.push("ASSETS_LT_300");
  if ((counts.visual_references ?? 0) < 150) blockers.push("VISUAL_REFS_LT_150");

  checks.googleConfigured = googleServiceAccountConfigured();
  if (!checks.googleConfigured) blockers.push("GOOGLE_SERVICE_ACCOUNT_MISSING");

  const [sheetSync, driveSync] = await Promise.all([
    rows("system_logs?event=eq.SHEET_TO_CONVEX&order=finished_at.desc&limit=1").catch(() => []),
    rows("system_logs?event=eq.DRIVE_TO_CONVEX&order=finished_at.desc&limit=1").catch(() => []),
  ]);
  const latestSheetSync = sheetSync[0];
  const latestDriveSync = driveSync[0];
  checks.latestSheetSync = latestSheetSync?.finished_at ?? null;
  checks.latestDriveSync = latestDriveSync?.finished_at ?? null;
  checks.googleSyncFresh = isRecent(latestSheetSync?.finished_at, 36) && isRecent(latestDriveSync?.finished_at, 36);
  if (!checks.googleSyncFresh) blockers.push("GOOGLE_SYNC_STALE_OR_MISSING");

  const masters = await rows("assets?source_type=eq.persona_master&enabled=eq.true&limit=100").catch(() => []);
  const masterPersonaIds = new Set(masters.map((row) => String(row.persona_id ?? "")).filter(Boolean));
  checks.masterCount = masterPersonaIds.size;
  if (masterPersonaIds.size < 16) blockers.push("PERSONA_MASTERS_LT_16");

  const accounts = await loadRuntimeAccounts().catch(() => []);
  const publishAccounts = accounts.filter((account) =>
    account.enabled &&
    account.posting_enabled &&
    account.warmup_status === "ACTIVE"
  );
  const mappedAccounts = publishAccounts.filter((account) => Boolean(account.upload_post_profile?.trim()));
  checks.activePublishingAccounts = publishAccounts.map((a) => a.id);
  checks.mappedPublishingAccounts = mappedAccounts.map((a) => a.id);
  if (!mappedAccounts.length) blockers.push("NO_UPLOAD_POST_PROFILE");

  checks.uploadPostApiKey = boolEnv("UPLOAD_POST_API_KEY");
  if (!checks.uploadPostApiKey) blockers.push("UPLOAD_POST_API_KEY_MISSING");
  checks.openAiConfigured = boolEnv("OPENAI_API_KEY");
  if (!checks.openAiConfigured) blockers.push("OPENAI_API_KEY_MISSING");

  const imageGenerationEnabled = process.env.IMAGE_GENERATION_ENABLED === "true";
  checks.imageGenerationEnabled = imageGenerationEnabled;
  if (imageGenerationEnabled) {
    checks.modelArkConfigured = boolEnv("MODELARK_API_KEY") && boolEnv("MODELARK_MODEL_ID");
    if (!checks.modelArkConfigured) blockers.push("MODELARK_NOT_CONFIGURED");
  } else {
    warnings.push("IMAGE_GENERATION_DISABLED");
  }

  const autonomyRules = await loadRuntimeRows("autonomy_rules", 200).catch(() => []);
  const minCacheRow = autonomyRules.find((row) => String(row.key) === "persona_cache_min" && row.active !== false);
  const minCache = Math.max(1, Number(minCacheRow?.value ?? 12));
  const cacheByPersona: Record<string, number> = {};
  const generatedAssets = await rows("assets?source_type=eq.persona_generated&enabled=eq.true&limit=5000").catch(() => []);
  for (const asset of generatedAssets) {
    const personaId = String(asset.persona_id ?? "");
    if (personaId) cacheByPersona[personaId] = (cacheByPersona[personaId] ?? 0) + 1;
  }
  checks.personaCacheMin = minCache;
  checks.personaCacheCounts = cacheByPersona;
  const cacheMissing = mappedAccounts
    .map((account) => account.persona_id)
    .filter((personaId) => (cacheByPersona[personaId] ?? 0) < minCache);
  checks.cacheMissingForPublishingPersonas = cacheMissing;
  if (cacheMissing.length) blockers.push("PUBLISHING_PERSONA_CACHE_BELOW_MIN");

  const acceptance = (await rows("system_logs?event=eq.ACCEPTANCE_GATE&order=created_at.desc&limit=1").catch(() => []))[0];
  const reviewed = Number(acceptance?.reviewed ?? 0);
  const usable = Number(acceptance?.usable ?? 0);
  const accepted = acceptance?.passed === true || String(acceptance?.passed).toLowerCase() === "true";
  checks.acceptance = {
    id: acceptance?.id ?? null,
    reviewed,
    usable,
    passed: accepted,
    created_at: acceptance?.created_at ?? null,
  };
  if (!(accepted && reviewed >= 20 && usable >= 15)) blockers.push("ACCEPTANCE_GATE_NOT_PASSED");

  checks.cronSecret = boolEnv("CRON_SECRET");
  if (!checks.cronSecret) blockers.push("CRON_SECRET_MISSING");

  checks.dryRun = process.env.DRY_RUN !== "false";
  checks.autoApprove = process.env.AUTONOMY_AUTO_APPROVE === "true";
  checks.autoPublish = process.env.AUTONOMY_AUTO_PUBLISH === "true";

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    checks,
  };
}
