import { z } from "zod";
import { evaluatePublishReadiness } from "../../../../lib/publish-readiness";
import { resolvePublishingProfile } from "../../../../lib/publishing-profile";
import { supabase } from "../../../../lib/supabase";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({ platform: z.enum(["tiktok", "instagram"]).default("tiktok"), profile: z.string().min(1).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    try { assertCortiFreeCarouselId(id); } catch { return Response.json({ error: "Invalid carousel id" }, { status: 400 }); }
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const response = await supabase(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=id,account_id,spec,status,topic,angle,caption,language,cta_type&limit=1`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; account_id: string; spec: Record<string, unknown>; status: string; topic: string; angle: string; caption: string; language: "en" | "fr"; cta_type: string }>;
    if (!rows[0]) return Response.json({ error: "Carousel not found" }, { status: 404 });
    const carousel = rows[0];
    const slideResponse = await supabase(`carousel_slides?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(id)}&select=position,rendered_url,asset_id&order=position.asc`);
    if (!slideResponse.ok) throw new Error(await slideResponse.text());
    const slideRows = await slideResponse.json() as Array<{ position: number; rendered_url: string | null; asset_id: string | number | null }>;
    const profile = await resolvePublishingProfile({ accountId: carousel.account_id, platform: body.platform, requestedProfile: body.profile });
    const readiness = await evaluatePublishReadiness({ rawSpec: carousel.spec.generated_slides ? {
      title: carousel.spec.title, topic: carousel.topic, angle: carousel.angle, hook: carousel.spec.hook,
      language: carousel.language, caption: carousel.caption, ctaType: carousel.cta_type, slides: carousel.spec.generated_slides,
    } : carousel.spec, renderedSlides: slideRows.filter((slide) => slide.rendered_url).map((slide) => ({ position: slide.position, url: slide.rendered_url!, assetId: slide.asset_id ?? undefined })), platform: body.platform, profile });
    const blockingContentIssues = readiness.issues.filter((issue) => issue.severity === "major" && issue.code !== "UPLOAD_POST_PROFILE");
    const contentApproved = blockingContentIssues.length === 0;
    const review = { checked_at: new Date().toISOString(), platform: body.platform, profile: profile ?? null, contentApproved, publishReady: readiness.ready, issues: readiness.issues };
    const updatedSpec = { ...carousel.spec, publish_review: review };
    const nextStatus = contentApproved ? "APPROVED" : "READY_FOR_REVIEW";
    const update = await supabase(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, spec: updatedSpec, updated_at: new Date().toISOString() }) });
    if (!update.ok) throw new Error(await update.text());
    return Response.json({ id, status: nextStatus, ...review }, { status: contentApproved ? 200 : 422 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid approval request", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Approval failed" }, { status: 500 });
  }
}
