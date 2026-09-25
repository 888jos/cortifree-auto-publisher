import type { CarouselSpec } from "./ai/schemas";
import type { RenderedSlide } from "./publish-readiness";

const API_ROOT = "https://api.upload-post.com/api";

export type UploadPostProfile = {
  username: string;
  social_accounts?: Record<string, unknown>;
};

export type UploadPostResult = Record<string, unknown> & { platform?: string };

export type NormalizedPostAnalytics = {
  platform: string;
  platformPostId: string | null;
  postUrl: string | null;
  profileUsername: string | null;
  mediaType: string | null;
  uploadTimestamp: string | null;
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  favorites: number;
  profileViews: number;
  newFollowers: number;
  watchTimeMinutes: number | null;
  averageViewDurationSeconds: number | null;
  averageViewPercentage: number | null;
  fullVideoWatchedRate: number | null;
  totalTimeWatched: number | null;
  retention: unknown;
  impressionSources: unknown;
  audienceTypes: unknown;
  raw: Record<string, unknown>;
};

function apiKey() {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) throw new Error("UPLOAD_POST_API_KEY is not configured");
  return key;
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalN(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parseUploadPostProfiles(payload: unknown): UploadPostProfile[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { profiles?: unknown }).profiles)
      ? (payload as { profiles: unknown[] }).profiles
      : payload && typeof payload === "object" && Array.isArray((payload as { users?: unknown }).users)
        ? (payload as { users: unknown[] }).users
        : [];
  return source.flatMap((profile) => {
    if (!profile || typeof profile !== "object") return [];
    const username = (profile as { username?: unknown }).username;
    if (typeof username !== "string" || !username.trim()) return [];
    const socialAccounts = (profile as { social_accounts?: unknown }).social_accounts;
    return [{
      username: username.trim(),
      social_accounts: socialAccounts && typeof socialAccounts === "object" && !Array.isArray(socialAccounts)
        ? socialAccounts as Record<string, unknown>
        : undefined,
    }];
  });
}

export function connectedPlatforms(profile: UploadPostProfile): string[] {
  return Object.entries(profile.social_accounts ?? {}).filter(([, account]) => {
    if (typeof account === "string") return account.trim().length > 0;
    if (account && typeof account === "object") return Object.keys(account).length > 0;
    return Boolean(account);
  }).map(([platform]) => platform);
}

export function filterUploadPostProfiles(profiles: UploadPostProfile[], allowedUsernames: string[]) {
  const allowed = new Set(allowedUsernames.map((username) => username.trim()).filter(Boolean));
  return profiles.filter((profile) => allowed.has(profile.username));
}

export function pickAssignedUploadPostProfile(
  profiles: UploadPostProfile[],
  platform: "tiktok" | "instagram",
  assignedUsername?: string | null,
) {
  if (!assignedUsername) return undefined;
  const profile = profiles.find((candidate) => candidate.username === assignedUsername);
  return profile && connectedPlatforms(profile).includes(platform) ? profile.username : undefined;
}

export function normalizeUploadPostResults(payload: unknown): UploadPostResult[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { results?: unknown }).results;
  if (Array.isArray(results)) return results.filter((result): result is UploadPostResult => Boolean(result) && typeof result === "object");
  if (!results || typeof results !== "object") return [];
  return Object.entries(results).flatMap(([platform, result]) => result && typeof result === "object"
    ? [{ platform, ...(result as Record<string, unknown>) }]
    : []);
}

