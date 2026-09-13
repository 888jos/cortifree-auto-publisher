import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { loadEnv } from '../src/config/env.js';
import { loadPersonas } from '../src/personas/loader.js';
import { scanVisualReferences } from '../src/visual-references/index.js';
import { supabase, supabaseConfigured } from '../src/lib/supabase.js';

const BUCKET = 'cortifree-assets';
const WORKSPACE = 'cortifree';

function storageUrl(base: string, storagePath: string, object = true) {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/${object ? 'object' : 'object/public'}/${BUCKET}/${encoded}`;
}

async function uploadIfMissing(file: string, storagePath: string, contentType: string, base: string, key: string) {
  const target = storageUrl(base, storagePath);
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const exists = await fetch(target, { method: 'HEAD', headers });
  if (exists.ok) return false;
  if (exists.status !== 400 && exists.status !== 404) throw new Error(`Storage check failed for ${storagePath}: ${exists.status}`);
  const response = await fetch(target, { method: 'POST', headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'false' }, body: new Uint8Array(await fs.readFile(file)) });
  if (!response.ok) throw new Error(`Storage upload failed for ${storagePath}: ${(await response.text()).slice(0, 300)}`);
  return true;
}

function folderCategory(file: string) {
  const folder = path.basename(path.dirname(file));
  const map: Record<string, string> = { '00_MASTER': 'master', '01_REFERENCES': 'reference', '02_HOME': 'home', '03_FITNESS': 'fitness', '04_OUTDOORS': 'outdoors', '05_SELF_CARE': 'self_care', '06_FOOD': 'food', '07_WORK_STUDY': 'work_study', '08_OTHER': 'other' };
  return map[folder] ?? 'other';
}

async function main() {
  const env = loadEnv();
  if (!supabaseConfigured() || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service credentials are required');
  const personas = loadPersonas(env.DRIVE_ROOT);
  const personaResponse = await supabase('personas?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(personas.map(({ id, name, folder }) => ({ id, name, folder, workspace_id: WORKSPACE }))),
  });
  if (!personaResponse.ok) throw new Error(`Persona sync failed: ${await personaResponse.text()}`);

  let uploaded = 0;
  let indexed = 0;
  for (const persona of personas) {
    const files = [...(persona.masterPath ? [persona.masterPath] : []), ...persona.referenceImages, ...persona.lifestyleAssets];
    for (const file of files) {
      const metadata = await sharp(file).metadata();
      if (!metadata.width || !metadata.height) continue;
      const category = folderCategory(file);
      const storagePath = `personas/${persona.id}/${path.basename(path.dirname(file))}/${path.basename(file)}`;
      const mime = metadata.format === 'png' ? 'image/png' : metadata.format === 'webp' ? 'image/webp' : 'image/jpeg';
      if (await uploadIfMissing(file, storagePath, mime, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)) uploaded += 1;
      const bytes = await fs.readFile(file);
      const sourceType = category === 'master' ? 'persona_master' : category === 'reference' ? 'persona_reference' : 'persona_generated';
      const publicUrl = storageUrl(env.SUPABASE_URL, storagePath, false);
      const row = {
        workspace_id: WORKSPACE, path: `supabase://${BUCKET}/${storagePath}`, relative_path: storagePath, filename: path.basename(file),
        category, subcategory: category, persona_id: persona.id, source_type: sourceType, width: metadata.width, height: metadata.height,
        hash: crypto.createHash('sha256').update(bytes).digest('hex'), storage_bucket: BUCKET, storage_path: storagePath, public_url: publicUrl,
        orientation: metadata.width === metadata.height ? 'square' : metadata.height > metadata.width ? 'portrait' : 'landscape',
        framing: 'medium', activity: category, mood: 'natural', colors: [], tags: [category, persona.name.toLowerCase()], metadata: { local_source: path.relative(env.DRIVE_ROOT, file), protected_master: sourceType === 'persona_master' }, enabled: true,
      };
      const response = await supabase('assets?on_conflict=path', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
      if (!response.ok) throw new Error(`Asset index failed for ${file}: ${await response.text()}`);
      indexed += 1;
    }
  }

  const references = await scanVisualReferences(env.DRIVE_ROOT);
  for (const reference of references) {
    if (!reference.storage_path) continue;
    const local = path.join(env.DRIVE_ROOT, reference.storage_path);
    try { await fs.access(local); } catch { continue; }
    const storagePath = `visual-references/${reference.category}/${path.basename(local)}`;
    const metadata = await sharp(local).metadata();
    const mime = metadata.format === 'png' ? 'image/png' : metadata.format === 'webp' ? 'image/webp' : 'image/jpeg';
    if (await uploadIfMissing(local, storagePath, mime, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)) uploaded += 1;
    const row = { ...reference, workspace_id: WORKSPACE, storage_path: storagePath, thumbnail_url: storageUrl(env.SUPABASE_URL, storagePath, false), updated_at: new Date().toISOString() };
    const response = await supabase('visual_references?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!response.ok) throw new Error(`Reference index failed for ${reference.id}: ${await response.text()}`);
    indexed += 1;
  }
  console.log(JSON.stringify({ workspace: WORKSPACE, bucket: BUCKET, uploaded, indexed, masters_modified: 0 }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
