import { dataBackend } from "../../../lib/data-backend";
import { assertCortiFreeAccountId, assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";
import { canonicalLayoutFor } from "../../../lib/canonical-layout";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertCortiFreeCarouselId(id);
    const [carouselResponse, slidesResponse] = await Promise.all([
      dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=*&limit=1`),
      dataBackend(`carousel_slides?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`),
    ]);
    if (!carouselResponse.ok) throw new Error(await carouselResponse.text());
    const carousel = (await carouselResponse.json())[0] ?? null;
    if (!carousel) return Response.json({ error: "Carousel not found" }, { status: 404 });
    let slides = slidesResponse.ok ? await slidesResponse.json() : [];
    const spec = (carousel.spec ?? {}) as Record<string, any>;
    if (!slides.length || spec.editor_structure_dirty === true) {
      const generated = Array.isArray(spec.generated_slides) ? spec.generated_slides : [];
      const rendered = Array.isArray(spec.rendered_slides) ? spec.rendered_slides : [];
      const layout = canonicalLayoutFor(String(carousel.content_type ?? spec.carousel_type ?? ""), String(spec.model_id ?? spec.layout ?? "single-image"));
      slides = generated.map((generatedSlide: any, index: number) => {
        const renderedSlide = rendered.find((item: any) => Number(item.position) === Number(generatedSlide.position)) ?? rendered[index] ?? {};
        const assetIds = Array.isArray(renderedSlide.assetIds)
          ? renderedSlide.assetIds
          : renderedSlide.assetId != null ? [renderedSlide.assetId] : [];
        return {
          workspace_id: CORTIFREE_WORKSPACE_ID,
          carousel_id: id,
          position: generatedSlide.position ?? index + 1,
          template_id: layout,
          headline: generatedSlide.headline ?? "",
          body: generatedSlide.body ?? "",
          asset_id: renderedSlide.assetId ?? assetIds[0] ?? null,
          rendered_url: renderedSlide.url ?? null,
          render_metadata: {
            geometry: renderedSlide.geometry ?? null,
            asset_ids: assetIds,
            selection: renderedSlide.assetId != null ? { selected_asset_id: renderedSlide.assetId } : null,
            synthesized_from_spec: true,
          },
        };
      });
    }
    return Response.json({ carousel, slides });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { spec?: Record<string, unknown>; topic?: string; angle?: string; caption?: string; account_id?: string; persona_id?: string };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.account_id) {
      assertCortiFreeAccountId(body.account_id);
      patch.account_id = body.account_id;
    }
    if (body.persona_id) {
      if (!/^P\d{2}$/.test(body.persona_id)) throw new Error("Invalid persona id");
      patch.persona_id = body.persona_id;
    }
    if (body.spec) patch.spec = body.spec;
    if (body.topic) patch.topic = body.topic;
    if (body.angle) patch.angle = body.angle;
    if (body.caption) patch.caption = body.caption;
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ carousel: (await response.json())[0] ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
