"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./image-studio.css";
import { referenceCarousels } from "./reference-carousels.js";
import { carouselBlueprints, getCarouselBlueprint } from "./carousel-blueprints.js";
import { hookCategories, hookLibrary } from "./hook-library.js";
import { getHookGenerationPlan } from "./lib/hook-selector";

type AssetGroup = { category: string; count: number };
type AssetPreview = { id: string | number; category: string; subcategory: string; filename: string; orientation: string; framing: string; mood: string; public_url: string; source_type?: string; persona_id?: string | null; visual_description?: string; metadata?: { asset_name?: string; [key: string]: unknown } };
type PersonaSummary = { id: string; name: string; ready: boolean; master: { id: string | number; public_url: string; filename: string } | null };
type VisualReferenceSummary = {
  id: string; category: string; source_url: string | null; thumbnail_url: string | null; storage_path: string | null;
  pose: string; framing: string; outfit: string; environment: string; lighting: string; mood: string[]; good_for: string[];
};
type ImageGenerationStatus = { configured: boolean; enabled: boolean; provider: string; model: string | null; maxRetries: number; dailyCapUsd: number; unitCostUsd: number; usage: { images: number; costUsd: number } };
type ImageJob = { id: string; status: string; output_asset_id?: string | number; last_error?: string | null };
type PersonaScene = { id: string; category: string; scene_description: string };
type AssetTab = "All Assets" | "Stock" | "Persona Generated" | "Masters" | "Visual References";

const menus = ["Carrousels", "Overview", "Content studio", "Models", "Hook library", "Asset library", "Calendar", "Settings"] as const;
const referenceImages = [
  {
    src: "https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-i-photomode-no/d6e07a2a6336432d936d5f58dfb95676~tplv-photomode-image.jpeg?dr=10375&x-expires=1788782400&x-signature=W%2F68OxVnQe7H1cgTkzl1CfanNcM%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=9b759fb9&idc=no1a&ftpl=1",
    alt: "Glow up carousel reference",
  },
  {
    src: "https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-i-photomode-no/1bd2d4aaa190477eb296298b838bc129~tplv-photomode-image.jpeg?dr=10375&x-expires=1788782400&x-signature=N7oqga8o8JcF17qRDbCqeq1VTH4%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=9b759fb9&idc=no1a&ftpl=1",
    alt: "Challenge carousel reference",
  },
  {
    src: "https://p16-common-sign.tiktokcdn-eu.com/tos-useast2a-i-photomode-euttp/a38966b74b2048e48519e00704f0f104~tplv-photomode-image.jpeg?dr=10375&x-expires=1788782400&x-signature=UWwvv8vmRREFi2s9Hre0Lv2Fv5w%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=9b759fb9&idc=no1a&ftpl=1",
    alt: "Habits carousel reference",
  },
  {
    src: "https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-i-photomode-no/9a66972e2b2d439abae4c9cdbaf73add~tplv-photomode-image.jpeg?dr=10375&x-expires=1788782400&x-signature=FX0d5HBNwQtnvfIoYobIHAq%2F66U%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=9b759fb9&idc=no1a&ftpl=1",
    alt: "Editorial carousel reference",
  },
  {
    src: "https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-i-photomode-no/f950dea78265427186f59c228faf2f76~tplv-photomode-image.jpeg?dr=10375&x-expires=1788782400&x-signature=Dsal0I8QxMckvvvkF56dEjmucI8%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=9b759fb9&idc=no1a&ftpl=1",
    alt: "Symptoms carousel reference",
  },
];

const rawModels = [
  {
    id: "single-image",
    name: "1× image",
    format: "Une image pleine page + texte éditorial",
    slides: "6 slides",
    style: "Photo dominante, titre fort, composition aérée",
    layout: "single-image",
  },
  {
    id: "grid-2x2",
    name: "2×2 images",
    format: "Quatre images en grille + texte éditorial",
    slides: "6 slides",
    style: "Moodboard féminin, deux images en diagonale, texte lisible",
    layout: "grid-2x2",
  },
] as const;

const layoutSpecs = {
  "single-image": {
    bestFor: "Une image forte avec texte éditorial lisible",
    imageZones: ["Une photo verticale pleine page"],
    textZones: ["Kicker", "Titre principal", "Texte court"],
    sample: { hook: "a softer kind of glow up", body: "small habits that make your days feel better", cta: "save" },
  },
  "grid-2x2": {
    bestFor: "Moodboard 2×2 avec une idée par slide",
    imageZones: ["Quatre photos verticales"],
    textZones: ["Kicker", "Titre éditorial", "Texte court"],
    sample: { hook: "the reset mood", body: "four little choices for a calmer week", cta: "save" },
  },
} as const;

const modelData = rawModels.map((model, index) => ({
  ...model,
  reference: referenceImages[index % referenceImages.length] ?? referenceImages[0],
  spec: layoutSpecs[model.layout],
}));

const carouselTypes = [
  {
    id: "C01_MORNING_ROUTINE",
    name: "Morning routine clean girl / low cortisol",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["amina-morning-routine", "thatgirl-challenge", "girlsonly-habits"],
    note: "Bon type pilier : parfait pour routines matin, clean girl, low cortisol.",
  },
  {
    id: "C02_CHECKLIST",
    name: "Checklist à sauvegarder",
    keep: true,
    modelIds: ["grid-2x2", "single-image"],
    refIds: ["lower-cortisol", "siuela-symptoms", "thatgirlstore-hormone"],
    note: "Très bon format saveable. 3 refs déjà utilisables.",
  },
  {
    id: "C03_THINGS_I_STOPPED",
    name: "Things I stopped doing",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["thomas-hormone", "siuela-symptoms"],
    note: "À garder, mais il manque 1 référence très typée stop/avoid.",
  },
  {
    id: "C04_THINGS_I_STARTED",
    name: "Habits I started",
    keep: true,
    modelIds: ["grid-2x2", "single-image"],
    refIds: ["girlsonly-habits", "rhea-hormones", "herfeminineedge-happy-hormones"],
    note: "Bon overlap avec glow-up + hormones.",
  },
  {
    id: "C05_GLOW_UP",
    name: "Glow-up / transformation",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["navzsm-glowup", "thatgirl-challenge", "girlsonly-habits"],
    note: "Très bien couvert. Tu peux produire beaucoup avec ce groupe.",
  },
  {
    id: "C06_POV_RELATABLE",
    name: "POV / identification",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["motion-hope", "medgirl-confidence"],
    note: "À compléter : il faut 1-2 refs plus 'POV girl experience'.",
  },
  {
    id: "C07_MISTAKES",
    name: "Erreurs / choses à éviter",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["thomas-hormone", "siuela-symptoms", "lower-cortisol"],
    note: "OK pour démarrer. Bon modèle éducatif/correction.",
  },
  {
    id: "C08_MY_REALISTIC",
    name: "My realistic…",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["amina-morning-routine", "motion-hope"],
    note: "À compléter avec refs day-in-my-life / realistic night / realistic reset.",
  },
  {
    id: "C09_LIST",
    name: "Liste d’idées / conseils",
    keep: true,
    modelIds: ["grid-2x2", "single-image"],
    refIds: ["navzsm-glowup", "lower-cortisol", "rhea-hormones"],
    note: "Très polyvalent : tips, ideas, foods, habits.",
  },
  {
    id: "C10_BEFORE_AFTER",
    name: "Avant / après comportemental",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["thomas-hormone", "girlsonly-habits"],
    note: "À garder, mais besoin d’1 ref clairement avant/après.",
  },
  {
    id: "C11_HORMONE_EDUCATION",
    name: "Hormone / cortisol education",
    keep: true,
    modelIds: ["grid-2x2", "single-image"],
    refIds: ["thatgirlstore-hormone", "siuela-symptoms", "rhea-hormones", "herfeminineedge-happy-hormones"],
    note: "Ajout recommandé : tes refs actuelles sont fortes ici.",
  },
  {
    id: "C12_NIGHT_ROUTINE",
    name: "Night routine clean girl / low cortisol",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: [],
    note: "À compléter en priorité : idéalement 3 refs night routine / sleep reset.",
  },
  {
    id: "C13_EDUCATIONAL_EXPLAINER",
    name: "Educational wellness explainer",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["lower-cortisol", "rhea-hormones"],
    note: "Explainer bien-être général avec wording prudent et sources si nécessaire.",
  },
  {
    id: "C14_STORY_TRANSFORMATION",
    name: "Story / transformation réaliste",
    keep: true,
    modelIds: ["single-image", "grid-2x2"],
    refIds: ["motion-hope", "girlsonly-habits"],
    note: "Transformation comportementale crédible, sans avant/après médical.",
  },
] as const;

