import { hookLibrary } from "../hook-library.js";

export type HookLayout = "single-image" | "grid-2x2";
export type HookGenerationPlan = {
  carouselType: string;
  layout: HookLayout;
  requestedSlideCount: 6;
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

  let carouselType = "C09_LIST";
  if (category === "Morning & night" || /morning|night|bed|sleep|waking|9pm/.test(text)) carouselType = /night|bed|sleep|waking|9pm/.test(text) ? "C12_NIGHT_ROUTINE" : "C01_MORNING_ROUTINE";
  else if (category === "Hormones & cortisol") carouselType = /started|habits/.test(text) ? "C04_THINGS_I_STARTED" : "C11_HORMONE_EDUCATION";
  else if (category === "Stress & calm") carouselType = /stopped/.test(text) ? "C03_THINGS_I_STOPPED" : /reset|routine/.test(text) ? "C08_MY_REALISTIC" : "C09_LIST";
  else if (category === "Overstimulation & reset") carouselType = /stopped|instead/.test(text) ? "C03_THINGS_I_STOPPED" : "C08_MY_REALISTIC";
  else if (category === "Energy & food") carouselType = /eat|breakfast|grocery|coffee/.test(text) ? "C09_LIST" : "C08_MY_REALISTIC";
  else if (category === "Glow-up & feminine") carouselType = "C05_GLOW_UP";
  else if (category === "Productivity & boundaries") carouselType = /stopped/.test(text) ? "C03_THINGS_I_STOPPED" : "C08_MY_REALISTIC";
  else if (category === "Weekly & seasonal reset") carouselType = "C02_CHECKLIST";
  else if (category === "Fitness & wellness") carouselType = /started|walking/.test(text) ? "C04_THINGS_I_STARTED" : "C08_MY_REALISTIC";

  const useGrid = /5 |habits|things|breakfast|grocery|checklist|tips|foods|eat|ideas|signs/.test(text) || category === "Energy & food" || category === "Weekly & seasonal reset";
  return { carouselType, layout: useGrid ? "grid-2x2" : "single-image", requestedSlideCount: 6 };
}
