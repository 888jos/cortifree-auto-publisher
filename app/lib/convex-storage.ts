import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const api = anyApi;
import { backendMode } from "./data-backend";

let client: ConvexHttpClient | null = null;

function backend() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.CORTIFREE_BACKEND_SECRET;
  if (!url || !secret) throw new Error("Convex storage is not configured for CortiFree");
  client ??= new ConvexHttpClient(url);
  return { client, secret };
}

export async function uploadConvexFile(bytes: Uint8Array, contentType: string) {
  if (backendMode() === "supabase") {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase storage is not configured for CortiFree");
    const storagePath = `generated/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const response = await fetch(`${url}/storage/v1/object/cortifree-assets/${storagePath}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) throw new Error(`Supabase file upload failed: ${response.status} ${await response.text()}`);
    return { storageId: storagePath, publicUrl: `${url}/storage/v1/object/public/cortifree-assets/${storagePath}` };
  }
  const { client: convex, secret } = backend();
  const uploadUrl = await convex.mutation(api.data.generateUploadUrl, { secret });
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes) });
  if (!response.ok) throw new Error(`Convex file upload failed: ${response.status}`);
  const { storageId } = await response.json() as { storageId: string };
  const publicUrl = await convex.query(api.data.storageUrl, { secret, storageId });
  if (!publicUrl) throw new Error("Convex returned no file URL");
  return { storageId, publicUrl };
}
