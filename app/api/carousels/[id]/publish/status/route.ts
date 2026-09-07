import { getUploadPostStatus } from "../../../../../lib/upload-post";
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
    const status = providerStatus === "completed" ? "PUBLISHED" : providerStatus === "failed" || providerStatus === "not_found" ? "FAILED" : job.provider_job_id ? "SCHEDULED" : "PUBLISHING";
    const results = Array.isArray(provider.results) ? provider.results as Array<Record<string, unknown>> : [];
    const platformResult = results.find((item) => item.platform === job.platform) ?? results[0];
    const postUrl = typeof platformResult?.post_url === "string" ? platformResult.post_url : null;
    await supabase(`publish_jobs?id=eq.${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ status, post_url: postUrl, last_error: status === "FAILED" ? String(provider.message ?? "Upload failed") : null }) });
    await supabase(`carousels?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
    return Response.json({ carouselId: id, status, postUrl, provider });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Status check failed" }, { status: 500 });
  }
}
