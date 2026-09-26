import { carouselGeneratorInputSchema } from '../../app/lib/ai/schemas';
import { generateCarousel } from '../../app/lib/ai/carousel-generator';
import { getRecentCarousels, saveGeneratedCarousel } from '../../app/lib/carousel-store';
import { renderCarousel } from '../../app/lib/render-carousel';
import { canonicalLayoutFor } from '../../app/lib/canonical-layout';
import { dataBackend } from '../lib/data-backend';
import { loadRuntimeAccounts, loadRuntimePersonaConfigs, loadRuntimeRows } from '../runtime/config';
import { assertCarouselHasCompleteRender } from '../../app/lib/human-review';
import { loadHealthGuardrails } from './health-context';
import { checkGenerationAssetReadiness, requestPreflightRefill } from './preflight';
import { updateContentSlot } from './slots';

type Row = Record<string, unknown>;
async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function patch(resource: string, body: Record<string, unknown>) {
  const response = await dataBackend(resource, { method: 'PATCH', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
}
function layoutFor(contentType: string) {
  return canonicalLayoutFor(contentType);
}
function slideCountFor(contentType: string, formats: Row[]) {
  const row = formats.find((item) => String(item.format_id) === contentType);
  const min = Number(row?.min_slides ?? 6), max = Number(row?.max_slides ?? 7);
  return Math.max(4, Math.min(12, Math.round((min + max) / 2)));
}
function ctaModeFromIdea(idea: Row): 'none' | 'soft' | 'save' | 'comment' | 'follow' {
  const text = String(idea.cta_text ?? '').toLowerCase();
  if (/follow/.test(text)) return 'follow';
  if (/comment|which|what would/.test(text)) return 'comment';
  if (/save|screenshot|keep this/.test(text)) return 'save';
  return 'soft';
}

export async function processQueuedIdeas(
  limit = Math.max(1, Math.min(24, Number(process.env.AUTONOMY_MAX_DRAFTS_PER_RUN ?? 16))),
  options: { acceptanceBatchId?: string } = {},
) {
  const [accounts, personas, formats, healthGuardrails] = await Promise.all([
    loadRuntimeAccounts(),
    loadRuntimePersonaConfigs(),
    loadRuntimeRows("content_formats", 100),
    loadHealthGuardrails(),
  ]);
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const personaNames = new Map(personas.map((persona) => [persona.id, persona.name]));
  const acceptanceFilter = options.acceptanceBatchId ? `&acceptance_batch_id=eq.${encodeURIComponent(options.acceptanceBatchId)}` : "";
  const ideas = (await rows(`carousel_ideas?status=eq.QUEUED${acceptanceFilter}&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];

  for (const idea of ideas) {
    const id = String(idea.id), accountId = String(idea.account_id), personaId = String(idea.persona_id);
    const account = accountMap.get(accountId);
    if (!account || (!account.enabled && !options.acceptanceBatchId)) {
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'BLOCKED_ACCOUNT', last_error: 'Account is not enabled' });
      await updateContentSlot(idea.slot_id, { status: 'BLOCKED_ACCOUNT' });
      report.push({ id, status: 'BLOCKED_ACCOUNT' });
      continue;
    }
    const linkedSlotId = String(idea.slot_id ?? "").trim();
    if (linkedSlotId) {
      const slot = (await rows(
        `content_slots?id=eq.${encodeURIComponent(linkedSlotId)}&workspace_id=eq.cortifree&select=id,status,scheduled_for&limit=1`,
      ))[0];
      const slotAt = Date.parse(String(slot?.scheduled_for ?? ""));
      if (slot && Number.isFinite(slotAt) && slotAt <= Date.now() && !idea.carousel_id) {
        await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, {
          status: 'EXPIRED_SLOT',
          last_error: 'SLOT_MISSED_BEFORE_GENERATION',
          finished_at: new Date().toISOString(),
        });
        await updateContentSlot(linkedSlotId, { status: 'MISSED' });
        report.push({ id, status: 'EXPIRED_SLOT', slot_id: linkedSlotId });
        continue;
      }
    }

    const contentType = String(idea.content_type);
    const layout = layoutFor(contentType);
    const carouselId = `CF_AUTO_${id.replace(/^CF_IDEA_/, '').replace(/[^A-Z0-9_]/gi, '').slice(0, 72)}`;
    try {
      const existingCarousel = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&limit=1`))[0];
      if (existingCarousel) {
        await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'GENERATED', carousel_id: carouselId, last_error: null });
        await updateContentSlot(idea.slot_id, { status: String(existingCarousel.status ?? 'DRAFT'), carousel_id: carouselId });
        report.push({ id, carousel_id: carouselId, status: existingCarousel.status ?? 'DRAFT', action: 'IDEMPOTENT_REUSE' });
        continue;
      }

      const requestedSlideCount = slideCountFor(contentType, formats);
      const preflight = await checkGenerationAssetReadiness({ personaId, formatId: contentType, slideCount: requestedSlideCount });
      if (!preflight.ready) {
        const reason = `ASSET_PREFLIGHT:${preflight.reasons.join(',')}`;
        await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, {
          status: 'NEEDS_ASSETS', render_status: 'NEEDS_ASSETS', last_error: reason,
        });
        await updateContentSlot(idea.slot_id, { status: 'NEEDS_ASSETS' });
        const refill = await requestPreflightRefill(preflight).catch((error) => [{ action: 'REFILL_FAILED', error: error instanceof Error ? error.message : String(error) }]);
        report.push({ id, status: 'NEEDS_ASSETS', preflight, refill });
        continue;
      }

      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'GENERATING', started_at: new Date().toISOString(), last_error: null });
      const input = carouselGeneratorInputSchema.parse({
        carouselType: contentType,
        layout,
        persona: personaNames.get(personaId) ?? personaId,
        language: account.language,
        market: account.market,
        references: [],
        recentCarousels: await getRecentCarousels(10),
        requestedSlideCount,
        preferredHook: String(idea.final_hook || idea.hook_formula || ''),
        ctaMode: ctaModeFromIdea(idea),
        bypassMonthlyCap: false,
        accountId,
        personaId,
        topicId: String(idea.topic_id || ''),
        hookId: String(idea.hook_id || ''),
        formatId: contentType,
        healthGuardrails,
        editorialContext: {
          search_query: `${String(idea.topic ?? '')} ${String(idea.angle ?? '')}`.trim(),
          primary_keyword: String(idea.topic ?? ''), secondary_keywords: [], language_profile: 'GENZ_GIRLY_US',
          language_version: 'genz-girly-us-v1', trend_terms: [], persona_voice: String(personaNames.get(personaId) ?? personaId),
          golden_example_ids: [], concept_id: idea.concept_id ? String(idea.concept_id) : undefined, topic_id: String(idea.topic_id || ''), hook_id: String(idea.hook_id || ''),
          format_id: contentType, account_id: accountId, persona_id: personaId,
          brand_integration: { required: true, mention: 'CortiFree', screenshot_required: true },
        },
        requireCanonicalContext: true,
      });
      const result = await generateCarousel(input, {}, { carouselId });
      if (result.source !== 'openai') throw new Error(result.warning ?? 'Autonomous generation requires a successful AI draft');
      const saved = await saveGeneratedCarousel({ id: carouselId, input, result, accountId, personaId });
      await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
        pillar_id: idea.pillar_id ?? null, topic_id: idea.topic_id ?? null, hook_id: idea.hook_id ?? null,
        cta_id: idea.cta_id ?? null, strategy: idea.strategy ?? null, source_idea_id: id, combo_key: idea.combo_key ?? null,
        calendar_slot_id: idea.slot_id ?? null, concept_id: idea.concept_id ?? null,
      });
      let renderStatus = 'DRAFT';
      let renderError: string | null = null;
      try {
        const rendered = await renderCarousel({
          id: carouselId, carouselType: contentType, layout, personaId,
          slides: result.spec.slides, references: input.references, spec: saved.spec,
        });
        if (rendered.length !== result.spec.slides.length || rendered.some((slide) => !slide.url)) {
          throw new Error(`RENDER_INCOMPLETE: expected ${result.spec.slides.length} final PNGs, received ${rendered.length}`);
        }
        await assertCarouselHasCompleteRender(carouselId);
        renderStatus = 'READY_FOR_REVIEW';
        await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, { status: renderStatus, review_status: 'AWAITING_REVIEW', last_review_action: 'GENERATED', updated_at: new Date().toISOString() });
        await updateContentSlot(idea.slot_id, { status: 'READY_FOR_REVIEW', carousel_id: carouselId });

      } catch (error) {
        renderError = error instanceof Error ? error.message : String(error);
      }
      const assetBlocked = Boolean(renderError && /PERSONA_ASSET|required|ASSET_DIVERSITY_EXHAUSTED|LOW_CONFIDENCE_ASSET/i.test(renderError));
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, {
        status: assetBlocked ? 'NEEDS_ASSETS' : 'GENERATED',
        carousel_id: carouselId, generated_at: new Date().toISOString(), render_status: renderStatus, last_error: renderError,
      });
      if (assetBlocked) {
        await updateContentSlot(idea.slot_id, { status: 'NEEDS_ASSETS', carousel_id: carouselId });
        await requestPreflightRefill(await checkGenerationAssetReadiness({ personaId, formatId: contentType, slideCount: requestedSlideCount })).catch(() => []);
      } else if (renderError) {
        await updateContentSlot(idea.slot_id, { status: 'DRAFT', carousel_id: carouselId });
      }
      report.push({ id, carousel_id: carouselId, status: assetBlocked ? 'NEEDS_ASSETS' : renderStatus, render_error: renderError });
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'FAILED', last_error: message, finished_at: new Date().toISOString() });
      await updateContentSlot(idea.slot_id, { status: 'FAILED' });
      report.push({ id, status: 'FAILED', error: message });
    }
  }
  return report;
}

