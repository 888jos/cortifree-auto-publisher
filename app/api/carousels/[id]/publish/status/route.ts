import { getUploadPostStatus, normalizeUploadPostResults } from "../../../../../lib/upload-post";
import { supabase } from "../../../../../lib/supabase";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const response = await supabase(`publish_jobs?carousel_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=1`);
    if (!response.ok) throw new Error(await response.text());
    const job = ((await response.json()) as Array<Record<string, unknown> & { id: string; provider_request_id?: string; provider_job_id?: string }>)[0];
    if (!job) return Response.json({ error: "Publish job not found" }, { status: 404 });
    const provider = await getUploadPostStatus({ requestId: job.provider_request_id, jobId: job.provider_job_id });
    const providerStatus = String(provider.status ?? "unknown").toLowerCase();
    const results = normalizeUploadPostResults(provider);
    const platformResult = results.find((item) => item.platform === job.platform) ?? results[0];
    const inboxFallback = platformResult?.fallback_to_inbox === true;
    const platformFailed = platformResult?.success === false || platformResult?.status === "failed" || platformResult?.status === "skipped" || platformResult?.skipped === true;
    const status = inboxFallback || platformFailed || providerStatus === "failed" || providerStatus === "not_found"
      ? "FAILED"
      : providerStatus === "completed" ? "PUBLISHED" : job.provider_job_id ? "SCHEDULED" : "PUBLISHING";
    const postUrl = typeof platformResult?.post_url === "string"
      ? platformResult.post_url
      : typeof platformResult?.url === "string" ? platformResult.url : null;
    const lastError = status === "FAILED"
      ? inboxFallback ? "TikTok received an inbox draft instead of a live post."
        : String(platformResult?.error ?? platformResult?.message ?? provider.message ?? "Upload failed")
      : null;
    await supabase(`publish_jobs?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ status, post_url: postUrl, last_error: lastError }) });
    await supabase(`carousels?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
    return Response.json({ carouselId: id, status, postUrl, provider });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Status check failed" }, { status: 500 });
  }
}
