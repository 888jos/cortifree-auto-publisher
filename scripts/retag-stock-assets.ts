import sharp from "sharp";
import { dataBackend } from "../app/lib/data-backend.js";
import { CORTIFREE_WORKSPACE_ID } from "../app/lib/workspace.js";
import { OpenAIStockAssetAnalyzer, type StockAssetVision } from "../app/lib/ai/stock-asset-analyzer.js";
import { getAIConfig } from "../app/lib/ai/config.js";
import { logAIUsage } from "../app/lib/ai/usage.js";

type StockRow = { id: string | number; filename: string; public_url: string; metadata?: Record<string, unknown>; tags?: string[]; visual_description?: string; visual_review_status?: string; visual_tagging_schema?: string };
type Outcome = { id: string; ok: boolean; error?: string; description?: string; name?: string };
const concurrency = Math.max(1, Math.min(4, Number(process.env.STOCK_VISION_CONCURRENCY ?? 3)));
const force = process.argv.includes("--force");

function token(value: string) { return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function stableName(base: string, id: string, used: Set<string>) {
  const clean = token(base).slice(0, 108) || "OBSERVED_IMAGE";
  if (!used.has(clean)) { used.add(clean); return clean; }
  const resolved = `${clean.slice(0, 104)}_${token(id).slice(-8)}`;
  used.add(resolved);
  return resolved;
}
async function imageDataUrl(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error(`IMAGE_FETCH_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 25_000_000) throw new Error("IMAGE_BYTES_INVALID");
  const normalized = await sharp(bytes).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${normalized.toString("base64")}`;
}
function writePayload(row: StockRow, analysis: StockAssetVision, assetName: string) {
  const metadata = row.metadata ?? {};
  const tags = [...new Set([...analysis.visible_actions, ...analysis.visible_objects, analysis.setting, ...analysis.good_for])].slice(0, 40);
  return {
    visual_description: analysis.visual_description, visible_actions: analysis.visible_actions, visible_objects: analysis.visible_objects,
    setting: analysis.setting, people_visibility: analysis.people_visibility, body_parts_visible: analysis.body_parts_visible,
    framing: analysis.framing, camera_angle: analysis.camera_angle, lighting: analysis.lighting, composition: analysis.composition.join(" | "),
    specific_details: analysis.specific_details.join(" | "), dominant_colors: analysis.dominant_colors, text_in_image: analysis.text_in_image,
    mood: analysis.mood, good_for: analysis.good_for, tags, visual_review_status: "IMAGE_INSPECTED_V2", visual_tagging_schema: "observable_v2",
    visual_reviewed_at: new Date().toISOString(),
    metadata: { ...metadata, asset_name: assetName, specific_details: analysis.specific_details, avoid_for: analysis.avoid_for, visual_tagging_schema: "observable_v2", visual_review_status: "IMAGE_INSPECTED_V2", visual_inspected_at: new Date().toISOString(), visual_analyzer: "openai_pixels" },
  };
}
function generic(description: string) { return /^(healthy|wellness|fitness|lifestyle|balanced)\b.*\b(scene|image|photo)\.?$/i.test(description.trim()); }
async function allStocks() {
  const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&source_type=eq.stock&enabled=eq.true&public_url=not.is.null&select=id,filename,public_url,metadata,tags,visual_description,visual_review_status,visual_tagging_schema&limit=5000`);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as StockRow[];
}
async function main() {
  const config = getAIConfig();
  if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const rows = await allStocks();
  const usedNames = new Set(rows.map((row) => String(row.metadata?.asset_name ?? "")).filter(Boolean));
  const analyzer = new OpenAIStockAssetAnalyzer(config.OPENAI_MODEL_QA, config.OPENAI_TIMEOUT_MS);
  const outcomes: Outcome[] = [];
  async function processRows(targets: StockRow[], phase: "initial" | "duplicate_retry") {
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const row = targets[cursor++]!;
      try {
        const result = await analyzer.analyze(await imageDataUrl(row.public_url));
        const name = stableName(result.data.asset_name, String(row.id), usedNames);
        const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(String(row.id))}`, { method: "PATCH", body: JSON.stringify(writePayload(row, result.data, name)) });
        if (!response.ok) throw new Error(`WRITE_FAILED:${await response.text()}`);
        await logAIUsage({ operation: "stock_asset.analyze_v2", model: config.OPENAI_MODEL_QA, usage: result.usage, success: true });
        outcomes.push({ id: String(row.id), ok: true, description: result.data.visual_description, name });
        process.stdout.write(`OK ${phase} ${outcomes.filter((item) => item.ok).length}/${targets.length} ${row.id}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outcomes.push({ id: String(row.id), ok: false, error: message });
        await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(String(row.id))}`, { method: "PATCH", body: JSON.stringify({ visual_review_status: "FAILED_VISION", metadata: { ...(row.metadata ?? {}), visual_review_status: "FAILED_VISION", visual_error: message.slice(0, 800), visual_failed_at: new Date().toISOString() } }) });
        process.stderr.write(`FAIL ${row.id}: ${message}\n`);
      }
    }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
  }
  // A normal run is resumable: only unreviewed/failed assets consume vision calls.
  // --force is deliberately explicit for a complete fresh audit.
  const initialTargets = force
    ? rows
    : rows.filter((row) => row.visual_review_status !== "IMAGE_INSPECTED_V2" || row.visual_tagging_schema !== "observable_v2");
  await processRows(initialTargets, "initial");

  let finalRows = await allStocks();
  // Exact duplicate/generic descriptions are not accepted as a completed audit.
  // Re-inspect only the flagged images once, using pixels again, then re-audit below.
  const byDescription = new Map<string, StockRow[]>();
  for (const row of finalRows) {
    const description = String(row.visual_description ?? "").trim().toLowerCase();
    if (description) byDescription.set(description, [...(byDescription.get(description) ?? []), row]);
  }
  const duplicateRetryIds = new Set([
    ...[...byDescription.values()].filter((group) => group.length > 1).flat().map((row) => String(row.id)),
    ...finalRows.filter((row) => generic(String(row.visual_description ?? ""))).map((row) => String(row.id)),
  ]);
  if (duplicateRetryIds.size) {
    await processRows(finalRows.filter((row) => duplicateRetryIds.has(String(row.id))), "duplicate_retry");
    finalRows = await allStocks();
  }
  const inspected = finalRows.filter((row) => row.visual_review_status === "IMAGE_INSPECTED_V2" && row.visual_tagging_schema === "observable_v2");
  const descriptions = new Map<string, string[]>();
  const names = new Map<string, string[]>();
  for (const row of finalRows) {
    const description = String(row.visual_description ?? "").trim().toLowerCase();
    const name = String(row.metadata?.asset_name ?? "").trim();
    if (description) descriptions.set(description, [...(descriptions.get(description) ?? []), String(row.id)]);
    if (name) names.set(name, [...(names.get(name) ?? []), String(row.id)]);
  }
  const duplicateDescriptions = [...descriptions.values()].filter((ids) => ids.length > 1);
  const duplicateNames = [...names.values()].filter((ids) => ids.length > 1);
  const genericWarnings = finalRows.filter((row) => generic(String(row.visual_description ?? ""))).map((row) => String(row.id));
  const report = { total_stock_assets: finalRows.length, vision_inspected: inspected.length, successfully_written: outcomes.filter((item) => item.ok).length, failed: outcomes.filter((item) => !item.ok), pending: finalRows.filter((row) => row.visual_review_status !== "IMAGE_INSPECTED_V2").map((row) => String(row.id)), duplicate_descriptions: duplicateDescriptions, duplicate_asset_names: duplicateNames, generic_description_warnings: genericWarnings, coverage: finalRows.length ? Number((inspected.length / finalRows.length * 100).toFixed(2)) : 100 };
  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length || report.pending.length || duplicateDescriptions.length || duplicateNames.length || genericWarnings.length) process.exitCode = 2;
}
main().catch((error) => { console.error(error); process.exit(1); });
