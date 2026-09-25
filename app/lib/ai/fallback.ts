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

const enEducationalSteps = [
  ["Morning light", "Useful for setting a clear start to the day without making it a complicated ritual."],
  ["A real lunch break", "Eating away from the laptop can make the middle of the day feel less chaotic."],
  ["Short walks", "Easy movement is often more repeatable than turning every break into a workout."],
  ["A slower evening", "Lower light and fewer notifications can make bedtime feel less abrupt."],
  ["One habit at a time", "Changing everything at once is usually harder to keep than one specific behavior."],
  ["Track what you repeat", "CortiFree can help you notice which routine pieces you actually keep doing."],
];
const frEducationalSteps = [
  ["Lumière du matin", "Un moyen simple de marquer le début de la journée sans créer un rituel compliqué."],
  ["Une vraie pause déjeuner", "Manger loin de l’écran peut rendre le milieu de journée moins chaotique."],
  ["Des marches courtes", "Un peu de mouvement est souvent plus facile à répéter qu’un entraînement à chaque pause."],
  ["Une soirée plus lente", "Moins de lumière et de notifications peut rendre le coucher moins brutal."],
  ["Une habitude à la fois", "Tout changer d’un coup est souvent plus dur à tenir qu’un comportement précis."],
  ["Regarde ce que tu répètes", "CortiFree peut t’aider à voir les morceaux de routine que tu gardes vraiment."],
];

const enEditorialSteps = [
  ["Morning light first", "I stopped opening notifications before I even opened the curtains."],
  ["A breakfast I repeat", "Simple food I actually like beats a perfect routine I quit in three days."],
  ["Walks that fit real life", "Ten easy minutes outside is the kind of habit I can keep on a busy day."],
  ["Less chaos at night", "Lower lights and fewer tabs open makes the evening feel noticeably less frantic."],
  ["Track the pattern", "CortiFree is where I keep the habits I want to notice instead of guessing."],
  ["Keep the useful parts", "The glow-up is mostly the boring things I can repeat without thinking."],
];
const frEditorialSteps = [
  ["Lumière avant notifications", "J’ai arrêté d’ouvrir mes messages avant même d’ouvrir les rideaux."],
  ["Un petit-déj que je refais", "Un truc simple que j’aime vaut mieux qu’une routine parfaite abandonnée en trois jours."],
  ["Des marches réalistes", "Dix minutes dehors, c’est le genre d’habitude que je garde même quand la journée est chargée."],
  ["Moins de chaos le soir", "Moins de lumière et moins d’onglets ouverts rendent la soirée beaucoup moins agitée."],
  ["Regarder le pattern", "CortiFree me sert à voir les habitudes que je répète vraiment au lieu de deviner."],
  ["Garder ce qui marche", "Le glow-up vient surtout des trucs un peu boring que je peux refaire sans réfléchir."],
];

