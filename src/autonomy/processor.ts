import { carouselGeneratorInputSchema } from '../../app/lib/ai/schemas';
import { generateCarousel } from '../../app/lib/ai/carousel-generator';
import { getRecentCarousels, saveGeneratedCarousel } from '../../app/lib/carousel-store';
import { renderCarousel } from '../../app/lib/render-carousel';
import { evaluatePublishReadiness } from '../../app/lib/publish-readiness';
import { dataBackend } from '../lib/data-backend';
import { loadRuntimeAccounts, loadRuntimePersonaConfigs, loadRuntimeRows } from '../runtime/config';

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
  return ['C02_CHECKLIST', 'C09_LIST'].includes(contentType) ? 'grid-2x2' : 'single-image';
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

export async function processQueuedIdeas(limit = Math.max(1, Math.min(24, Number(process.env.AUTONOMY_MAX_DRAFTS_PER_RUN ?? 16)))) {
  const [accounts, personas, formats] = await Promise.all([
    loadRuntimeAccounts(),
    loadRuntimePersonaConfigs(),
    loadRuntimeRows("content_formats", 100),
  ]);
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const personaNames = new Map(personas.map((persona) => [persona.id, persona.name]));
  const ideas = (await rows(`carousel_ideas?status=eq.QUEUED&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];

  for (const idea of ideas) {
    const id = String(idea.id), accountId = String(idea.account_id), personaId = String(idea.persona_id);
    const account = accountMap.get(accountId);
    if (!account?.enabled) {
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'BLOCKED_ACCOUNT', last_error: 'Account is not enabled' });
      report.push({ id, status: 'BLOCKED_ACCOUNT' });
      continue;
    }
    const contentType = String(idea.content_type);
    const layout = layoutFor(contentType);
    const carouselId = `CF_AUTO_${id.replace(/^CF_IDEA_/, '').replace(/[^A-Z0-9_]/gi, '').slice(0, 72)}`;
    try {
      const existingCarousel = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&limit=1`))[0];
      if (existingCarousel) {
        await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'GENERATED', carousel_id: carouselId, last_error: null });
        report.push({ id, carousel_id: carouselId, status: existingCarousel.status ?? 'DRAFT', action: 'IDEMPOTENT_REUSE' });
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
        requestedSlideCount: slideCountFor(contentType, formats),
        preferredHook: String(idea.final_hook || idea.hook_formula || ''),
        ctaMode: ctaModeFromIdea(idea),
        bypassMonthlyCap: false,
      });
      const result = await generateCarousel(input, {}, { carouselId });
      if (result.source !== 'openai') throw new Error(result.warning ?? 'Autonomous generation requires a successful AI draft');
      const saved = await saveGeneratedCarousel({ id: carouselId, input, result, accountId, personaId });
      await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
        pillar_id: idea.pillar_id ?? null, topic_id: idea.topic_id ?? null, hook_id: idea.hook_id ?? null,
        cta_id: idea.cta_id ?? null, strategy: idea.strategy ?? null, source_idea_id: id, combo_key: idea.combo_key ?? null,
      });
      let renderStatus = 'DRAFT';
      let renderError: string | null = null;
      try {
        const rendered = await renderCarousel({
          id: carouselId, carouselType: contentType, layout, personaId,
          slides: result.spec.slides, references: input.references, spec: saved.spec,
        });
        renderStatus = 'READY_FOR_REVIEW';
        await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, { status: renderStatus, updated_at: new Date().toISOString() });

        if (process.env.AUTONOMY_AUTO_APPROVE === 'true') {
          const readiness = await evaluatePublishReadiness({ rawSpec: result.spec, renderedSlides: rendered.map((slide) => ({ position: slide.position, url: slide.url, assetId: slide.assetId })), platform: 'tiktok', profile: undefined });
          const contentBlockers = readiness.issues.filter((issue) => issue.severity === 'major' && issue.code !== 'UPLOAD_POST_PROFILE');
          if (contentBlockers.length === 0) {
            renderStatus = 'APPROVED';
            await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, { status: 'APPROVED', updated_at: new Date().toISOString(), spec: { ...saved.spec, autonomous_approval: { at: new Date().toISOString(), issues: readiness.issues } } });
          }
        }
      } catch (error) {
        renderError = error instanceof Error ? error.message : String(error);
      }
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, {
        status: renderError ? (renderError.startsWith('PERSONA_ASSET_REQUIRED') ? 'NEEDS_ASSETS' : 'GENERATED') : 'GENERATED',
        carousel_id: carouselId, generated_at: new Date().toISOString(), render_status: renderStatus, last_error: renderError,
      });
      report.push({ id, carousel_id: carouselId, status: renderStatus, render_error: renderError });
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await patch(`carousel_ideas?id=eq.${encodeURIComponent(id)}`, { status: 'FAILED', last_error: message, finished_at: new Date().toISOString() });
      report.push({ id, status: 'FAILED', error: message });
    }
  }
  return report;
}

export async function retryPendingRenders(limit = 20) {
  const drafts = (await rows(`carousels?status=eq.DRAFT&order=created_at.asc&limit=${limit}`)).slice(0, limit);
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
      await patch(`carousels?id=eq.${encodeURIComponent(id)}`, { status: 'READY_FOR_REVIEW', updated_at: new Date().toISOString() });
      report.push({ id, status: 'READY_FOR_REVIEW', rendered: rendered.length });
    } catch (error) {
      report.push({ id, status: 'DRAFT', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
