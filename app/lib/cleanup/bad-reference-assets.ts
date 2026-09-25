import { deleteGeneratedFile } from "../convex-storage";
import { dataBackend } from "../data-backend";
import { deleteDriveFile } from "../google/drive";
import { CORTIFREE_WORKSPACE_ID } from "../workspace";

type Row = Record<string, any>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function patch(resource: string, body: Record<string, unknown>) {
  const response = await dataBackend(resource, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
}

function isUserCuratedReference(reference: Row) {
  const metadata = reference.metadata ?? {};
  return reference.source_platform === "manual"
    || String(metadata.canonical_source ?? "") === "08_VISUAL_REFS"
    || /^VR\d+$/i.test(String(reference.id ?? ""));
}

function isLegacyAutoReference(reference: Row) {
  return reference.source_platform === "pinterest" && !isUserCuratedReference(reference);
}

function isLegacyGeneratedFilename(filename: string) {
  return /_MODELARK_01\.png$/i.test(filename)
    || /^modelark_image_swap_test_/i.test(filename);
}

export async function cleanupNonUserReferenceAssets() {
  const [references, jobs, assets] = await Promise.all([
    rows(`visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,source_platform,metadata,enabled&limit=1000`),
    rows(`image_generation_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,visual_reference_id,output_asset_id,status&limit=1000`),
    rows(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&source_type=eq.persona_generated&select=id,persona_id,filename,drive_file_id,drive_path,public_url,storage_path,metadata,enabled,visual_review_status&limit=2000`),
  ]);

  const badReferences = references.filter(isLegacyAutoReference);
  const badReferenceIds = new Set(badReferences.map((reference) => String(reference.id)));
  const badOutputAssetIds = new Set(
    jobs
      .filter((job) => job.output_asset_id != null && badReferenceIds.has(String(job.visual_reference_id ?? "")))
      .map((job) => String(job.output_asset_id)),
  );

  const targets = assets.filter((asset) =>
    isLegacyGeneratedFilename(String(asset.filename ?? ""))
    || badOutputAssetIds.has(String(asset.id)),
  );

  const report = {
    references_disabled: 0,
    target_assets: targets.length,
    drive_deleted: 0,
    drive_missing: 0,
    storage_deleted: 0,
    storage_missing: 0,
    storage_skipped: 0,
    assets_marked_deleted: 0,
    failures: [] as Array<Record<string, unknown>>,
  };

  for (const reference of badReferences) {
    try {
      await patch(
        `visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(String(reference.id))}`,
        {
          enabled: false,
          metadata: {
            ...(reference.metadata ?? {}),
            automatic_generation_disabled: true,
            automatic_generation_disabled_reason: "reference_not_user_curated",
            automatic_generation_disabled_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
      );
      report.references_disabled += 1;
    } catch (error) {
      report.failures.push({ kind: "REFERENCE_DISABLE", id: reference.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const asset of targets) {
    const assetId = String(asset.id);
    try {
      if (asset.drive_file_id) {
        const result = await deleteDriveFile(String(asset.drive_file_id));
        if (result.deleted) report.drive_deleted += 1;
        if (result.missing) report.drive_missing += 1;
      }

      const storageId = asset.metadata?.storage_id
        ?? (String(asset.storage_path ?? "").startsWith("generated/") ? asset.storage_path : null);
      const storageResult = await deleteGeneratedFile(storageId);
      if (storageResult.deleted) report.storage_deleted += 1;
      else if ("missing" in storageResult && storageResult.missing) report.storage_missing += 1;
      else report.storage_skipped += 1;

      await patch(
        `assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(assetId)}`,
        {
          enabled: false,
          drive_file_id: null,
          drive_path: null,
          public_url: null,
          visual_review_status: "DELETED_BAD_REFERENCE_PROVENANCE",
          visual_reviewed_at: new Date().toISOString(),
          metadata: {
            ...(asset.metadata ?? {}),
            deleted_bad_reference_provenance: true,
            deleted_bad_reference_reason: "generated from a reference that was not user-curated",
            deleted_bad_reference_at: new Date().toISOString(),
            former_drive_file_id: asset.drive_file_id ?? null,
            former_public_url: asset.public_url ?? null,
          },
        },
      );
      report.assets_marked_deleted += 1;
    } catch (error) {
      report.failures.push({
        kind: "ASSET_DELETE",
        id: asset.id,
        persona_id: asset.persona_id,
        filename: asset.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: report.failures.length === 0,
    bad_reference_ids: [...badReferenceIds].sort(),
    ...report,
  };
}