export function createFallbackCarousel(input: CarouselGeneratorInput): CarouselSpec {
  const language = input.language;
  const topic = topics[input.carouselType][language];
  const steps = input.carouselType === "F03_ROUTINE_TIMELINE"
    ? (language === "fr" ? frRoutineSteps : enRoutineSteps)
    : input.carouselType === "F04_AESTHETIC_EDUCATIONAL"
      ? (language === "fr" ? frEducationalSteps : enEducationalSteps)
      : input.carouselType === "F02_EDITORIAL_COLLAGE"
        ? (language === "fr" ? frEditorialSteps : enEditorialSteps)
        : (language === "fr" ? frSteps : enSteps);
  const hook = input.preferredHook ?? (language === "fr" ? `${topic} — sans routine parfaite` : `${topic} — no perfect routine required`);
  const middleCount = input.requestedSlideCount - 2;
  const roles: SlideRole[] = input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? ["CHECKLIST"] : input.carouselType === "F03_ROUTINE_TIMELINE" ? ["STEP"] : ["TIP", "STEP", "TAKEAWAY"];
  const slides = [
    { position: 1, role: "HOOK" as const, layout: input.layout, headline: hook, body: input.carouselType === "F03_ROUTINE_TIMELINE" ? (language === "fr" ? "6h30 → 21h30 · une journée réaliste" : "6:30 AM → 9:30 PM · a realistic day") : input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? (language === "fr" ? "5 idées simples à garder en tête" : "5 simple ideas worth knowing") : input.carouselType === "F02_EDITORIAL_COLLAGE" ? (language === "fr" ? "les changements qui ont fait la vraie différence" : "the changes that made the biggest difference") : (language === "fr" ? "Swipe pour une version simple et tenable." : "Swipe for a simple version you can actually keep."), visualIntent: input.carouselType === "F03_ROUTINE_TIMELINE" ? "Natural full-screen morning lifestyle scene matching the routine context, candid phone-camera realism, clear negative space upper-left" : input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? "Three cohesive vertical lifestyle/detail images supporting the same educational theme, natural phone-camera feel, no text inside images" : input.carouselType === "F02_EDITORIAL_COLLAGE" ? "Exactly three cohesive editorial lifestyle images for the same glow-up theme: one strong human hero portrait plus two supporting detail/object/action images, natural magazine/Pinterest feel, no text inside images" : "Clean lifestyle hero image with generous negative space for a short hook", assetType: "stock" as const, assetQuery: input.carouselType === "F03_ROUTINE_TIMELINE" ? "realistic morning routine bedroom window natural light candid lifestyle" : input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? "three cohesive wellness lifestyle detail images natural light educational" : input.carouselType === "F02_EDITORIAL_COLLAGE" ? "editorial glow up portrait detail lifestyle natural light cohesive" : "calm clean girl morning soft natural light portrait" },
    ...Array.from({ length: middleCount }, (_, index) => {
      const copy = steps[index % steps.length]!;
      return { position: index + 2, role: roles[index % roles.length]!, layout: input.layout, headline: copy[0], body: copy[1], visualIntent: input.carouselType === "F03_ROUTINE_TIMELINE" ? `One exact routine action matching: ${copy[0]}. Candid phone-camera lifestyle photo, natural and attainable, no text in image.` : input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? `Three cohesive photos that all support this exact point: ${copy[0]}. Mix one human/lifestyle angle with close detail or object views when relevant. Natural, non-staged, no text in image.` : input.carouselType === "F02_EDITORIAL_COLLAGE" ? `Exactly three cohesive editorial photos supporting this point: ${copy[0]}. Use one human/action hero plus two complementary close details or objects. Magazine/Pinterest composition, no text in image.` : "One clear everyday lifestyle action, candid and attainable", assetType: "stock" as const, assetQuery: input.carouselType === "F03_ROUTINE_TIMELINE" ? `${copy[0]} candid lifestyle exact action natural light` : input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? `${copy[0]} lifestyle detail object candid natural light` : input.carouselType === "F02_EDITORIAL_COLLAGE" ? `${copy[0]} editorial portrait detail object lifestyle natural light` : `${copy[0]} wellness lifestyle natural light` };
    }),
    { position: input.requestedSlideCount, role: "CTA" as const, layout: input.layout, headline: language === "fr" ? "Sauvegarde pour ton prochain reset" : "Save this for your next reset", body: language === "fr" ? "Choisis une seule idée et commence par là." : "Pick one idea and start there.", visualIntent: input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? "Three cohesive closing lifestyle/detail images that match the carousel topic, natural and clean, no text in image" : input.carouselType === "F02_EDITORIAL_COLLAGE" ? "Exactly three cohesive editorial closing images: one lifestyle hero plus two supporting details matching the carousel, natural magazine feel, no text in image" : "Minimal closing frame with calm background and strong save prompt", assetType: input.carouselType === "F04_AESTHETIC_EDUCATIONAL" || input.carouselType === "F02_EDITORIAL_COLLAGE" ? "stock" as const : "text_only" as const, assetQuery: input.carouselType === "F04_AESTHETIC_EDUCATIONAL" ? "cohesive wellness lifestyle details natural light closing collage" : input.carouselType === "F02_EDITORIAL_COLLAGE" ? "editorial wellness closing portrait details natural light" : "minimal warm neutral paper texture" },
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
