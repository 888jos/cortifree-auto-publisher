import { dataBackend } from "./data-backend";
import {
  carouselButtons,
  sendTelegramMessage,
  telegramChatId,
  telegramConfigured,
} from "./telegram";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function insertLog(stage: string, carouselId: string, metadata: Record<string, unknown> = {}) {
  const response = await dataBackend("system_logs", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: "cortifree",
      stage,
      status: "SENT",
      carousel_id: carouselId,
      metadata,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function wasSent(stage: string, carouselId: string) {
  const existing = await rows(
    `system_logs?stage=eq.${encodeURIComponent(stage)}&carousel_id=eq.${encodeURIComponent(carouselId)}&select=id&limit=1`,
  );
  return existing.length > 0;
}

async function notifyReview(chatId: string) {
  const queue = await rows(
    "carousels?review_status=eq.AWAITING_REVIEW&status=eq.READY_FOR_REVIEW&select=id,topic,account_id,persona_id,current_version&order=created_at.asc&limit=20",
  );
  let sent = 0;
  for (const carousel of queue) {
    const id = String(carousel.id ?? "");
    const version = Number(carousel.current_version ?? 1);
    const stage = `TELEGRAM_REVIEW_READY_V${version}`;
    if (!id || await wasSent(stage, id)) continue;
    await sendTelegramMessage(chatId, [
      "🧾 Ready for review",
      String(carousel.topic ?? id),
      `ID: ${id}`,
      `Persona: ${carousel.persona_id ?? "-"} · Account: ${carousel.account_id ?? "-"}`,
      `Version: ${carousel.current_version ?? 1}`,
    ].join("\n"), carouselButtons(id));
    await insertLog(stage, id, { version });
    sent += 1;
  }
  return sent;
}

async function notifyPublishing(chatId: string) {
  const jobs = await rows(
    "publish_jobs?status=in.(PUBLISHED,FAILED)&select=id,carousel_id,account_id,platform,status,post_url,last_error,published_at,updated_at&order=updated_at.desc&limit=50",
  );
  let sent = 0;
  for (const job of jobs) {
    const id = String(job.carousel_id ?? "");
    if (!id) continue;
    const status = String(job.status ?? "");
    const stage = status === "PUBLISHED" ? "TELEGRAM_PUBLISHED" : "TELEGRAM_PUBLISH_FAILED";
    if (await wasSent(stage, id)) continue;
    const text = status === "PUBLISHED"
      ? [
          "✅ Published",
          `Carousel: ${id}`,
          `${String(job.platform ?? "").toUpperCase()} · ${job.account_id ?? "-"}`,
          job.post_url ? String(job.post_url) : "",
        ].filter(Boolean).join("\n")
      : [
          "🚨 Publish failed",
          `Carousel: ${id}`,
          `${String(job.platform ?? "").toUpperCase()} · ${job.account_id ?? "-"}`,
          String(job.last_error ?? "Unknown Upload-Post error"),
        ].join("\n");
    await sendTelegramMessage(chatId, text, carouselButtons(id));
    await insertLog(stage, id, { publish_job_id: job.id, status });
    sent += 1;
  }
  return sent;
}

async function notifyWinners(chatId: string) {
  const winners = await rows(
    "carousels?is_winner=eq.true&select=id,topic,account_id,performance_score,winner_at&order=winner_at.desc&limit=30",
  );
  let sent = 0;
  for (const carousel of winners) {
    const id = String(carousel.id ?? "");
    if (!id || await wasSent("TELEGRAM_WINNER", id)) continue;
    const latest = (await rows(
      `analytics_snapshots?carousel_id=eq.${encodeURIComponent(id)}&select=views,likes,comments,shares,saves,favorites,snapshot_label,post_url&order=captured_at.desc&limit=1`,
    ))[0];
    await sendTelegramMessage(chatId, [
      "🔥 Winner detected",
      String(carousel.topic ?? id),
      `ID: ${id}`,
      `Account: ${carousel.account_id ?? "-"}`,
      `Views: ${Number(latest?.views ?? 0).toLocaleString("en-US")} · Snapshot: ${latest?.snapshot_label ?? "-"}`,
      `Shares: ${Number(latest?.shares ?? 0).toLocaleString("en-US")} · Saves: ${Number(latest?.saves ?? latest?.favorites ?? 0).toLocaleString("en-US")}`,
      latest?.post_url ? String(latest.post_url) : "",
    ].filter(Boolean).join("\n"), carouselButtons(id));
    await insertLog("TELEGRAM_WINNER", id, { performance_score: carousel.performance_score });
    sent += 1;
  }
  return sent;
}

export async function sendPendingTelegramNotifications() {
  if (!telegramConfigured()) return { configured: false, review: 0, publishing: 0, winners: 0 };
  const chatId = telegramChatId();
  const [review, publishing, winners] = await Promise.all([
    notifyReview(chatId),
    notifyPublishing(chatId),
    notifyWinners(chatId),
  ]);
  return { configured: true, review, publishing, winners };
}
