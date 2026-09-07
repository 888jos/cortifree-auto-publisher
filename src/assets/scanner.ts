import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { resolveDriveLayout } from '../config/paths.js';
import { type AssetRecord } from '../domain.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const categoryMap: Record<string, string> = { '02_HOME': 'home', '03_FITNESS': 'fitness', '04_OUTDOORS': 'outdoors', '05_SELF_CARE': 'self_care', '06_FOOD': 'food', '07_WORK_STUDY': 'work_study', '07_OTHER': 'other' };

async function hashFile(file: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex')));
  });
}
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}
function classify(file: string, root: string): Pick<AssetRecord, 'category' | 'persona_id' | 'source_type'> {
  const rel = path.relative(root, file); const parts = rel.split(path.sep); const top = parts[0]?.trim();
  if (top === '01_STOCK_ASSETS') return { category: parts[1] ?? 'uncategorized', persona_id: null, source_type: 'stock' };
  if (top === '09_VISUAL_REFERENCES') return { category: parts[1] ?? 'uncategorized', persona_id: null, source_type: 'visual_reference' };
  if (top === '02_PERSONAS') {
    const persona = parts[1] ?? 'UNKNOWN'; const section = parts[2] ?? '';
    if (section === '00_MASTER') return { category: 'master', persona_id: persona, source_type: 'persona_master' };
    if (section === '01_REFERENCES') return { category: 'reference', persona_id: persona, source_type: 'persona_reference' };
    return { category: categoryMap[section] ?? section.toLowerCase(), persona_id: persona, source_type: 'persona_generated' };
  }
  return { category: 'uncategorized', persona_id: null, source_type: 'stock' };
}
export type ScanResult = { assets: AssetRecord[]; added: number; updated: number; removed: string[]; warnings: string[] };
export async function scanAssets(driveRoot: string, previous: AssetRecord[] = []): Promise<ScanResult> {
  const layout = resolveDriveLayout(driveRoot); const warnings: string[] = []; const files: string[] = [];
  for (const name of ['01_STOCK_ASSETS', '02_PERSONAS', '09_VISUAL_REFERENCES'] as const) {
    const dir = layout[name]; if (!dir) { if (name !== '09_VISUAL_REFERENCES') warnings.push(`Missing ${name}`); continue; }
    try { files.push(...await walk(dir)); } catch (error) { warnings.push(`Cannot scan ${dir}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const previousByPath = new Map(previous.map((asset) => [asset.path, asset])); const assets: AssetRecord[] = [];
  for (const file of files) {
    try {
      const meta = await sharp(file).metadata(); if (!meta.width || !meta.height) { warnings.push(`Unreadable dimensions: ${file}`); continue; }
      const hash = await hashFile(file); const old = previousByPath.get(file); const now = new Date().toISOString();
      const info = classify(file, driveRoot); assets.push({ id: old?.id ?? `asset_${hash.slice(0, 20)}`, path: file, relative_path: path.relative(driveRoot, file), filename: path.basename(file), ...info, width: meta.width, height: meta.height, hash, created_at: old?.created_at ?? now, indexed_at: now, last_used_at: old?.last_used_at ?? null, use_count: old?.use_count ?? 0, enabled: old?.enabled ?? true });
    } catch (error) { warnings.push(`Skipped ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const current = new Set(assets.map((asset) => asset.path)); return { assets, added: assets.filter((a) => !previousByPath.has(a.path)).length, updated: assets.filter((a) => previousByPath.has(a.path)).length, removed: previous.filter((a) => !current.has(a.path)).map((a) => a.path), warnings };
}
export function loadAssetIndex(file = path.resolve('.data/assets-index.json')): AssetRecord[] { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as AssetRecord[]; } catch { return []; } }
export function saveAssetIndex(assets: AssetRecord[], file = path.resolve('.data/assets-index.json')) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(assets, null, 2) + '\n'); }
