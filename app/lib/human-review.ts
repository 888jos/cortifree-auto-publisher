import { z } from "zod";
import { dataBackend } from "./data-backend";
import { requestStructured } from "./ai/openai-client";
import { getAIConfig } from "./ai/config";
import { renderCarouselRevision } from "./render-carousel";
import { type RejectionAction, reviewReasonLabel } from "./review-reasons";

type Row = Record<string, unknown>;

const operationSchema = z.object({
  slidePosition: z.number().int().min(1).max(12),
  rewriteCopy: z.boolean(),
  changeVisual: z.boolean(),
  instruction: z.string().min(1).max(400),
});
const revisedSlideSchema = z.object({
  position: z.number().int().min(1).max(12),
  headline: z.string().min(1).max(90),
  body: z.string().max(280),
  visualIntent: z.string().min(1).max(240),
  assetQuery: z.string().min(1).max(180),
});
const revisionSchema = z.object({
  summary: z.string().min(1).max(500),
  fullRegenerate: z.boolean(),
  operations: z.array(operationSchema).max(12),
  revisedSlides: z.array(revisedSlideSchema).max(12),
});

export type ReviewRevision = z.infer<typeof revisionSchema>;

export async function assertCarouselHasCompleteRender(carouselId: string, carousel?: Row) {
  const current = carousel ?? (await rows(
    `carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=id,spec&limit=1`,
  ))[0];
  if (!current) throw new Error(`Carousel not found: ${carouselId}`);
  const spec = (current.spec ?? {}) as Record<string, unknown>;
  if (spec.editor_structure_dirty === true) {
    throw new Error(`RENDER_REQUIRED: ${carouselId} has unapplied editor changes`);
  }
  const generated = Array.isArray(spec.generated_slides) ? spec.generated_slides as Array<{ position?: number }> : [];
  if (!generated.length) throw new Error(`RENDER_REQUIRED: ${carouselId} has no generated slides`);
  const rendered = await rows(
    `carousel_slides?workspace_id=eq.cortifree&carousel_id=eq.${encodeURIComponent(carouselId)}&select=position,rendered_url,status&order=position.asc`,
  );
  const currentRows = rendered.filter((slide) => !slide.status || slide.status === "CURRENT");
  const byPosition = new Map(currentRows.map((slide) => [Number(slide.position), String(slide.rendered_url ?? "").trim()]));
  const missing = generated
    .map((slide, index) => Number(slide.position ?? index + 1))
    .filter((position) => !/^https:\/\//.test(byPosition.get(position) ?? ""));
  if (missing.length) throw new Error(`RENDER_REQUIRED: missing final PNG for slide(s) ${missing.join(", ")}`);
  const urls = generated.map((slide, index) => byPosition.get(Number(slide.position ?? index + 1)) ?? "");
  if (new Set(urls).size !== urls.length) throw new Error("RENDER_REQUIRED: rendered slide URLs must be distinct");
  return { expected: generated.length, rendered: urls.length, urls };
}

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function patch(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function insert(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
function zonedToUtc(year:number,month:number,day:number,hour:number,minute:number,timezone:string) {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - represented;
  }
  return new Date(guess);
}
export function nextHumanApprovedPostingTime(now = new Date(), timezone = "America/New_York", startHour = 18, endHour = 23) {
  const local = localParts(now, timezone);
  const nowMinutes = local.hour * 60 + local.minute;
  const slots: Array<[number, number]> = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === endHour && minute > 0) continue;
      slots.push([hour, minute]);
    }
  }
  const today = slots.find(([h,m]) => h * 60 + m > nowMinutes + 5);
  if (today) return zonedToUtc(local.year, local.month, local.day, today[0], today[1], timezone);
  const nextCalendar = new Date(Date.UTC(local.year, local.month - 1, local.day) + 86_400_000);
  return zonedToUtc(nextCalendar.getUTCFullYear(), nextCalendar.getUTCMonth() + 1, nextCalendar.getUTCDate(), startHour, 0, timezone);
}