export async function retryPendingRenders(limit = 20) {
  const drafts = (await rows(`carousels?status=eq.DRAFT&select=*&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];
  for (const carousel of drafts) {
    const id = String(carousel.id);
    const spec = carousel.spec as Record<string, unknown> | undefined;
    const slides = Array.isArray(spec?.generated_slides) ? spec!.generated_slides as any[] : [];
    if (!slides.length) continue;
    try {
      const rendered = await renderCarousel({
        id, carouselType: String(carousel.content_type), layout: String(spec?.model_id ?? spec?.layout ?? 'single-image'),
        personaId: String(carousel.persona_id ?? ''), slides, references: Array.isArray(spec?.references) ? spec!.references as any[] : [], spec: spec ?? {},
      });
      if (rendered.length !== slides.length || rendered.some((slide) => !slide.url)) {
        throw new Error(`RENDER_INCOMPLETE: expected ${slides.length} final PNGs, received ${rendered.length}`);
      }
      await assertCarouselHasCompleteRender(id);
      await patch(`carousels?id=eq.${encodeURIComponent(id)}`, { status: 'READY_FOR_REVIEW', review_status: 'AWAITING_REVIEW', last_review_action: 'RENDERED', updated_at: new Date().toISOString() });
      if (carousel.source_idea_id) {
        await patch(`carousel_ideas?id=eq.${encodeURIComponent(String(carousel.source_idea_id))}`, {
          status: 'GENERATED', render_status: 'READY_FOR_REVIEW', last_error: null,
        });
      }
      await updateContentSlot(carousel.calendar_slot_id, { status: 'READY_FOR_REVIEW', carousel_id: id });
      report.push({ id, status: 'READY_FOR_REVIEW', rendered: rendered.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const assetBlocked = /PERSONA_ASSET|required|ASSET_DIVERSITY_EXHAUSTED|LOW_CONFIDENCE_ASSET/i.test(message);
      if (assetBlocked && carousel.source_idea_id) {
        await patch(`carousel_ideas?id=eq.${encodeURIComponent(String(carousel.source_idea_id))}`, {
          status: 'NEEDS_ASSETS', render_status: 'NEEDS_ASSETS', last_error: message.slice(0,1000),
        });
      }
      if (assetBlocked) await updateContentSlot(carousel.calendar_slot_id, { status: 'NEEDS_ASSETS', carousel_id: id });
      report.push({ id, status: assetBlocked ? 'NEEDS_ASSETS' : 'DRAFT', error: message });
    }
  }
  return report;
}


export async function resumeAssetBlockedIdeas(limit = 50) {
  const [ideas, formats] = await Promise.all([
    rows(`carousel_ideas?workspace_id=eq.cortifree&status=eq.NEEDS_ASSETS&order=updated_at.asc&limit=${limit}`),
    loadRuntimeRows("content_formats", 100),
  ]);
  const report: Row[] = [];
  for (const idea of ideas) {
    const id = String(idea.id ?? "");
    const personaId = String(idea.persona_id ?? "");
    const formatId = String(idea.content_type ?? "");
    if (!id || !personaId || !formatId) continue;
    const preflight = await checkGenerationAssetReadiness({
      personaId,
      formatId,
      slideCount: slideCountFor(formatId, formats),
    });
    if (!preflight.ready) {
      report.push({ id, status: 'NEEDS_ASSETS', reasons: preflight.reasons });
      continue;
    }
    const existingCarouselId = String(idea.carousel_id ?? "").trim();
    if (existingCarouselId) {
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, {
        status: 'GENERATED', render_status: 'DRAFT', last_error: null,
      });
      await updateContentSlot(idea.slot_id, { status: 'DRAFT', carousel_id: existingCarouselId });
      report.push({ id, status: 'DRAFT', carousel_id: existingCarouselId, action: 'RERENDER_EXISTING' });
    } else {
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, {
        status: 'QUEUED', render_status: null, last_error: null,
      });
      await updateContentSlot(idea.slot_id, { status: 'QUEUED' });
      report.push({ id, status: 'QUEUED', action: 'RESUME_GENERATION' });
    }
  }
  return report;
}
