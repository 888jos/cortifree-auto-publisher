import { NextResponse } from "next/server";
import { dataBackend } from "../../../lib/data-backend";
import { approveCarousel, planReviewRevision, recordReviewEvent, rejectCarousel } from "../../../lib/human-review";
import { scheduleCarousel } from "../../../lib/planning";
import { reviewReasonLabel } from "../../../lib/review-reasons";
import { enqueueWorkerJob } from "../../../lib/worker-queue";
import { formatIntegrationHealth, getLocalIntegrationHealth } from "../../../lib/integration-health";
import {
  getUploadPostAnalyticsByPlatformPost,
  getUploadPostPostAnalytics,
  normalizeUploadPostAnalytics,
} from "../../../lib/upload-post";
import {
  answerTelegramCallback,
  carouselButtons,
  rejectionReasonButtons,
  isAllowedTelegramChat,
  isTelegramWebhookRequest,
  sendTelegramMediaGroup,
  sendTelegramMessage,
} from "../../../lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = Record<string, unknown>;
type TelegramMessage = { message_id?: number; text?: string; chat?: { id?: string | number } };
type TelegramCallback = { id?: string; data?: string; message?: TelegramMessage };
type TelegramUpdate = { message?: TelegramMessage; callback_query?: TelegramCallback };

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function upsert(resource: string, body: Record<string, unknown>) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
}

