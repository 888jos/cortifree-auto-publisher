"use client";

import { useEffect, useMemo, useState } from "react";
import { referenceCarousels } from "./reference-carousels.js";
import { carouselBlueprints, getCarouselBlueprint } from "./carousel-blueprints.js";
import { hookCategories, hookLibrary } from "./hook-library.js";

const assets = [
  ["fitness", 47],
  ["food", 50],
  ["morning", 50],
  ["self care", 45],
  ["work / study", 34],
] as const;

type AssetGroup = { category: string; count: number };
type AssetPreview = { id: string | number; category: string; subcategory: string; filename: string; orientation: string; framing: string; mood: string; public_url: string };

const menus = ["Overview", "Content studio", "Models", "Hook library", "Asset library", "Calendar", "Settings"] as const;

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
    id: "cover-hero",
    name: "Cover hero",
    format: "Full image -> title block -> save CTA",
    slides: "6 slides",
    style: "Large photo, short hook, bottom caption block",
    layout: "hero",
  },
  {
    id: "split-proof",
    name: "Split proof",
    format: "Claim -> image proof -> quick takeaway",
    slides: "5 slides",
    style: "Image left, text right, bold contrast label",
    layout: "split",
  },
  {
    id: "numbered-stack",
    name: "Numbered stack",
    format: "Hook -> 3-5 numbered points -> CTA",
    slides: "7 slides",
    style: "Huge numbers, compact copy, repeated rhythm",
    layout: "numbered",
  },
  {
    id: "checklist-grid",
    name: "Checklist grid",
    format: "Problem -> checklist -> correction",
    slides: "6 slides",
    style: "Checkbox rows, small icons, high clarity",
    layout: "checklist",
  },
  {
    id: "before-after",
    name: "Before / after",
    format: "Before -> switch -> after -> next step",
    slides: "6 slides",
    style: "Two panels, sharp labels, transformation frame",
    layout: "compare",
  },
  {
    id: "quote-pause",
    name: "Quote pause",
    format: "Statement -> pause slide -> reflection",
    slides: "4 slides",
    style: "Minimal image, centered line, premium spacing",
    layout: "quote",
  },
  {
    id: "routine-cards",
    name: "Routine cards",
    format: "Routine hook -> time blocks -> habit stack",
    slides: "8 slides",
    style: "Stacked cards, time pill, step hierarchy",
    layout: "cards",
  },
  {
    id: "myth-fact",
    name: "Myth / fact",
    format: "Myth -> fact -> why -> action",
    slides: "5 slides",
    style: "Big red/green labels, punchy educational copy",
    layout: "myth",
  },
  {
    id: "mistake-fix",
    name: "Mistake fix",
    format: "Mistake -> consequence -> fix",
    slides: "6 slides",
    style: "Bad/good contrast, arrows, direct correction",
    layout: "fix",
  },
  {
    id: "challenge-days",
    name: "Challenge days",
    format: "Promise -> day cards -> progress CTA",
    slides: "10 slides",
    style: "Daily badges, repeated template, follow-through",
    layout: "challenge",
  },
  {
    id: "symptom-map",
    name: "Symptom map",
    format: "Signs -> meaning -> gentle reframe",
    slides: "7 slides",
    style: "Grouped bubbles, educational but calm",
    layout: "bubbles",
  },
  {
    id: "recipe-flow",
    name: "Recipe flow",
    format: "Result -> ingredients -> steps -> serving",
    slides: "8 slides",
    style: "Food image frame, ingredient chips, simple steps",
    layout: "recipe",
  },
] as const;

