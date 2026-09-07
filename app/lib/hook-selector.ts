import { hookLibrary } from "../hook-library.js";

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
