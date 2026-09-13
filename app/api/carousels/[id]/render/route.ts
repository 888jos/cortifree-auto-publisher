import { z } from "zod";
import { carouselSlideSchema } from "../../../../lib/ai/schemas";
import { renderCarousel } from "../../../../lib/render-carousel";
import { dataBackend } from "../../../../lib/data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=id,spec&limit=1`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; spec: unknown }>;
    if (!rows[0]) return Response.json({ error: "Carousel not found" }, { status: 404 });
    const spec = storedSpecSchema.parse(rows[0].spec);
    const slides = await renderCarousel({ id, carouselType: spec.carousel_type, layout: spec.model_id, slides: spec.generated_slides, references: spec.references, spec });
    return Response.json({ id, slides, rendered: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Stored carousel is incomplete", details: error.issues }, { status: 422 });
    return Response.json({ error: error instanceof Error ? error.message : "Render failed" }, { status: 500 });
  }
}
