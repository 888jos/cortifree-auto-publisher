import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.CORTIFREE_BACKEND_SECRET;
if (!url || !secret) throw new Error("Convex migration environment is required");
const client = new ConvexHttpClient(url);
const targets = [
  { table: "assets", field: "public_url" },
  { table: "visual_references", field: "thumbnail_url" },
  { table: "carousel_slides", field: "rendered_url" },
] as const;
const uploaded = new Map<string, Promise<Id<"_storage">>>();
let attached = 0;
let skipped = 0;
const failures: Array<{ table: string; legacyId: string; source: string; error: string }> = [];

async function retry<T>(operation: () => Promise<T>) {
  let error: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await operation(); } catch (caught) {
      error = caught;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw error;
}

async function migrateRow(target: (typeof targets)[number], row: Record<string, unknown>) {
    const source = typeof row[target.field] === "string" ? String(row[target.field]) : "";
    const legacyId = String(row.id ?? (target.table === "carousel_slides" ? `${row.carousel_id}:${row.position}` : ""));
    if (!source || !legacyId || source.includes("convex.cloud") || source.includes("convex.site")) { skipped += 1; return; }
    try {
      let upload = uploaded.get(source);
      if (!upload) {
        upload = retry(async () => {
          const sourceResponse = await fetch(source);
          if (!sourceResponse.ok) throw new Error(`Cannot download ${target.table} file: ${sourceResponse.status}`);
          const uploadUrl = await client.mutation(api.data.generateUploadUrl, { secret });
          const uploadResponse = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": sourceResponse.headers.get("content-type") ?? "application/octet-stream" }, body: new Uint8Array(await sourceResponse.arrayBuffer()) });
          if (!uploadResponse.ok) throw new Error(`Convex upload failed: ${uploadResponse.status}`);
          return (await uploadResponse.json() as { storageId: Id<"_storage"> }).storageId;
        });
        uploaded.set(source, upload);
      }
      const storageId = await upload;
      await client.mutation(api.data.attachStorage, { secret, table: target.table, legacyId, storageId, storageField: target.field });
      attached += 1;
      if (attached % 50 === 0) console.log(`Attached ${attached} files...`);
    } catch (error) {
      failures.push({ table: target.table, legacyId, source, error: error instanceof Error ? error.message : String(error) });
    }
}

for (const target of targets) {
  const rows = await client.query(api.data.list, { secret, table: target.table, filters: [], limit: 5000 }) as Array<Record<string, unknown>>;
  for (let offset = 0; offset < rows.length; offset += 8) {
    await Promise.all(rows.slice(offset, offset + 8).map((row) => migrateRow(target, row)));
  }
}
console.log(JSON.stringify({ uniqueFilesUploaded: uploaded.size, documentsAttached: attached, skipped, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
