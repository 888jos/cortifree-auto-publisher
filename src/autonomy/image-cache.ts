import personas from '../../config/personas.json' with { type: 'json' };
import { dataBackend } from '../lib/data-backend.js';
import { loadAccounts } from '../config/accounts.js';
import { loadEditorialSnapshot, autonomyValue } from '../editorial/snapshot.js';
import { buildImagePrompt, imageGenerationInputSchema } from '../image-generation/core.js';
import { visualReferenceSchema } from '../visual-references/index.js';
import { processImageGenerationJob } from '../../app/lib/image-generation.js';

type Row = Record<string, unknown>;
async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function insert(resource: string, body: unknown) {
  const response = await dataBackend(resource, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export async function refillPersonaCaches() {
  const snapshot = loadEditorialSnapshot();
  const min = autonomyValue(snapshot, 'persona_cache_min', 12);
  const target = autonomyValue(snapshot, 'persona_cache_target', 20);
  const generationEnabled = process.env.IMAGE_GENERATION_ENABLED === 'true';
  const report: Row[] = [];
  const active = loadAccounts().filter((account) => account.enabled);

  for (const account of active) {
    const existing = await rows(`assets?persona_id=eq.${account.persona_id}&source_type=eq.persona_generated&enabled=eq.true&select=id&limit=100`);
    if (existing.length >= min) { report.push({ persona_id: account.persona_id, count: existing.length, action: 'HEALTHY' }); continue; }
    const master = (await rows(`assets?persona_id=eq.${account.persona_id}&source_type=eq.persona_master&enabled=eq.true&select=id&limit=1`))[0];
    if (!master) { report.push({ persona_id: account.persona_id, count: existing.length, action: 'BLOCKED_MASTER' }); continue; }
    if (!generationEnabled) { report.push({ persona_id: account.persona_id, count: existing.length, action: 'GENERATION_DISABLED' }); continue; }

    const sceneRows = await rows('persona_scene_templates?enabled=eq.true&select=*&limit=100');
    const refs = (await rows('visual_references?enabled=eq.true&select=*&limit=500')).map((row) => visualReferenceSchema.parse(row));
    const persona = personas.find((item) => item.id === account.persona_id);
    if (!persona) { report.push({ persona_id: account.persona_id, action: 'MISSING_CONFIG' }); continue; }
    const need = Math.min(target - existing.length, 4);
    const jobs: Row[] = [];
    for (let index = 0; index < need; index += 1) {
      const scene = sceneRows[index % Math.max(sceneRows.length, 1)];
      if (!scene) break;
      const categories = Array.isArray(scene.recommended_reference_categories) ? scene.recommended_reference_categories.map(String) : [];
      const reference = refs.find((ref) => categories.includes(ref.category)) ?? refs[index % Math.max(refs.length, 1)];
      if (!reference) break;
      const input = imageGenerationInputSchema.parse({
        persona_id: account.persona_id, master_asset_id: master.id, visual_reference_id: reference.id,
        scene: String(scene.scene_description ?? scene.id), category: String(scene.category ?? 'other'),
        framing: scene.recommended_framing ? String(scene.recommended_framing) : undefined,
        outfit: scene.recommended_outfit ? String(scene.recommended_outfit) : undefined,
        prompt_additions: 'Autonomous persona cache refill. Keep identity exact and scene natural.',
      });
      jobs.push({
        id: `IMG_AUTO_${account.persona_id}_${Date.now()}_${index}`, workspace_id: 'cortifree', persona_id: account.persona_id,
        master_asset_id: master.id, visual_reference_id: reference.id, category: input.category, scene: input.scene,
        input, prompt: buildImagePrompt(persona as any, reference, input), provider: 'modelark_seedream',
        model: process.env.MODELARK_MODEL_ID ?? null, status: 'PENDING', attempts: 0, attempt_count: 0,
        created_at: new Date().toISOString(), metadata: { autonomous_refill: true },
      });
    }
    if (jobs.length) await insert('image_generation_jobs', jobs);
    report.push({ persona_id: account.persona_id, count: existing.length, action: jobs.length ? 'QUEUED_REFILL' : 'NO_USABLE_SCENE', queued: jobs.length });
  }
  return report;
}

export async function processPendingImageJobs(limit = Math.max(1, Math.min(6, Number(process.env.AUTONOMY_MAX_IMAGE_JOBS_PER_RUN ?? 4)))) {
  if (process.env.IMAGE_GENERATION_ENABLED !== 'true') return [{ action: 'GENERATION_DISABLED' }];
  const pending = (await rows(`image_generation_jobs?status=in.(PENDING,RETRY)&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];
  for (const job of pending) {
    try {
      const asset = await processImageGenerationJob(String(job.id));
      report.push({ id: job.id, status: 'DONE', asset_id: asset.id });
    } catch (error) {
      report.push({ id: job.id, status: 'FAILED', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