type View = (typeof menus)[number];
type ProductVersion = "current" | "next";
type ModelId = (typeof modelData)[number]["id"];
type LayoutName = keyof typeof layoutSpecs;
type CarouselTypeId = (typeof carouselTypes)[number]["id"];
type DraftPreview = {
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

type AIStatus = {
  configured: boolean; enabled: boolean; primaryModel: string; qaModel: string; qaEnabled: boolean; qaSampleRate: number; monthlyCapUsd: number;
};
type AIUsage = { costUsd: number; calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; monthlyCapUsd: number };
type HealthStatus = {
  ok?: boolean;
  p0Ready?: boolean;
  dryRun: boolean;
  backend?: "supabase" | "convex";
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
type StoredCarousel = {
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
type CalendarEntry = { id: string; account_id: string; account_name: string; persona_id: string; date: string; slot: string; timezone: string; platform: string; status: string; content_type: string; content_type_label: string; topic: string; angle: string; phase: string; source: string };
type CalendarAccount = { id: string; name: string; persona_id: string; timezone: string; enabled: boolean; posting_enabled: boolean; daily_target: number; slots: string[]; entries: CalendarEntry[] };
type CalendarData = { source: string; accounts: CalendarAccount[]; dailyTotals: Array<{ date: string; total: number; byStatus: Record<string, number> }>; summary: { accountCount: number; postsPerDay: number; averagePostsPerDay: number; maxPostsPerDay: number; totalSlots: number; phaseCounts: Record<string, number> } };

function useReferenceFallback(event: React.SyntheticEvent<HTMLImageElement>, seed: string, category = "self care") {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = `/api/assets/fallback?seed=${encodeURIComponent(seed)}&category=${encodeURIComponent(category)}`;
}

const fallbackCategoryByType: Record<CarouselTypeId, string> = {
  C01_MORNING_ROUTINE: "morning", C02_CHECKLIST: "self care", C03_THINGS_I_STOPPED: "self care",
  C04_THINGS_I_STARTED: "self care", C05_GLOW_UP: "self care", C06_POV_RELATABLE: "self care",
  C07_MISTAKES: "self care", C08_MY_REALISTIC: "morning", C09_LIST: "food",
  C10_BEFORE_AFTER: "fitness", C11_HORMONE_EDUCATION: "self care", C12_NIGHT_ROUTINE: "self care",
  C13_EDUCATIONAL_EXPLAINER: "self care", C14_STORY_TRANSFORMATION: "self care",
};

function referenceCopy(title: string, role: string, position: number) {
  if (role === "HOOK") return { kicker: "A SOFTER RESET", headline: title, body: "realistic habits that fit into everyday life" };
  if (role === "CTA") return { kicker: "SAVE FOR LATER", headline: "Choose one habit to start with", body: "small changes are easier to keep" };
  const number = String(position - 1).padStart(2, "0");
  const content: Record<string, [string, string]> = {
    CHECKLIST: ["Make the next hour feel lighter", "Pick one simple action, not a perfect routine."],
    STEP: ["Build a calmer rhythm", "Keep this step realistic enough to repeat tomorrow."],
    FACT: ["Look at the whole routine", "Energy, sleep and stress can have more than one influence."],
    TAKEAWAY: ["Start with what feels manageable", "Consistency matters more than doing everything at once."],
    CONTEXT: ["Notice the pattern without judging it", "Use this as a prompt for reflection, not a diagnosis."],
    TIP: ["Try one low-effort shift", "Create a little more space in your day."],
  };
  const [headline, body] = content[role] ?? content.TIP!;
  return { kicker: `${number} · ${role}`, headline, body };
}

function LayoutMockup({
  layout,
  reference,
  sample,
}: {
  layout: LayoutName;
  reference: { src: string; alt: string };
  sample: (typeof layoutSpecs)[LayoutName]["sample"];
}) {
  return (
    <div className={`layoutMockup ${layout}`} aria-hidden="true">
      {(layout === "grid-2x2" ? [0, 1, 2, 3] : [0]).map((index) => (
        <img
          alt={reference.alt}
          className="mockImage"
          key={index}
          loading="lazy"
          onError={(event) => useReferenceFallback(event, `${reference.alt}-${index}`)}
          src={reference.src}
        />
      ))}
      <div className="mockCopy">
        <small>{layout === "grid-2x2" ? "MOODBOARD · 02" : "EDITORIAL · 01"}</small>
        <strong>{sample.hook}</strong>
        <span>{sample.body}</span>
      </div>
    </div>
  );
}

function ZoneList({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <div className="zoneList">
      <b>{label}</b>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function buildDraftPreview({
  id,
  type,
  model,
  refs,
}: {
  id: string;
  type: (typeof carouselTypes)[number];
  model: (typeof modelData)[number];
  refs: NonNullable<(typeof referenceCarousels)[number]>[];
}): DraftPreview {
  const slideCount = Number.parseInt(model.slides, 10);
  const firstRef = refs[0];
  const refNames = refs.map((ref) => ref.title).join(" / ") || "no reference yet";
  const topicByType: Record<CarouselTypeId, string> = {
    C01_MORNING_ROUTINE: "low cortisol morning routine",
    C02_CHECKLIST: "saveable low-stress checklist",
    C03_THINGS_I_STOPPED: "things I stopped doing for calmer hormones",
    C04_THINGS_I_STARTED: "habits I started for a softer glow-up",
    C05_GLOW_UP: "clean girl glow-up reset",
    C06_POV_RELATABLE: "POV: you are tired of forcing productivity",
    C07_MISTAKES: "mistakes keeping stress high",
    C08_MY_REALISTIC: "my realistic reset routine",
    C09_LIST: "simple low-cortisol ideas",
    C10_BEFORE_AFTER: "before and after nervous-system habits",
    C11_HORMONE_EDUCATION: "hormone and cortisol education",
    C12_NIGHT_ROUTINE: "night routine for lower cortisol",
    C13_EDUCATIONAL_EXPLAINER: "simple wellness education",
    C14_STORY_TRANSFORMATION: "realistic behavior-change story",
  };
  const topic = topicByType[type.id];
  const angle = `${type.name} avec layout ${model.name}, inspiré par ${refNames}.`;
  const headlines = [
    topic,
    model.spec.textZones[0] ?? "main idea",
    "what to show",
    "what to say",
    "why it works",
    "make it saveable",
    "soft CTA",
    "next step",
    "repeatable frame",
    "final reminder",
  ];

  return {
    id,
    typeName: type.name,
    modelName: model.name,
    topic,
    angle,
    caption: `Save this ${type.name.toLowerCase()} for your next calm reset. Built from ${refs.length} visual reference${refs.length > 1 ? "s" : ""}.`,
    source: "fallback",
    model: null,
    generatedAt: new Date().toISOString(),
    warning: "AI generation unavailable - fallback used.",
    saved: false,
    slides: Array.from({ length: slideCount }, (_, index) => ({
      position: index + 1,
      role: index === 0 ? "HOOK" : index === slideCount - 1 ? "CTA" : "TIP",
      headline: headlines[index] ?? `${topic} · ${index + 1}`,
      body: index === 0 ? model.format : `${model.spec.textZones[index % model.spec.textZones.length]} + ${model.spec.imageZones[0]}`,
      asset: firstRef ? `${firstRef.title} · slide ${(index % firstRef.slides.length) + 1}` : "asset à choisir",
      visualIntent: model.spec.bestFor,
    })),
  };
}

export default function Home() {
  const [active, setActive] = useState<View>("Carrousels");
  const [productVersion, setProductVersion] = useState<ProductVersion>("current");
  const [selectedModel, setSelectedModel] = useState<ModelId>("single-image");
  const [selectedType, setSelectedType] = useState<CarouselTypeId>("C05_GLOW_UP");
  const [notice, setNotice] = useState("Vérification de l’infrastructure CortiFree…");
  const [dryRun, setDryRun] = useState<boolean | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [lastDraftId, setLastDraftId] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [referenceIndexes, setReferenceIndexes] = useState<Record<string, number>>({});
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("navzsm-glowup");
  const [language, setLanguage] = useState<"en" | "fr">("en");
  const [market, setMarket] = useState("US");
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsage | null>(null);
  const [hookQuery, setHookQuery] = useState("");
  const [hookCategory, setHookCategory] = useState("All");
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [assetPreviews, setAssetPreviews] = useState<AssetPreview[]>([]);
  const [storedCarousels, setStoredCarousels] = useState<StoredCarousel[]>([]);
  const [carouselsLoading, setCarouselsLoading] = useState(false);
  const [carouselQuery, setCarouselQuery] = useState("");
  const [carouselStatus, setCarouselStatus] = useState("ALL");
  const [openedCarousel, setOpenedCarousel] = useState<StoredCarousel | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [calendarDays, setCalendarDays] = useState(7);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [assetTab, setAssetTab] = useState<AssetTab>("All Assets");
  const [assetQuery, setAssetQuery] = useState("");
  const [referenceCategory, setReferenceCategory] = useState("all");
  const [visualReferences, setVisualReferences] = useState<VisualReferenceSummary[]>([]);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [imageGenerationStatus, setImageGenerationStatus] = useState<ImageGenerationStatus | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imagePersonaId, setImagePersonaId] = useState("P06");
  const [imageReferenceId, setImageReferenceId] = useState("MIRROR_001");
  const [imageScene, setImageScene] = useState("casual mirror selfie");
  const [imageCategory, setImageCategory] = useState("other");
  const [imageFraming, setImageFraming] = useState("");
  const [imageOutfit, setImageOutfit] = useState("");
  const [imageInstructions, setImageInstructions] = useState("");
  const [imageJob, setImageJob] = useState<ImageJob | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchScenes, setBatchScenes] = useState<PersonaScene[]>([]);
  const [batchPersonaIds, setBatchPersonaIds] = useState<string[]>([]);
  const [batchSceneIds, setBatchSceneIds] = useState<string[]>([]);
  const [batchVariations, setBatchVariations] = useState(1);
  const [batchConcurrency, setBatchConcurrency] = useState(1);
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const currentModel = useMemo(
    () => modelData.find((model) => model.id === selectedModel) ?? modelData[0],
    [selectedModel],
  );
  const currentType = useMemo(
    () => carouselTypes.find((type) => type.id === selectedType) ?? carouselTypes[0],
    [selectedType],
  );
  const currentTypeRefs = currentType.refIds
    .map((refId) => referenceCarousels.find((carousel) => carousel.id === refId))
    .filter(Boolean);
  const currentTypeModels = currentType.modelIds
    .map((modelId) => modelData.find((model) => model.id === modelId))
    .filter(Boolean);
  const currentBlueprint = useMemo(() => {
    const allowedIds = new Set<string>(currentType.refIds);
    return carouselBlueprints.find((blueprint) => blueprint.id === selectedBlueprintId && allowedIds.has(blueprint.id))
      ?? carouselBlueprints.find((blueprint) => allowedIds.has(blueprint.id))
      ?? null;
  }, [currentType, selectedBlueprintId]);
  const filteredHooks = useMemo(() => {
    const query = hookQuery.trim().toLowerCase();
    return hookLibrary.filter((hook) =>
      (hookCategory === "All" || hook.category === hookCategory)
      && (!query || hook.text.toLowerCase().includes(query)),
    );
  }, [hookCategory, hookQuery]);
  const filteredCarousels = useMemo(() => {
    const query = carouselQuery.trim().toLowerCase();
    return storedCarousels.filter((carousel) =>
      (carouselStatus === "ALL" || carousel.status === carouselStatus)
      && (!query || `${carousel.id} ${carousel.topic} ${carousel.angle} ${carousel.spec?.hook ?? ""}`.toLowerCase().includes(query)),
    );
  }, [carouselQuery, carouselStatus, storedCarousels]);
  const filteredAssetPreviews = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    const sourceByTab: Partial<Record<AssetTab, string>> = {
      Stock: "stock", "Persona Generated": "persona_generated", Masters: "persona_master",
    };
    const expectedSource = sourceByTab[assetTab];
    return assetPreviews.filter((asset) =>
      (!expectedSource || asset.source_type === expectedSource)
      && (!query || [asset.metadata?.asset_name ?? "", asset.visual_description ?? "", asset.filename, asset.category, asset.subcategory, asset.persona_id ?? "", asset.mood].join(" ").toLowerCase().includes(query)),
    );
  }, [assetPreviews, assetQuery, assetTab]);
  const filteredVisualReferences = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    return visualReferences.filter((reference) =>
      (referenceCategory === "all" || reference.category === referenceCategory)
      && (!query || JSON.stringify(reference).toLowerCase().includes(query)),
    );
  }, [assetQuery, referenceCategory, visualReferences]);
  const selectedImagePersona = personas.find((persona) => persona.id === imagePersonaId) ?? null;
  const selectedImageReference = visualReferences.find((reference) => reference.id === imageReferenceId) ?? null;

  useEffect(() => {
    const saved = window.localStorage.getItem("cortifree-product-version");
    if (saved === "next") setProductVersion("next");
  }, []);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as HealthStatus;
        setHealthStatus(data);
        setDryRun(typeof data.dryRun === "boolean" ? data.dryRun : null);
        if (data.productionReady) {
          setNotice("Production gate READY · infrastructure CortiFree opérationnelle.");
        } else if (!data.backendConfigured) {
          setNotice("BLOCKED · le backend Supabase n’est pas configuré sur ce déploiement.");
        } else if (!data.backendLive) {
          setNotice("BLOCKED · Supabase est configuré mais le ping runtime échoue.");
        } else if (!data.backendDataReady) {
          setNotice("BLOCKED · Supabase répond, mais les données runtime ne sont pas lisibles.");
        } else if (!data.googleSyncConfigured) {
          setNotice("BLOCKED · Google Sheet / Drive sync n’est pas configuré en production.");
        } else {
          const count = data.productionBlockers?.length ?? 0;
          setNotice(`BLOCKED · production gate : ${count} blocker(s). Consulte Settings.`);
        }
      })
      .catch(() => {
        setDryRun(null);
        setNotice("ERREUR · impossible de vérifier l’état de l’infrastructure CortiFree.");
      });
  }, []);

  useEffect(() => {
    if (active !== "Carrousels" || productVersion !== "current") return;
    setCarouselsLoading(true);
    fetch("/api/carousels", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return response.json();
      })
      .then((data) => setStoredCarousels(Array.isArray(data.carousels) ? data.carousels : []))
      .catch(() => setNotice("Impossible de charger les carrousels CortiFree."))
      .finally(() => setCarouselsLoading(false));
  }, [active, productVersion]);

  useEffect(() => {
    if (active !== "Calendar") return;
    setCalendarLoading(true);
    fetch(`/api/calendar?days=${calendarDays}`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(`API ${response.status}`); return response.json(); })
      .then((data) => setCalendarData(data))
      .catch(() => setNotice("Impossible de charger le calendrier détaillé."))
      .finally(() => setCalendarLoading(false));
  }, [active, calendarDays]);

  function changeProductVersion(version: ProductVersion) {
    setProductVersion(version);
    window.localStorage.setItem("cortifree-product-version", version);
    if (version === "current") setActive("Carrousels");
  }

  useEffect(() => {
    if (active !== "Settings") return;
    Promise.all([
      fetch("/api/ai/status", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/ai/usage", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([status, usage]) => {
      setAiStatus(status);
      setAiUsage(usage);
    }).catch(() => setNotice("Impossible de charger le statut OpenAI."));
  }, [active]);

  useEffect(() => {
    if (active !== "Asset library" && active !== "Content studio") return;
    Promise.all([
      fetch("/api/assets", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/personas", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/visual-references", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/image-generation/status", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/image-generation/batch", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([assetData, personaData, referenceData, generationData, batchData]) => {
      if (Array.isArray(assetData.assets)) setAssetGroups(assetData.assets);
      if (Array.isArray(assetData.previews)) setAssetPreviews(assetData.previews);
      if (Array.isArray(personaData.personas)) setPersonas(personaData.personas);
      if (Array.isArray(referenceData.references)) setVisualReferences(referenceData.references);
      setImageGenerationStatus(generationData);
      if (Array.isArray(batchData.scenes)) setBatchScenes(batchData.scenes);
    }).catch(() => setNotice("Impossible de charger l’infrastructure images."));
  }, [active]);

  async function generatePersonaImage() {
    if (imageBusy) return;
    const persona = personas.find((item) => item.id === imagePersonaId);
    if (!persona?.master) { setNotice("Cette persona n’a pas de MASTER indexé."); return; }
    setImageBusy(true);
    setImageJob({ id: "pending", status: "PENDING" });
    try {
      const createResponse = await fetch("/api/image-generation/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: imagePersonaId, master_asset_id: persona.master.id, visual_reference_id: imageReferenceId,
          scene: imageScene, category: imageCategory, framing: imageFraming || undefined, outfit: imageOutfit || undefined,
          prompt_additions: imageInstructions || undefined,
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok) throw new Error(created.error || "Création du job impossible");
      setImageJob(created.job);
      const runResponse = await fetch("/api/image-generation/jobs/" + created.job.id, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }),
      });
      const completed = await runResponse.json();
      if (!runResponse.ok) throw new Error(completed.error || "Génération impossible");
      setImageJob({ ...created.job, status: "DONE", output_asset_id: completed.asset.id });
      setNotice("Image générée, vérifiée et ajoutée à l’Asset Library.");
      const refreshed = await fetch("/api/assets", { cache: "no-store" }).then((response) => response.json());
      if (Array.isArray(refreshed.previews)) setAssetPreviews(refreshed.previews);
    } catch (error) {
      setImageJob((current) => ({ id: current?.id ?? "failed", status: "FAILED", last_error: error instanceof Error ? error.message : String(error) }));
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setImageBusy(false);
    }
  }

  async function createImageBatch() {
    const total = batchPersonaIds.length * batchSceneIds.length * batchVariations;
    if (!batchConfirmed || total < 1 || total > 100 || batchBusy) return;
    setBatchBusy(true);
    try {
      const response = await fetch("/api/image-generation/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_ids: batchPersonaIds, scene_ids: batchSceneIds, variations: batchVariations, max_concurrency: batchConcurrency, confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Création du batch impossible");
      setNotice(`${result.total} jobs image ajoutés à la file. Aucune génération n’a été lancée automatiquement.`);
      setBatchModalOpen(false);
      setBatchConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchBusy(false);
    }
  }

  async function create() {
    if (isCreating) return;

    setIsCreating(true);
    setNotice(`Creation du brouillon ${currentType.id} avec ${currentModel.name}...`);
    const draftId = `CF_${Date.now()}`;
    try {
      const requestedSlideCount = currentBlueprint?.slideCount
        ?? Math.max(4, Math.min(12, Number.parseInt(currentModel.slides, 10)));
      const orderedReferences = currentTypeRefs.slice().sort((a, b) => {
        if (a?.id === currentBlueprint?.id) return -1;
        if (b?.id === currentBlueprint?.id) return 1;
        return 0;
      });
      const response = await fetch("/api/ai/carousel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId,
          accountId: "CF_EN_01",
          personaId: "P01",
          carouselType: currentType.id,
          layout: currentModel.id,
          persona: "P01",
          language,
          market,
          references: orderedReferences.map((reference) => {
            const blueprint = getCarouselBlueprint(reference!.id);
            const isPrimary = blueprint?.id === currentBlueprint?.id;
            return {
            id: reference!.id,
            title: reference!.title,
            slideCount: reference!.slides.length,
            sourceUrl: reference!.sourceUrl,
            notes: `${isPrimary ? "PRIMARY STRUCTURE; " : "Secondary reference; "}${currentType.name}; ${currentModel.format}`,
            templateFamily: blueprint?.family,
            rhythm: blueprint?.rhythm,
            slides: isPrimary ? blueprint?.slides.map((slide) => ({
              position: slide.position,
              role: slide.role,
              imagePlacement: currentModel.layout === "grid-2x2" ? "grid-2x2" : "single-image",
              textPlacement: currentModel.layout === "grid-2x2" ? "center" : "lower-third",
              textAlign: currentModel.layout === "grid-2x2" ? "center" : "left",
            })) : undefined,
          };
          }),
          recentCarousels: [],
          requestedSlideCount,
          preferredHook: selectedHook ?? undefined,
          ctaMode: "save",
        }),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `API ${response.status}`);
      }

      const data = await response.json();
      const spec = data.spec;
      let preview: DraftPreview = {
        id: data.carousel?.id || draftId,
        typeName: currentType.name,
        modelName: currentModel.name,
        topic: spec.topic,
        angle: spec.angle,
        caption: spec.caption,
        source: data.generation.source,
        model: data.generation.model,
        generatedAt: data.generation.generatedAt,
        warning: data.generation.warning || data.storageWarning,
        saved: data.saved,
        slides: spec.slides.map((slide: { position: number; role: string; headline: string; body: string; assetQuery: string; visualIntent: string }) => ({
          position: slide.position, role: slide.role, headline: slide.headline, body: slide.body,
          asset: slide.assetQuery, visualIntent: slide.visualIntent,
        })),
      };
      setLastDraftId(preview.id);
      setDraftPreview(preview);
      setNotice(`${data.generation.source === "openai" ? "Brouillon IA" : "Brouillon fallback"} ${preview.id} créé${data.saved ? ", sélection des images et rendu en cours…" : ""}.`);

      if (data.saved) {
        const renderResponse = await fetch(`/api/carousels/${encodeURIComponent(preview.id)}/render`, { method: "POST" });
        const renderData = await renderResponse.json().catch(() => ({}));
        if (renderResponse.ok && Array.isArray(renderData.slides)) {
          const renderedByPosition = new Map<number, { url: string; assetFilename: string }>(renderData.slides.map((slide: { position: number; url: string; assetFilename: string }) => [slide.position, slide]));
          preview = {
            ...preview,
            slides: preview.slides.map((slide) => {
              const rendered = renderedByPosition.get(slide.position);
              return rendered ? { ...slide, renderUrl: rendered.url, asset: rendered.assetFilename } : slide;
            }),
          };
          setDraftPreview(preview);
          const approvalResponse = await fetch(`/api/carousels/${encodeURIComponent(preview.id)}/approve`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "tiktok" }),
          });
          const approval = await approvalResponse.json().catch(() => ({}));
          preview = { ...preview, approvalStatus: approval.status, publishReady: approval.publishReady };
          setDraftPreview(preview);
          setNotice(approval.contentApproved
            ? `${preview.id} validé : texte OpenAI, ${preview.slides.length} PNG et contrôle pré-publication OK${approval.publishReady ? "." : "; il ne manque que le profil média."}`
            : `${preview.id} rendu, mais le contrôle éditorial demande une correction.`);
        } else {
          preview = { ...preview, warning: [preview.warning, `Rendu non terminé : ${renderData.error ?? `API ${renderResponse.status}`}`].filter(Boolean).join(" · ") };
          setDraftPreview(preview);
          setNotice(`${preview.id} est sauvegardé, mais le rendu PNG doit être relancé.`);
        }
      }

      await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "carousel.create",
          status: "SUCCESS",
          carousel_id: preview.id,
          metadata: { model_id: currentModel.id, carousel_type: currentType.id, blueprint_id: currentBlueprint?.id, generation_source: data.generation.source },
        }),
      });
    } catch (error) {
      setNotice(`Erreur creation brouillon: ${error instanceof Error ? error.message : "inconnue"}.`);
    } finally {
      setIsCreating(false);
    }
  }

  async function generateOneLibraryHook(hook: (typeof hookLibrary)[number], index: number) {
    const plan = getHookGenerationPlan(hook);
    const modelId: ModelId = index % 2 === 0 ? "single-image" : "grid-2x2";
    const model = modelData.find((item) => item.id === modelId) ?? modelData[0];
    const type = carouselTypes.find((item) => item.id === plan.carouselType) ?? carouselTypes[0];
    const refs = type.refIds
      .map((refId) => referenceCarousels.find((carousel) => carousel.id === refId))
      .filter(Boolean);
    const draftId = `CF_HOOK_${hook.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${Date.now().toString().slice(-6)}`;
    const response = await fetch("/api/ai/carousel/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draftId,
        accountId: "CF_EN_01",
        personaId: "P01",
        carouselType: plan.carouselType,
        layout: model.id,
        persona: "P01",
        language,
        market,
        references: refs.slice(0, 3).map((reference) => ({
          id: reference!.id,
          title: reference!.title,
          slideCount: reference!.slides.length,
          sourceUrl: reference!.sourceUrl,
          notes: `Visual reference for ${type.name}; preserve only the editorial rhythm.`,
          templateFamily: getCarouselBlueprint(reference!.id)?.family,
          rhythm: getCarouselBlueprint(reference!.id)?.rhythm,
        })),
        recentCarousels: [],
        requestedSlideCount: plan.requestedSlideCount,
        preferredHook: hook.text,
        ctaMode: "save",
        requireAI: true,
      }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error || `API ${response.status}`);
    }
    const data = await response.json();
    if (!data.saved) throw new Error(data.storageWarning || "Brouillon non sauvegardé dans Supabase");

    const renderResponse = await fetch(`/api/carousels/${encodeURIComponent(data.carousel.id)}/render`, { method: "POST" });
    const renderData = await renderResponse.json().catch(() => ({}));
    if (!renderResponse.ok || !Array.isArray(renderData.slides)) throw new Error(renderData.error || "Rendu PNG impossible");
    const approvalResponse = await fetch(`/api/carousels/${encodeURIComponent(data.carousel.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "tiktok" }),
    });
    const approval = await approvalResponse.json().catch(() => ({}));
    if (!approvalResponse.ok) throw new Error(approval.error || "Validation impossible");
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "hook-library.generate",
        status: "SUCCESS",
        carousel_id: data.carousel.id,
        metadata: { hook_id: hook.id, hook: hook.text, model_id: model.id, carousel_type: plan.carouselType, approval: approval.status },
      }),
    });
    return { id: data.carousel.id, source: data.generation.source, slides: renderData.slides.length };
  }

  async function generateAllHooks() {
    if (isCreating || isBatchGenerating) return;
    setIsBatchGenerating(true);
    setBatchProgress({ done: 0, total: hookLibrary.length, failed: 0 });
    setNotice(`Génération IA de ${hookLibrary.length} carrousels lancée…`);
    let done = 0;
    let failed = 0;
    for (const [index, hook] of hookLibrary.entries()) {
      try {
        const result = await generateOneLibraryHook(hook, index);
        done += 1;
        setNotice(`${done}/${hookLibrary.length} · ${result.id} créé avec « ${hook.text} »`);
      } catch (error) {
        failed += 1;
        setNotice(`${done + failed}/${hookLibrary.length} · hook ignoré : ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
      setBatchProgress({ done, total: hookLibrary.length, failed });
    }
    setIsBatchGenerating(false);
    setNotice(`Génération terminée : ${done} carrousels créés, ${failed} échecs. Les échecs peuvent être relancés.`);
  }

  function pickModel(modelId: ModelId) {
    const model = modelData.find((item) => item.id === modelId);
    setSelectedModel(modelId);
    setActive("Content studio");
    setNotice(`${model?.name ?? "Modele"} selectionne pour le prochain brouillon.`);
  }

  function openType(typeId: CarouselTypeId) {
    const type = carouselTypes.find((item) => item.id === typeId) ?? carouselTypes[0];
    const firstModel = modelData.find((model) => model.id === type.modelIds[0]);
    setSelectedType(type.id);
    if (firstModel) setSelectedModel(firstModel.id);
    setSelectedBlueprintId(type.refIds[0] ?? "");
    setActive("Content studio");
    setNotice(`${type.name} ouvert avec ses références.`);
  }

  function useHook(hook: string) {
    setSelectedHook(hook);
    setActive("Content studio");
    setNotice("Hook sélectionné pour le prochain brouillon.");
  }

  function moveReference(carouselId: string, direction: -1 | 1) {
    const carousel = referenceCarousels.find((item) => item.id === carouselId);
    if (!carousel) return;

    setReferenceIndexes((current) => {
      const index = current[carouselId] ?? 0;
      const next = (index + direction + carousel.slides.length) % carousel.slides.length;
      return { ...current, [carouselId]: next };
    });
  }

  async function refreshCarousels() {
    const response = await fetch("/api/carousels", { cache: "no-store" });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const list = Array.isArray(data.carousels) ? data.carousels : [];
    setStoredCarousels(list);
    if (openedCarousel) setOpenedCarousel(list.find((item: StoredCarousel) => item.id === openedCarousel.id) ?? null);
  }

  async function submitReviewAction(action: "approve" | "reject" | "request-changes") {
    if (!openedCarousel || reviewBusy) return;
    if (action !== "approve" && !reviewFeedback.trim()) {
      setNotice("Ajoute une instruction avant d’envoyer la correction.");
      return;
    }
    setReviewBusy(true);
    try {
      const endpoint = action === "approve" ? "/api/review/approve" : action === "reject" ? "/api/review/reject" : "/api/review/request-changes";
      const body = action === "approve"
        ? { carouselId: openedCarousel.id, actor: "jos" }
        : action === "reject"
          ? { carouselId: openedCarousel.id, reason: reviewFeedback.trim(), actor: "jos" }
          : { carouselId: openedCarousel.id, feedback: reviewFeedback.trim(), actor: "jos" };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `API ${response.status}`);
      setNotice(action === "approve"
        ? `${openedCarousel.id} approuvé · publication prévue dans la fenêtre NYC.`
        : action === "reject"
          ? `${openedCarousel.id} rejeté.`
          : `${openedCarousel.id} · correction ciblée envoyée au worker Railway.`);
      if (action !== "request-changes") setReviewFeedback("");
      await refreshCarousels();
    } catch (error) {
      setNotice(`Review impossible : ${error instanceof Error ? error.message : "erreur inconnue"}.`);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <main className="shell">
      <aside>
        <div className="workspaceSwitcher">
          <div className="brand">
            <span className="mark">CF</span>
            <span>CortiFree</span>
          </div>
          <label htmlFor="workspace-select">Application</label>
          <select aria-label="Application CortiFree" disabled id="workspace-select" value="cortifree">
            <option value="cortifree">CortiFree · Carrousels</option>
          </select>
          <div className="versionSwitch" aria-label="Version de CortiFree" role="group">
            <button className={productVersion === "current" ? "active" : ""} onClick={() => changeProductVersion("current")} type="button">Actuelle</button>
            <button className={productVersion === "next" ? "active" : ""} onClick={() => changeProductVersion("next")} type="button">Nouvelle</button>
          </div>
        </div>

        {productVersion === "current" && <nav aria-label="Main navigation">
          {menus.map((menu) => (
            <button
              key={menu}
              className={active === menu ? "active" : ""}
              onClick={() => setActive(menu)}
              type="button"
            >
              {menu}
            </button>
          ))}
          <Link className="templateLabNav" href="/templates">Template Lab ↗</Link>
        </nav>}

        <div className="account">
          <div className="avatar">CF</div>
          <div>
            <b>CortiFree</b>
            <small>Workspace</small>
          </div>
        </div>
      </aside>

      <section className="content">
        {productVersion === "next" ? (
          <section className="nextVersion">
            <p className="eyebrow">CORTIFREE · NOUVELLE VERSION</p>
            <h1>Un espace neuf, prêt pour ton prochain prompt.</h1>
            <p>Cette version est isolée de l’interface actuelle. Les données CortiFree restent isolées dans Supabase et l’infrastructure dédiée.</p>
            <div className="nextVersionStatus">
              <div><span>Données</span><b>Séparées et conservées</b></div>
              <div><span>Interface</span><b>À définir</b></div>
              <div><span>Publication</span><b>Non activée ici</b></div>
            </div>
            <button className="secondary" onClick={() => changeProductVersion("current")} type="button">Revenir à la version actuelle</button>
          </section>
        ) : <>
        <header>
          <div>
            <p className="eyebrow">CONTENT OPERATIONS</p>
            <h1>{active === "Overview" ? "Choisis un modèle" : active}</h1>
            <p className="muted">{active === "Carrousels" ? "Retrouve tous les carrousels générés et leurs slides finales." : "Sélectionne un type de carrousel, puis ouvre ses références et layouts."}</p>
          </div>
          <button
            className="primary"
            disabled={isCreating}
            onClick={active === "Content studio" ? create : () => setActive("Content studio")}
            type="button"
          >
            {active === "Content studio" ? (isCreating ? "Création..." : "Créer ce brouillon") : "Créer un carrousel"}
          </button>
        </header>

        <div className={`notice ${healthStatus?.productionReady ? "ready" : healthStatus ? "blocked" : "checking"}`}>
          <span className="pulse" />
          {notice}
          <span className="dry">{dryRun === null ? "VERIFICATION" : dryRun ? "DRY RUN" : "MODE REEL"}</span>
        </div>

        {lastDraftId && <div className="draftBadge">Dernier brouillon cree : {lastDraftId}</div>}

        {active === "Carrousels" && (
          <section className="carouselLibrary">
            <div className="librarySummary">
              <div><span>Total</span><b>{storedCarousels.length}</b></div>
              <div><span>Validés</span><b>{storedCarousels.filter((item) => item.status === "APPROVED").length}</b></div>
              <div><span>Prêts à publier</span><b>{storedCarousels.filter((item) => item.spec?.publish_review?.publishReady).length}</b></div>
              <div><span>Avec PNG</span><b>{storedCarousels.filter((item) => item.spec?.rendered_slides?.length).length}</b></div>
            </div>
            <div className="carouselToolbar">
              <label><span>Rechercher</span><input onChange={(event) => setCarouselQuery(event.target.value)} placeholder="Titre, hook ou identifiant" type="search" value={carouselQuery} /></label>
              <label><span>Statut</span><select onChange={(event) => setCarouselStatus(event.target.value)} value={carouselStatus}><option value="ALL">Tous</option><option value="APPROVED">Validés</option><option value="DRAFT">Brouillons</option><option value="READY_FOR_REVIEW">À revoir</option><option value="SCHEDULED">Planifiés</option><option value="PUBLISHED">Publiés</option><option value="FAILED">Échecs</option></select></label>
            </div>
            {carouselsLoading ? <div className="libraryEmpty">Chargement des carrousels…</div> : filteredCarousels.length === 0 ? <div className="libraryEmpty">Aucun carrousel ne correspond à ce filtre.</div> : (
              <div className="carouselGrid">
                {filteredCarousels.map((carousel) => {
                  const cover = carousel.spec?.rendered_slides?.slice().sort((a, b) => a.position - b.position)[0]?.url;
                  const slideCount = carousel.spec?.rendered_slides?.length ?? carousel.spec?.generated_slides?.length ?? 0;
                  return <article className="carouselItem" key={carousel.id}>
                    <button className="carouselCover" onClick={() => setOpenedCarousel(carousel)} type="button">
                      {cover ? <img alt={`Couverture de ${carousel.topic}`} loading="lazy" src={cover} /> : <div className="missingCover"><span>Pas encore rendu</span><b>{carousel.spec?.hook ?? carousel.topic}</b></div>}
                      <span className="slideCount">{slideCount} slides</span>
                    </button>
                    <div className="carouselInfo">
                      <div><span className={`statusTag status-${carousel.status.toLowerCase()}`}>{carousel.status}</span><time>{new Date(carousel.created_at).toLocaleDateString("fr-FR")}</time></div>
                      <h2>{carousel.spec?.hook ?? carousel.topic}</h2>
                      <p>{carousel.topic}</p>
                      <button onClick={() => setOpenedCarousel(carousel)} type="button">Voir les slides</button>
                    </div>
                  </article>;
                })}
              </div>
            )}
          </section>
        )}

        {active === "Content studio" && (
          <section className="referenceBand">
            <div className="panelHead">
              <div>
                <p className="eyebrow">RÉFÉRENCES DU MODÈLE</p>
                <h2>{currentType.name}</h2>
              </div>
              <span className="modelCount">{currentTypeRefs.reduce((total, item) => total + (item?.slides.length ?? 0), 0)} slides analysées</span>
            </div>

            {currentTypeRefs.length ? (
              <>
                <div className="blueprintTabs" role="tablist" aria-label="Choisir la structure source">
                  {currentTypeRefs.map((carousel) => carousel && (
                    <button
                      aria-selected={currentBlueprint?.id === carousel.id}
                      className={currentBlueprint?.id === carousel.id ? "selected" : ""}
                      key={carousel.id}
                      onClick={() => setSelectedBlueprintId(carousel.id)}
                      role="tab"
                      type="button"
                    >
                      <b>{carousel.title}</b>
                      <span>{carousel.slides.length} slides</span>
                    </button>
                  ))}
                </div>

                {currentBlueprint && (() => {
                  const index = referenceIndexes[currentBlueprint.id] ?? 0;
                  const activeSlide = currentBlueprint.slides[index] ?? currentBlueprint.slides[0];
                  const activeCopy = referenceCopy(currentBlueprint.title, activeSlide.role, activeSlide.position);
                  const fallbackCategory = fallbackCategoryByType[currentType.id];
                  return (
                    <article className="blueprintViewer">
                      <div className="blueprintHero">
                        <button aria-label="Slide précédente" onClick={() => moveReference(currentBlueprint.id, -1)} type="button">‹</button>
                        <div className={`phoneFrame large referenceVisual placement-${activeSlide.textPlacement}`}>
                          <img alt={`${currentBlueprint.title} slide ${index + 1}`} onError={(event) => useReferenceFallback(event, `${currentBlueprint.id}-${index + 1}`, fallbackCategory)} referrerPolicy="no-referrer" src={activeSlide.image} />
                          <div className="referenceOverlay">
                            <small>{activeCopy.kicker}</small>
                            <strong>{activeCopy.headline}</strong>
                            <p>{activeCopy.body}</p>
                          </div>
                        </div>
                        <button aria-label="Slide suivante" onClick={() => moveReference(currentBlueprint.id, 1)} type="button">›</button>
                        <div className="blueprintMeta">
                          <p className="eyebrow">STRUCTURE ACTIVE</p>
                          <h3>{currentBlueprint.family}</h3>
                          <p>{currentBlueprint.rhythm}</p>
                          <dl>
                            <div><dt>Slide</dt><dd>{index + 1}/{currentBlueprint.slideCount}</dd></div>
                            <div><dt>Rôle</dt><dd>{activeSlide.role}</dd></div>
                            <div><dt>Image</dt><dd>{activeSlide.imagePlacement}</dd></div>
                            <div><dt>Texte</dt><dd>{activeSlide.textPlacement} · {activeSlide.textAlign}</dd></div>
                          </dl>
                          <a href={currentBlueprint.sourceUrl} rel="noreferrer" target="_blank">Voir la source TikTok ↗</a>
                        </div>
                      </div>

                      <div className="fullSequence" aria-label={`Toutes les slides de ${currentBlueprint.title}`}>
                        {currentBlueprint.slides.map((slide) => {
                          const copy = referenceCopy(currentBlueprint.title, slide.role, slide.position);
                          return (
                          <button
                            className={slide.position === index + 1 ? "active" : ""}
                            key={slide.position}
                            onClick={() => setReferenceIndexes((current) => ({ ...current, [currentBlueprint.id]: slide.position - 1 }))}
                            type="button"
                          >
                            <div className={`sequenceVisual placement-${slide.textPlacement}`}>
                              <img alt={`${currentBlueprint.title} slide ${slide.position}`} loading="lazy" onError={(event) => useReferenceFallback(event, `${currentBlueprint.id}-${slide.position}`, fallbackCategory)} referrerPolicy="no-referrer" src={slide.image} />
                              <div className="referenceOverlay compact"><small>{copy.kicker}</small><strong>{copy.headline}</strong></div>
                            </div>
                            <span>{String(slide.position).padStart(2, "0")} · {slide.role}</span>
                          </button>
                        );})}
                      </div>
                    </article>
                  );
                })()}
              </>
            ) : (
                <div className="emptyRefs">Aucune référence pour ce modèle. Ajoute idéalement 3 carrousels TikTok du même type.</div>
              )}
          </section>
        )}

        {(active === "Overview" || active === "Models") && (
          <section className="typeBand">
            <div className="panelHead">
              <div>
                <p className="eyebrow">CONTENT TYPES</p>
                <h2>Modèles</h2>
              </div>
              <span className="modelCount">clic = voir les carrousels</span>
            </div>

            <div className="typeGrid">
              {carouselTypes.map((type) => {
                const refs = type.refIds
                  .map((refId) => referenceCarousels.find((carousel) => carousel.id === refId))
                  .filter(Boolean);
                const needs = Math.max(0, 3 - refs.length);

                return (
                  <button className={`typeCard ${needs ? "needsRefs" : "readyType"}`} key={type.id} onClick={() => openType(type.id)} type="button">
                    <div className="typeTop">
                      <span>{type.id}</span>
                      <b>{needs ? `+${needs} ref` : "OK"}</b>
                    </div>
                    <h3>{type.name}</h3>
                    <p>{type.note}</p>

                    <div className="typeModels">
                      {type.modelIds.map((modelId) => {
                        const model = modelData.find((item) => item.id === modelId);
                        if (!model) return null;

                        return (
                          <span key={model.id}>
                            {model.name}
                          </span>
                        );
                      })}
                    </div>

                    <div className="typeMeta">
                      <span>{refs.length} refs liées</span>
                      <strong>Ouvrir →</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {active === "Hook library" && (
          <section className="hookLibraryPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">HOOK BANK</p>
                <h2>{hookLibrary.length} hooks prêts à utiliser</h2>
              </div>
              <div className="panelHeadActions">
                {selectedHook && <span className="modelCount">1 hook actif</span>}
                <button className="primary" disabled={isCreating || isBatchGenerating} onClick={generateAllHooks} type="button">
                  {isBatchGenerating ? `Génération ${batchProgress.done}/${batchProgress.total}` : "Générer tous les hooks"}
                </button>
              </div>
            </div>

            {isBatchGenerating && (
              <div className="batchProgress" role="status">
                <div><b>{batchProgress.done}/{batchProgress.total}</b> carrousels générés · {batchProgress.failed} échec{batchProgress.failed > 1 ? "s" : ""}</div>
                <progress max={batchProgress.total} value={batchProgress.done + batchProgress.failed} />
                <small>Chaque hook est envoyé à OpenAI, sauvegardé, rendu en PNG puis validé automatiquement.</small>
              </div>
            )}

            <div className="hookToolbar">
              <label>
                <span>Rechercher</span>
                <input onChange={(event) => setHookQuery(event.target.value)} placeholder="stress, morning, glow up…" type="search" value={hookQuery} />
              </label>
              <label>
                <span>Catégorie</span>
                <select onChange={(event) => setHookCategory(event.target.value)} value={hookCategory}>
                  {hookCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>

            <div className="hookResultsMeta">{filteredHooks.length} résultat{filteredHooks.length > 1 ? "s" : ""}</div>
            <div className="hookGrid">
              {filteredHooks.map((hook) => (
                <article className={selectedHook === hook.text ? "selected" : ""} key={hook.id}>
                  <span>{hook.category}</span>
                  <h3>{hook.text}</h3>
                  <button onClick={() => useHook(hook.text)} type="button">{selectedHook === hook.text ? "Sélectionné ✓" : "Utiliser ce hook"}</button>
                </article>
              ))}
            </div>
          </section>
        )}

        {active === "Asset library" && (
          <div className="stats">
            <div>
              <span>Assets indexes</span>
              <strong>226</strong>
              <em>Drive synchronise</em>
            </div>
            <div>
              <span>Modeles design</span>
              <strong>{modelData.length}</strong>
              <em>Layouts editables</em>
            </div>
            <div>
              <span>Publications</span>
              <strong>0</strong>
              <em>Mode securise actif</em>
            </div>
            <div>
              <span>Comptes connectes</span>
              <strong>1</strong>
              <em>Reseaux a connecter</em>
            </div>
          </div>
        )}

        {active === "Content studio" && (
          <section className="modelsBand">
            <div className="panelHead">
              <div>
                <p className="eyebrow">LAYOUTS RECOMMANDÉS</p>
                <h2>{currentType.id}</h2>
              </div>
              <span className="modelCount">{currentTypeModels.length} layouts</span>
            </div>

            <div className="modelGrid">
              {currentTypeModels.map((model) => {
                if (!model) return null;
                return (
                <button
                  className={`modelCard ${selectedModel === model.id ? "selected" : ""}`}
                  key={model.id}
                  onClick={() => pickModel(model.id)}
                  type="button"
                >
                  <LayoutMockup layout={model.layout} reference={model.reference} sample={model.spec.sample} />
                  <span>{model.slides}</span>
                  <h3>{model.name}</h3>
                  <p>{model.format}</p>
                  <small>{model.spec.bestFor}</small>
                </button>
                );
              })}
            </div>
          </section>
        )}

        {active === "Content studio" && (
          <section className="studioPanel">
            <div>
              <p className="eyebrow">DRAFT BUILDER</p>
              <h2>{currentType.name}</h2>
              <p className="muted">Layout actif : {currentModel.name} · {currentModel.format}</p>
              {currentBlueprint && <p className="structureLock">Structure source : <b>{currentBlueprint.title}</b> · {currentBlueprint.slideCount} slides complètes</p>}
              {selectedHook && (
                <div className="activeHook">
                  <div><span>HOOK ACTIF</span><b>{selectedHook}</b></div>
                  <button aria-label="Retirer le hook" onClick={() => setSelectedHook(null)} type="button">×</button>
                </div>
              )}
            </div>

            <div className="layoutInspector">
              <LayoutMockup
                layout={currentModel.layout}
                reference={currentModel.reference}
                sample={currentModel.spec.sample}
              />
              <div className="layoutZones">
                <p>{currentModel.spec.bestFor}</p>
                <ZoneList label="Images" items={currentModel.spec.imageZones} />
                <ZoneList label="Texte" items={currentModel.spec.textZones} />
              </div>
            </div>

            <label>
              Modele
              <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value as ModelId)}>
                {currentTypeModels.map((model) => {
                  if (!model) return null;
                  return (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                  );
                })}
              </select>
            </label>

            <div className="studioOptions">
              <label>
                Langue
                <select value={language} onChange={(event) => {
                  const nextLanguage = event.target.value as "en" | "fr";
                  setLanguage(nextLanguage);
                  setMarket(nextLanguage === "fr" ? "FR" : "US");
                }}>
                  <option value="en">English (US)</option>
                  <option value="fr">Français</option>
                </select>
              </label>
              <label>
                Marché
                <select value={market} onChange={(event) => setMarket(event.target.value)}>
                  <option value="US">US</option>
                  <option value="FR">France</option>
                  <option value="CA">Canada</option>
                  <option value="UK">UK</option>
                </select>
              </label>
            </div>

            <button className="primary" disabled={isCreating} onClick={create} type="button">
              {isCreating ? "Création..." : "Créer ce brouillon"}
            </button>
          </section>
        )}

        {active === "Content studio" && draftPreview && (
          <section className="draftPreviewPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">BROUILLON CRÉÉ</p>
                <h2>{draftPreview.topic}</h2>
              </div>
              <span className="modelCount">{draftPreview.id}</span>
            </div>

            <div className={`generationBadge ${draftPreview.source}`}>
              <b>{draftPreview.source === "openai" ? "Generated with AI" : "Deterministic fallback"}</b>
              <span>{draftPreview.model ?? "Local generator"} · {new Date(draftPreview.generatedAt).toLocaleString("fr-FR")}</span>
            </div>
            {draftPreview.approvalStatus && (
              <div className={`generationBadge ${draftPreview.approvalStatus === "APPROVED" ? "openai" : "fallback"}`}>
                <b>{draftPreview.approvalStatus === "APPROVED" ? "Contenu validé pour publication" : "Révision nécessaire"}</b>
                <span>{draftPreview.publishReady ? "Upload-Post prêt" : "Profil média Upload-Post à connecter"}</span>
              </div>
            )}
            {draftPreview.warning && <p className="aiWarning">{draftPreview.warning}</p>}

            <div className="draftSummary">
              <div>
                <span>Type</span>
                <b>{draftPreview.typeName}</b>
              </div>
              <div>
                <span>Layout</span>
                <b>{draftPreview.modelName}</b>
              </div>
              <div>
                <span>Slides</span>
                <b>{draftPreview.slides.length}</b>
              </div>
            </div>

            <p className="draftAngle">{draftPreview.angle}</p>
            <p className="draftCaption">{draftPreview.caption}</p>

            <div className="draftSlides">
              {draftPreview.slides.map((slide) => (
                <article key={slide.position}>
                  {slide.renderUrl && <img alt={`Slide ${slide.position} — ${slide.headline}`} loading="lazy" src={slide.renderUrl} />}
                  <span>{String(slide.position).padStart(2, "0")} · {slide.role}</span>
                  <h3>{slide.headline}</h3>
                  <p>{slide.body}</p>
                  <small>{slide.asset}</small>
                  <em>{slide.visualIntent}</em>
                </article>
              ))}
            </div>
          </section>
        )}

        {active === "Content studio" && (
          <section className="imageStudioBar">
            <div>
              <p className="eyebrow">IMAGE</p>
              <h2>Visuels persona</h2>
              <p>Choisis un asset existant ou crée une variation à partir d’un MASTER et d’une référence de scène.</p>
            </div>
            <div className="imageStudioActions">
              <button className="secondary" onClick={() => setActive("Asset library")} type="button">Changer d’asset</button>
              <button className="primary" onClick={() => { setImageJob(null); setImageModalOpen(true); }} type="button">Générer une image</button>
            </div>
          </section>
        )}

        <div className="grid">
          {active === "Asset library" && (
            <section className="panel wide">
              <div className="panelHead">
                <div>
                  <p className="eyebrow">LIBRARY</p>
                  <h2>Asset library</h2>
                </div>
                <button className="batchButton" onClick={() => { setBatchConfirmed(false); setBatchModalOpen(true); }} type="button">Batch personas</button>
              </div>
              <div className="assetTabs" role="tablist" aria-label="Type d’asset">
                {(["All Assets", "Stock", "Persona Generated", "Masters", "Visual References"] as AssetTab[]).map((tab) => (
                  <button aria-selected={assetTab === tab} className={assetTab === tab ? "selected" : ""} key={tab} onClick={() => setAssetTab(tab)} role="tab" type="button">{tab}</button>
                ))}
              </div>
              <div className="assetFilters">
                <label><span>Recherche</span><input onChange={(event) => setAssetQuery(event.target.value)} placeholder="full body mirror casual bedroom" type="search" value={assetQuery} /></label>
                {assetTab === "Visual References" && (
                  <label><span>Catégorie</span><select onChange={(event) => setReferenceCategory(event.target.value)} value={referenceCategory}><option value="all">Toutes</option>{[...new Set(visualReferences.map((reference) => reference.category))].map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label>
                )}
              </div>
              {assetTab !== "Visual References" && (assetTab === "All Assets" || assetTab === "Stock") && <div className="assetList">
                {assetGroups.map(({ category, count }) => (
                  <div className="asset" key={category}>
                    <div className="assetIcon">{category.charAt(0).toUpperCase()}</div>
                    <div className="assetText">
                      <b>{category.replaceAll("_", " ")}</b>
                      <small>Images Drive synchronisées</small>
                    </div>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>}
              {assetTab !== "Visual References" && filteredAssetPreviews.length > 0 && (
                <div className="assetPreviewGrid">
                  {filteredAssetPreviews.map((asset) => (
                    <figure key={asset.id}>
                      <img alt={asset.filename} loading="lazy" src={asset.public_url} />
                      <figcaption>
                        <b>{asset.source_type === "persona_master" ? "MASTER · " : ""}{(asset.metadata?.asset_name || asset.subcategory).replaceAll("_", " ")}</b>
                        <span>{asset.persona_id ? asset.persona_id + " · " : ""}{asset.category.replaceAll("_", " ")} · {asset.orientation} · {asset.framing}</span>
                        {asset.visual_description && <small className="assetSemanticDescription">{asset.visual_description}</small>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {assetTab !== "Visual References" && !filteredAssetPreviews.length && <div className="libraryEmpty">Aucun asset correspondant dans le stockage Supabase.</div>}
              {assetTab === "Visual References" && (
                <div className="visualReferenceGrid">
                  {filteredVisualReferences.map((reference) => (
                    <article key={reference.id}>
                      {reference.thumbnail_url ? <img alt={reference.id} loading="lazy" referrerPolicy="no-referrer" src={reference.thumbnail_url} /> : <div className="referencePlaceholder">Référence URL</div>}
                      <div><span>{reference.category.replaceAll("_", " ")}</span><h3>{reference.id}</h3><p>{reference.pose || reference.environment}</p><small>{reference.framing} · {reference.lighting}</small><a href={reference.source_url ?? "#"} rel="noreferrer" target="_blank">Source Pinterest</a></div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {active === "Calendar" && (
            <section className="panel wide calendarPanel">
              <div className="panelHead">
                <div><p className="eyebrow">PUBLISHING CALENDAR</p><h2>Vue détaillée par compte</h2><p className="muted">Planning canonique de l’onglet 15_CONTENT_CALENDAR : warm-up, jours de repos, horaires New York et montée en cadence sont respectés.</p></div>
                <label className="calendarDays">Horizon
                  <select value={calendarDays} onChange={(event) => setCalendarDays(Number(event.target.value))}><option value={3}>3 jours</option><option value={7}>7 jours</option><option value={14}>14 jours</option></select>
                </label>
              </div>
              {calendarLoading && <div className="libraryEmpty">Chargement du planning…</div>}
              {calendarData && <>
                <div className="calendarSummary">
                  <div><span>Comptes</span><strong>{calendarData.summary.accountCount}</strong></div>
                  <div><span>Moy. posts / jour</span><strong>{calendarData.summary.averagePostsPerDay.toFixed(1)}</strong></div>
                  <div><span>Slots affichés</span><strong>{calendarData.summary.totalSlots}</strong></div>
                  <div><span>Pic journalier</span><strong>{calendarData.summary.maxPostsPerDay}</strong></div>
                </div>
                <div className="calendarDaysStrip">{calendarData.dailyTotals.map((day) => <div key={day.date}><b>{new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</b><strong>{day.total}</strong><small>{Object.entries(day.byStatus).map(([status, count]) => `${status} ${count}`).join(" · ")}</small></div>)}</div>
                <div className="calendarAccounts">
                  {calendarData.accounts.map((account) => <article className="calendarAccount" key={account.id}>
                    <div className="calendarAccountHead"><div><span className="eyebrow">{account.id} · {account.persona_id}</span><h3>{account.name}</h3></div><div className="calendarAccountState"><b>{account.entries.length / Math.max(1, calendarData.dailyTotals.length)} / jour</b><small>{account.timezone} · {account.enabled ? "enabled" : "disabled"}</small></div></div>
                    <div className="calendarTable"><div className="calendarRow calendarHeader"><span>Date</span><span>Heure</span><span>Type de contenu</span><span>Topic / angle</span><span>Statut</span></div>
                      {account.entries.map((entry) => <div className="calendarRow" key={entry.id + entry.date + entry.slot}><span>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span><span>{entry.slot}</span><span><b>{entry.content_type_label}</b><small>{entry.content_type} · {entry.phase}</small></span><span><b>{entry.topic}</b><small>{entry.angle}</small></span><span><i className={`calendarStatus status-${entry.status.toLowerCase()}`}>{entry.status}</i><small>{entry.source}</small></span></div>)}
                    </div>
                  </article>)}
                </div>
              </>}
            </section>
          )}

          {active === "Settings" && (
            <section className="panel wide">
              <p className="eyebrow">CONFIGURATION</p>
              <h2>Integrations</h2>
              <div className="settingsList">
                <span>Vercel frontend ✓</span>
                <span>{healthStatus?.backendConfigured ? `${healthStatus.backend ?? "Supabase"} configuré ✓` : "Backend non configuré ✕"}</span>
                <span>{healthStatus?.backendLive ? "Backend ping ✓" : `Backend ping ✕${healthStatus?.backendError ? ` · ${healthStatus.backendError}` : ""}`}</span>
                <span>{healthStatus?.backendDataReady ? "Données runtime ✓" : `Données runtime ✕${healthStatus?.backendDataError ? ` · ${healthStatus.backendDataError}` : ""}`}</span>
                <span>{healthStatus?.editorialReady ? "Banques éditoriales ✓" : "Banques éditoriales incomplètes"}</span>
                <span>{healthStatus?.googleSyncConfigured ? "Google sync configuré ✓" : "Google sync non configuré ✕"}</span>
                <span>{(healthStatus?.productionChecks?.mappedPublishingAccounts?.length ?? 0) > 0 ? `Upload-Post · ${healthStatus?.productionChecks?.mappedPublishingAccounts?.length} profil(s) ✓` : "Upload-Post non mappé"}</span>
                <span>{healthStatus?.productionReady ? "Production gate READY ✓" : `${healthStatus?.productionBlockers?.length ?? "?"} blocker(s) production`}</span>
                <span>{dryRun === false ? "DRY_RUN désactivé · mode réel" : dryRun === true ? "DRY_RUN actif ✓" : "DRY_RUN inconnu"}</span>
              </div>
              {!healthStatus?.productionReady && (healthStatus?.productionBlockers?.length ?? 0) > 0 && (
                <div className="libraryEmpty">Blockers : {healthStatus!.productionBlockers!.join(" · ")}</div>
              )}
              <div className="openaiSettings">
                <div className="panelHead">
                  <div>
                    <p className="eyebrow">OPENAI</p>
                    <h3>{aiStatus ? (aiStatus.configured ? "Configured ✓" : "Not configured") : "Chargement…"}</h3>
                  </div>
                  <span className={`aiState ${aiStatus?.configured && aiStatus.enabled ? "ready" : "off"}`}>
                    {aiStatus?.configured && aiStatus.enabled ? "ACTIVE" : "FALLBACK"}
                  </span>
                </div>
                {aiStatus && (
                  <div className="aiConfigGrid">
                    <div><span>Primary model</span><b>{aiStatus.primaryModel}</b></div>
                    <div><span>QA model</span><b>{aiStatus.qaModel}</b></div>
                    <div><span>AI generation</span><b>{aiStatus.enabled ? "Enabled" : "Disabled"}</b></div>
                    <div><span>QA sampling</span><b>{aiStatus.qaEnabled ? `${Math.round(aiStatus.qaSampleRate * 100)}%` : "Disabled"}</b></div>
                  </div>
                )}
                {aiUsage && (
                  <div className="usageBlock">
                    <div><span>Usage ce mois</span><strong>${aiUsage.costUsd.toFixed(4)} / ${aiUsage.monthlyCapUsd.toFixed(2)}</strong></div>
                    <div><span>Calls</span><strong>{aiUsage.calls}</strong></div>
                    <div><span>Input tokens</span><strong>{aiUsage.inputTokens.toLocaleString()}</strong></div>
                    <div><span>Output tokens</span><strong>{aiUsage.outputTokens.toLocaleString()}</strong></div>
                  </div>
                )}
                <p className="keyPrivacy">La clé API reste côté serveur et n’est jamais affichée ici.</p>
              </div>
            </section>
          )}
        </div>
        {openedCarousel && (
          <div className="carouselModal" onClick={() => setOpenedCarousel(null)} role="presentation">
            <section aria-label={`Aperçu de ${openedCarousel.topic}`} aria-modal="true" className="carouselModalPanel" onClick={(event) => event.stopPropagation()} role="dialog">
              <div className="modalHead"><div><p className="eyebrow">{openedCarousel.id}</p><h2>{openedCarousel.spec?.hook ?? openedCarousel.topic}</h2></div><button aria-label="Fermer" onClick={() => setOpenedCarousel(null)} type="button">×</button></div>
              <div className="modalMeta"><span className={`statusTag status-${openedCarousel.status.toLowerCase()}`}>{openedCarousel.review_status ?? openedCarousel.status}</span><span>v{openedCarousel.current_version ?? 1}</span><span>{openedCarousel.spec?.model_id ?? "Layout inconnu"}</span><span>{openedCarousel.language.toUpperCase()}</span></div>
              <div className="modalSlides">
                {(openedCarousel.spec?.rendered_slides ?? []).slice().sort((a, b) => a.position - b.position).map((slide) => <figure key={slide.position}><img alt={`Slide ${slide.position}`} src={slide.url} /><figcaption>{slide.position}</figcaption></figure>)}
              </div>
              {!openedCarousel.spec?.rendered_slides?.length && <div className="libraryEmpty">Ce brouillon n’a pas encore de PNG rendu.</div>}
              <div className="modalCaption"><b>Légende</b><p>{openedCarousel.caption}</p></div>
              <div className="reviewPanel">
                <div className="reviewPanelHead">
                  <div><b>Human approval</b><span>{openedCarousel.revision_count ?? 0} correction(s)</span></div>
                  {openedCarousel.scheduled_for && <small>Prévu : {new Date(openedCarousel.scheduled_for).toLocaleString("fr-FR", { timeZone: "America/New_York" })} NYC</small>}
                </div>
                <textarea
                  disabled={reviewBusy}
                  onChange={(event) => setReviewFeedback(event.target.value)}
                  placeholder="Ex: slide 2 plus punchy, garde le reste. Change seulement l’image de la slide 4 pour une scène bedroom journaling."
                  rows={4}
                  value={reviewFeedback}
                />
                <div className="reviewActions">
                  <button className="primary" disabled={reviewBusy} onClick={() => submitReviewAction("approve")} type="button">{reviewBusy ? "Traitement…" : "Approve"}</button>
                  <button disabled={reviewBusy || !reviewFeedback.trim()} onClick={() => submitReviewAction("request-changes")} type="button">Request changes</button>
                  <button disabled={reviewBusy || !reviewFeedback.trim()} onClick={() => submitReviewAction("reject")} type="button">Reject</button>
                </div>
                <small>Les corrections sont ciblées : les slides non visées restent inchangées.</small>
              </div>
            </section>
          </div>
        )}
        {imageModalOpen && (
          <div className="carouselModal" onClick={() => setImageModalOpen(false)} role="presentation">
            <section aria-label="Générer une image persona" aria-modal="true" className="imageGeneratorModal" onClick={(event) => event.stopPropagation()} role="dialog">
              <div className="modalHead"><div><p className="eyebrow">PERSONA IMAGE GENERATOR</p><h2>MASTER + référence de scène</h2></div><button aria-label="Fermer" onClick={() => setImageModalOpen(false)} type="button">×</button></div>
              <div className="identityEquation">
                <figure>{selectedImagePersona?.master?.public_url ? <img alt={"MASTER " + selectedImagePersona.name} src={selectedImagePersona.master.public_url} /> : <div className="referencePlaceholder">MASTER manquant</div>}<figcaption><b>WHO</b><span>{selectedImagePersona?.name ?? imagePersonaId}</span></figcaption></figure>
                <strong>+</strong>
                <figure>{selectedImageReference?.thumbnail_url ? <img alt={selectedImageReference.id} referrerPolicy="no-referrer" src={selectedImageReference.thumbnail_url} /> : <div className="referencePlaceholder">Image à importer</div>}<figcaption><b>HOW + WHERE</b><span>{selectedImageReference?.id ?? imageReferenceId}</span></figcaption></figure>
              </div>
              <div className="imageGeneratorFields">
                <label><span>Persona</span><select onChange={(event) => setImagePersonaId(event.target.value)} value={imagePersonaId}>{personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.id} · {persona.name}{persona.ready ? "" : " · MASTER non indexé"}</option>)}</select></label>
                <label><span>Scène</span><input onChange={(event) => setImageScene(event.target.value)} value={imageScene} /></label>
                <label><span>Catégorie</span><select onChange={(event) => setImageCategory(event.target.value)} value={imageCategory}><option value="other">Other</option><option value="home">Home</option><option value="fitness">Fitness</option><option value="outdoors">Outdoors</option><option value="self_care">Self care</option><option value="food">Food</option><option value="work_study">Work / Study</option></select></label>
                <label><span>Référence visuelle</span><select onChange={(event) => setImageReferenceId(event.target.value)} value={imageReferenceId}>{visualReferences.map((reference) => <option key={reference.id} value={reference.id}>{reference.id} · {reference.category.replaceAll("_", " ")}</option>)}</select></label>
                <label><span>Cadrage</span><input onChange={(event) => setImageFraming(event.target.value)} placeholder={selectedImageReference?.framing || "full body"} value={imageFraming} /></label>
                <label><span>Tenue</span><input onChange={(event) => setImageOutfit(event.target.value)} placeholder={selectedImageReference?.outfit || "casual neutral"} value={imageOutfit} /></label>
                <label className="full"><span>Instructions additionnelles</span><textarea onChange={(event) => setImageInstructions(event.target.value)} placeholder="Détails optionnels, sans changer l’identité du MASTER" value={imageInstructions} /></label>
              </div>
              <div className="generationReadiness">
                <span className={imageGenerationStatus?.enabled && imageGenerationStatus?.configured ? "ready" : "off"}>{imageGenerationStatus?.enabled && imageGenerationStatus?.configured ? "Seedream prêt" : "Seedream désactivé"}</span>
                <small>{imageGenerationStatus?.model ?? "MODELARK_MODEL_ID absent"} · {imageGenerationStatus?.usage.images ?? 0} image(s) ce mois</small>
              </div>
              {imageJob && <div className={"jobState state-" + imageJob.status.toLowerCase()}><b>{imageJob.status}</b><span>{imageJob.last_error ?? (imageJob.status === "DONE" ? "Nouvel asset ajouté à la bibliothèque" : "Traitement du job")}</span></div>}
              <div className="modalActions">
                <button className="ghost" onClick={() => setImageReferenceId(visualReferences[(Math.max(0, visualReferences.findIndex((item) => item.id === imageReferenceId)) + 1) % Math.max(visualReferences.length, 1)]?.id ?? imageReferenceId)} type="button">Changer de référence</button>
                <button className="primary" disabled={imageBusy || !selectedImagePersona?.master || !selectedImageReference} onClick={generatePersonaImage} type="button">{imageBusy ? "Génération…" : imageJob?.status === "DONE" ? "Régénérer" : "Générer l’image"}</button>
              </div>
            </section>
          </div>
        )}
        {batchModalOpen && (
          <div className="carouselModal" onClick={() => setBatchModalOpen(false)} role="presentation">
            <section aria-label="Générateur batch de personas" aria-modal="true" className="imageGeneratorModal batchGeneratorModal" onClick={(event) => event.stopPropagation()} role="dialog">
              <div className="modalHead"><div><p className="eyebrow">PERSONA IMAGE GENERATOR</p><h2>Créer un batch contrôlé</h2></div><button aria-label="Fermer" onClick={() => setBatchModalOpen(false)} type="button">×</button></div>
              <div className="batchColumns">
                <fieldset><legend>Personas</legend><div className="batchChecks">{personas.map((persona) => <label key={persona.id}><input checked={batchPersonaIds.includes(persona.id)} disabled={!persona.ready} onChange={(event) => setBatchPersonaIds((current) => event.target.checked ? [...current, persona.id] : current.filter((id) => id !== persona.id))} type="checkbox" /><span>{persona.id} · {persona.name}{persona.ready ? "" : " · MASTER absent"}</span></label>)}</div></fieldset>
                <fieldset><legend>Scènes</legend><div className="batchChecks">{batchScenes.map((scene) => <label key={scene.id}><input checked={batchSceneIds.includes(scene.id)} onChange={(event) => setBatchSceneIds((current) => event.target.checked ? [...current, scene.id] : current.filter((id) => id !== scene.id))} type="checkbox" /><span>{scene.id.replaceAll("_", " ")}</span></label>)}</div></fieldset>
              </div>
              <div className="batchControls">
                <label><span>Variations</span><select onChange={(event) => setBatchVariations(Number(event.target.value))} value={batchVariations}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
                <label><span>Concurrence demandée</span><select onChange={(event) => setBatchConcurrency(Number(event.target.value))} value={batchConcurrency}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
              </div>
              <div className="batchEstimate"><div><span>Personas</span><b>{batchPersonaIds.length}</b></div><div><span>Scènes</span><b>{batchSceneIds.length}</b></div><div><span>Total</span><b>{batchPersonaIds.length * batchSceneIds.length * batchVariations}</b></div><div><span>Coût estimé</span><b>${((imageGenerationStatus?.unitCostUsd ?? 0) * batchPersonaIds.length * batchSceneIds.length * batchVariations).toFixed(2)}</b></div></div>
              <label className="batchConfirmation"><input checked={batchConfirmed} onChange={(event) => setBatchConfirmed(event.target.checked)} type="checkbox" /><span>Je confirme la création de ces jobs. Ils resteront en attente et ne seront pas exécutés automatiquement.</span></label>
              <div className="modalActions"><button className="ghost" onClick={() => setBatchModalOpen(false)} type="button">Annuler</button><button className="primary" disabled={batchBusy || !batchConfirmed || batchPersonaIds.length * batchSceneIds.length * batchVariations < 1 || batchPersonaIds.length * batchSceneIds.length * batchVariations > 100} onClick={createImageBatch} type="button">{batchBusy ? "Création…" : "Ajouter à la file"}</button></div>
            </section>
          </div>
        )}
        </>}
      </section>
    </main>
  );
}