export async function recordReviewEvent(input: {
  carouselId: string; eventType: string; actor?: string; feedback?: string;
  patchPlan?: unknown; beforeVersion?: number; afterVersion?: number; slideIndex?: number;
}) {
  return insert("carousel_review_events", {
    workspace_id: "cortifree",
    carousel_id: input.carouselId,
    actor: input.actor ?? "admin",
    event_type: input.eventType,
    target_scope: input.slideIndex ? "slide" : "carousel",
    slide_index: input.slideIndex ?? null,
    feedback_text: input.feedback ?? null,
    patch_plan: input.patchPlan ?? {},
    before_version: input.beforeVersion ?? null,
    after_version: input.afterVersion ?? null,
  });
}

export async function approveCarousel(carouselId: string, actor = "admin") {
  const current = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=*&limit=1`))[0];
  if (!current) throw new Error(`Carousel not found: ${carouselId}`);
  await assertCarouselHasCompleteRender(carouselId, current);
  const reviewedAt = new Date().toISOString();
  const version = Number(current.current_version ?? 1);
  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    status: "APPROVED",
    review_status: "APPROVED",
    approved_by: actor,
    approved_at: reviewedAt,
    reviewed_by: actor,
    reviewed_at: reviewedAt,
    approved_version: version,
    rejected_at: null,
    rejection_reason_code: null,
    rejection_action: null,
    review_notes: null,
    scheduled_for: null,
    last_review_action: "APPROVED",
  });
  await recordReviewEvent({
    carouselId,
    eventType: "APPROVED",
    actor,
    patchPlan: { approved_version: version },
    beforeVersion: version,
    afterVersion: version,
  });
  return { carouselId, status: "APPROVED", approvedVersion: version };
}

export async function rejectCarousel(
  carouselId: string,
  reason: string,
  actor = "admin",
  options: { reasonCode?: string; action?: RejectionAction } = {},
) {
  const current = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=current_version&limit=1`))[0];
  if (!current) throw new Error(`Carousel not found: ${carouselId}`);
  const version = Number(current.current_version ?? 1);
  const reviewedAt = new Date().toISOString();
  const reasonCode = options.reasonCode?.trim() || "OTHER";
  const action = options.action ?? "ARCHIVE";
  const status = action === "REVISION" ? "NEEDS_FIX" : "REJECTED";
  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    status,
    review_status: status,
    review_notes: reason,
    reviewed_by: actor,
    reviewed_at: reviewedAt,
    rejected_at: action === "ARCHIVE" ? reviewedAt : null,
    rejection_reason_code: reasonCode,
    rejection_action: action,
    scheduled_for: null,
    last_review_action: action === "REVISION" ? "REJECTED_FOR_REVISION" : "REJECTED",
  });
  await recordReviewEvent({
    carouselId,
    eventType: action === "REVISION" ? "REJECTED_FOR_REVISION" : "REJECTED",
    actor,
    feedback: reason,
    patchPlan: { reason_code: reasonCode, reason_label: reviewReasonLabel(reasonCode), action },
    beforeVersion: version,
    afterVersion: version,
  });
  return { carouselId, status, reasonCode, action };
}

