import { refreshPostAnalytics, refreshPublishStatuses, queueWinnerVariants } from "../../../../src/autonomy/performance";
import { sendPendingTelegramNotifications } from "../../../lib/telegram-notifications";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized cron request" }, { status: 401 });

  const result: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const errors: Record<string, string> = {};
  async function stage<T>(name: string, run: () => Promise<T>) {
    try {
      result[name] = await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors[name] = message;
      result[`${name}Error`] = message;
    }
  }

  await stage("publishStatus", () => refreshPublishStatuses(100));
  await stage("analytics", () => refreshPostAnalytics(100));
  await stage("winnerVariants", queueWinnerVariants);
  await stage("telegram", sendPendingTelegramNotifications);

  result.finishedAt = new Date().toISOString();
  result.ok = Object.keys(errors).length === 0;
  result.errors = errors;
  return Response.json(result, { status: Object.keys(errors).length ? 500 : 200 });
}
