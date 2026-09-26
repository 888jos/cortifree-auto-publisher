import { NextResponse } from "next/server";
import { POST as handleCanonicalWebhook, maxDuration, runtime } from "../../../telegram/webhook/route";
import { isTelegramWebhookRequest, setTelegramWebhook, telegramConfigured } from "../../../../lib/telegram";

export { maxDuration, runtime };

export async function POST(request: Request) {
  if (isTelegramWebhookRequest(request)) return handleCanonicalWebhook(request);

  // This legacy endpoint existed before /api/telegram/webhook became canonical.
  // If Telegram is still posting here with an old/missing secret, repair the
  // registration to the canonical endpoint instead of creating an endless 401 retry loop.
  if (telegramConfigured()) {
    try {
      const origin = new URL(request.url).origin;
      await setTelegramWebhook(origin);
      return NextResponse.json({ ok: true, repaired: "canonical_webhook_registered" }, { status: 202 });
    } catch (error) {
      console.error("[telegram] legacy webhook repair failed", error);
      return new NextResponse(null, { status: 204 });
    }
  }

  // Telegram is intentionally disabled. Acknowledge stale webhook deliveries
  // without processing them so Telegram does not hammer the app with retries.
  return new NextResponse(null, { status: 204 });
}
