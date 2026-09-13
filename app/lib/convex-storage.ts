import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

let client: ConvexHttpClient | null = null;

function backend() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.CORTIFREE_BACKEND_SECRET;
  if (!url || !secret) throw new Error("Convex storage is not configured for CortiFree");
  client ??= new ConvexHttpClient(url);
  return { client, secret };
}

export async function uploadConvexFile(bytes: Uint8Array, contentType: string) {
  const { client: convex, secret } = backend();
  const uploadUrl = await convex.mutation(api.data.generateUploadUrl, { secret });
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes) });
  if (!response.ok) throw new Error(`Convex file upload failed: ${response.status}`);
  const { storageId } = await response.json() as { storageId: Id<"_storage"> };
  const publicUrl = await convex.query(api.data.storageUrl, { secret, storageId });
  if (!publicUrl) throw new Error("Convex returned no file URL");
  return { storageId, publicUrl };
}
