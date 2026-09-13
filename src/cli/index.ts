import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../config/env.js';
import { resolveDriveLayout } from '../config/paths.js';
import { loadAccounts } from '../config/accounts.js';
import { validatePersonas, loadPersonas } from '../personas/loader.js';
import { scanAssets, loadAssetIndex, saveAssetIndex } from '../assets/scanner.js';
import { goldenCarousel } from '../carousels/golden.js';
import { loadCarousel, saveCarousel } from '../carousels/store.js';
import { renderCarousel } from '../render/renderer.js';
import { buildDryRunPayload } from '../publishing/dry-run.js';
import type { AssetRecord } from '../domain.js';
import { scanVisualReferences } from '../visual-references/index.js';
import { supabase, supabaseConfigured } from '../lib/supabase.js';
import sharp from 'sharp';
import { OpenAIVisualReferenceAnalyzer } from '../../app/lib/ai/visual-reference-analyzer.js';
import { logAIUsage } from '../../app/lib/ai/usage.js';

const args = process.argv.slice(2); const command = args[0];
const flag = (name: string, fallback?: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] ?? fallback : fallback; };
function fail(error: unknown): never { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
async function personaAssets(root: string, personaFolder: string): Promise<AssetRecord[]> { const base = path.join(resolveDriveLayout(root)['02_PERSONAS'] ?? '', personaFolder); const files: string[] = []; const walk = async (dir: string) => { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) await walk(full); else if (/\.(jpe?g|png|webp|avif)$/i.test(entry.name)) files.push(full); } }; await walk(base); return files.map((file, index) => ({ id: `local_${index}`, path: file, relative_path: path.relative(root, file), filename: path.basename(file), category: path.basename(path.dirname(file)).toLowerCase(), persona_id: personaFolder, source_type: path.basename(path.dirname(file)) === '00_MASTER' ? 'persona_master' : 'persona_generated', width: 1, height: 1, hash: '', created_at: new Date(0).toISOString(), indexed_at: new Date().toISOString(), last_used_at: null, use_count: 0, enabled: true })); }
async function main() {
  const env = loadEnv();
  if (command === 'doctor') { const layout = resolveDriveLayout(env.DRIVE_ROOT); const result = validatePersonas(env.DRIVE_ROOT); console.log(JSON.stringify({ drive: fs.existsSync(env.DRIVE_ROOT) ? 'OK' : 'FAIL', directories: Object.fromEntries(Object.entries(layout).filter(([key]) => key !== 'root').map(([key, value]) => [key, value ? 'FOUND' : 'MISSING'])), persona_configs: result.personas.length === 16 ? 'OK' : 'FAIL', masters_found: result.personas.length - result.missingMasters.length, missing_masters: result.missingMasters, renderer: 'Satori-compatible SVG + Sharp', dry_run: env.DRY_RUN, external_apis: { supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), openai: Boolean(env.OPENAI_API_KEY), modelark: Boolean(env.MODELARK_API_KEY && env.MODELARK_MODEL_ID), upload_post: Boolean(env.UPLOAD_POST_API_KEY) } }, null, 2)); return; }
  if (command === 'personas:validate') { const result = validatePersonas(env.DRIVE_ROOT); console.log(`Validated ${result.personas.length} persona configs. MASTER files found: ${result.personas.length - result.missingMasters.length}/16.`); if (result.missingMasters.length) console.log(`UNVERIFIED/MISSING MASTER: ${result.missingMasters.join(', ')}`); return; }
  if (command === 'assets:scan') { const previous = loadAssetIndex(); const result = await scanAssets(env.DRIVE_ROOT, previous); saveAssetIndex(result.assets); console.log(JSON.stringify({ indexed: result.assets.length, added: result.added, updated: result.updated, removed: result.removed.length, warnings: result.warnings }, null, 2)); return; }
  if (command === 'refs:scan') {
    const references = await scanVisualReferences(env.DRIVE_ROOT);
    fs.mkdirSync(path.resolve('.data'), { recursive: true });
    fs.writeFileSync(path.resolve('.data/visual-references.json'), `${JSON.stringify(references, null, 2)}\n`);
    if (supabaseConfigured()) {
      const response = await supabase('visual_references?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(references.map((record) => ({ ...record, workspace_id: 'cortifree', updated_at: new Date().toISOString() }))) });
      if (!response.ok) fail(`Visual reference sync failed: ${await response.text()}`);
    }
    console.log(JSON.stringify({ indexed: references.length, source: supabaseConfigured() ? 'supabase+local' : 'local', output: '.data/visual-references.json' }, null, 2));
    return;
  }
  if (command === 'refs:analyze') {
    const requested = (flag('--ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    if (!requested.length) fail('Explicit IDs are required. Example: npm run refs:analyze -- --ids MIRROR_001,MORNING_HOME_001');
    if (!env.OPENAI_API_KEY) fail('OPENAI_API_KEY is required for explicit visual-reference analysis');
    const references = await scanVisualReferences(env.DRIVE_ROOT);
    const selected = references.filter((reference) => requested.includes(reference.id));
    const missing = requested.filter((id) => !selected.some((reference) => reference.id === id));
    if (missing.length) fail(`Unknown visual reference IDs: ${missing.join(', ')}`);
    const analyzer = new OpenAIVisualReferenceAnalyzer(env.OPENAI_MODEL_QA, env.OPENAI_TIMEOUT_MS);
    for (const reference of selected) {
      if (!reference.storage_path) fail(`${reference.id} has no local image`);
      const file = path.join(env.DRIVE_ROOT, reference.storage_path);
      const image = await sharp(file).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const result = await analyzer.analyze({ imageUrl: `data:image/jpeg;base64,${image.toString('base64')}`, currentCategory: reference.category });
      Object.assign(reference, { ...result.data, good_for: result.data.goodFor, metadata: { ...reference.metadata, analyzed_at: new Date().toISOString(), analyzer_model: env.OPENAI_MODEL_QA } });
      delete (reference as Record<string, unknown>).goodFor;
      await logAIUsage({ operation: 'visual_reference.analyze', model: env.OPENAI_MODEL_QA, usage: result.usage, success: true });
      console.log(`Analyzed ${reference.id}`);
    }
    const referenceRoot = resolveDriveLayout(env.DRIVE_ROOT)['09_VISUAL_REFERENCES'];
    if (!referenceRoot) fail('Missing 09_VISUAL_REFERENCES');
    fs.writeFileSync(path.join(referenceRoot, 'visual_references.json'), `${JSON.stringify(references, null, 2)}\n`);
    fs.mkdirSync(path.resolve('.data'), { recursive: true });
    fs.writeFileSync(path.resolve('.data/visual-references.json'), `${JSON.stringify(references, null, 2)}\n`);
    if (supabaseConfigured()) {
      const response = await supabase('visual_references?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(selected.map((record) => ({ ...record, workspace_id: 'cortifree', updated_at: new Date().toISOString() }))) });
      if (!response.ok) fail(`Visual reference analysis sync failed: ${await response.text()}`);
    }
    console.log(`Completed explicit one-time analysis for ${selected.length} reference(s).`);
    return;
  }
  if (command === 'carousel:create') { const accountId = flag('--account', 'CF_EN_01')!; const account = loadAccounts().find((item) => item.id === accountId); if (!account) fail(`Unknown account ${accountId}`); const spec = goldenCarousel(account.id, account.persona_id, flag('--id', 'CF_TEST_001')); saveCarousel(spec); console.log(`Created ${spec.id} for ${account.id} (${spec.slides.length} slides) in .data/carousels/${spec.id}.json`); return; }
  if (command === 'carousel:render') { const id = flag('--id', 'CF_TEST_001')!; const spec = loadCarousel(id); const personas = loadPersonas(env.DRIVE_ROOT); const persona = personas.find((item) => item.id === spec.persona_id); if (!persona) fail(`Unknown persona ${spec.persona_id}`); const assets = await personaAssets(env.DRIVE_ROOT, persona.folder); if (!assets.length) console.warn('UNVERIFIED: no local persona assets found; renderer will use deterministic paper backgrounds.'); const result = await renderCarousel(spec, assets, env.DRIVE_ROOT, persona.name); console.log(JSON.stringify(result, null, 2)); return; }
  if (command === 'carousel:approve') { const id = flag('--id', 'CF_TEST_001')!; const spec = loadCarousel(id); saveCarousel({ ...spec, status: 'APPROVED' }); console.log(`Approved ${id}`); return; }
  if (command === 'publish:dry') { const id = flag('--id', 'CF_TEST_001')!; const spec = loadCarousel(id); const account = loadAccounts().find((item) => item.id === spec.account_id); if (!account) fail(`Unknown account ${spec.account_id}`); for (const platform of account.platforms) console.log(JSON.stringify(buildDryRunPayload(spec, account, platform), null, 2)); return; }
  if (command === 'jobs:failures') { console.log('No local failure queue is configured yet. Supabase job queries are Milestone 5+.'); return; }
  if (command === 'scheduler:run') { console.log(`Scheduler dry-run: ${env.DRY_RUN ? 'enabled' : 'disabled'}; buffer=${env.TARGET_READY_BUFFER_DAYS} days. No publish calls made.`); return; }
  fail(`Unknown command ${command ?? '(missing)'}`);
}
main().catch(fail);
