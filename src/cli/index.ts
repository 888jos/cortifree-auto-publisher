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

const args = process.argv.slice(2); const command = args[0];
const flag = (name: string, fallback?: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] ?? fallback : fallback; };
function fail(error: unknown): never { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
async function personaAssets(root: string, personaFolder: string): Promise<AssetRecord[]> { const base = path.join(resolveDriveLayout(root)['02_PERSONAS'] ?? '', personaFolder); const files: string[] = []; const walk = async (dir: string) => { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) await walk(full); else if (/\.(jpe?g|png|webp|avif)$/i.test(entry.name)) files.push(full); } }; await walk(base); return files.map((file, index) => ({ id: `local_${index}`, path: file, relative_path: path.relative(root, file), filename: path.basename(file), category: path.basename(path.dirname(file)).toLowerCase(), persona_id: personaFolder, source_type: path.basename(path.dirname(file)) === '00_MASTER' ? 'persona_master' : 'persona_generated', width: 1, height: 1, hash: '', created_at: new Date(0).toISOString(), indexed_at: new Date().toISOString(), last_used_at: null, use_count: 0, enabled: true })); }
async function main() {
  const env = loadEnv();
  if (command === 'doctor') { const layout = resolveDriveLayout(env.DRIVE_ROOT); const result = validatePersonas(env.DRIVE_ROOT); console.log(JSON.stringify({ drive: fs.existsSync(env.DRIVE_ROOT) ? 'OK' : 'FAIL', directories: Object.fromEntries(Object.entries(layout).filter(([key]) => key !== 'root').map(([key, value]) => [key, value ? 'FOUND' : 'MISSING'])), persona_configs: result.personas.length === 16 ? 'OK' : 'FAIL', masters_found: result.personas.length - result.missingMasters.length, missing_masters: result.missingMasters, renderer: 'Satori-compatible SVG + Sharp', dry_run: env.DRY_RUN, external_apis: { supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), openai: Boolean(env.OPENAI_API_KEY), modelark: Boolean(env.MODELARK_API_KEY && env.MODELARK_MODEL_ID), upload_post: Boolean(env.UPLOAD_POST_API_KEY) } }, null, 2)); return; }
  if (command === 'personas:validate') { const result = validatePersonas(env.DRIVE_ROOT); console.log(`Validated ${result.personas.length} persona configs. MASTER files found: ${result.personas.length - result.missingMasters.length}/16.`); if (result.missingMasters.length) console.log(`UNVERIFIED/MISSING MASTER: ${result.missingMasters.join(', ')}`); return; }
  if (command === 'assets:scan') { const previous = loadAssetIndex(); const result = await scanAssets(env.DRIVE_ROOT, previous); saveAssetIndex(result.assets); console.log(JSON.stringify({ indexed: result.assets.length, added: result.added, updated: result.updated, removed: result.removed.length, warnings: result.warnings }, null, 2)); return; }
  if (command === 'carousel:create') { const accountId = flag('--account', 'CF_EN_01')!; const account = loadAccounts().find((item) => item.id === accountId); if (!account) fail(`Unknown account ${accountId}`); const spec = goldenCarousel(account.id, account.persona_id, flag('--id', 'CF_TEST_001')); saveCarousel(spec); console.log(`Created ${spec.id} for ${account.id} (${spec.slides.length} slides) in .data/carousels/${spec.id}.json`); return; }
  if (command === 'carousel:render') { const id = flag('--id', 'CF_TEST_001')!; const spec = loadCarousel(id); const personas = loadPersonas(env.DRIVE_ROOT); const persona = personas.find((item) => item.id === spec.persona_id); if (!persona) fail(`Unknown persona ${spec.persona_id}`); const assets = await personaAssets(env.DRIVE_ROOT, persona.folder); if (!assets.length) console.warn('UNVERIFIED: no local persona assets found; renderer will use deterministic paper backgrounds.'); const result = await renderCarousel(spec, assets, env.DRIVE_ROOT, persona.name); console.log(JSON.stringify(result, null, 2)); return; }
  if (command === 'carousel:approve') { const id = flag('--id', 'CF_TEST_001')!; const spec = loadCarousel(id); saveCarousel({ ...spec, status: 'APPROVED' }); console.log(`Approved ${id}`); return; }
  if (command === 'publish:dry') { const id = flag('--id', 'CF_TEST_001')!; const spec = loadCarousel(id); const account = loadAccounts().find((item) => item.id === spec.account_id); if (!account) fail(`Unknown account ${spec.account_id}`); for (const platform of account.platforms) console.log(JSON.stringify(buildDryRunPayload(spec, account, platform), null, 2)); return; }
  if (command === 'jobs:failures') { console.log('No local failure queue is configured yet. Supabase job queries are Milestone 5+.'); return; }
  if (command === 'scheduler:run') { console.log(`Scheduler dry-run: ${env.DRY_RUN ? 'enabled' : 'disabled'}; buffer=${env.TARGET_READY_BUFFER_DAYS} days. No publish calls made.`); return; }
  fail(`Unknown command ${command ?? '(missing)'}`);
}
main().catch(fail);
