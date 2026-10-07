// Static Studio data: navigation, the F01–F08 formats and the editorial concepts.

export const menus = ["Carrousels", "Edit", "Overview", "Content studio", "Formats", "Hook library", "Asset library", "Calendar", "Settings"] as const;
export const referenceImages = [
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

export const rawModels = [
  { id: "F01_LIFESTYLE_GUIDE", name: "F01 · Lifestyle 3-Stack", format: "Lifestyle guide · 3 stacked photos", slides: "6 slides", style: "Photo-first, human, fast saveable tips", layout: "lifestyle-3stack" },
  { id: "F02_EDITORIAL_COLLAGE", name: "F02 · Editorial Collage", format: "Asymmetric editorial collage", slides: "6 slides", style: "Editorial, premium, asymmetric image rhythm", layout: "editorial-asym-hero" },
  { id: "F03_ROUTINE_TIMELINE", name: "F03 · Routine Timeline", format: "Full photo + timed routine steps", slides: "6 slides", style: "Morning, night and day-in-life routines", layout: "routine-timeline" },
  { id: "F04_AESTHETIC_EDUCATIONAL", name: "F04 · Aesthetic Educational", format: "3-image educational board", slides: "6 slides", style: "Visual education, compact explanations", layout: "three-rect-educational" },
  { id: "F05_INTERACTIVE_CHECKLIST", name: "F05 · Notes Master List", format: "Notes card over lifestyle photo", slides: "6 slides", style: "Saveable lists and checklists", layout: "interactive-checklist" },
  { id: "F06_PERSONA_EXPLAINER", name: "F06 · Persona Explainer", format: "Persona-led full-screen explainer", slides: "6 slides", style: "Relatable first-person explanation", layout: "persona-explainer" },
  { id: "F07_RANKING", name: "F07 · Girly Tier List", format: "Tier ranking", slides: "7 slides", style: "Opinionated ranking with one item per slide", layout: "ranking" },
  { id: "F08_2X2", name: "F08 · 2×2 Contrast", format: "2×2 visual contrast grid", slides: "6 slides", style: "Before/after, comparisons and contrasts", layout: "grid-2x2" },
] as const;

export const layoutSpecs = {
  "lifestyle-3stack": { bestFor: "Glow-up, habits and lifestyle guides", imageZones: ["Hook: 1 full photo", "Body: 3 stacked photos"], textZones: ["Short headline", "Short support copy"], sample: { hook: "tiny habits that changed my week", body: "simple things I actually kept doing", cta: "save" } },
  "editorial-asym-hero": { bestFor: "Premium editorial wellness storytelling", imageZones: ["1 hero photo", "2 supporting images"], textZones: ["Editorial title", "Compact body"], sample: { hook: "the quiet reset", body: "what made my routine feel easier", cta: "save" } },
  "routine-timeline": { bestFor: "Morning, night and day-in-life routines", imageZones: ["1 full-screen action photo per slide"], textZones: ["Time range", "Action", "Optional short support"], sample: { hook: "my low-stress morning", body: "7:10 - 7:25 · slow breakfast", cta: "save" } },
  "three-rect-educational": { bestFor: "Educational wellness explainers", imageZones: ["2 images on cover", "3 images on body"], textZones: ["Subject", "Category", "2-5 short points"], sample: { hook: "what actually helped", body: "sleep | meals | movement", cta: "save" } },
  "interactive-checklist": { bestFor: "Saveable lists, groceries and checklists", imageZones: ["One lifestyle background reused"], textZones: ["Category", "5-12 list items"], sample: { hook: "save this for your next reset", body: "protein | berries | greens | oats", cta: "save" } },
  "persona-explainer": { bestFor: "Relatable persona-led explanations", imageZones: ["One new persona photo per slide"], textZones: ["Mini headline", "2-4 observations"], sample: { hook: "what I noticed when I slowed down", body: "less rushing | better evenings | easier sleep", cta: "save" } },
  "ranking": { bestFor: "Tier lists and rankings", imageZones: ["Hook pair", "One item image per body slide"], textZones: ["Tier", "Item", "Short reason"], sample: { hook: "ranking habits for calmer mornings", body: "walking · A tier", cta: "comment" } },
  "grid-2x2": { bestFor: "Before/after and visual comparisons", imageZones: ["Four-image 2×2 grid"], textZones: ["Headline", "Short comparison"], sample: { hook: "before vs after my reset", body: "what changed in my routine", cta: "save" } },
} as const;
export const modelData = rawModels.map((model, index) => ({
  ...model,
  reference: referenceImages[index % referenceImages.length] ?? referenceImages[0],
  spec: layoutSpecs[model.layout],
}));

export const canonicalFormats = [
  { id:"F01_LIFESTYLE_GUIDE", short:"F01", name:"Lifestyle 3-Stack", mode:"3 photos stacked", concepts:"Glow-up · habits · routines", status:"READY" },
  { id:"F02_EDITORIAL_COLLAGE", short:"F02", name:"Editorial Collage", mode:"Asymmetric editorial", concepts:"Glow-up · wellness", status:"READY" },
  { id:"F03_ROUTINE_TIMELINE", short:"F03", name:"Routine Timeline", mode:"Full photo + timed step", concepts:"Morning · night · day in life", status:"READY" },
  { id:"F04_AESTHETIC_EDUCATIONAL", short:"F04", name:"Aesthetic Educational", mode:"3-image education board", concepts:"How-to · glow-up", status:"READY" },
  { id:"F05_INTERACTIVE_CHECKLIST", short:"F05", name:"Notes Master List", mode:"Notes card + shared photo", concepts:"Lists · wellness · glow-up", status:"READY" },
  { id:"F06_PERSONA_EXPLAINER", short:"F06", name:"Persona Explainer", mode:"Persona-led explainer", concepts:"Signs · before/after · how-to", status:"READY" },
  { id:"F07_RANKING", short:"F07", name:"Girly Tier List", mode:"Tier ranking", concepts:"Ranking · habits", status:"READY" },
  { id:"F08_2X2", short:"F08", name:"2×2 Contrast", mode:"Diagonal 2-image grid", concepts:"Before/after · contrasts", status:"READY" },
] as const;
export const canonicalFormatById = new Map(canonicalFormats.map(format => [format.id, format]));

export const carouselTypes = [
  {
    id: "C01_MORNING_ROUTINE",
    name: "Morning routine clean girl / low cortisol",
    keep: true,
    modelIds: ["F03_ROUTINE_TIMELINE","F01_LIFESTYLE_GUIDE"],
    refIds: ["amina-morning-routine", "thatgirl-challenge", "girlsonly-habits"],
    note: "Bon type pilier : parfait pour routines matin, clean girl, low cortisol.",
  },
  {
    id: "C02_CHECKLIST",
    name: "Checklist à sauvegarder",
    keep: true,
    modelIds: ["F05_INTERACTIVE_CHECKLIST","F04_AESTHETIC_EDUCATIONAL"],
    refIds: ["lower-cortisol", "siuela-symptoms", "thatgirlstore-hormone"],
    note: "Très bon format saveable. 3 refs déjà utilisables.",
  },
  {
    id: "C03_THINGS_I_STOPPED",
    name: "Things I stopped doing",
    keep: true,
    modelIds: ["F06_PERSONA_EXPLAINER","F04_AESTHETIC_EDUCATIONAL"],
    refIds: ["thomas-hormone", "siuela-symptoms"],
    note: "À garder, mais il manque 1 référence très typée stop/avoid.",
  },
  {
    id: "C04_THINGS_I_STARTED",
    name: "Habits I started",
    keep: true,
    modelIds: ["F01_LIFESTYLE_GUIDE","F06_PERSONA_EXPLAINER"],
    refIds: ["girlsonly-habits", "rhea-hormones", "herfeminineedge-happy-hormones"],
    note: "Bon overlap avec glow-up + hormones.",
  },
  {
    id: "C05_GLOW_UP",
    name: "Glow-up / transformation",
    keep: true,
    modelIds: ["F01_LIFESTYLE_GUIDE","F02_EDITORIAL_COLLAGE","F08_2X2"],
    refIds: ["navzsm-glowup", "thatgirl-challenge", "girlsonly-habits"],
    note: "Très bien couvert. Tu peux produire beaucoup avec ce groupe.",
  },
  {
    id: "C06_POV_RELATABLE",
    name: "POV / identification",
    keep: true,
    modelIds: ["F06_PERSONA_EXPLAINER","F01_LIFESTYLE_GUIDE"],
    refIds: ["motion-hope", "medgirl-confidence"],
    note: "À compléter : il faut 1-2 refs plus 'POV girl experience'.",
  },
  {
    id: "C07_MISTAKES",
    name: "Erreurs / choses à éviter",
    keep: true,
    modelIds: ["F04_AESTHETIC_EDUCATIONAL","F06_PERSONA_EXPLAINER"],
    refIds: ["thomas-hormone", "siuela-symptoms", "lower-cortisol"],
    note: "OK pour démarrer. Bon modèle éducatif/correction.",
  },
  {
    id: "C08_MY_REALISTIC",
    name: "My realistic…",
    keep: true,
    modelIds: ["F03_ROUTINE_TIMELINE","F06_PERSONA_EXPLAINER"],
    refIds: ["amina-morning-routine", "motion-hope"],
    note: "À compléter avec refs day-in-my-life / realistic night / realistic reset.",
  },
  {
    id: "C09_LIST",
    name: "Liste d’idées / conseils",
    keep: true,
    modelIds: ["F05_INTERACTIVE_CHECKLIST","F04_AESTHETIC_EDUCATIONAL"],
    refIds: ["navzsm-glowup", "lower-cortisol", "rhea-hormones"],
    note: "Très polyvalent : tips, ideas, foods, habits.",
  },
  {
    id: "C10_BEFORE_AFTER",
    name: "Avant / après comportemental",
    keep: true,
    modelIds: ["F08_2X2","F06_PERSONA_EXPLAINER"],
    refIds: ["thomas-hormone", "girlsonly-habits"],
    note: "À garder, mais besoin d’1 ref clairement avant/après.",
  },
  {
    id: "C11_HORMONE_EDUCATION",
    name: "Hormone / cortisol education",
    keep: true,
    modelIds: ["F04_AESTHETIC_EDUCATIONAL","F06_PERSONA_EXPLAINER"],
    refIds: ["thatgirlstore-hormone", "siuela-symptoms", "rhea-hormones", "herfeminineedge-happy-hormones"],
    note: "Ajout recommandé : tes refs actuelles sont fortes ici.",
  },
  {
    id: "C12_NIGHT_ROUTINE",
    name: "Night routine clean girl / low cortisol",
    keep: true,
    modelIds: ["F03_ROUTINE_TIMELINE","F01_LIFESTYLE_GUIDE"],
    refIds: [],
    note: "À compléter en priorité : idéalement 3 refs night routine / sleep reset.",
  },
  {
    id: "C13_EDUCATIONAL_EXPLAINER",
    name: "Educational wellness explainer",
    keep: true,
    modelIds: ["F04_AESTHETIC_EDUCATIONAL","F02_EDITORIAL_COLLAGE"],
    refIds: ["lower-cortisol", "rhea-hormones"],
    note: "Explainer bien-être général avec wording prudent et sources si nécessaire.",
  },
  {
    id: "C14_STORY_TRANSFORMATION",
    name: "Story / transformation réaliste",
    keep: true,
    modelIds: ["F06_PERSONA_EXPLAINER","F08_2X2"],
    refIds: ["motion-hope", "girlsonly-habits"],
    note: "Transformation comportementale crédible, sans avant/après médical.",
  },
] as const;


export type View = (typeof menus)[number];
export type ProductVersion = "current" | "next";
export type ModelId = (typeof modelData)[number]["id"];
export type LayoutName = keyof typeof layoutSpecs;
export type CarouselTypeId = (typeof carouselTypes)[number]["id"];

export const fallbackCategoryByType: Record<CarouselTypeId, string> = {
  C01_MORNING_ROUTINE: "morning", C02_CHECKLIST: "self care", C03_THINGS_I_STOPPED: "self care",
  C04_THINGS_I_STARTED: "self care", C05_GLOW_UP: "self care", C06_POV_RELATABLE: "self care",
  C07_MISTAKES: "self care", C08_MY_REALISTIC: "morning", C09_LIST: "food",
  C10_BEFORE_AFTER: "fitness", C11_HORMONE_EDUCATION: "self care", C12_NIGHT_ROUTINE: "self care",
  C13_EDUCATIONAL_EXPLAINER: "self care", C14_STORY_TRANSFORMATION: "self care",
};