const layoutSpecs = {
  hero: {
    bestFor: "Cover forte, accroche courte, image pleine page",
    imageZones: ["Background 9:16"],
    textZones: ["Hook grand format", "Sous-titre court", "CTA save/comment"],
    sample: { hook: "reset your cortisol gently", body: "3 tiny shifts for a calmer day", cta: "save" },
  },
  split: {
    bestFor: "Preuve visuelle + explication courte",
    imageZones: ["Colonne image 45%"],
    textZones: ["Claim", "Takeaway", "Micro note"],
    sample: { hook: "your body is asking for rest", body: "proof / symptom / quick fix", cta: "try" },
  },
  numbered: {
    bestFor: "Tips numérotés faciles à swiper",
    imageZones: ["Image d’ambiance légère"],
    textZones: ["Numéro XXL", "Titre", "1 conseil par slide"],
    sample: { hook: "01", body: "morning light before coffee", cta: "next" },
  },
  checklist: {
    bestFor: "Listes sauvegardables et routines",
    imageZones: ["Petit visuel haut/bas"],
    textZones: ["Titre", "Checklist 3-5 items", "Correction"],
    sample: { hook: "low stress checklist", body: "☑ protein  ☑ walk  ☑ no rush", cta: "save" },
  },
  compare: {
    bestFor: "Avant / après, erreur / correction",
    imageZones: ["Deux panneaux visuels"],
    textZones: ["Before label", "After label", "Conclusion"],
    sample: { hook: "before", body: "after", cta: "shift" },
  },
  quote: {
    bestFor: "Pause émotionnelle, slide minimaliste",
    imageZones: ["Texture/image douce optionnelle"],
    textZones: ["Phrase centrale", "Reflection", "Signature"],
    sample: { hook: "you don’t need to earn rest", body: "read that again", cta: "breathe" },
  },
  cards: {
    bestFor: "Routine par horaires ou blocs",
    imageZones: ["Fond lifestyle doux"],
    textZones: ["Time pill", "Cartes étapes", "Habit stack"],
    sample: { hook: "7:30", body: "water · sunlight · protein", cta: "routine" },
  },
  myth: {
    bestFor: "Éducatif punchy : mythe vs réalité",
    imageZones: ["Visuel preuve / portrait"],
    textZones: ["MYTH badge", "FACT block", "Why"],
    sample: { hook: "myth", body: "you need a perfect routine", cta: "fact" },
  },
  fix: {
    bestFor: "Erreur courante puis correction directe",
    imageZones: ["Image contexte"],
    textZones: ["Mistake", "Arrow", "Fix"],
    sample: { hook: "stop doing this", body: "switch to this instead", cta: "fix" },
  },
  challenge: {
    bestFor: "Séries 5-10 jours, progression visible",
    imageZones: ["Background ou vignette"],
    textZones: ["Day badge", "Action du jour", "Progression"],
    sample: { hook: "day 03", body: "10 min walk after lunch", cta: "go" },
  },
  bubbles: {
    bestFor: "Symptômes / signaux regroupés",
    imageZones: ["Fond clean, image secondaire"],
    textZones: ["Bubbles", "Reframe", "Gentle action"],
    sample: { hook: "signs", body: "tired · cravings · wired", cta: "support" },
  },
  recipe: {
    bestFor: "Food carousel : résultat + ingrédients + étapes",
    imageZones: ["Photo food dominante"],
    textZones: ["Ingredient chips", "Steps", "Serving note"],
    sample: { hook: "cortisol-friendly bowl", body: "eggs · avocado · greens", cta: "recipe" },
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
    modelIds: ["routine-cards", "cover-hero"],
    refIds: ["amina-morning-routine", "thatgirl-challenge", "girlsonly-habits"],
    note: "Bon type pilier : parfait pour routines matin, clean girl, low cortisol.",
  },
  {
    id: "C02_CHECKLIST",
    name: "Checklist à sauvegarder",
    keep: true,
    modelIds: ["checklist-grid", "numbered-stack"],
    refIds: ["lower-cortisol", "siuela-symptoms", "thatgirlstore-hormone"],
    note: "Très bon format saveable. 3 refs déjà utilisables.",
  },
  {
    id: "C03_THINGS_I_STOPPED",
    name: "Things I stopped doing",
    keep: true,
    modelIds: ["mistake-fix", "before-after"],
    refIds: ["thomas-hormone", "siuela-symptoms"],
    note: "À garder, mais il manque 1 référence très typée stop/avoid.",
  },
  {
    id: "C04_THINGS_I_STARTED",
    name: "Habits I started",
    keep: true,
    modelIds: ["numbered-stack", "routine-cards"],
    refIds: ["girlsonly-habits", "rhea-hormones", "herfeminineedge-happy-hormones"],
    note: "Bon overlap avec glow-up + hormones.",
  },
  {
    id: "C05_GLOW_UP",
    name: "Glow-up / transformation",
    keep: true,
    modelIds: ["cover-hero", "challenge-days", "numbered-stack"],
    refIds: ["navzsm-glowup", "thatgirl-challenge", "girlsonly-habits"],
    note: "Très bien couvert. Tu peux produire beaucoup avec ce groupe.",
  },
  {
    id: "C06_POV_RELATABLE",
    name: "POV / identification",
    keep: true,
    modelIds: ["quote-pause", "cover-hero"],
    refIds: ["motion-hope", "medgirl-confidence"],
    note: "À compléter : il faut 1-2 refs plus 'POV girl experience'.",
  },
  {
    id: "C07_MISTAKES",
    name: "Erreurs / choses à éviter",
    keep: true,
    modelIds: ["mistake-fix", "myth-fact"],
    refIds: ["thomas-hormone", "siuela-symptoms", "lower-cortisol"],
    note: "OK pour démarrer. Bon modèle éducatif/correction.",
  },
  {
    id: "C08_MY_REALISTIC",
    name: "My realistic…",
    keep: true,
    modelIds: ["routine-cards", "quote-pause"],
    refIds: ["amina-morning-routine", "motion-hope"],
    note: "À compléter avec refs day-in-my-life / realistic night / realistic reset.",
  },
  {
    id: "C09_LIST",
    name: "Liste d’idées / conseils",
    keep: true,
    modelIds: ["numbered-stack", "checklist-grid"],
    refIds: ["navzsm-glowup", "lower-cortisol", "rhea-hormones"],
    note: "Très polyvalent : tips, ideas, foods, habits.",
  },
  {
    id: "C10_BEFORE_AFTER",
    name: "Avant / après comportemental",
    keep: true,
    modelIds: ["before-after", "mistake-fix"],
    refIds: ["thomas-hormone", "girlsonly-habits"],
    note: "À garder, mais besoin d’1 ref clairement avant/après.",
  },
  {
    id: "C11_HORMONE_EDUCATION",
    name: "Hormone / cortisol education",
    keep: true,
    modelIds: ["symptom-map", "myth-fact", "split-proof"],
    refIds: ["thatgirlstore-hormone", "siuela-symptoms", "rhea-hormones", "herfeminineedge-happy-hormones"],
    note: "Ajout recommandé : tes refs actuelles sont fortes ici.",
  },
  {
    id: "C12_NIGHT_ROUTINE",
    name: "Night routine clean girl / low cortisol",
    keep: true,
    modelIds: ["routine-cards", "quote-pause"],
    refIds: [],
    note: "À compléter en priorité : idéalement 3 refs night routine / sleep reset.",
  },
] as const;

