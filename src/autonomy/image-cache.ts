import { usedReferenceIdsForPersona } from "../../app/lib/image-generation";
import { visualPersonaIdFor } from "../../app/lib/asset-selector";
import { loadVisualGroups, visualGroupOf } from "../../app/lib/visual-groups";
import crypto from 'node:crypto';
import { dataBackend } from '../lib/data-backend';
import { loadRuntimeAccounts, loadRuntimeEditorial, loadRuntimePersonaConfigs, autonomyRuleValue } from '../runtime/config';
import { buildImagePrompt, imageGenerationInputSchema } from '../image-generation/core';
import { isAutomaticVisualReference, scoreVisualReferenceForScene, visualReferenceSchema } from '../visual-references/index';
import { processImageGenerationJob, recentImageProviderBlocker } from '../../app/lib/image-generation';

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


export function personaCacheGenerationPolicy(
  count: number,
  personaId: string,
  dateKey = new Date().toISOString().slice(0, 10),
) {
  const normalized = Math.max(0, Math.floor(count));
  const generatePercent = normalized < 10 ? 100 : normalized < 20 ? 80 : normalized < 25 ? 20 : 0;
  const bucket = crypto.createHash('sha1').update(`${personaId}:${dateKey}:${normalized}`).digest().readUInt32BE(0) % 100;
  return {
    count: normalized,
    generatePercent,
    recyclePercent: 100 - generatePercent,
    shouldGenerate: generatePercent > 0 && bucket < generatePercent,
    bucket,
    maxCache: 25,
  };
}

