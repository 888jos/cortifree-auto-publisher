function supabaseStorage() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage is not configured for CortiFree");
  return { url, key };
}

export async function uploadFile(bytes: Uint8Array, contentType: string) {
  const { url, key } = supabaseStorage();
  const storagePath = `generated/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const response = await fetch(`${url}/storage/v1/object/cortifree-assets/${storagePath}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) throw new Error(`Supabase file upload failed: ${response.status} ${await response.text()}`);
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