function fmt(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("en-US", { notation: number >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(number);
}

function metricScore(metrics: ReturnType<typeof normalizeUploadPostAnalytics>) {
  return metrics.views + metrics.likes * 2 + metrics.comments * 5 + metrics.shares * 10 + Math.max(metrics.saves, metrics.favorites) * 10;
}

function statsText(title: string, metrics: ReturnType<typeof normalizeUploadPostAnalytics>) {
  const retention = metrics.fullVideoWatchedRate !== null ? `\nCompletion: ${fmt(metrics.fullVideoWatchedRate)}%` : "";
  const avgWatch = metrics.averageViewDurationSeconds !== null ? `\nAvg watch: ${fmt(metrics.averageViewDurationSeconds)}s` : "";
  const followers = metrics.newFollowers ? `\nNew followers: ${fmt(metrics.newFollowers)}` : "";
  return [
    `📊 ${title}`,
    `${metrics.platform.toUpperCase()} · ${metrics.mediaType ?? "post"}`,
    "",
    `Views: ${fmt(metrics.views)}`,
    `Likes: ${fmt(metrics.likes)}`,
    `Comments: ${fmt(metrics.comments)}`,
    `Shares: ${fmt(metrics.shares)}`,
    `Saves: ${fmt(Math.max(metrics.saves, metrics.favorites))}`,
    retention,
    avgWatch,
    followers,
    metrics.postUrl ? `\n${metrics.postUrl}` : "",
  ].filter(Boolean).join("\n");
}

async function saveSnapshot(input: {
  carouselId?: string | null;
  accountId?: string | null;
  providerRequestId?: string | null;
  profileUsername?: string | null;
  metrics: ReturnType<typeof normalizeUploadPostAnalytics>;
  contentKind: "carousel" | "video";
}) {
  const capturedAt = new Date().toISOString();
  const m = input.metrics;
  await upsert("analytics_snapshots?on_conflict=id", {
    id: `AN_${input.carouselId ?? m.platformPostId ?? "post"}_${Date.now()}`,
    workspace_id: "cortifree",
    content_kind: input.contentKind,
    carousel_id: input.carouselId ?? null,
    account_id: input.accountId ?? null,
    platform: m.platform,
    provider_request_id: input.providerRequestId ?? null,
    platform_post_id: m.platformPostId,
    profile_username: input.profileUsername ?? m.profileUsername,
    post_url: m.postUrl,
    media_type: m.mediaType,
    captured_at: capturedAt,
    views: m.views,
    reach: m.reach,
    impressions: m.impressions,
    likes: m.likes,
    comments: m.comments,
    shares: m.shares,
    saves: m.saves,
    favorites: m.favorites,
    profile_views: m.profileViews,
    new_followers: m.newFollowers,
    watch_time_minutes: m.watchTimeMinutes,
    average_view_duration_seconds: m.averageViewDurationSeconds,
    average_view_percentage: m.averageViewPercentage,
    full_video_watched_rate: m.fullVideoWatchedRate,
    total_time_watched: m.totalTimeWatched,
    performance_score: metricScore(m),
    retention: m.retention,
    impression_sources: m.impressionSources,
    audience_types: m.audienceTypes,
    raw: m.raw,
  });
}

async function carouselRow(id: string) {
  return (await rows(`carousels?workspace_id=eq.cortifree&id=eq.${encodeURIComponent(id)}&select=*&limit=1`))[0];
}

async function carouselCard(chatId: string | number, id: string, includeSlides = false) {
  const carousel = await carouselRow(id);
  if (!carousel) return sendTelegramMessage(chatId, `Carousel not found: ${id}`);
  if (includeSlides) {
    const slides = await rows(`carousel_slides?workspace_id=eq.cortifree&carousel_id=eq.${encodeURIComponent(id)}&status=eq.CURRENT&select=position,rendered_url&order=position.asc`);
    const urls = slides.map((slide) => String(slide.rendered_url ?? "")).filter(Boolean);
    if (urls.length) await sendTelegramMediaGroup(chatId, urls);
  }
  return sendTelegramMessage(chatId, [
    `🧩 ${id}`,
    String(carousel.topic ?? "Untitled"),
    `Persona: ${carousel.persona_id ?? "-"} · Account: ${carousel.account_id ?? "-"}`,
    `Status: ${carousel.status ?? "-"} / ${carousel.review_status ?? "-"}`,
    `Version: ${carousel.current_version ?? 1} · Revisions: ${carousel.revision_count ?? 0}`,
  ].join("\n"), carouselButtons(id, { canPlan: ["APPROVED","SCHEDULED"].includes(String(carousel.status ?? "")) }));
}

async function approve(chatId: string | number, id: string) {
  const result = await approveCarousel(id, `telegram:${chatId}`);
  await sendTelegramMessage(
    chatId,
    `✅ Approved ${id}\nVersion: ${result.approvedVersion}\nAdded to the planning backlog.`,
    carouselButtons(id, { canPlan: true }),
  );
}

async function requestChanges(chatId: string | number, id: string, feedback: string) {
  const current = await carouselRow(id);
  if (!current) throw new Error(`Carousel not found: ${id}`);
  const revision = await planReviewRevision(id, feedback);
  await recordReviewEvent({
    carouselId: id,
    eventType: "REVISION_QUEUED",
    actor: `telegram:${chatId}`,
    feedback,
    patchPlan: revision,
    beforeVersion: Number(current.current_version ?? 1),
  });
  const queued = await enqueueWorkerJob({
    kind: "APPLY_REVIEW_PATCH",
    resourceId: id,
    idempotencyKey: `telegram-review:${id}:${Date.now()}`,
    payload: { feedback, actor: `telegram:${chatId}`, revision },
    priority: 200,
    maxAttempts: 2,
  });
  await sendTelegramMessage(chatId, `✏️ Revision queued for ${id}\n${revision.summary}\nWorker job: ${queued.job.status}`);
}

async function statsForCarousel(chatId: string | number, id: string) {
  const jobs = await rows(`publish_jobs?workspace_id=eq.cortifree&carousel_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=1`);
  const job = jobs[0];
  if (!job?.provider_request_id) return sendTelegramMessage(chatId, `No Upload-Post request found yet for ${id}`);
  const platform = String(job.platform ?? "tiktok") as "tiktok" | "instagram";
  const payload = await getUploadPostPostAnalytics(String(job.provider_request_id), platform);
  const metrics = normalizeUploadPostAnalytics(payload, platform);
  await saveSnapshot({
    carouselId: id,
    accountId: String(job.account_id ?? "") || null,
    providerRequestId: String(job.provider_request_id),
    metrics,
    contentKind: "carousel",
  });
  return sendTelegramMessage(chatId, statsText(id, metrics), carouselButtons(id));
}

async function statsForVideo(chatId: string | number, platform: string, user: string, postId: string) {
  const allowed = ["tiktok","instagram","youtube","facebook","linkedin","x","threads","pinterest","reddit"];
  if (!allowed.includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
  const payload = await getUploadPostAnalyticsByPlatformPost({
    platformPostId: postId,
    platform: platform as "tiktok",
    user,
  });
  const metrics = normalizeUploadPostAnalytics(payload, platform);
  await saveSnapshot({ profileUsername: user, metrics, contentKind: "video" });
  return sendTelegramMessage(chatId, statsText(`${user} · ${postId}`, metrics));
}

async function status(chatId: string | number) {
  const [review, scheduled, published, heartbeats, activeJobs] = await Promise.all([
    rows("carousels?workspace_id=eq.cortifree&review_status=eq.AWAITING_REVIEW&select=id&limit=500"),
    rows("carousels?workspace_id=eq.cortifree&status=in.(APPROVED,SCHEDULING,SCHEDULED,PUBLISHING)&select=id&limit=500"),
    rows("carousels?workspace_id=eq.cortifree&status=eq.PUBLISHED&select=id&limit=500"),
    rows("worker_heartbeats?workspace_id=eq.cortifree&select=worker_id,version,last_seen_at&order=last_seen_at.desc&limit=1"),
    rows("worker_jobs?workspace_id=eq.cortifree&status=in.(PENDING,RUNNING,RETRY)&select=id,kind,status&limit=500"),
  ]);
  const worker = heartbeats[0];
  return sendTelegramMessage(chatId, [
    "🩺 CortiFree status",
    `Review queue: ${review.length}`,
    `Scheduled/publishing: ${scheduled.length}`,
    `Published: ${published.length}`,
    `Active worker jobs: ${activeJobs.length}`,
    `Worker: ${worker ? `${worker.worker_id} · ${worker.version} · ${worker.last_seen_at}` : "offline"}`,
  ].join("\n"));
}

async function integrations(chatId: string | number) {
  const heartbeats = await rows("worker_heartbeats?workspace_id=eq.cortifree&select=worker_id,version,last_seen_at,capabilities&order=last_seen_at.desc&limit=1");
  const worker = heartbeats[0];
  const suffix = worker
    ? `\nWorker: ✅ ${worker.version ?? "unknown"} · ${worker.last_seen_at ?? "-"}`
    : "\nWorker: ❌ offline";
  return sendTelegramMessage(chatId, formatIntegrationHealth(getLocalIntegrationHealth()) + suffix);
}

async function reviewQueue(chatId: string | number) {
  const queue = await rows("carousels?workspace_id=eq.cortifree&review_status=eq.AWAITING_REVIEW&status=eq.READY_FOR_REVIEW&select=id&order=created_at.asc&limit=8");
  if (!queue.length) return sendTelegramMessage(chatId, "✅ Review queue is empty.");
  await sendTelegramMessage(chatId, `🧾 ${queue.length} carousel(s) shown from the review queue.`);
  for (const row of queue) await carouselCard(chatId, String(row.id), false);
}

async function planning(chatId: string | number, personaId?: string) {
  const filter = personaId ? `&persona_id=eq.${encodeURIComponent(personaId.toUpperCase())}` : "";
  const rowsList = await rows(
    `carousels?workspace_id=eq.cortifree&status=in.(APPROVED,SCHEDULED,PUBLISHING,PUBLISHED)&select=id,persona_id,account_id,topic,status,scheduled_for&order=scheduled_for.asc.nullslast,approved_at.asc&limit=100${filter}`,
  );
  const backlog = rowsList.filter((row) => String(row.status) === "APPROVED" && !row.scheduled_for);
  const scheduled = rowsList.filter((row) => Boolean(row.scheduled_for)).slice(0, 20);
  const lines = scheduled.map((row) => {
    const when = row.scheduled_for
      ? new Intl.DateTimeFormat("fr-FR", { timeZone: "America/New_York", weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(String(row.scheduled_for)))
      : "—";
    return `• ${when} · ${row.persona_id ?? "-"} · ${row.topic ?? row.id} · ${row.status}`;
  });
  return sendTelegramMessage(chatId, [
    "📅 CortiFree planning",
    personaId ? `Persona: ${personaId.toUpperCase()}` : "All personas",
    `Approved backlog: ${backlog.length}`,
    `Scheduled/publishing shown: ${scheduled.length}`,
    "",
    ...lines,
  ].join("\n"));
}

async function planNext(chatId: string | number, id: string) {
  const result = await scheduleCarousel({ carouselId: id, actor: `telegram:${chatId}`, mode: "next" });
  await sendTelegramMessage(chatId, `📅 Planned ${id}\n${result.scheduledFor}`, carouselButtons(id, { canPlan: true }));
}

async function top(chatId: string | number) {
  const snapshots = await rows(
    "analytics_snapshots?workspace_id=eq.cortifree&select=carousel_id,profile_username,platform,platform_post_id,views,likes,shares,saves,favorites,performance_score,post_url,captured_at,snapshot_label&order=captured_at.desc&limit=200",
  );
  if (!snapshots.length) return sendTelegramMessage(chatId, "No analytics snapshots yet.");

  const latestByContent = new Map<string, Row>();
  for (const row of snapshots) {
    const key = String(row.carousel_id ?? row.platform_post_id ?? `${row.profile_username ?? "post"}:${row.platform ?? "unknown"}`);
    if (!latestByContent.has(key)) latestByContent.set(key, row);
  }

  const list = [...latestByContent.values()]
    .sort((a, b) => Number(b.performance_score ?? 0) - Number(a.performance_score ?? 0))
    .slice(0, 10);

  const lines = list.map((row, index) =>
    `${index + 1}. ${row.carousel_id ?? row.profile_username ?? "post"} · ${String(row.platform ?? "").toUpperCase()} · ${fmt(row.views)} views · score ${fmt(row.performance_score)} · ${row.snapshot_label ?? "live"}`
  );
  return sendTelegramMessage(chatId, ["🏆 Top unique content", ...lines].join("\n"));
}

async function handleText(chatId: string | number, text: string) {
  const [commandRaw, ...args] = text.trim().split(/\s+/);
  const command = commandRaw.toLowerCase().split("@")[0];
  if (command === "/start" || command === "/help") {
    return sendTelegramMessage(chatId, [
      "CortiFree Ops Bot",
      "/status",
      "/integrations",
      "/review",
      "/planning [persona]",
      "/carousel <id>",
      "/approve <id>",
      "/changes <id> <feedback>",
      "/reject <id> <reason>",
      "/stats <id>",
      "/videostats <platform> <profile> <post_id>",
      "/top",
    ].join("\n"));
  }
  if (command === "/status") return status(chatId);
  if (command === "/integrations") return integrations(chatId);
  if (command === "/review") return reviewQueue(chatId);
  if (command === "/planning") return planning(chatId, args[0]);
  if (command === "/top") return top(chatId);
  if (command === "/carousel" && args[0]) return carouselCard(chatId, args[0], true);
  if (command === "/approve" && args[0]) return approve(chatId, args[0]);
  if (command === "/stats" && args[0]) return statsForCarousel(chatId, args[0]);
  if (command === "/reject" && args[0] && args.slice(1).join(" ").trim()) {
    await rejectCarousel(args[0], args.slice(1).join(" ").trim(), `telegram:${chatId}`);
    return sendTelegramMessage(chatId, `🗑 Rejected ${args[0]}`);
  }
  if (command === "/changes" && args[0] && args.slice(1).join(" ").trim()) {
    return requestChanges(chatId, args[0], args.slice(1).join(" ").trim());
  }
  if (command === "/videostats" && args.length >= 3) return statsForVideo(chatId, args[0].toLowerCase(), args[1], args[2]);
  return sendTelegramMessage(chatId, "Unknown or incomplete command. Use /help.");
}

async function handleCallback(chatId: string | number, callback: TelegramCallback) {
  const callbackId = callback.id ?? "";
  const data = callback.data ?? "";
  const parts = data.split(":");
  const action = parts[0] ?? "";
  const id = action === "rr" ? parts.slice(2).join(":") : parts.slice(1).join(":");
  try {
    if (action === "a" && id) await approve(chatId, id);
    else if (action === "r" && id) await sendTelegramMessage(chatId, `Why reject ${id}?`, rejectionReasonButtons(id));
    else if (action === "rr" && parts[1] && id) {
      const reasonCode = parts[1];
      await rejectCarousel(id, reviewReasonLabel(reasonCode), `telegram:${chatId}`, { reasonCode, action: "ARCHIVE" });
      await sendTelegramMessage(chatId, `🗑 Rejected ${id}\nReason: ${reviewReasonLabel(reasonCode)}`);
    }
    else if (action === "p" && id) await planNext(chatId, id);
    else if (action === "v" && id) await carouselCard(chatId, id, true);
    else if (action === "s" && id) await statsForCarousel(chatId, id);
    else if (action === "c" && id) await sendTelegramMessage(chatId, `Send: /changes ${id} <what you want changed>`);
    else if (action === "x") await sendTelegramMessage(chatId, "Cancelled.");
    else await sendTelegramMessage(chatId, "Unknown action.");
    if (callbackId) await answerTelegramCallback(callbackId, "Done");
  } catch (error) {
    if (callbackId) await answerTelegramCallback(callbackId, "Failed");
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isTelegramWebhookRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const update = await request.json() as TelegramUpdate;
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (!isAllowedTelegramChat(chatId)) return NextResponse.json({ ok: true, ignored: "chat_not_allowed" });
    if (update.callback_query) await handleCallback(chatId!, update.callback_query);
    else if (update.message?.text) await handleText(chatId!, update.message.text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const updateText = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: updateText }, { status: 500 });
  }
}
