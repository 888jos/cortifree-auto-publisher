import { z } from "zod";
import { carouselSlideSchema } from "../../../../lib/ai/schemas";
import { renderCarousel } from "../../../../lib/render-carousel";
import { dataBackend } from "../../../../lib/data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";
import { enqueueWorkerJob, shouldDelegateHeavyWork } from "../../../../lib/worker-queue";

export const runtime = "nodejs";
// A repair render may run ModelArk synchronously before the PNGs are saved.
export const maxDuration = 300;

const storedSpecSchema = z.object({
  carousel_type: z.string(),
  model_id: z.string(),
  references: z.array(z.object({ id: z.string().optional(), slides: z.array(z.object({ geometry: z.record(z.string(), z.unknown()).optional() })).optional() })).optional(),
  generated_slides: z.array(carouselSlideSchema),
}).passthrough();

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    try { assertCortiFreeCarouselId(id); } catch { return Response.json({ error: "Invalid carousel id" }, { status: 400 }); }
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=id,persona_id,spec,updated_at&limit=1`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; persona_id?: string; spec: unknown; updated_at?: string }>;
    if (!rows[0]) return Response.json({ error: "Carousel not found" }, { status: 404 });
    if (await shouldDelegateHeavyWork()) {
      const queued = await enqueueWorkerJob({
        kind: "RENDER_CAROUSEL",
        resourceId: id,
        idempotencyKey: `render:${id}:${rows[0].updated_at ?? "current"}`,
        payload: { requested_at: new Date().toISOString() },
        priority: 20,
      });
      await dataBackend(`carousels?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "RENDER_QUEUED" }),
      });
      return Response.json({ id, queued: true, job: queued.job, reused: queued.reused, execution: "external_worker" }, { status: 202 });
    }
    const spec = storedSpecSchema.parse(rows[0].spec);
    const slides = await renderCarousel({ id, carouselType: spec.carousel_type, layout: spec.model_id, personaId: rows[0].persona_id, slides: spec.generated_slides, references: spec.references, spec });
    return Response.json({ id, slides, rendered: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Stored carousel is incomplete", details: error.issues }, { status: 422 });
    return Response.json({ error: error instanceof Error ? error.message : "Render failed" }, { status: 500 });
  }
}
