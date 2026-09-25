import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { setTelegramWebhook, telegramConfigured } from "../../../lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!telegramConfigured()) return NextResponse.json({ error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and TELEGRAM_WEBHOOK_SECRET first" }, { status: 503 });
  try {
    const origin = new URL(request.url).origin;
    const result = await setTelegramWebhook(origin);
    return NextResponse.json({ ok: true, webhook: `${origin}/api/telegram/webhook`, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
