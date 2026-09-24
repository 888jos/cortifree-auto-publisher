import { dataBackend } from "../app/lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../app/lib/workspace";

type Row = Record<string, unknown>;

async function rows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function patch(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function main() {
  const execute = process.argv.includes("--execute");
  const [legacyJobs, legacyCarousels] = await Promise.all([
    rows(`image_generation_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&status=eq.FAILED&last_error=eq.STALE_LEGACY_VISUAL_REFERENCE_DISABLED&output_asset_id=is.null&select=id,status,last_error,metadata`),
    rows(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&content_type=like.C*&status=neq.ARCHIVED&select=id,content_type,status,spec`),
  ]);

  const report: Row = {
    execute,
    legacy_image_jobs_to_cancel: legacyJobs.length,
    legacy_carousels_to_archive: legacyCarousels.length,
  };

  if (!execute) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const cleanedAt = new Date().toISOString();
  const cancelled: string[] = [];
  for (const job of legacyJobs) {
    const metadata = job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata as Row
      : {};
    const updated = await patch(
      `image_generation_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(String(job.id))}`,
      {
        status: "CANCELLED",
        metadata: {
          ...metadata,
          cleanup_reason: "STALE_LEGACY_VISUAL_REFERENCE_DISABLED",
          cleaned_at: cleanedAt,
        },
        updated_at: cleanedAt,
      },
    );
    if (updated[0]) cancelled.push(String(job.id));
  }

  const archived: string[] = [];
  for (const carousel of legacyCarousels) {
    const spec = carousel.spec && typeof carousel.spec === "object" && !Array.isArray(carousel.spec)
      ? carousel.spec as Row
      : {};
    const updated = await patch(
      `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(String(carousel.id))}`,
      {
        status: "ARCHIVED",
        spec: {
          ...spec,
          archived_reason: "LEGACY_C_FORMAT_REPLACED_BY_F01_F08",
          archived_at: cleanedAt,
        },
        updated_at: cleanedAt,
      },
    );
    if (updated[0]) archived.push(String(carousel.id));
  }

  console.log(JSON.stringify({
    ...report,
    cancelled_image_jobs: cancelled.length,
    archived_carousels: archived.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
