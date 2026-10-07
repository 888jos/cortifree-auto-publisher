// API payload shapes used by the Studio home page.

export type AssetPreview = { id: string | number; category: string; subcategory: string; filename: string; orientation: string; framing: string; mood: string; public_url: string; source_type?: string; persona_id?: string | null; visual_description?: string; metadata?: { asset_name?: string; [key: string]: unknown } };
export type PersonaSummary = { id: string; name: string; ready: boolean; master: { id: string | number; public_url: string; filename: string } | null };
export type VisualReferenceSummary = {
  id: string; category: string; source_url: string | null; thumbnail_url: string | null; storage_path: string | null;
  pose: string; framing: string; outfit: string; environment: string; lighting: string; mood: string[]; good_for: string[];
};
export type ImageGenerationStatus = { configured: boolean; enabled: boolean; provider: string; model: string | null; maxRetries: number; dailyCapUsd: number; unitCostUsd: number; usage: { images: number; costUsd: number } };
export type ImageJob = { id: string; status: string; output_asset_id?: string | number; last_error?: string | null };
export type PersonaScene = { id: string; category: string; scene_description: string };
export type AssetTab = "All Assets" | "Stock" | "Persona Generated" | "Masters" | "Visual References";
export type DraftPreview = {
  id: string;
  typeName: string;
  modelName: string;
  topic: string;
  angle: string;
  caption: string;
  source: "openai" | "fallback";
  model: string | null;
  generatedAt: string;
  warning: string | null;
  saved: boolean;
  approvalStatus?: "APPROVED" | "READY_FOR_REVIEW";
  publishReady?: boolean;
  slides: { position: number; role: string; headline: string; body: string; asset: string; visualIntent: string; renderUrl?: string }[];
};

export type AIStatus = {
  configured: boolean; enabled: boolean; primaryModel: string; qaModel: string; qaEnabled: boolean; qaSampleRate: number; monthlyCapUsd: number;
};
export type AIUsage = { costUsd: number; calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; monthlyCapUsd: number };
export type HealthStatus = {
  ok?: boolean;
  p0Ready?: boolean;
  dryRun: boolean;
  backend?: "supabase";
  backendConfigured?: boolean;
  backendLive?: boolean;
  backendDataReady?: boolean;
  backendError?: string | null;
  backendDataError?: string | null;
  editorialReady?: boolean;
  googleSyncConfigured?: boolean;
  productionReady?: boolean;
  productionBlockers?: string[];
  productionWarnings?: string[];
  productionChecks?: {
    mappedPublishingAccounts?: string[];
    acceptance?: { reviewed?: number; usable?: number; passed?: boolean };
    masterCount?: number;
    personaCacheMin?: number;
    cacheMissingForPublishingPersonas?: string[];
    [key: string]: unknown;
  };
};
export type StoredCarousel = {
  id: string;
  topic: string;
  angle: string;
  caption: string;
  status: string;
  review_status?: string;
  review_notes?: string | null;
  current_version?: number;
  revision_count?: number;
  scheduled_for?: string | null;
  content_type: string;
  language: "en" | "fr";
  created_at: string;
  spec?: {
    model_id?: string;
    hook?: string;
    rendered_slides?: Array<{ position: number; url: string; assetId?: string | number }>;
    generated_slides?: Array<{ position: number; role: string; headline: string; body: string }>;
    publish_review?: { publishReady?: boolean; profile?: string; platform?: string };
  };
};
export type CalendarEntry = { id: string; account_id: string; account_name: string; persona_id: string; date: string; slot: string; timezone: string; platform: string; status: string; content_type: string; content_type_label: string; topic: string; angle: string; phase: string; source: string };
export type CalendarAccount = { id: string; name: string; persona_id: string; timezone: string; enabled: boolean; posting_enabled: boolean; daily_target: number; slots: string[]; entries: CalendarEntry[] };
export type CalendarData = { source: string; accounts: CalendarAccount[]; dailyTotals: Array<{ date: string; total: number; byStatus: Record<string, number> }>; summary: { accountCount: number; postsPerDay: number; averagePostsPerDay: number; maxPostsPerDay: number; totalSlots: number; phaseCounts: Record<string, number> } };
export type OpsOverview = {
  ok: boolean;
  checkedAt: string;
  posts: { today: number; publishedToday: number; failedToday: number; successRate7d: number | null; byStatus7d: Record<string, number> };
  worker: { latest: { version?: string; last_seen_at?: string } | null; heartbeatAgeSeconds: number | null; oldestQueueAgeSeconds: number | null; activeQueue: number; recentFailures: Array<{ id?: string; last_error?: string }> };
  buffers: Array<{ accountId: string; personaId: string; ready: number; days: number; targetDays: number }>;
  personaAssetsUnderThreshold: Array<{ personaId: string; count: number; threshold: number }>;
  costs7d: Record<string, number>;
  analytics: { views7d: number; topCarousels: Array<{ carouselId: string; accountId: string; views: number; score: number; postUrl?: string | null }> };
  accountsInError: Array<{ accountId: string; personaId: string; status: string }>;
  alerts: Array<{ code: string; severity: string; message: string }>;
};