type View = (typeof menus)[number];
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
  slides: { position: number; role: string; headline: string; body: string; asset: string; visualIntent: string; renderUrl?: string }[];
};

type AIStatus = {
  configured: boolean; enabled: boolean; primaryModel: string; qaModel: string; qaEnabled: boolean; qaSampleRate: number; monthlyCapUsd: number;
};
type AIUsage = { costUsd: number; calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; monthlyCapUsd: number };

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
      <img
        alt={reference.alt}
        className="mockImage"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
        src={reference.src}
      />
      <div className="mockScrim" />
      <div className="mockBadge">{sample.cta}</div>
      <div className="mockHook">{sample.hook}</div>
      <div className="mockBody">{sample.body}</div>
      <div className="mockLine one" />
      <div className="mockLine two" />
      <div className="mockDot a" />
      <div className="mockDot b" />
      <div className="mockDot c" />
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
  const [active, setActive] = useState<View>("Overview");
  const [selectedModel, setSelectedModel] = useState<ModelId>("cover-hero");
  const [selectedType, setSelectedType] = useState<CarouselTypeId>("C05_GLOW_UP");
  const [notice, setNotice] = useState("Systeme operationnel");
  const [isCreating, setIsCreating] = useState(false);
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
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>(assets.map(([category, count]) => ({ category, count })));
  const [assetPreviews, setAssetPreviews] = useState<AssetPreview[]>([]);

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
    if (active !== "Asset library") return;
    fetch("/api/assets", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (Array.isArray(data.assets)) setAssetGroups(data.assets);
      if (Array.isArray(data.previews)) setAssetPreviews(data.previews);
    }).catch(() => setNotice("Impossible de charger le catalogue d’images."));
  }, [active]);

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
              imagePlacement: slide.imagePlacement,
              textPlacement: slide.textPlacement,
              textAlign: slide.textAlign,
              geometry: slide.geometry,
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
          setNotice(`${preview.id} créé, images Drive sélectionnées et ${preview.slides.length} PNG sauvegardés.`);
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

  return (
    <main className="shell">
      <aside>
        <div className="brand">
          <span className="mark">CF</span>
          <span>CortiFree</span>
        </div>

        <nav aria-label="Main navigation">
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
        </nav>

        <div className="account">
          <div className="avatar">CF</div>
          <div>
            <b>CortiFree</b>
            <small>Workspace</small>
          </div>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">CONTENT OPERATIONS</p>
            <h1>{active === "Overview" ? "Choisis un modèle" : active}</h1>
            <p className="muted">Sélectionne un type de carrousel, puis ouvre ses références et layouts.</p>
          </div>
          <button
            className="primary"
            disabled={isCreating}
            onClick={active === "Content studio" ? create : () => setActive("Models")}
            type="button"
          >
            {active === "Content studio" ? (isCreating ? "Création..." : "Créer ce brouillon") : "Voir modèles"}
          </button>
        </header>

        <div className="notice">
          <span className="pulse" />
          {notice}
          <span className="dry">DRY RUN</span>
        </div>

        {lastDraftId && <div className="draftBadge">Dernier brouillon cree : {lastDraftId}</div>}

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
                  return (
                    <article className="blueprintViewer">
                      <div className="blueprintHero">
                        <button aria-label="Slide précédente" onClick={() => moveReference(currentBlueprint.id, -1)} type="button">‹</button>
                        <div className="phoneFrame large">
                          <img alt={`${currentBlueprint.title} slide ${index + 1}`} src={activeSlide.image} />
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
                        {currentBlueprint.slides.map((slide) => (
                          <button
                            className={slide.position === index + 1 ? "active" : ""}
                            key={slide.position}
                            onClick={() => setReferenceIndexes((current) => ({ ...current, [currentBlueprint.id]: slide.position - 1 }))}
                            type="button"
                          >
                            <img alt={`${currentBlueprint.title} slide ${slide.position}`} loading="lazy" src={slide.image} />
                            <span>{String(slide.position).padStart(2, "0")} · {slide.role}</span>
                          </button>
                        ))}
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
              {selectedHook && <span className="modelCount">1 hook actif</span>}
            </div>

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

        <div className="grid">
          {active === "Asset library" && (
            <section className="panel wide">
              <div className="panelHead">
                <div>
                  <p className="eyebrow">LIBRARY</p>
                  <h2>Asset library</h2>
                </div>
                <button className="ghost" onClick={() => setActive("Asset library")} type="button">
                  Voir tout
                </button>
              </div>
              <div className="assetList">
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
              </div>
              {assetPreviews.length > 0 && (
                <div className="assetPreviewGrid">
                  {assetPreviews.map((asset) => (
                    <figure key={asset.id}>
                      <img alt={asset.filename} loading="lazy" src={asset.public_url} />
                      <figcaption><b>{asset.subcategory.replaceAll("_", " ")}</b><span>{asset.category.replaceAll("_", " ")} · {asset.orientation} · {asset.framing}</span></figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          )}

          {active === "Calendar" && (
            <section className="panel">
              <p className="eyebrow">NEXT ACTION</p>
              <h2>Golden carousel</h2>
              <p className="muted">Cree un brouillon, valide-le, puis branche Upload-Post quand tes comptes media sont prets.</p>
              <div className="progress">
                <span />
              </div>
              <small>7 slides · 1080 x 1350</small>
              <button className="secondary" onClick={() => setActive("Content studio")} type="button">
                Ouvrir le studio
              </button>
            </section>
          )}

          {active === "Settings" && (
            <section className="panel wide">
              <p className="eyebrow">CONFIGURATION</p>
              <h2>Integrations</h2>
              <div className="settingsList">
                <span>Supabase connecte</span>
                <span>Upload-Post configure</span>
                <span>DRY_RUN actif</span>
              </div>
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
      </section>
    </main>
  );
}
