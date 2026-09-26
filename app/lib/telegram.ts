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

export async function setTelegramCommands() {
  return telegramApi("setMyCommands", {
    commands: [
      { command: "status", description: "CortiFree runtime and queue status" },
      { command: "integrations", description: "Check Telegram, Upload-Post and Google readiness" },
      { command: "review", description: "Show carousels waiting for review" },
      { command: "planning", description: "Show the next 7 days by persona" },
      { command: "carousel", description: "Open a carousel by ID" },
      { command: "approve", description: "Approve a carousel by ID" },
      { command: "changes", description: "Request targeted changes to a carousel" },
      { command: "reject", description: "Reject a carousel with a reason" },
      { command: "stats", description: "Fetch live stats for a published carousel" },
      { command: "videostats", description: "Fetch live stats for a platform post ID" },
      { command: "top", description: "Show top unique content" },
    ],
  });
}

export async function getTelegramWebhookInfo() {
  return telegramApi("getWebhookInfo", {});
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

export function carouselButtons(carouselId: string, options: { canPlan?: boolean } = {}): TelegramReplyMarkup {
  const secondRow: TelegramInlineButton[] = [
    { text: "✏️ Changes", callback_data: `c:${carouselId}` },
    ...(options.canPlan ? [{ text: "📅 Plan", callback_data: `p:${carouselId}` }] : []),
    { text: "📊 Stats", callback_data: `s:${carouselId}` },
  ];
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `a:${carouselId}` },
        { text: "❌ Reject", callback_data: `r:${carouselId}` },
        { text: "🖼 Slides", callback_data: `v:${carouselId}` },
      ],
      secondRow,
    ],
  };
}

export function rejectionReasonButtons(carouselId: string): TelegramReplyMarkup {
  const reasons = [
    ["COPY_AI", "🤖 Copy trop IA"],
    ["HOOK_WEAK", "🪝 Hook faible"],
    ["IMAGES_BAD", "🖼 Mauvaises images"],
    ["PERSONA_MISMATCH", "👤 Persona incohérent"],
    ["IMAGES_REPETITIVE", "🔁 Images répétitives"],
    ["FORMAT_BAD", "📐 Format mauvais"],
    ["GENERIC", "🫥 Trop générique"],
    ["CONCEPT_BAD", "🗑 Mauvais concept"],
  ] as const;
  return {
    inline_keyboard: [
      ...Array.from({ length: Math.ceil(reasons.length / 2) }, (_, index) =>
        reasons.slice(index * 2, index * 2 + 2).map(([code, text]) => ({
          text,
          callback_data: `rr:${code}:${carouselId}`,
        })),
      ),
      [{ text: "↩️ Annuler", callback_data: `x:${carouselId}` }],
    ],
  };
}
