import type { RemixExtractedPayload, RemixMaterial } from "./schemas";
import { remixMaterialSchema } from "./schemas";

const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

export function normalizeTikTokUrl(input: string) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (!TIKTOK_HOSTS.has(host) && !host.endsWith(".tiktok.com")) {
    throw new Error("Only TikTok URLs are accepted by the remix importer");
  }
  url.hash = "";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "is_from_webapp", "sender_device"]) url.searchParams.delete(key);
  return url.toString();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) return value.map(firstUrl).find(Boolean);
  return undefined;
}

function normalizeProviderPayload(sourceUrl: string, payload: unknown): RemixMaterial {
  const root = (Array.isArray(payload) ? payload[0] : payload) as Record<string, any> | undefined;
  if (!root || typeof root !== "object") throw new Error("TikTok ingestion provider returned no usable item");
  const author = root.authorMeta?.name ?? root.author?.uniqueId ?? root.author?.username ?? root.author ?? root.username ?? root.creator;
  const caption = text(root.text ?? root.desc ?? root.caption ?? root.title);
  const candidates = root.slides ?? root.images ?? root.imageUrls ?? root.photos ?? root.imagePost?.images ?? [];
  const slides = Array.isArray(candidates) ? candidates.slice(0, 30).map((item: any, index: number) => ({
    position: index + 1,
    text: text(item?.text ?? item?.ocrText ?? item?.caption),
    imageUrl: firstUrl(item?.imageUrl ?? item?.url ?? item?.displayImage ?? item?.image ?? item),
  })).filter((item) => item.text || item.imageUrl) : [];
  const rawText = [caption, ...slides.map((slide) => slide.text)].filter(Boolean).join("\n");
  return remixMaterialSchema.parse({
    sourceUrl,
    creator: text(author) || null,
    caption,
    rawText,
    slides,
    ingestionQuality: slides.length ? "full" : "metadata_only",
    provider: "configured_endpoint",
    thumbnailUrl: firstUrl(root.thumbnail_url ?? root.thumbnailUrl ?? root.cover ?? root.video?.cover) ?? null,
  });
}

async function configuredProvider(sourceUrl: string): Promise<RemixMaterial | null> {
  const endpoint = process.env.TIKTOK_INGEST_ENDPOINT;
  if (!endpoint) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TIKTOK_INGEST_TIMEOUT_MS ?? 20_000));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.TIKTOK_INGEST_TOKEN ? { Authorization: `Bearer ${process.env.TIKTOK_INGEST_TOKEN}` } : {}),
      },
      body: JSON.stringify({ url: sourceUrl }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TikTok ingestion provider failed with HTTP ${response.status}`);
    return normalizeProviderPayload(sourceUrl, await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function oembedFallback(sourceUrl: string): Promise<RemixMaterial> {
  const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(sourceUrl)}`, {
    headers: { "User-Agent": "CortiFreeRemix/1.0" },
  });
  if (!response.ok) throw new Error(`TikTok metadata fetch failed with HTTP ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  const caption = text(data.title);
  return remixMaterialSchema.parse({
    sourceUrl,
    creator: text(data.author_name) || null,
    caption,
    rawText: caption,
    slides: [],
    ingestionQuality: "metadata_only",
    provider: "tiktok_oembed",
    thumbnailUrl: firstUrl(data.thumbnail_url) ?? null,
  });
}

export async function ingestTikTok(sourceUrl: string, extracted?: RemixExtractedPayload): Promise<RemixMaterial> {
  const normalized = normalizeTikTokUrl(sourceUrl);
  if (extracted) {
    const rawText = text(extracted.rawText) || [text(extracted.caption), ...extracted.slides.map((slide) => slide.text)].filter(Boolean).join("\n");
    return remixMaterialSchema.parse({
      sourceUrl: normalized,
      creator: text(extracted.creator) || null,
      caption: text(extracted.caption),
      rawText,
      slides: extracted.slides,
      ingestionQuality: "manual",
      provider: "request_payload",
      thumbnailUrl: extracted.slides.find((slide) => slide.imageUrl)?.imageUrl ?? null,
    });
  }
  return await configuredProvider(normalized) ?? await oembedFallback(normalized);
}
