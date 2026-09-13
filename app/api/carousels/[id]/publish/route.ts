import { z } from "zod";
import { evaluatePublishReadiness } from "../../../../lib/publish-readiness";
import { resolvePublishingProfile } from "../../../../lib/publishing-profile";
import { dataBackend } from "../../../../lib/data-backend";
import { uploadPhotoCarousel } from "../../../../lib/upload-post";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  platform: z.enum(["tiktok", "instagram"]).default("tiktok"),
  profile: z.string().min(1).optional(),
  scheduledDate: z.string().datetime().optional(),
  confirmPublish: z.boolean().default(false),
});

function assertScheduleDate(value?: string) {
  if (!value) return;
  const scheduled = new Date(value).getTime();
  const now = Date.now();
  if (scheduled <= now + 60_000) throw new Error("scheduledDate must be at least one minute in the future");
  if (scheduled > now + 365 * 24 * 60 * 60 * 1_000) throw new Error("scheduledDate cannot be more than 365 days in the future");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    try { assertCortiFreeCarouselId(id); } catch { return Response.json({ error: "Invalid carousel id" }, { status: 400 }); }
    const body = requestSchema.parse(await request.json());
    assertScheduleDate(body.scheduledDate);
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    if (!response.ok) throw new Error(await response.text());
    const carousel = ((await response.json()) as Array<Record<string, unknown> & { id: string; account_id: string; status: string; spec: Record<string, unknown>; caption: string }>)[0];
    if (!carousel) return Response.json({ error: "Carousel not found" }, { status: 404 });
    if (carousel.status !== "APPROVED") return Response.json({ error: "Carousel must pass approval before publishing", code: "NOT_APPROVED" }, { status: 409 });
    const slideResponse = await dataBackend(`carousel_slides?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(id)}&select=position,rendered_url,asset_id&order=position.asc`);
    if (!slideResponse.ok) throw new Error(await slideResponse.text());
    const slideRows = await slideResponse.json() as Array<{ position: number; rendered_url: string | null; asset_id: string | number | null }>;
    const profile = await resolvePublishingProfile({ accountId: carousel.account_id, platform: body.platform, requestedProfile: body.profile });
    const rawSpec = { title: carousel.spec.title, topic: carousel.topic, angle: carousel.angle, hook: carousel.spec.hook, language: carousel.language, caption: carousel.caption, ctaType: carousel.cta_type, slides: carousel.spec.generated_slides };
    const renderedSlides = slideRows.filter((slide) => slide.rendered_url).map((slide) => ({ position: slide.position, url: slide.rendered_url!, assetId: slide.asset_id ?? undefined }));
    const readiness = await evaluatePublishReadiness({ rawSpec, renderedSlides, platform: body.platform, profile });
    if (!readiness.ready) return Response.json({ error: "Carousel is not publish-ready", issues: readiness.issues }, { status: 422 });
    const dryRun = process.env.DRY_RUN !== "false";
    const idempotencyKey = `cortifree:${profile}:${body.platform}:${id}`;
    const preview = { endpoint: "/api/upload_photos", carouselId: id, platform: body.platform, profile, scheduledDate: body.scheduledDate ?? null, photoCount: renderedSlides.length, title: readiness.spec.caption, idempotencyKey };
    if (dryRun || !body.confirmPublish) return Response.json({ ready: true, dryRun, requiresConfirmation: !body.confirmPublish, preview });
    const jobInsert = await dataBackend("publish_jobs?on_conflict=idempotency_key", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, carousel_id: id, account_id: carousel.account_id, platform: body.platform, scheduled_at: body.scheduledDate ?? null, external_id: id, idempotency_key: idempotencyKey, attempts: 1, status: body.scheduledDate ? "SCHEDULING" : "PUBLISHING" }),
    });
    if (!jobInsert.ok) throw new Error(`Cannot create publish audit job: ${await jobInsert.text()}`);
    const job = ((await jobInsert.json()) as Array<{ id: string }>)[0];
    try {
      const result = await uploadPhotoCarousel({ carouselId: id, profile: profile!, platform: body.platform, spec: readiness.spec, slides: renderedSlides, scheduledDate: body.scheduledDate });
      const status = body.scheduledDate ? "SCHEDULED" : "PUBLISHING";
      const requestId = typeof result.request_id === "string" ? result.request_id : id;
      const jobId = typeof result.job_id === "string" ? result.job_id : null;
      if (job) await dataBackend(`publish_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ status, provider_request_id: requestId, provider_job_id: jobId, last_error: null }) });
      await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
      return Response.json({ ready: true, dryRun: false, status, provider: "upload-post", requestId, jobId, result }, { status: body.scheduledDate ? 202 : 200 });
    } catch (error) {
      if (job) await dataBackend(`publish_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ status: "FAILED", last_error: error instanceof Error ? error.message : "Upload failed" }) });
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid publish request", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Publish failed" }, { status: 500 });
  }
}
