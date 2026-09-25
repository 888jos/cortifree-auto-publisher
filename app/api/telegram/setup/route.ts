import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { getTelegramWebhookInfo, setTelegramCommands, setTelegramWebhook, telegramConfigured } from "../../../lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!telegramConfigured()) return NextResponse.json({ error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and TELEGRAM_WEBHOOK_SECRET first" }, { status: 503 });
  try {
    const origin = new URL(request.url).origin;
    const webhookResult = await setTelegramWebhook(origin);
    const commandsResult = await setTelegramCommands();
    const webhookInfo = await getTelegramWebhookInfo();
    return NextResponse.json({
      ok: true,
      webhook: `${origin}/api/telegram/webhook`,
      webhookResult,
      commandsResult,
      webhookInfo,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}


export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, configured: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const webhookInfo = await getTelegramWebhookInfo();
    return NextResponse.json({ ok: true, configured: true, webhookInfo }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