export function normalizeUploadPostAnalytics(payload: Record<string, unknown>, requestedPlatform?: string): NormalizedPostAnalytics {
  const post = objectValue(payload.post);
  const platforms = objectValue(payload.platforms);
  const platform = requestedPlatform || String(post.platform ?? Object.keys(platforms)[0] ?? "unknown");
  const entry = objectValue(platforms[platform] ?? Object.values(platforms)[0]);
  const metrics = objectValue(entry.post_metrics ?? entry.metrics ?? payload.metrics);
  return {
    platform,
    platformPostId: typeof entry.platform_post_id === "string" ? entry.platform_post_id : typeof post.platform_post_id === "string" ? post.platform_post_id : null,
    postUrl: typeof entry.post_url === "string" ? entry.post_url : typeof post.post_url === "string" ? post.post_url : null,
    profileUsername: typeof post.profile_username === "string" ? post.profile_username : typeof payload.profile_username === "string" ? payload.profile_username : null,
    mediaType: typeof post.media_type === "string" ? post.media_type : typeof entry.media_type === "string" ? entry.media_type : null,
    uploadTimestamp: typeof post.upload_timestamp === "string" ? post.upload_timestamp : typeof entry.upload_timestamp === "string" ? entry.upload_timestamp : null,
    views: n(metrics.views ?? metrics.impressions ?? metrics.reach),
    reach: n(metrics.reach),
    impressions: n(metrics.impressions),
    likes: n(metrics.likes),
    comments: n(metrics.comments),
    shares: n(metrics.shares),
    saves: n(metrics.saves),
    favorites: n(metrics.favorites ?? metrics.saves),
    profileViews: n(metrics.profile_views ?? metrics.profileViews),
    newFollowers: n(metrics.new_followers ?? metrics.newFollowers),
    watchTimeMinutes: optionalN(metrics.watch_time_minutes),
    averageViewDurationSeconds: optionalN(metrics.average_view_duration_seconds ?? metrics.average_time_watched),
    averageViewPercentage: optionalN(metrics.average_view_percentage),
    fullVideoWatchedRate: optionalN(metrics.full_video_watched_rate ?? metrics.completion_rate),
    totalTimeWatched: optionalN(metrics.total_time_watched),
    retention: metrics.retention ?? [],
    impressionSources: metrics.impression_sources ?? {},
    audienceTypes: metrics.audience_types ?? {},
    raw: payload,
  };
}

export async function listUploadPostProfiles(): Promise<UploadPostProfile[]> {
  const response = await fetch(`${API_ROOT}/uploadposts/users`, { headers: { Authorization: `Apikey ${apiKey()}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Upload-Post profile check failed: HTTP ${response.status}`);
  return parseUploadPostProfiles(await response.json());
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

export async function getUploadPostPostAnalytics(requestId: string, platform?: "tiktok" | "instagram" | "youtube" | "facebook" | "linkedin" | "x" | "threads" | "pinterest" | "reddit") {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : "";
  const response = await fetch(`${API_ROOT}/uploadposts/post-analytics/${encodeURIComponent(requestId)}${query}`, {
    headers: { Authorization: `Apikey ${apiKey()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Upload-Post analytics failed: HTTP ${response.status}`);
  return payload as Record<string, unknown>;
}

export async function getUploadPostAnalyticsByPlatformPost(input: {
  platformPostId: string;
  platform: "tiktok" | "instagram" | "youtube" | "facebook" | "linkedin" | "x" | "threads" | "pinterest" | "reddit";
  user: string;
}) {
  const params = new URLSearchParams({
    platform_post_id: input.platformPostId,
    platform: input.platform,
    user: input.user,
  });
  const response = await fetch(`${API_ROOT}/uploadposts/post-analytics?${params}`, {
    headers: { Authorization: `Apikey ${apiKey()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Upload-Post platform post analytics failed: HTTP ${response.status}`);
  return payload as Record<string, unknown>;
}

export async function getUploadPostCachedAnalytics(input: {
  user: string;
  platform?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}) {
  const params = new URLSearchParams({ user: input.user, limit: String(Math.min(Math.max(input.limit ?? 50, 1), 200)) });
  if (input.platform) params.set("platform", input.platform);
  if (input.since) params.set("since", input.since);
  if (input.until) params.set("until", input.until);
  if (input.cursor) params.set("cursor", input.cursor);
  const response = await fetch(`${API_ROOT}/uploadposts/post-analytics/cached?${params}`, {
    headers: { Authorization: `Apikey ${apiKey()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Upload-Post cached analytics failed: HTTP ${response.status}`);
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
  const { default: sharp } = await import("sharp");
  const body = new FormData();
  body.append("user", input.profile);
  body.append("platform[]", input.platform);
  body.append("title", input.platform === "tiktok" ? input.spec.hook.slice(0, 90) : input.spec.caption);
  body.append("external_id", input.carouselId);
  body.append("request_id", input.carouselId);
  body.append("async_upload", "true");
  if (input.platform === "tiktok") {
    body.append("post_mode", "DIRECT_POST");
    body.append("disable_inbox_fallback", "true");
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
