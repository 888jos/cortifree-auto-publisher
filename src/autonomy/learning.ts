import { dataBackend } from "../../app/lib/data-backend";

type Row = Record<string, unknown>;
export type LearningWeights = {
  topic: Record<string, number>;
  hook: Record<string, number>;
  format: Record<string, number>;
  pillar: Record<string, number>;
};

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

const clamp = (value: number) => Math.max(0.35, Math.min(2.5, value));
function apply(map: Record<string, number>, key: unknown, multiplier: number) {
  const id = String(key ?? "").trim();
  if (!id) return;
  map[id] = clamp((map[id] ?? 1) * multiplier);
}

export function strategyExponent(strategy: string | null | undefined) {
  if (strategy === "PROVEN") return 1.35;
  if (strategy === "ADJACENT") return 0.65;
  return 0;
}

export function learningMultiplier(map: Record<string, number> | undefined, key: string, strategy: string | null | undefined) {
  const raw = map?.[key] ?? 1;
  const exponent = strategyExponent(strategy);
  return exponent === 0 ? 1 : Math.pow(raw, exponent);
}

export async function loadLearningWeights(): Promise<LearningWeights> {
  const [carousels, events] = await Promise.all([
    rows("carousels?workspace_id=eq.cortifree&select=id,topic_id,hook_id,format_id,content_type,pillar_id,is_winner,performance_score&order=created_at.desc&limit=1500"),
    rows("carousel_review_events?workspace_id=eq.cortifree&event_type=in.(REJECTED,REJECTED_FOR_REVISION)&select=carousel_id,event_type,patch_plan,created_at&order=created_at.desc&limit=1500"),
  ]);
  const weights: LearningWeights = { topic: {}, hook: {}, format: {}, pillar: {} };
  const byId = new Map(carousels.map((row) => [String(row.id), row]));

  for (const carousel of carousels) {
    if (carousel.is_winner !== true) continue;
    const score = Number(carousel.performance_score ?? 0);
    const boost = score > 0 ? 1.28 : 1.18;
    apply(weights.topic, carousel.topic_id, boost);
    apply(weights.hook, carousel.hook_id, boost);
    apply(weights.format, carousel.format_id ?? carousel.content_type, 1.18);
    apply(weights.pillar, carousel.pillar_id, 1.10);
  }

  for (const event of events) {
    const carousel = byId.get(String(event.carousel_id ?? ""));
    if (!carousel) continue;
    const plan = event.patch_plan && typeof event.patch_plan === "object" ? event.patch_plan as Record<string, unknown> : {};
    const code = String(plan.reason_code ?? plan.rejection_reason_code ?? "OTHER");
    if (code === "HOOK_WEAK") apply(weights.hook, carousel.hook_id, 0.72);
    if (code === "FORMAT_BAD") apply(weights.format, carousel.format_id ?? carousel.content_type, 0.72);
    if (["COPY_AI","GENERIC","CONCEPT_BAD"].includes(code)) {
      apply(weights.topic, carousel.topic_id, 0.82);
      apply(weights.pillar, carousel.pillar_id, 0.92);
    }
    if (["IMAGES_BAD","PERSONA_MISMATCH","IMAGES_REPETITIVE"].includes(code)) {
      apply(weights.format, carousel.format_id ?? carousel.content_type, 0.90);
    }
  }

  return weights;
}
