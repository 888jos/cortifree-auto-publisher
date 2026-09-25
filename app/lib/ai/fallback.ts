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
  ["6:00 - 6:05 · wake up and brush teeth", ""],
  ["6:05 - 6:25 · skincare", ""],
  ["6:25 - 6:50 · get ready", ""],
  ["6:50 - 7:00 · make lunch", ""],
  ["7:00 - 7:10 · make and eat breakfast", ""],
  ["7:10 - 7:15 · get dressed and leave", "refill water bottle | pack lunch and bag"],
];
const frRoutineSteps = [
  ["6h00 - 6h05 · réveil et brossage de dents", ""],
  ["6h05 - 6h25 · skincare", ""],
  ["6h25 - 6h50 · je me prépare", ""],
  ["6h50 - 7h00 · je prépare mon déjeuner", ""],
  ["7h00 - 7h10 · petit-déjeuner", ""],
  ["7h10 - 7h15 · je m’habille et je pars", "remplir la gourde | prendre le déjeuner et le sac"],
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

const enChecklistSteps = [
  ["How does your morning actually start?", "Phone before daylight | Curtains stay closed | I rush straight into work"],
  ["What happens around lunch?", "I eat at my desk | I skip it until late | I never really stop working"],
  ["How much movement fits your day?", "I sit for hours at a time | I only move if it is a workout | I rarely step outside"],
  ["What does your evening look like?", "Bright lights until bed | Phone in bed | Work tabs still open late"],
  ["Which part do you want to change first?", "Morning screen time | Midday pause | Evening wind-down"],
  ["Do you notice what repeats?", "I mostly guess | I forget after a few days | I want one place to track it"],
];
const frChecklistSteps = [
  ["Comment commence vraiment ta matinée ?", "Téléphone avant la lumière | Rideaux fermés | Je passe direct en mode travail"],
  ["Qu’est-ce qui se passe à midi ?", "Je mange devant mon écran | Je repousse le repas | Je ne fais jamais vraiment de pause"],
  ["Combien tu bouges dans ta journée ?", "Je reste assise des heures | Je bouge seulement si je m’entraîne | Je sors rarement"],
  ["À quoi ressemble ta soirée ?", "Lumières fortes jusqu’au lit | Téléphone au lit | Onglets de travail encore ouverts tard"],
  ["Qu’est-ce que tu veux changer en premier ?", "Écran le matin | Vraie pause à midi | Ralentir le soir"],
  ["Tu vois ce que tu répètes vraiment ?", "Je devine surtout | J’oublie après quelques jours | Je veux tout suivre au même endroit"],
];

const enRankingSteps = [
  ["9/10 · Morning light", "Easy to repeat, costs nothing, and gives my morning an actual starting point."],
  ["8/10 · Walk after lunch", "Not dramatic, just one of the few habits I still do on busy days."],
  ["6/10 · Perfect meal prep", "Useful in theory, but too much setup for me to pretend I will do it every Sunday."],
  ["9/10 · Phone out of bed", "Annoying for two nights, then much easier than fighting notifications at midnight."],
  ["7/10 · Tracking patterns", "I like having CortiFree show me what I repeat instead of relying on memory."],
  ["5/10 · Ten-step routines", "Cute online, but I keep the two steps I actually enjoy and skip the rest."],
];
const frRankingSteps = [
  ["9/10 · Lumière du matin", "Facile à refaire, gratuite, et ça donne enfin un vrai début à ma matinée."],
  ["8/10 · Marche après déjeuner", "Pas spectaculaire, juste une des rares habitudes que je garde même les jours chargés."],
  ["6/10 · Meal prep parfait", "Utile en théorie, mais trop de préparation pour prétendre que je vais le faire chaque dimanche."],
  ["9/10 · Téléphone hors du lit", "Pénible deux soirs, puis bien plus simple que lutter contre les notifications à minuit."],
  ["7/10 · Suivre mes habitudes", "J’aime voir dans CortiFree ce que je répète vraiment au lieu de compter sur ma mémoire."],
  ["5/10 · Routine en dix étapes", "Jolie sur internet, mais je garde les deux étapes que j’aime vraiment et je zappe le reste."],
];

function createF04Fallback(input: CarouselGeneratorInput): CarouselSpec {
  const fr = input.language === "fr";
  const patterns = fr ? [
    ["GLAÇON SUR LE VISAGE", "BENEFITS | Décongestionne visuellement | Donne un effet plus frais | Réveille l’éclat du teint"],
    ["SOIN DES LÈVRES", "HOW TO | Exfolie très doucement | Applique un baume simple | Remets-en avant de dormir"],
    ["MASSAGE DU VISAGE", "HOW TO | Commence sur peau glissante | Garde une pression légère | Masse vers l’extérieur | Arrête si ça irrite"],
    ["SÉRUM CILS", "WHAT TO USE | Formule douce | Applicateur propre | Une fine couche suffit | Régularité avant quantité"],
    ["ERREURS À ÉVITER", "MISTAKES | Trop frotter la peau | Empiler trop d’actifs | Copier chaque tendance | Ignorer les irritations"],
  ] : [
    ["ICE-ING FACE", "BENEFITS | De-puffs the look of skin | Gives a fresher look | Can boost visible glow"],
    ["LIP CARE", "HOW TO | Exfoliate very gently | Use a simple balm | Reapply before bed"],
    ["MASSAGING FACE", "HOW TO | Start on slippery skin | Keep pressure light | Massage outward | Stop if skin feels irritated"],
    ["LASH SERUM", "WHAT TO USE | Gentle formula | Clean applicator | One thin layer | Consistency over quantity"],
    ["COMMON MISTAKES", "MISTAKES | Scrubbing too hard | Stacking too many actives | Copying every trend | Ignoring irritation"],
  ];
  const coverTitle = input.preferredHook ?? (fr ? "COMMENT ÊTRE NATURELLEMENT ÉCLATANTE" : "HOW TO BE NATURALLY BREATHTAKING");
  const slideCount = input.requestedSlideCount;
  const slides = Array.from({ length: slideCount }, (_, index) => {
    if (index === 0) return {
      position: 1,
      role: "HOOK" as const,
      layout: input.layout,
      headline: coverTitle,
      body: "✦ · ✧",
      visualIntent: "Exactly two portrait beauty/wellness images for a diagonal cover: one top-right portrait and one bottom-left portrait; clean light background; no text inside images.",
      assetType: "stock" as const,
      assetQuery: "natural beauty portrait clean girl soft daylight skincare editorial",
    };
    const copy = patterns[(index - 1) % patterns.length]!;
    const isFinal = index === slideCount - 1;
    return {
      position: index + 1,
      role: isFinal ? "CTA" as const : "TIP" as const,
      layout: input.layout,
      headline: copy[0],
      body: copy[1],
      visualIntent: `Exactly three differentiated visuals for ${copy[0]}: top-left proof/result/example close-up; bottom-left support tool/product/ingredient; bottom-right support result/diagram-style visual without text. Natural beauty editorial photography, no text inside images.`,
      assetType: "stock" as const,
      assetQuery: `${copy[0]} beauty wellness proof result tool product ingredient close up natural light`,
    };
  });
  return {
    title: fr ? "guide beauté à sauvegarder" : "saveable beauty cheat sheet",
    topic: fr ? "conseils beauté et wellness visuels" : "visual beauty and wellness tips",
    angle: fr ? "Mini fiches éducatives courtes, visuelles et sans promesse miracle." : "Short visual educational boards without miracle claims.",
    hook: coverTitle,
    language: input.language,
    caption: fr ? "Le mini guide beauté à garder sous la main. ✨" : "The little beauty cheat sheet worth saving. ✨",
    ctaType: input.ctaMode,
    slides,
  };
}

export function createFallbackCarousel(input: CarouselGeneratorInput): CarouselSpec {
  if (String(input.carouselType) === "F04_AESTHETIC_EDUCATIONAL") return createF04Fallback(input);
  const language = input.language;
  const topic = topics[input.carouselType][language];
  const steps = input.carouselType === "F03_ROUTINE_TIMELINE"
    ? (language === "fr" ? frRoutineSteps : enRoutineSteps)
    : input.carouselType === "F02_EDITORIAL_COLLAGE"
        ? (language === "fr" ? frEditorialSteps : enEditorialSteps)
        : input.carouselType === "F07_RANKING"
          ? (language === "fr" ? frRankingSteps : enRankingSteps)
          : input.carouselType === "F05_INTERACTIVE_CHECKLIST"
            ? (language === "fr" ? frChecklistSteps : enChecklistSteps)
            : (language === "fr" ? frSteps : enSteps);
  const hook = input.preferredHook ?? (language === "fr" ? `${topic} — sans routine parfaite` : `${topic} — no perfect routine required`);
  const middleCount = input.requestedSlideCount - 2;
  const roles: SlideRole[] = input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? ["CHECKLIST"] : input.carouselType === "F03_ROUTINE_TIMELINE" ? ["STEP"] : ["TIP", "STEP", "TAKEAWAY"];
  const slides = [
    { position: 1, role: "HOOK" as const, layout: input.layout, headline: hook, body: input.carouselType === "F03_ROUTINE_TIMELINE" ? (language === "fr" ? "6h00 - 7h15" : "6:00 - 7:15") : input.carouselType === "F02_EDITORIAL_COLLAGE" ? (language === "fr" ? "les changements qui ont fait la vraie différence" : "the changes that made the biggest difference") : input.carouselType === "F07_RANKING" ? (language === "fr" ? "ce que je garde, ce que je zappe" : "what I keep, what I skip") : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? (language === "fr" ? "Coche mentalement ce qui te ressemble." : "Mentally check what sounds like you.") : (language === "fr" ? "Swipe pour une version simple et tenable." : "Swipe for a simple version you can actually keep."), visualIntent: input.carouselType === "F03_ROUTINE_TIMELINE" ? "Natural full-screen morning lifestyle scene matching the routine context, candid phone-camera realism, clear negative space upper-left" : input.carouselType === "F02_EDITORIAL_COLLAGE" ? "Exactly three cohesive editorial lifestyle images for the same glow-up theme: one strong human hero portrait plus two supporting detail/object/action images, natural magazine/Pinterest feel, no text inside images" : input.carouselType === "F07_RANKING" ? "Exactly two distinct teaser lifestyle photos representing items from the ranking, cohesive natural editorial feel, no text or score baked into images" : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? "One contextual lifestyle photo that sets up the self-audit question, candid natural phone-camera realism, no text or UI inside image" : "Clean lifestyle hero image with generous negative space for a short hook", assetType: "stock" as const, assetQuery: input.carouselType === "F03_ROUTINE_TIMELINE" ? "realistic morning routine bedroom window natural light candid lifestyle" : input.carouselType === "F02_EDITORIAL_COLLAGE" ? "editorial glow up portrait detail lifestyle natural light cohesive" : input.carouselType === "F07_RANKING" ? "wellness habits ranking lifestyle teaser natural light editorial" : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? "realistic daily routine candid lifestyle natural light self audit" : "calm clean girl morning soft natural light portrait" },
    ...Array.from({ length: middleCount }, (_, index) => {
      const copy = steps[index % steps.length]!;
      return { position: index + 2, role: roles[index % roles.length]!, layout: input.layout, headline: copy[0], body: copy[1], visualIntent: input.carouselType === "F03_ROUTINE_TIMELINE" ? `One exact routine action matching: ${copy[0]}. Candid phone-camera lifestyle photo, natural and attainable, no text in image.` : input.carouselType === "F02_EDITORIAL_COLLAGE" ? `Exactly three cohesive editorial photos supporting this point: ${copy[0]}. Use one human/action hero plus two complementary close details or objects. Magazine/Pinterest composition, no text in image.` : input.carouselType === "F07_RANKING" ? `One strong lifestyle photo depicting exactly the ranked item: ${copy[0]}. Natural editorial image, no rating, badge or text baked into image.` : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? `One contextual candid lifestyle photo matching this self-audit question: ${copy[0]}. No text, checkbox, card or UI baked into image.` : "One clear everyday lifestyle action, candid and attainable", assetType: "stock" as const, assetQuery: input.carouselType === "F03_ROUTINE_TIMELINE" ? `${copy[0]} candid lifestyle exact action natural light` : input.carouselType === "F02_EDITORIAL_COLLAGE" ? `${copy[0]} editorial portrait detail object lifestyle natural light` : input.carouselType === "F07_RANKING" ? `${copy[0].replace(/^\d+(?:\.\d+)?\/10\s*[·•|—–:\-]\s*/i, "")} lifestyle natural light editorial` : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? `${copy[0]} candid daily routine lifestyle natural light` : `${copy[0]} wellness lifestyle natural light` };
    }),
    input.carouselType === "F03_ROUTINE_TIMELINE"
      ? (() => {
          const copy = steps[middleCount % steps.length]!;
          return {
            position: input.requestedSlideCount,
            role: "STEP" as const,
            layout: input.layout,
            headline: copy[0],
            body: copy[1],
            visualIntent: `One exact routine action matching: ${copy[0]}. Candid phone-camera lifestyle photo, natural and attainable, no text in image.`,
            assetType: "stock" as const,
            assetQuery: `${copy[0]} candid lifestyle exact action natural light`,
          };
        })()
      : { position: input.requestedSlideCount, role: "CTA" as const, layout: input.layout, headline: input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? (language === "fr" ? "Ton score n’est pas le plus important" : "Your score is not the point") : (language === "fr" ? "Sauvegarde pour ton prochain reset" : "Save this for your next reset"), body: input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? (language === "fr" ? "Garde les 1 ou 2 cases que tu veux changer en premier. CortiFree peut t’aider à voir ce que tu répètes." : "Keep the 1 or 2 boxes you want to change first. CortiFree can help you notice what you repeat.") : (language === "fr" ? "Choisis une seule idée et commence par là." : "Pick one idea and start there."), visualIntent: input.carouselType === "F02_EDITORIAL_COLLAGE" ? "Exactly three cohesive editorial closing images: one lifestyle hero plus two supporting details matching the carousel, natural magazine feel, no text in image" : input.carouselType === "F07_RANKING" ? "One clean closing lifestyle photo related to the ranking, natural editorial feel, no text or score baked into image" : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? "One calm closing lifestyle photo with no text or UI baked into image" : "Minimal closing frame with calm background and strong save prompt", assetType: input.carouselType === "F02_EDITORIAL_COLLAGE" || input.carouselType === "F07_RANKING" || input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? "stock" as const : "text_only" as const, assetQuery: input.carouselType === "F02_EDITORIAL_COLLAGE" ? "editorial wellness closing portrait details natural light" : input.carouselType === "F07_RANKING" ? "wellness lifestyle editorial closing natural light" : input.carouselType === "F05_INTERACTIVE_CHECKLIST" ? "calm realistic routine lifestyle closing natural light" : "minimal warm neutral paper texture" },
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
