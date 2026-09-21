import languageBank from "../../../config/editorial/language-bank.json" with { type: "json" };
import type { CarouselSpec } from "./schemas";

export type GenericityIssue = { code: string; message: string; score: number };

export function scoreGenericity(spec: CarouselSpec): { score: number; issues: GenericityIssue[] } {
  const copy = [spec.title, spec.topic, spec.angle, spec.hook, spec.caption, ...spec.slides.flatMap((slide) => [slide.headline, slide.body])].join(" ").toLowerCase();
  const issues: GenericityIssue[] = [];
  for (const phrase of languageBank.blacklist) if (copy.includes(phrase.toLowerCase())) issues.push({ code: "BLACKLISTED_WELLNESS_CLICHE", message: `Blacklisted generic phrase: ${phrase}`, score: 3 });
  const abstract = /\b(meaningful|intentional|supportive|aligned|journey|wellness|self-care|feel better|more grounded|best self)\b/gi;
  const abstractHits = copy.match(abstract)?.length ?? 0;
  if (abstractHits >= 4) issues.push({ code: "ABSTRACT_COPY", message: "Too many abstract wellness terms", score: 2 });
  const concreteSlides = spec.slides.filter((slide) => /\b\d+\s*(min|minutes?|am|pm|glass|steps?)\b|\b(open|write|walk|put|make|turn|leave|drink|set|pack|delete|close|start|stop)\b/i.test(`${slide.headline} ${slide.body}`)).length;
  if (concreteSlides < Math.max(2, Math.ceil(spec.slides.length / 2))) issues.push({ code: "LOW_CONCRETENESS", message: "Too few concrete behaviors or details", score: 2 });
  if (!/\b(I|my|me|when I|I’m|i'm)\b/i.test(copy)) issues.push({ code: "NO_CREATOR_POINT_OF_VIEW", message: "Copy has no creator point of view", score: 2 });
  const headlines = spec.slides.map((slide) => slide.headline.toLowerCase());
  if (new Set(headlines).size < headlines.length) issues.push({ code: "REPETITIVE_HEADLINES", message: "Headlines repeat", score: 2 });
  return { score: issues.reduce((total, issue) => total + issue.score, 0), issues };
}

export function assertSpecificCarousel(spec: CarouselSpec) {
  const result = scoreGenericity(spec);
  if (result.score >= 3) throw new Error(`GENERICITY_QA_FAILED:${result.issues.map((issue) => issue.message).join(" | ")}`);
  return result;
}
