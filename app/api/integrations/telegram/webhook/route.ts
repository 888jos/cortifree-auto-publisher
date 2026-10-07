import { NextResponse } from "next/server";
import { POST as handleCanonicalWebhook, maxDuration, runtime } from "../../../telegram/webhook/route";
import { isTelegramWebhookRequest } from "../../../../lib/telegram";

export { maxDuration, runtime };

export async function POST(request: Request) {
  if (isTelegramWebhookRequest(request)) return handleCanonicalWebhook(request);

  // This legacy endpoint existed before /api/telegram/webhook became canonical.
  // Unauthenticated deliveries are acknowledged without any side effect so
  // Telegram does not retry forever. Re-register the bot from the admin-gated
  // /api/telegram/setup route; this public endpoint must never call setWebhook.
  return new NextResponse(null, { status: 204 });
}
