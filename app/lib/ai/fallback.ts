import type { CarouselSpec } from "./schemas";
import type { CarouselGeneratorInput, SlideRole } from "./types";

const topics: Record<CarouselGeneratorInput["carouselType"], { en: string; fr: string }> = {
  C01_MORNING_ROUTINE: { en: "a realistic morning routine for calmer days", fr: "une routine du matin réaliste pour des journées plus calmes" },
  C02_CHECKLIST: { en: "a low-stress checklist worth saving", fr: "une checklist anti-stress à sauvegarder" },
  C03_THINGS_I_STOPPED: { en: "things I stopped doing when I felt drained", fr: "ce que j’ai arrêté de faire quand je me sentais épuisée" },
  C04_THINGS_I_STARTED: { en: "small habits that made my days feel softer", fr: "les petites habitudes qui ont adouci mes journées" },
  C05_GLOW_UP: { en: "a gentle glow-up reset", fr: "un glow-up tout en douceur" },
  C06_POV_RELATABLE: { en: "POV: you stopped forcing productivity", fr: "POV : tu as arrêté de forcer ta productivité" },
  C07_MISTAKES: { en: "low-stress mistakes I stopped repeating", fr: "les erreurs anti-stress que j’ai arrêté de répéter" },
  C08_MY_REALISTIC: { en: "my realistic reset routine", fr: "ma routine reset réaliste" },
  C09_LIST: { en: "simple ways to make today feel lighter", fr: "des idées simples pour alléger ta journée" },
  C10_BEFORE_AFTER: { en: "before and after choosing a slower routine", fr: "avant et après avoir choisi une routine plus douce" },
  C11_HORMONE_EDUCATION: { en: "everyday habits that support a calmer routine", fr: "des habitudes quotidiennes pour une routine plus calme" },
  C12_NIGHT_ROUTINE: { en: "a realistic night routine to wind down", fr: "une routine du soir réaliste pour ralentir" },
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

export function createFallbackCarousel(input: CarouselGeneratorInput): CarouselSpec {
  const language = input.language;
  const topic = topics[input.carouselType][language];
  const steps = language === "fr" ? frSteps : enSteps;
  const hook = input.preferredHook ?? (language === "fr" ? `${topic} — sans routine parfaite` : `${topic} — no perfect routine required`);
  const middleCount = input.requestedSlideCount - 2;
  const roles: SlideRole[] = input.carouselType === "C02_CHECKLIST" ? ["CHECKLIST"] : ["TIP", "STEP", "TAKEAWAY"];
  const slides = [
    { position: 1, role: "HOOK" as const, layout: input.layout, headline: hook, body: language === "fr" ? "Swipe pour une version simple et tenable." : "Swipe for a simple version you can actually keep.", visualIntent: "Clean lifestyle hero image with generous negative space for a short hook", assetType: "stock" as const, assetQuery: "calm clean girl morning soft natural light portrait" },
    ...Array.from({ length: middleCount }, (_, index) => {
      const copy = steps[index % steps.length]!;
      return { position: index + 2, role: roles[index % roles.length]!, layout: input.layout, headline: copy[0], body: copy[1], visualIntent: "One clear everyday lifestyle action, candid and attainable", assetType: "stock" as const, assetQuery: `${copy[0]} wellness lifestyle natural light` };
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