export async function refillPersonaCaches(options: { personaIds?: string[] } = {}) {
  const [{ autonomyRules }, accounts, personas] = await Promise.all([
    loadRuntimeEditorial(),
    loadRuntimeAccounts(),
    loadRuntimePersonaConfigs(),
  ]);
  const min = autonomyRuleValue(autonomyRules, 'persona_cache_min', 12);
  const target = autonomyRuleValue(autonomyRules, 'persona_cache_target', 20);
  const maxCache = Math.max(25, autonomyRuleValue(autonomyRules, 'persona_cache_max', 25));
  const generationEnabled = process.env.IMAGE_GENERATION_ENABLED === 'true';
  const providerBlocker = generationEnabled ? await recentImageProviderBlocker() : null;
  const report: Row[] = [];
  const requestedPersonaIds = new Set((options.personaIds ?? []).map((id) => id.trim().toUpperCase()).filter(Boolean));
  const active = accounts.filter((account) =>
    (!requestedPersonaIds.size ? account.enabled : requestedPersonaIds.has(account.persona_id))
    && !["PAUSED","ERROR"].includes(account.warmup_status)
  );
  const rejectedReferenceJobs = await rows(
    'image_generation_jobs?workspace_id=eq.cortifree&status=eq.FAILED&select=visual_reference_id,last_error&order=created_at.desc&limit=200',
  );
  const rejectedReferenceIds = new Set(
    rejectedReferenceJobs
      .filter((row) => /InputImageSensitiveContentDetected|SensitiveContent/i.test(String(row.last_error ?? "")))
      .map((row) => String(row.visual_reference_id ?? ""))
      .filter(Boolean),
  );

  // One cache per visual group, filled from the group master only: look-alike
  // accounts share it instead of each generating its own face.
  await loadVisualGroups();
  const groupTargets = [...new Map(active.map((account) => {
    const master = visualPersonaIdFor(account.persona_id) ?? account.persona_id;
    return [master, { ...account, persona_id: master }] as const;
  })).values()];
  for (const account of groupTargets) {
    const group = visualGroupOf(account.persona_id);
    const groupTarget = group?.imageTarget;
    if (groupTarget === 0) {
      report.push({ persona_id: account.persona_id, group: group?.id, action: 'GROUP_GENERATION_PAUSED' });
      continue;
    }
    const [existing, inFlight] = await Promise.all([
      rows(`assets?persona_id=eq.${account.persona_id}&source_type=eq.persona_generated&enabled=eq.true&select=id&limit=100`),
      rows(`image_generation_jobs?workspace_id=eq.cortifree&persona_id=eq.${encodeURIComponent(account.persona_id)}&status=in.(PENDING,RETRY,RUNNING)&select=id&limit=100`),
    ]);
    // A group target replaces the generic cache ceiling.
    const ceiling = groupTarget ?? maxCache;
    if (existing.length >= ceiling) {
      report.push({ persona_id: account.persona_id, count: existing.length, action: 'HEALTHY_MAX' });
      continue;
    }
    if (inFlight.length) {
      report.push({ persona_id: account.persona_id, count: existing.length, in_flight: inFlight.length, action: 'REFILL_IN_FLIGHT' });
      continue;
    }
    const policy = personaCacheGenerationPolicy(existing.length, account.persona_id);
    if (groupTarget === undefined && !policy.shouldGenerate && existing.length >= min) {
      report.push({
        persona_id: account.persona_id,
        count: existing.length,
        target,
        action: 'RECYCLE_ONLY',
        generation_percent: policy.generatePercent,
        recycle_percent: policy.recyclePercent,
      });
      continue;
    }
    const master = (await rows(`assets?persona_id=eq.${account.persona_id}&source_type=eq.persona_master&enabled=eq.true&select=id&limit=1`))[0];
    if (!master) { report.push({ persona_id: account.persona_id, count: existing.length, action: 'BLOCKED_MASTER' }); continue; }
    if (!generationEnabled) { report.push({ persona_id: account.persona_id, count: existing.length, action: 'GENERATION_DISABLED' }); continue; }
    if (providerBlocker) {
      report.push({ persona_id: account.persona_id, count: existing.length, action: 'GENERATION_PROVIDER_BLOCKED', reason: providerBlocker.reason, blocked_at: providerBlocker.updatedAt });
      continue;
    }

    const sceneRows = await rows('persona_scene_templates?enabled=eq.true&select=*&limit=100');
    const refs = (await rows('visual_references?enabled=eq.true&select=*&limit=500'))
      .map((row) => visualReferenceSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter(isAutomaticVisualReference);
    // Never reuse a reference this face already used: it only makes a duplicate.
    const recentReferenceIds = await usedReferenceIdsForPersona(account.persona_id);
    const allowedRefs = refs.filter((ref) => !rejectedReferenceIds.has(ref.id));
    const persona = personas.find((item) => item.id === account.persona_id);
    if (!persona) { report.push({ persona_id: account.persona_id, action: 'MISSING_CONFIG' }); continue; }
    const policyCeiling = existing.length < 10 ? Math.min(10, maxCache) : existing.length < 20 ? Math.min(20, maxCache) : maxCache;
    const desiredCeiling = Math.max(existing.length + 1, Math.min(policyCeiling, existing.length < min ? Math.max(min, target) : policyCeiling));
    const need = groupTarget !== undefined
      ? Math.min(groupTarget - existing.length, 5)
      : Math.min(
        Math.max(1, desiredCeiling - existing.length),
        existing.length < 10 ? 4 : existing.length < 20 ? 2 : 1,
      );
    const jobs: Row[] = [];
    // Scenes whose category the group has the fewest images of come first
    // (evening, morning/home and fitness were short everywhere).
    const groupImages = await rows(`assets?workspace_id=eq.cortifree&source_type=eq.persona_generated&enabled=eq.true&persona_id=in.(${(group?.members ?? [account.persona_id]).join(',')})&select=category&limit=1000`);
    const categoryCount = new Map<string, number>();
    for (const image of groupImages) categoryCount.set(String(image.category ?? 'other'), (categoryCount.get(String(image.category ?? 'other')) ?? 0) + 1);
    const usedScenes = new Set<string>();
    for (let index = 0; index < need; index += 1) {
      // Re-pick each time: the category with the fewest images right now,
      // so one short category does not take the whole batch.
      const countOf = (row: Row) => categoryCount.get(String(row.category ?? 'other')) ?? 0;
      const scene = [...sceneRows]
        .filter((row) => !usedScenes.has(String(row.id)))
        .sort((a, b) => countOf(a) - countOf(b) || String(a.id).localeCompare(String(b.id)))[0];
      if (!scene) break;
      usedScenes.add(String(scene.id));
      categoryCount.set(String(scene.category ?? 'other'), (categoryCount.get(String(scene.category ?? 'other')) ?? 0) + 1);
      // Closest unused Pinterest reference for this scene (scene and
      // reference category names differ, so match on the scene's terms).
      const intent = {
        category: String(scene.category ?? ''), scene_description: String(scene.scene_description ?? scene.id),
        recommended_reference_categories: Array.isArray(scene.recommended_reference_categories) ? scene.recommended_reference_categories.map(String) : [],
        recommended_framing: scene.recommended_framing ? String(scene.recommended_framing) : null,
        recommended_outfit: scene.recommended_outfit ? String(scene.recommended_outfit) : null,
      };
      const ranked = allowedRefs
        .filter((ref) => !recentReferenceIds.has(ref.id))
        .map((ref) => ({ ref, score: scoreVisualReferenceForScene(ref, intent) }))
        .sort((a, b) => b.score - a.score || a.ref.id.localeCompare(b.ref.id));
      const reference = ranked.find((item) => item.score >= 6)?.ref;
      if (!reference) {
        report.push({ persona_id: account.persona_id, count: existing.length, scene: scene.id, action: ranked.length ? 'NO_CONFIDENT_REFERENCE' : 'REFERENCES_EXHAUSTED' });
        continue;
      }
      recentReferenceIds.add(reference.id);
      const input = imageGenerationInputSchema.parse({
        persona_id: account.persona_id, master_asset_id: master.id, visual_reference_id: reference.id,
        scene: String(scene.scene_description ?? scene.id), category: String(scene.category ?? 'other'),
        framing: scene.recommended_framing ? String(scene.recommended_framing) : undefined,
        outfit: scene.recommended_outfit ? String(scene.recommended_outfit) : undefined,
        prompt_additions: 'Autonomous persona cache refill. Keep identity exact and scene natural.',
      });
      jobs.push({
        workspace_id: 'cortifree', persona_id: account.persona_id,
        master_asset_id: master.id, visual_reference_id: reference.id, category: input.category, scene: input.scene,
        input, prompt: buildImagePrompt(persona as any, reference, input), provider: 'modelark_seedream',
        model: process.env.MODELARK_MODEL_ID ?? null, status: 'PENDING', attempts: 0, attempt_count: 0,
        created_at: new Date().toISOString(), metadata: { autonomous_refill: true },
      });
    }
    if (jobs.length) await insert('image_generation_jobs', jobs);
    report.push({
      persona_id: account.persona_id,
      count: existing.length,
      target,
      max_cache: maxCache,
      action: jobs.length ? 'QUEUED_REFILL' : 'NO_USABLE_SCENE',
      queued: jobs.length,
      generation_percent: policy.generatePercent,
      recycle_percent: policy.recyclePercent,
    });
  }
  return report;
}

export async function processPendingImageJobs(limit = Math.max(1, Math.min(6, Number(process.env.AUTONOMY_MAX_IMAGE_JOBS_PER_RUN ?? 4)))) {
  if (process.env.IMAGE_GENERATION_ENABLED !== 'true') return [{ action: 'GENERATION_DISABLED' }];
  const providerBlocker = await recentImageProviderBlocker();
  if (providerBlocker) return [{ action: 'GENERATION_PROVIDER_BLOCKED', reason: providerBlocker.reason, blocked_at: providerBlocker.updatedAt }];
  const due = encodeURIComponent(new Date().toISOString());
  const pending = (await rows(`image_generation_jobs?status=in.(PENDING,RETRY)&or=(next_attempt_at.is.null,next_attempt_at.lte.${due})&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];
  for (const job of pending) {
    // Same compare-and-swap claim as the worker, so both never generate (and pay for) one job twice.
    const claim = await dataBackend(`image_generation_jobs?id=eq.${encodeURIComponent(String(job.id))}&status=in.(PENDING,RETRY)`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'RUNNING', locked_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    if (!claim.ok || !((await claim.json()) as Row[]).length) {
      report.push({ id: job.id, status: 'SKIPPED', reason: 'CLAIMED_ELSEWHERE' });
      continue;
    }
    try {
      const asset = await processImageGenerationJob(String(job.id));
      report.push({ id: job.id, status: 'DONE', asset_id: asset.id });
    } catch (error) {
      report.push({ id: job.id, status: 'FAILED', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
