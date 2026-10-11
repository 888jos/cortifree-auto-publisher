import { z } from "zod";
import type { CarouselSpec } from "./schemas";
import type { StructuredResult } from "./openai-client";

export const PLAIN_LANGUAGE_INSTRUCTIONS = `
You edit TikTok carousel copy written by a 20-something woman for her friends.
You receive numbered lines. Return the same number of lines, in the same order.
Rewrite ONLY a line that relies on a metaphor, personification, an exaggerated image or a joke instead of saying something concrete
(e.g. "my brain is actually online", "moving like a sleepy ghost", "outfit indecision has stolen my mornings", "motivation does not send calendar invites", "zero personality before 9am").
Replace the figurative part with the plain, concrete fact a viewer could act on, keeping her casual voice, the first person, the same rough length, all lowercase, no final period.
Line 1 is the hook. If it does not clearly say what the carousel is about (e.g. "when i need to wash up, i check my bathroom first" for a carousel about not shopping on a bad day), rewrite it into a short, natural hook that names the topic, in the same voice (e.g. "things i try before buying another product on a bad day").
Line 1 must never read like a blog or Pinterest title ("my simple reset when everything feels like too much", "5 easy ways to feel calmer"). If it does, rewrite it as something a girl would actually say: a specific moment, a confession or a "you" call-out (e.g. "what i do when i have 12 tabs open and zero brain left").
Leave every other line EXACTLY as it is, character for character, including tier prefixes ("S · "), section labels ("HOW TO |"), " | " separators, times ("10:15 - 10:20 · ") and hashtags.
Never add dashes, emoji, new advice or health claims.
`.trim();

export const plainLanguageSchema = z.object({ lines: z.array(z.string()) });

type PlainRequest = (options: {
  model: string;
  schema: typeof plainLanguageSchema;
  schemaName: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}) => Promise<StructuredResult<z.infer<typeof plainLanguageSchema>>>;

type Field = { get: (spec: CarouselSpec) => string; set: (spec: CarouselSpec, value: string) => void };

function fields(spec: CarouselSpec): Field[] {
  return [
    { get: (s) => s.hook, set: (s, v) => { s.hook = v; } },
    { get: (s) => s.caption, set: (s, v) => { s.caption = v; } },
    ...spec.slides.flatMap((_, index): Field[] => [
      { get: (s) => s.slides[index]!.headline, set: (s, v) => { s.slides[index]!.headline = v; } },
      { get: (s) => s.slides[index]!.body, set: (s, v) => { s.slides[index]!.body = v; } },
    ]),
  ];
}

/**
 * Rewrites figurative lines into plain concrete wording. Returns null when the
 * edit is unusable (wrong line count, or a structural marker went missing),
 * so callers keep the original draft.
 */
export async function plainLanguageEdit(spec: CarouselSpec, request: PlainRequest, model: string) {
  const list = fields(spec);
  const lines = list.map((field) => field.get(spec));
  const input = lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  const result = await request({
    model,
    schema: plainLanguageSchema,
    schemaName: "cortifree_plain_language",
    instructions: PLAIN_LANGUAGE_INSTRUCTIONS,
    input,
    maxOutputTokens: 2_400,
  });
  const edited = result.data.lines.map((line) => line.replace(/^\d+\.\s*/, ""));
  if (edited.length !== lines.length) return { spec: null, usage: result.usage };
  const keepsStructure = lines.every((original, index) => {
    const next = edited[index]!;
    if (!original.trim()) return !next.trim();
    const pipes = (value: string) => (value.match(/\|/g) ?? []).length;
    const prefix = (value: string) => value.match(/^\s*(?:SS|[SABCDF][+-]?)\s*·|^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/)?.[0] ?? "";
    return pipes(original) === pipes(next) && prefix(original) === prefix(next);
  });
  if (!keepsStructure) return { spec: null, usage: result.usage };
  const copy = structuredClone(spec);
  list.forEach((field, index) => field.set(copy, edited[index]!));
  // The hook also sits on slide 1: keep the two in step (F05 wraps it in quotes).
  const bare = (value: string) => value.replace(/^[\s“"']+|[\s”"']+$/g, "").toLowerCase();
  const cover = copy.slides[0];
  if (cover && copy.hook !== spec.hook && bare(spec.slides[0]!.headline) === bare(spec.hook) && bare(cover.headline) === bare(spec.hook)) {
    const quoted = /^[“"]/.test(cover.headline.trim());
    cover.headline = quoted ? `“${bare(copy.hook)}”` : copy.hook;
  }
  return { spec: copy, usage: result.usage };
}
