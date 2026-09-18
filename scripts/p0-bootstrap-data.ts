import { syncEditorialSheetToConvex } from "../app/lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../app/lib/sync/drive";
import { getConvexCounts } from "../app/lib/data-backend";

const batch = Math.max(1, Math.min(250, Number(process.env.P0_DRIVE_BATCH || 250)));
const maxPasses = Math.max(1, Math.min(10, Number(process.env.P0_DRIVE_MAX_PASSES || 4)));

const editorial = await syncEditorialSheetToConvex();
const passes: unknown[] = [];

for (let pass = 1; pass <= maxPasses; pass += 1) {
  const result = await syncGoogleDriveToConvex({ limit: batch });
  passes.push({ pass, ...result });
  if ((result.remaining_hint ?? 0) <= 0 || result.uploaded === 0) break;
}

const counts = await getConvexCounts();
const safeCounts = {
  personas: counts.personas ?? 0,
  accounts: counts.accounts ?? 0,
  assets: counts.assets ?? 0,
  content_formats: counts.content_formats ?? 0,
  content_pillars: counts.content_pillars ?? 0,
  content_topics: counts.content_topics ?? 0,
  content_hooks: counts.content_hooks ?? 0,
  content_ctas: counts.content_ctas ?? 0,
  content_claim_rules: counts.content_claim_rules ?? 0,
  content_sources: counts.content_sources ?? 0,
  autonomy_rules: counts.autonomy_rules ?? 0,
  template_specs: counts.template_specs ?? 0,
  visual_references: counts.visual_references ?? 0,
};

const blockers: string[] = [];
if (safeCounts.personas < 16) blockers.push("personas<16");
if (safeCounts.accounts < 16) blockers.push("accounts<16");
if (safeCounts.content_topics < 500) blockers.push("topics<500");
if (safeCounts.content_hooks < 200) blockers.push("hooks<200");
if (safeCounts.content_ctas < 30) blockers.push("ctas<30");
if (safeCounts.assets < 300) blockers.push("assets<300");
if (safeCounts.visual_references < 150) blockers.push("visual_refs<150");

console.log(JSON.stringify({ editorial, drivePasses: passes, counts: safeCounts, blockers, ready: blockers.length === 0 }, null, 2));
if (blockers.length) process.exitCode = 2;
