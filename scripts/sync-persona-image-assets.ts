import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { loadEnv } from '../src/config/env.js';
import { loadPersonas } from '../src/personas/loader.js';
import { scanVisualReferences } from '../src/visual-references/index.js';
import { dataBackend, convexConfigured } from '../src/lib/data-backend.js';
import { uploadConvexFile } from '../app/lib/convex-storage.js';

const WORKSPACE = 'cortifree';

async function existingUrl(resource: string, field: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  const [row] = await response.json() as Array<Record<string, unknown>>;
  return typeof row?.[field] === 'string' ? String(row[field]) : null;
}

function folderCategory(file: string) {
  const folder = path.basename(path.dirname(file));
  const map: Record<string, string> = { '00_MASTER': 'master', '01_REFERENCES': 'reference', '02_HOME': 'home', '03_FITNESS': 'fitness', '04_OUTDOORS': 'outdoors', '05_SELF_CARE': 'self_care', '06_FOOD': 'food', '07_OTHER': 'other', '07_WORK_STUDY': 'other', '08_OTHER': 'other' };
  return map[folder] ?? 'other';
}

async function main() {
  const env = loadEnv();
  if (!convexConfigured()) throw new Error('Convex server credentials are required');
  const personas = loadPersonas(env.DRIVE_ROOT);
  const personaResponse = await dataBackend('personas?on_conflict=id', {
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
      const bytes = await fs.readFile(file);
      const recordPath = `convex://${storagePath}`;
      let publicUrl = await existingUrl(`assets?path=eq.${encodeURIComponent(recordPath)}&select=public_url&limit=1`, 'public_url');
      let convexStorageId: string | undefined;
      if (!publicUrl) {
        const upload = await uploadConvexFile(new Uint8Array(bytes), mime);
        publicUrl = upload.publicUrl;
        convexStorageId = upload.storageId;
        uploaded += 1;
      }
      const sourceType = category === 'master' ? 'persona_master' : category === 'reference' ? 'persona_reference' : 'persona_generated';
      const row = {
        workspace_id: WORKSPACE, path: recordPath, relative_path: storagePath, filename: path.basename(file),
        category, subcategory: category, persona_id: persona.id, source_type: sourceType, width: metadata.width, height: metadata.height,
        hash: crypto.createHash('sha256').update(bytes).digest('hex'), storage_bucket: 'convex', storage_path: storagePath, public_url: publicUrl,
        orientation: metadata.width === metadata.height ? 'square' : metadata.height > metadata.width ? 'portrait' : 'landscape',
        framing: 'medium', activity: category, mood: 'natural', colors: [], tags: [category, persona.name.toLowerCase()], metadata: { local_source: path.relative(env.DRIVE_ROOT, file), protected_master: sourceType === 'persona_master', convex_storage_id: convexStorageId }, enabled: true,
      };
      const response = await dataBackend('assets?on_conflict=path', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
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
    let thumbnailUrl = await existingUrl(`visual_references?id=eq.${encodeURIComponent(reference.id)}&select=thumbnail_url&limit=1`, 'thumbnail_url');
    if (!thumbnailUrl) {
      thumbnailUrl = (await uploadConvexFile(new Uint8Array(await fs.readFile(local)), mime)).publicUrl;
      uploaded += 1;
    }
    const row = { ...reference, workspace_id: WORKSPACE, storage_path: storagePath, thumbnail_url: thumbnailUrl, updated_at: new Date().toISOString() };
    const response = await dataBackend('visual_references?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!response.ok) throw new Error(`Reference index failed for ${reference.id}: ${await response.text()}`);
    indexed += 1;
  }
  console.log(JSON.stringify({ workspace: WORKSPACE, storage: 'convex', uploaded, indexed, masters_modified: 0 }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
