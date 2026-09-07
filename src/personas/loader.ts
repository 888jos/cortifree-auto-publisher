import fs from 'node:fs';
import path from 'node:path';
import { personaConfigSchema, type PersonaConfig } from '../domain.js';
import { resolveDriveLayout } from '../config/paths.js';

export type LoadedPersona = PersonaConfig & { folder: string; masterPath?: string };

export function loadPersonas(driveRoot: string): LoadedPersona[] {
  const layout = resolveDriveLayout(driveRoot);
  if (!layout['10_PERSONA_CONFIG']) throw new Error('Missing Drive directory 10_PERSONA_CONFIG');
  if (!layout['02_PERSONAS']) throw new Error('Missing Drive directory 02_PERSONAS (spaces are tolerated, but the directory is absent)');
  const configDir = layout['10_PERSONA_CONFIG'];
  const files = fs.readdirSync(configDir).filter((name) => /^P\d{2}_.+\.json$/i.test(name)).sort();
  if (files.length !== 16) throw new Error(`Expected 16 persona config files, found ${files.length} in ${configDir}`);
  const personas: LoadedPersona[] = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8')) as unknown;
    const parsed = personaConfigSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Invalid persona config ${file}: ${parsed.error.message}`);
    const folder = parsed.data.name.toUpperCase();
    const personaDir = path.join(layout['02_PERSONAS'], folder);
    if (!fs.existsSync(personaDir)) throw new Error(`Persona ${parsed.data.id} maps to missing folder ${folder}`);
    const masterDir = path.join(personaDir, '00_MASTER');
    const masterFiles = fs.existsSync(masterDir) ? fs.readdirSync(masterDir).filter((name) => /\.(jpe?g|png|webp)$/i.test(name)) : [];
    if (masterFiles.length > 1) throw new Error(`Persona ${parsed.data.id} has more than one MASTER in ${masterDir}`);
    personas.push({ ...parsed.data, folder, ...(masterFiles[0] ? { masterPath: path.join(masterDir, masterFiles[0]) } : {}) });
  }
  const ids = new Set(personas.map((p) => p.id));
  if (ids.size !== 16 || [...ids].sort().join(',') !== Array.from({ length: 16 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`).join(',')) throw new Error('Persona IDs must be exactly P01..P16');
  return personas;
}

export function validatePersonas(driveRoot: string): { personas: LoadedPersona[]; missingMasters: string[] } {
  const personas = loadPersonas(driveRoot);
  return { personas, missingMasters: personas.filter((p) => !p.masterPath).map((p) => `${p.id}_${p.name}`) };
}
