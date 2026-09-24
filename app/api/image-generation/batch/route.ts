import { z } from 'zod';
import { batchGenerationCount, buildImagePrompt, imageGenerationInputSchema } from '../../../../src/image-generation/core';
import { isAutomaticVisualReference, scoreVisualReferenceForScene, visualReferenceSchema } from '../../../../src/visual-references';
import { dataBackend } from '../../../lib/data-backend';
import { CORTIFREE_WORKSPACE_ID } from '../../../lib/workspace';
import { loadRuntimePersonaConfigs } from '../../../../src/runtime/config';

export const runtime = 'nodejs';

const batchSchema = z.object({
  persona_ids: z.array(z.string().regex(/^P\d{2}$/)).min(1).max(16),
  scene_ids: z.array(z.string().min(2)).min(1).max(12),
  variations: z.number().int().min(1).max(3),
  max_concurrency: z.number().int().min(1).max(3),
  confirmed: z.literal(true),
});

type Scene = { id: string; category: string; scene_description: string; recommended_reference_categories: string[]; recommended_framing: string | null; recommended_outfit: string | null };

async function rows<T>(resource: string): Promise<T[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as T[];
}

export async function GET() {
  try {
    const scenes = await rows<Scene>(`persona_scene_templates?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&enabled=eq.true&select=*&order=id.asc`);
    return Response.json({ scenes, source: 'supabase' });
  } catch (error) {
    return Response.json({ scenes: [], error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const batch = batchSchema.parse(await request.json());
    const total = batchGenerationCount(batch.persona_ids.length, batch.scene_ids.length, batch.variations);
    const personas = await loadRuntimePersonaConfigs();
    const selectedPersonas = personas.filter((persona) => batch.persona_ids.includes(persona.id));
    if (selectedPersonas.length !== batch.persona_ids.length) throw new Error('Unknown persona in batch selection');
    const sceneIds = batch.scene_ids.map(encodeURIComponent).join(',');
    const scenes = await rows<Scene>(`persona_scene_templates?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=in.(${sceneIds})&enabled=eq.true&select=*`);
    if (scenes.length !== batch.scene_ids.length) throw new Error('Unknown or disabled scene in batch selection');
    const masters = await rows<{ id: string | number; persona_id: string }>(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&persona_id=in.(${batch.persona_ids.map(encodeURIComponent).join(',')})&source_type=eq.persona_master&enabled=eq.true&select=id,persona_id`);
    // A legacy visual-reference row must not make the whole batch unusable.
    // Ignore malformed rows here; the selected reference is still validated
    // again by the single-job runner before ModelArk is called.
    const references = (await rows<unknown>(`visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&enabled=eq.true&select=*`))
      .map((row) => visualReferenceSchema.safeParse(row))
      .filter((result): result is { success: true; data: z.infer<typeof visualReferenceSchema> } => result.success)
      .map((result) => result.data)
      .filter(isAutomaticVisualReference);
    const recentByPersona = new Map<string, Set<string>>();
    for (const personaId of batch.persona_ids) {
      const recent = await rows<{ visual_reference_id?: string }>(`image_generation_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&persona_id=eq.${encodeURIComponent(personaId)}&status=in.(READY,DONE)&select=visual_reference_id&order=created_at.desc&limit=10`);
      recentByPersona.set(personaId, new Set(recent.map((row) => String(row.visual_reference_id ?? "")).filter(Boolean)));
    }
    const jobs: Record<string, unknown>[] = [];
    for (const persona of selectedPersonas) {
      const master = masters.find((item) => item.persona_id === persona.id);
      if (!master) throw new Error(`${persona.id} has no indexed MASTER`);
      for (const scene of scenes) {
        const recentReferenceIds = recentByPersona.get(persona.id) ?? new Set<string>();
        const ranked = references
          .map((reference) => ({ reference, score: scoreVisualReferenceForScene(reference, scene) }))
          .sort((a, b) => b.score - a.score || a.reference.id.localeCompare(b.reference.id));
        const rotated = ranked.filter((item) => !recentReferenceIds.has(item.reference.id));
        const best = rotated[0] ?? ranked[0];
        if (!best) throw new Error(`${scene.id} has no usable visual reference`);
        if (best.score < 6) throw new Error(`${scene.id} has no confident visual reference (score=${best.score}, candidates=${ranked.length})`);
        const reference = best.reference;
        const referenceDiagnostics = ranked.slice(0, 5).map((item) => ({ id: item.reference.id, category: item.reference.category, score: item.score }));
        for (let variation = 1; variation <= batch.variations; variation += 1) {
          const input = imageGenerationInputSchema.parse({
            persona_id: persona.id, master_asset_id: master.id, visual_reference_id: reference.id,
            scene: scene.scene_description, category: scene.category, framing: scene.recommended_framing ?? undefined,
            outfit: scene.recommended_outfit ?? undefined, prompt_additions: `Batch variation ${variation} of ${batch.variations}`,
          });
          jobs.push({
            workspace_id: CORTIFREE_WORKSPACE_ID, persona_id: persona.id, master_asset_id: master.id,
            visual_reference_id: reference.id, category: scene.category, scene: scene.scene_description,
            input, prompt: buildImagePrompt(persona, reference, input), provider: 'modelark_seedream',
            model: process.env.MODELARK_MODEL_ID ?? null, status: 'PENDING', attempts: 0, attempt_count: 0,
            metadata: { batch_scene_id: scene.id, batch_variation: variation, requested_concurrency: batch.max_concurrency, selected_reference_score: best.score, top_reference_candidates: referenceDiagnostics },
          });
        }
      }
    }
    if (jobs.length !== total) throw new Error('Batch generation count mismatch');
    const response = await dataBackend('image_generation_jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(jobs) });
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ total, max_concurrency: batch.max_concurrency, jobs: await response.json(), execution: 'queued_only' }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
