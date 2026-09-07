import type { CarouselSpec } from "./ai/schemas";
import type { RenderedSlide } from "./publish-readiness";
import sharp from "sharp";

const API_ROOT = "https://api.upload-post.com/api";

function apiKey() {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) throw new Error("UPLOAD_POST_API_KEY is not configured");
  return key;
}

export async function listUploadPostProfiles() {
  const response = await fetch(`${API_ROOT}/uploadposts/users`, { headers: { Authorization: `Apikey ${apiKey()}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Upload-Post profile check failed: HTTP ${response.status}`);
  return response.json();
}

export async function getUploadPostStatus(input: { requestId?: string | null; jobId?: string | null }) {
  const query = input.jobId ? `job_id=${encodeURIComponent(input.jobId)}` : input.requestId ? `request_id=${encodeURIComponent(input.requestId)}` : "";
  if (!query) throw new Error("Upload-Post request_id or job_id is required");
  const response = await fetch(`${API_ROOT}/uploadposts/status?${query}`, {
    headers: { Authorization: `Apikey ${apiKey()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Upload-Post status failed: HTTP ${response.status}`);
  return payload as Record<string, unknown>;
}

export async function uploadPhotoCarousel(input: {
  carouselId: string;
  profile: string;
  platform: "tiktok" | "instagram";
  spec: CarouselSpec;
  slides: RenderedSlide[];
  scheduledDate?: string;
}) {
  const body = new FormData();
  body.append("user", input.profile);
  body.append("platform[]", input.platform);
  body.append("title", input.platform === "tiktok" ? input.spec.hook.slice(0, 90) : input.spec.caption);
  body.append("external_id", input.carouselId);
  body.append("request_id", input.carouselId);
  body.append("async_upload", "true");
  if (input.platform === "tiktok") {
    body.append("post_mode", "DIRECT_POST");
    body.append("privacy_level", "PUBLIC_TO_EVERYONE");
    body.append("auto_add_music", "true");
    body.append("description", input.spec.caption);
    body.append("tiktok_is_ai_generated", process.env.AI_DISCLOSURE_MODE === "never" ? "false" : "true");
  } else {
    body.append("is_ai_generated", process.env.AI_DISCLOSURE_MODE === "never" ? "false" : "true");
  }
  if (input.scheduledDate) body.append("scheduled_date", input.scheduledDate);
  for (const slide of [...input.slides].sort((a, b) => a.position - b.position)) {
    const response = await fetch(slide.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Cannot fetch rendered slide ${slide.position}: HTTP ${response.status}`);
    const source = Buffer.from(await response.arrayBuffer());
    const bytes = input.platform === "tiktok" ? await sharp(source).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer() : source;
    const extension = input.platform === "tiktok" ? "jpg" : "png";
    const mimeType = input.platform === "tiktok" ? "image/jpeg" : "image/png";
    body.append("photos[]", new Blob([new Uint8Array(bytes)], { type: mimeType }), `slide_${String(slide.position).padStart(2, "0")}.${extension}`);
  }
  const response = await fetch(`${API_ROOT}/upload_photos`, {
    method: "POST",
    headers: { Authorization: `Apikey ${apiKey()}`, "Idempotency-Key": `cortifree:${input.profile}:${input.platform}:${input.carouselId}` },
    body,
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Upload-Post failed: HTTP ${response.status}`);
  return payload as Record<string, unknown>;
}
