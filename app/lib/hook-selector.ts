import { hookLibrary } from "../hook-library.js";

export type HookLayout = "lifestyle-3stack" | "editorial-asym-hero" | "routine-timeline" | "three-rect-educational" | "interactive-checklist" | "persona-explainer" | "ranking" | "grid-2x2";
export type HookGenerationPlan = {
  conceptType: string;
  formatId: string;
  layout: HookLayout;
  requestedSlideCount: number;
};
const categoryByType: Record<string, string[]> = {
  C01_MORNING_ROUTINE: ["Morning & night", "Hormones & cortisol", "Stress & calm"],
  C02_CHECKLIST: ["Weekly & seasonal reset", "Stress & calm"],
  C03_THINGS_I_STOPPED: ["Stress & calm", "Overstimulation & reset"],
  C04_THINGS_I_STARTED: ["Hormones & cortisol", "Fitness & wellness"],
  C05_GLOW_UP: ["Glow-up & feminine", "Fitness & wellness"],
  C06_POV_RELATABLE: ["Overstimulation & reset", "Stress & calm"],
  C07_MISTAKES: ["Stress & calm", "Overstimulation & reset"],
  C08_MY_REALISTIC: ["Fitness & wellness", "Morning & night"],
  C09_LIST: ["Fitness & wellness", "Stress & calm"],
  C10_BEFORE_AFTER: ["Morning & night", "Glow-up & feminine"],
  C11_HORMONE_EDUCATION: ["Hormones & cortisol"],
  C12_NIGHT_ROUTINE: ["Morning & night", "Stress & calm"],
  C13_EDUCATIONAL_EXPLAINER: ["Hormones & cortisol", "Stress & calm", "Energy & food"],
  C14_STORY_TRANSFORMATION: ["Glow-up & feminine", "Stress & calm", "Productivity & boundaries"],
};

export function selectAutomaticHook(input: { carouselType: string; recentHooks?: string[]; referenceTitles?: string[] }) {
  const preferred = categoryByType[input.carouselType] ?? [];
  const recent = new Set((input.recentHooks ?? []).map((hook) => hook.toLowerCase()));
  const referenceWords = (input.referenceTitles ?? []).join(" ").toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  return hookLibrary.map((hook) => {
    let score = preferred.includes(hook.category) ? 100 - preferred.indexOf(hook.category) * 15 : 10;
    score += referenceWords.filter((word) => hook.text.toLowerCase().includes(word)).length * 8;
    if (recent.has(hook.text.toLowerCase())) score -= 1_000;
    return { hook, score };
  }).sort((a, b) => b.score - a.score || a.hook.id.localeCompare(b.hook.id))[0]?.hook.text;
}

/** Map the editorial hook bank to the existing carousel taxonomy and the two allowed visual models. */
export function getHookGenerationPlan(hook: { category: string; text: string }): HookGenerationPlan {
  const text = hook.text.toLowerCase();
  const category = hook.category;

  let conceptType = "C09_LIST";
  if (category === "Morning & night" || /morning|night|bed|sleep|waking|9pm/.test(text)) conceptType = /night|bed|sleep|waking|9pm/.test(text) ? "C12_NIGHT_ROUTINE" : "C01_MORNING_ROUTINE";
  else if (category === "Hormones & cortisol") conceptType = /started|habits/.test(text) ? "C04_THINGS_I_STARTED" : "C11_HORMONE_EDUCATION";
  else if (category === "Stress & calm") conceptType = /stopped/.test(text) ? "C03_THINGS_I_STOPPED" : /reset|routine/.test(text) ? "C08_MY_REALISTIC" : "C09_LIST";
  else if (category === "Overstimulation & reset") conceptType = /stopped|instead/.test(text) ? "C03_THINGS_I_STOPPED" : "C08_MY_REALISTIC";
  else if (category === "Energy & food") conceptType = /eat|breakfast|grocery|coffee/.test(text) ? "C09_LIST" : "C13_EDUCATIONAL_EXPLAINER";
  else if (category === "Glow-up & feminine") conceptType = "C05_GLOW_UP";
  else if (category === "Productivity & boundaries") conceptType = /stopped/.test(text) ? "C03_THINGS_I_STOPPED" : "C08_MY_REALISTIC";
  else if (category === "Weekly & seasonal reset") conceptType = "C02_CHECKLIST";
  else if (category === "Fitness & wellness") conceptType = /started|walking/.test(text) ? "C04_THINGS_I_STARTED" : "C08_MY_REALISTIC";

  let formatId = "F01_LIFESTYLE_GUIDE";
  if (/rank|ranking|tier|rated|rating/.test(text)) formatId = "F07_RANKING";
  else if (/before|after|vs\.?|versus/.test(text) && !/morning after|night after/.test(text)) formatId = "F08_2X2";
  else if (category === "Morning & night" || /morning routine|night routine|day in my life|day-in-my-life/.test(text)) formatId = "F03_ROUTINE_TIMELINE";
  else if (category === "Weekly & seasonal reset" || /checklist|grocery|foods|things to eat|shopping list|save this list/.test(text)) formatId = "F05_INTERACTIVE_CHECKLIST";
  else if (/pov|what i noticed|why i|signs|i stopped|i started|things i stopped|things i started/.test(text)) formatId = "F06_PERSONA_EXPLAINER";
  else if (category === "Hormones & cortisol" || /cortisol|hormone|why this happens|explained|science/.test(text)) formatId = "F04_AESTHETIC_EDUCATIONAL";
  else if (/editorial|guide|reset guide/.test(text)) formatId = "F02_EDITORIAL_COLLAGE";

  const layoutByFormat: Record<string, HookLayout> = {
    F01_LIFESTYLE_GUIDE: "lifestyle-3stack",
    F02_EDITORIAL_COLLAGE: "editorial-asym-hero",
    F03_ROUTINE_TIMELINE: "routine-timeline",
    F04_AESTHETIC_EDUCATIONAL: "three-rect-educational",
    F05_INTERACTIVE_CHECKLIST: "interactive-checklist",
    F06_PERSONA_EXPLAINER: "persona-explainer",
    F07_RANKING: "ranking",
    F08_2X2: "grid-2x2",
  };
  return { conceptType, formatId, layout: layoutByFormat[formatId] ?? "lifestyle-3stack", requestedSlideCount: formatId === "F07_RANKING" ? 7 : 6 };
}
