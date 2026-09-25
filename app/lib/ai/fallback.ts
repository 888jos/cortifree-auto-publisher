import type { CarouselSpec } from "./schemas";
import type { CarouselGeneratorInput, SlideRole } from "./types";

const topics: Record<CarouselGeneratorInput["carouselType"], { en: string; fr: string }> = {
  F01_LIFESTYLE_GUIDE: { en: "things that actually changed my everyday routine", fr: "ce qui a vraiment changé ma routine au quotidien" },
  F02_EDITORIAL_COLLAGE: { en: "a realistic glow-up edit worth saving", fr: "un glow-up réaliste à sauvegarder" },
  F03_ROUTINE_TIMELINE: { en: "my realistic routine from start to finish", fr: "ma routine réaliste du début à la fin" },
  F04_AESTHETIC_EDUCATIONAL: { en: "a simple wellness explainer without miracle claims", fr: "une explication wellness simple sans promesse miracle" },
  F05_INTERACTIVE_CHECKLIST: { en: "a quick self-check for your routine", fr: "un mini check de ta routine" },
  F06_PERSONA_EXPLAINER: { en: "what I noticed when I changed my routine", fr: "ce que j’ai remarqué en changeant ma routine" },
  F07_RANKING: { en: "ranking the habits I would actually keep", fr: "je classe les habitudes que je garderais vraiment" },
  F08_2X2: { en: "what I stopped vs what I do now", fr: "ce que j’ai arrêté vs ce que je fais maintenant" },
};

const enSteps = [
  ["Start with daylight", "Open the curtains or step outside for a few quiet minutes."],
  ["Eat something steady", "Choose a simple meal that feels satisfying and realistic for you."],
  ["Add an easy walk", "A short walk can be a gentle way to break up a busy day."],
  ["Make one thing slower", "Pick one task and do it without multitasking or rushing."],
  ["Create a softer landing", "Dim the lights, put the phone down, and let the day feel finished."],
  ["Keep what actually helps", "Your routine does not need to be perfect to feel supportive."],
];
const frSteps = [
  ["Commence par la lumière du jour", "Ouvre les rideaux ou sors quelques minutes, sans te presser."],
  ["Choisis un repas rassasiant", "Fais simple, nourrissant et réaliste pour ton quotidien."],
  ["Ajoute une marche facile", "Quelques minutes peuvent créer une vraie coupure dans la journée."],
  ["Ralentis une seule chose", "Choisis une tâche et fais-la sans multitâche ni urgence."],
  ["Crée une fin de journée douce", "Baisse les lumières, pose ton téléphone et laisse la journée se terminer."],
  ["Garde ce qui t’aide vraiment", "Ta routine n’a pas besoin d’être parfaite pour te soutenir."],
];

const enRoutineSteps = [
  ["6:30 AM · sunlight before scrolling", "Curtains open first, phone later."],
  ["7:00 AM · protein breakfast", "Something simple I can actually repeat."],
  ["8:10 AM · walk before sitting down", "Ten quiet minutes outside."],
  ["12:30 PM · real lunch break", "I eat away from my laptop."],
  ["8:45 PM · lights lower", "I make the room feel like the day is ending."],
  ["9:30 PM · shower + phone away", "Nothing elaborate, just a clear stop signal."],
];
const frRoutineSteps = [
  ["6h30 · lumière avant le téléphone", "J’ouvre les rideaux avant de scroller."],
  ["7h00 · petit-déj protéiné", "Simple, rassasiant et facile à refaire."],
  ["8h10 · marche avant de m’asseoir", "Dix minutes dehors, sans objectif."],
  ["12h30 · vraie pause déjeuner", "Je mange loin de mon écran."],
  ["20h45 · lumières plus basses", "Je fais sentir à la pièce que la journée ralentit."],
  ["21h30 · douche + téléphone posé", "Rien de compliqué, juste une vraie coupure."],
];

export function createFallbackCarousel(input: CarouselGeneratorInput): CarouselSpec {
  const language = input.language;
  const topic = topics[input.carouselType][language];
  const steps = input.carouselType === "F03_ROUTINE_TIMELINE"
    ? (language === "fr" ? frRoutineSteps : enRoutineSteps)
    : (language === "fr" ? frSteps : enSteps);
  const hook = input.preferredHook ?? (language === "fr" ? `${topic} — sans routine parfaite` : `${topic} — no perfect routine required`);
  const middleCount = input.requestedSlideCount - 2;
  const roles: SlideRole[] = input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? ["CHECKLIST"] : input.carouselType === "F03_ROUTINE_TIMELINE" ? ["STEP"] : ["TIP", "STEP", "TAKEAWAY"];
  const slides = [
    { position: 1, role: "HOOK" as const, layout: input.layout, headline: hook, body: input.carouselType === "F03_ROUTINE_TIMELINE" ? (language === "fr" ? "6h30 → 21h30 · une journée réaliste" : "6:30 AM → 9:30 PM · a realistic day") : (language === "fr" ? "Swipe pour une version simple et tenable." : "Swipe for a simple version you can actually keep."), visualIntent: input.carouselType === "F03_ROUTINE_TIMELINE" ? "Natural full-screen morning lifestyle scene matching the routine context, candid phone-camera realism, clear negative space upper-left" : "Clean lifestyle hero image with generous negative space for a short hook", assetType: "stock" as const, assetQuery: input.carouselType === "F03_ROUTINE_TIMELINE" ? "realistic morning routine bedroom window natural light candid lifestyle" : "calm clean girl morning soft natural light portrait" },
    ...Array.from({ length: middleCount }, (_, index) => {
      const copy = steps[index % steps.length]!;
      return { position: index + 2, role: roles[index % roles.length]!, layout: input.layout, headline: copy[0], body: copy[1], visualIntent: input.carouselType === "F03_ROUTINE_TIMELINE" ? `One exact routine action matching: ${copy[0]}. Candid phone-camera lifestyle photo, natural and attainable, no text in image.` : "One clear everyday lifestyle action, candid and attainable", assetType: "stock" as const, assetQuery: input.carouselType === "F03_ROUTINE_TIMELINE" ? `${copy[0]} candid lifestyle exact action natural light` : `${copy[0]} wellness lifestyle natural light` };
    }),
    { position: input.requestedSlideCount, role: "CTA" as const, layout: input.layout, headline: language === "fr" ? "Sauvegarde pour ton prochain reset" : "Save this for your next reset", body: language === "fr" ? "Choisis une seule idée et commence par là." : "Pick one idea and start there.", visualIntent: "Minimal closing frame with calm background and strong save prompt", assetType: "text_only" as const, assetQuery: "minimal warm neutral paper texture" },
  ];

  return {
    title: topic,
    topic,
    angle: language === "fr" ? "Une approche douce, réaliste et sans promesse médicale." : "A gentle, realistic angle without medical promises.",
    hook,
    language,
    caption: language === "fr" ? "Une routine calme peut rester simple. Sauvegarde ces idées pour plus tard. ✨" : "A calmer routine can stay simple. Save these ideas for later. ✨",
    ctaType: input.ctaMode,
    slides,
  };
}