export async function planReviewRevision(carouselId: string, feedback: string) {
  const carousel = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=*&limit=1`))[0];
  if (!carousel) throw new Error(`Carousel not found: ${carouselId}`);
  const spec = (carousel.spec ?? {}) as Record<string, any>;
  const slides = Array.isArray(spec.generated_slides) ? spec.generated_slides : [];
  if (!slides.length) throw new Error(`Carousel has no generated slides: ${carouselId}`);

  const config = getAIConfig();
  const result = await requestStructured({
    model: config.OPENAI_MODEL_PRIMARY,
    schema: revisionSchema,
    schemaName: "cortifree_review_revision",
    maxOutputTokens: 2600,
    instructions: `You are the revision planner for CortiFree carousel drafts.
Interpret the human editor's feedback and make the smallest possible patch.
Never rewrite an unchanged slide. Preserve exact existing copy and visual intent unless the feedback requires changing it.
If the user asks to change only copy, keep visualIntent and assetQuery exact.
If the user asks to change only the visual, keep headline and body exact.
"Keep the rest" means all unspecified slides and fields must remain byte-for-byte unchanged.
fullRegenerate must be false unless the user explicitly asks to redo/rebuild the entire carousel.
Return revisedSlides ONLY for slides that actually need a change.
Keep copy concise, Gen Z feminine/conversational, not clinical, and avoid unsupported medical claims.`,
    input: JSON.stringify({
      feedback,
      carousel: { id: carouselId, topic: carousel.topic, angle: carousel.angle, contentType: carousel.content_type },
      slides: slides.map((slide: any) => ({
        position: slide.position, role: slide.role, headline: slide.headline, body: slide.body,
        visualIntent: slide.visualIntent, assetQuery: slide.assetQuery,
      })),
    }),
  });

  if (result.data.fullRegenerate) {
    throw new Error("FULL_REGENERATE_EXPLICIT_REQUIRED: use the normal generation flow for a deliberate full rebuild");
  }
  if (!result.data.revisedSlides.length) throw new Error("Revision planner produced no targeted changes");
  return result.data;
}

export async function applyReviewRevision(
  carouselId: string,
  feedback: string,
  revisionInput: ReviewRevision,
  actor = "admin",
) {
  const revision = revisionSchema.parse(revisionInput);
  if (revision.fullRegenerate) throw new Error("FULL_REGENERATE_EXPLICIT_REQUIRED");
  const carousel = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=*&limit=1`))[0];
  if (!carousel) throw new Error(`Carousel not found: ${carouselId}`);
  const spec = (carousel.spec ?? {}) as Record<string, any>;
  const slides = Array.isArray(spec.generated_slides) ? spec.generated_slides : [];
  if (!slides.length) throw new Error(`Carousel has no generated slides: ${carouselId}`);
  const beforeVersion = Number(carousel.current_version ?? 1);

  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    review_status: "REVISION_GENERATING", status: "REVISION_GENERATING",
    review_notes: feedback, last_review_action: "REVISION_REQUESTED",
    approved_at: null, approved_by: null, approved_version: null, scheduled_for: null,
  });

  const revisedByPosition = new Map(revision.revisedSlides.map((slide) => [slide.position, slide]));
  const nextSlides = slides.map((slide: any) => {
    const revised = revisedByPosition.get(Number(slide.position));
    return revised ? { ...slide, ...revised } : slide;
  });
  const changedPositions = [...revisedByPosition.keys()];
  if (!changedPositions.length) throw new Error("Revision plan has no targeted changes");

  const nextVersion = beforeVersion + 1;
  const nextSpec = {
    ...spec,
    generated_slides: nextSlides,
    review_revision: {
      version: nextVersion,
      feedback,
      summary: revision.summary,
      operations: revision.operations,
      changed_positions: changedPositions,
      applied_at: new Date().toISOString(),
    },
  };

  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    spec: nextSpec,
    current_version: nextVersion,
    revision_count: Number(carousel.revision_count ?? 0) + 1,
    review_status: "REVISION_GENERATING",
    status: "REVISION_GENERATING",
  });

  const visualChangePositions = revision.operations
    .filter((operation) => operation.changeVisual)
    .map((operation) => operation.slidePosition);
  const rendered = await renderCarouselRevision({
    id: carouselId,
    carouselType: String(carousel.content_type ?? spec.carousel_type ?? ""),
    layout: String(spec.model_id ?? spec.layout ?? "single-image"),
    personaId: carousel.persona_id ? String(carousel.persona_id) : undefined,
    slides: nextSlides,
    spec: nextSpec,
    changedPositions,
    visualChangePositions,
  });

  if (rendered.length !== nextSlides.length || rendered.some((slide) => !slide.url)) {
    throw new Error(`RENDER_INCOMPLETE: expected ${nextSlides.length} final PNGs, received ${rendered.length}`);
  }

  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    review_status: "AWAITING_REVIEW",
    status: "READY_FOR_REVIEW",
    last_review_action: "PATCH_APPLIED",
  });
  await recordReviewEvent({
    carouselId, eventType: "PATCH_APPLIED", actor, feedback,
    patchPlan: revision, beforeVersion, afterVersion: nextVersion,
  });

  return {
    carouselId,
    status: "AWAITING_REVIEW",
    beforeVersion,
    afterVersion: nextVersion,
    changedPositions,
    summary: revision.summary,
    rendered: rendered.map((slide) => ({ position: slide.position, url: slide.url })),
  };
}
