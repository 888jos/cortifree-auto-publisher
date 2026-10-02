import { backendConfigured, backendMode, dataBackend, getBackendCounts, getBackendPing } from "../../app/lib/data-backend";
import { googleServiceAccountConfigured } from "../../app/lib/google/auth";
import { loadRuntimeAccounts, loadRuntimeAutonomyRules } from "../runtime/config";
import { acceptanceGateStatus } from "./acceptance";

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

  checks.backendConfigured = backendConfigured();
  checks.backendMode = backendMode();
  if (!checks.backendConfigured) blockers.push("BACKEND_NOT_CONFIGURED");

  let counts: Record<string, number> = {};
  if (checks.backendConfigured) {
    try {
      checks.backendPing = await getBackendPing();
      checks.backendLive = true;
    } catch (error) {
      checks.backendLive = false;
      checks.backendError = error instanceof Error ? error.message : String(error);
      blockers.push("BACKEND_NOT_LIVE");
    }
    if (checks.backendLive) {
      try {
        counts = await getBackendCounts();
        checks.backendDataReady = true;
      } catch (error) {
        checks.backendDataReady = false;
        checks.backendDataError = error instanceof Error ? error.message : String(error);
        blockers.push("BACKEND_DATA_NOT_READY");
      }
    }
  }

  checks.counts = counts;
  if ((counts.personas ?? 0) < 16) blockers.push("PERSONAS_LT_16");
  if ((counts.accounts ?? 0) < 16) blockers.push("ACCOUNTS_LT_16");
  if ((counts.content_ctas ?? 0) < 30) blockers.push("CTAS_LT_30");
  if ((counts.assets ?? 0) < 300) blockers.push("ASSETS_LT_300");
  if ((counts.visual_references ?? 0) < 150) blockers.push("VISUAL_REFS_LT_150");

  const [activeTerritories, activeFormats, activeLegacyHooks] = await Promise.all([
    rows("content_topics?active=eq.true&select=topic_id&limit=500").catch(() => []),
    rows("content_formats?active=eq.true&select=format_id&limit=100").catch(() => []),
    rows("content_hooks?active=eq.true&select=hook_id&limit=500").catch(() => []),
  ]);
  const canonicalFormats = new Set([
    "F01_LIFESTYLE_GUIDE","F03_ROUTINE_TIMELINE","F04_AESTHETIC_EDUCATIONAL",
    "F05_INTERACTIVE_CHECKLIST","F07_RANKING","F08_2X2",
  ]);
  const territoryIds = activeTerritories.map((row) => String(row.topic_id ?? "")).filter((id) => id.startsWith("T_"));
  const formatIds = activeFormats.map((row) => String(row.format_id ?? ""));
  checks.activeTerritories = territoryIds.length;
  checks.activeCanonicalFormats = formatIds.filter((id) => canonicalFormats.has(id)).length;
  checks.activeLegacyHookFormulas = activeLegacyHooks.length;
  checks.dynamicHookMode = activeLegacyHooks.length === 0;
  if (territoryIds.length < 40) blockers.push("CONTENT_TERRITORIES_LT_40");
  if (checks.activeCanonicalFormats !== 6) blockers.push("CANONICAL_FORMATS_NOT_6");
  if (activeLegacyHooks.length > 0) blockers.push("LEGACY_HOOK_FORMULAS_ACTIVE");

  checks.googleConfigured = googleServiceAccountConfigured();
  if (!checks.googleConfigured) blockers.push("GOOGLE_SERVICE_ACCOUNT_MISSING");

  const sheetStage = `SHEET_TO_${backendMode().toUpperCase()}`;
  const driveStage = `DRIVE_TO_${backendMode().toUpperCase()}`;
  const [sheetSync, driveSync] = await Promise.all([
    rows(`system_logs?stage=eq.${sheetStage}&order=created_at.desc&limit=1`).catch(() => []),
    rows(`system_logs?stage=eq.${driveStage}&order=created_at.desc&limit=1`).catch(() => []),
  ]);
  const latestSheetSync = sheetSync[0];
  const latestDriveSync = driveSync[0];
  checks.latestSheetSync = latestSheetSync?.created_at ?? null;
  checks.latestDriveSync = latestDriveSync?.created_at ?? null;
  checks.sheetSyncStage = sheetStage;
  checks.driveSyncStage = driveStage;
  const sheetSyncOk = String(latestSheetSync?.status ?? "").toUpperCase() === "SUCCESS";
  const driveSyncOk = String(latestDriveSync?.status ?? "").toUpperCase() === "SUCCESS";
  checks.googleSyncFresh = isRecent(latestSheetSync?.created_at, 36) && isRecent(latestDriveSync?.created_at, 36);
  checks.googleSyncSuccessful = sheetSyncOk && driveSyncOk;
  if (!checks.googleSyncFresh) blockers.push("GOOGLE_SYNC_STALE_OR_MISSING");
  if (!checks.googleSyncSuccessful) blockers.push("GOOGLE_SYNC_NOT_SUCCESSFUL");

  const masters = await rows("assets?source_type=eq.persona_master&enabled=eq.true&limit=100").catch(() => []);
  const masterPersonaIds = new Set(masters.map((row) => String(row.persona_id ?? "")).filter(Boolean));
  checks.masterCount = masterPersonaIds.size;
  if (masterPersonaIds.size < 16) blockers.push("PERSONA_MASTERS_LT_16");

  const accounts = await loadRuntimeAccounts().catch(() => []);
  const enabledPostingAccounts = accounts.filter((account) => account.enabled && account.posting_enabled);
  const publishAccounts = enabledPostingAccounts.filter((account) => account.warmup_status === "ACTIVE");
  const mappedEnabledAccounts = enabledPostingAccounts.filter((account) => Boolean(account.upload_post_profile?.trim()));
  const mappedAccounts = publishAccounts.filter((account) => Boolean(account.upload_post_profile?.trim()));
  checks.enabledPostingAccounts = enabledPostingAccounts.map((a) => a.id);
  checks.activePublishingAccounts = publishAccounts.map((a) => a.id);
  checks.mappedEnabledAccounts = mappedEnabledAccounts.map((a) => a.id);
  checks.mappedPublishingAccounts = mappedAccounts.map((a) => a.id);
  if (!publishAccounts.length) blockers.push("NO_ACTIVE_PUBLISHING_ACCOUNT");
  else if (mappedAccounts.length !== publishAccounts.length) blockers.push("ACTIVE_ACCOUNT_MISSING_UPLOAD_POST_PROFILE");

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

  const autonomyRules = await loadRuntimeAutonomyRules(200);
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

  const acceptance = await acceptanceGateStatus().catch(() => ({
    passed: false,
    reviewed: 0,
    usable: 0,
    batchId: null,
    createdAt: null,
    notes: null,
  }));
  checks.acceptance = acceptance;
  if (!(acceptance.passed && acceptance.reviewed >= 20 && acceptance.usable >= 15)) {
    blockers.push("ACCEPTANCE_GATE_NOT_PASSED");
  }

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
