function supabaseStorage() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage is not configured for CortiFree");
  return { url, key };
}

export async function uploadFile(bytes: Uint8Array, contentType: string) {
  const { url, key } = supabaseStorage();
  const storagePath = `generated/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  // Storage occasionally answers 5xx/429 (a 520 failed a whole live F01);
  // the upload is an idempotent upsert, so retry with backoff.
  let response: Response | undefined;
  let networkError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** (attempt - 1)));
    try {
      response = await fetch(`${url}/storage/v1/object/cortifree-assets/${storagePath}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "true" },
        body: new Uint8Array(bytes),
      });
      networkError = undefined;
    } catch (error) {
      networkError = error;
      continue;
    }
    if (response.ok || (response.status < 500 && response.status !== 429)) break;
  }
  if (!response) throw networkError instanceof Error ? networkError : new Error("Supabase file upload failed: no response");
  // Keep error text short: a Cloudflare 5xx page is several KB of HTML.
  if (!response.ok) throw new Error(`Supabase file upload failed: ${response.status} ${(await response.text()).replace(/\s+/g, " ").slice(0, 200)}`);
  return { storageId: storagePath, publicUrl: `${url}/storage/v1/object/public/cortifree-assets/${storagePath}` };
}

export async function deleteGeneratedFile(storageId: string | null | undefined) {
  const id = String(storageId ?? "").trim();
  if (!id) return { deleted: false, skipped: true };
  const { url, key } = supabaseStorage();
  const encodedPath = id.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${url}/storage/v1/object/cortifree-assets/${encodedPath}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (response.status === 404) return { deleted: false, missing: true };
  if (!response.ok) throw new Error(`Supabase file delete failed: ${response.status} ${await response.text()}`);
  return { deleted: true, missing: false };
}
