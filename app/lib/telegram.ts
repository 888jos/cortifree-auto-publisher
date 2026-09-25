type TelegramInlineButton = { text: string; callback_data?: string; url?: string };
type TelegramReplyMarkup = { inline_keyboard: TelegramInlineButton[][] };

function config() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
  return { token, chatId, webhookSecret };
}

function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return mismatch === 0;
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  const { token } = config();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` })) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) throw new Error(String(payload.description ?? `Telegram ${method} failed: HTTP ${response.status}`));
  return payload;
}

export function telegramConfigured() {
  const value = config();
  return Boolean(value.token && value.chatId && value.webhookSecret);
}

export function telegramChatId() {
  return config().chatId;
}

export function isTelegramWebhookRequest(request: Request) {
  const expected = config().webhookSecret;
  if (!expected) return false;
  return safeEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", expected);
}

export function isAllowedTelegramChat(chatId: string | number | undefined | null) {
  const expected = config().chatId;
  return Boolean(expected && chatId !== undefined && chatId !== null && safeEqual(String(chatId), expected));
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function sendTelegramMediaGroup(chatId: string | number, urls: string[]) {
  const media = urls.filter(Boolean).slice(0, 10).map((url) => ({ type: "photo", media: url }));
  if (!media.length) return null;
  return telegramApi("sendMediaGroup", { chat_id: chatId, media });
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 180) } : {}),
  });
}

export async function setTelegramWebhook(origin: string) {
  const { webhookSecret } = config();
  if (!telegramConfigured()) throw new Error("Telegram bot variables are incomplete");
  const url = `${origin.replace(/\/$/, "")}/api/telegram/webhook`;
  return telegramApi("setWebhook", {
    url,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function carouselButtons(carouselId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `a:${carouselId}` },
        { text: "🖼 Slides", callback_data: `v:${carouselId}` },
        { text: "📊 Stats", callback_data: `s:${carouselId}` },
      ],
      [{ text: "✏️ Changes", callback_data: `c:${carouselId}` }],
    ],
  };
}
