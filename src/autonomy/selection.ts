import crypto from "node:crypto";
import { learningMultiplier, type LearningWeights } from "./learning";

export type EditorialTopic = {
  topic_id: string;
  pillar_id: string;
  topic: string;
  angle: string;
  angle_family?: string | null;
  planning_only?: boolean | null;
  target_problem?: string | null;
  target_emotion?: string | null;
  eligible_formats: string;
  eligible_personas: string;
  weight?: number | null;
  cooldown_days?: number | null;
  active?: boolean | null;
};

export type EditorialHook = {
  hook_id: string;
  hook_family: string;
  formula?: string | null;
  compatible_formats: string;
  compatible_pillars: string;
  persona_fit: string;
  weight?: number | null;
  cooldown_days?: number | null;
  active?: boolean | null;
  runtime_use?: string | null;
  publishable?: boolean | null;
  human_status?: string | null;
  version?: string | number | null;
};

export type EditorialCta = {
  cta_id: string;
  cta_family: string;
  text: string;
  compatible_formats: string;
  weight?: number | null;
  active?: boolean | null;
};

export type SelectionHistory = {
  account_id: string;
  topic_id?: string;
  hook_id?: string;
  final_hook?: string;
  visual_ref_id?: string;
  combo_key?: string;
  created_at?: string;
};

export type HookStyleReference = {
  id: string;
  text: string;
  humanStatus?: string;
  version?: string;
};

const split = (value: unknown) => String(value ?? "").split("|").map((x) => x.trim()).filter(Boolean);
const includesToken = (value: unknown, token: string) => {
  const values = split(value);
  return values.includes("all") || values.includes("ALL") || values.includes(token);
};
const daysSince = (iso?: string) => iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Number.POSITIVE_INFINITY;
const hoursSince = (iso?: string) => iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : Number.POSITIVE_INFINITY;

function unit(seed: string) {
  const digest = crypto.createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function weightedPick<T>(items: T[], getWeight: (item: T) => number, seed: string): T {
  if (!items.length) throw new Error("No eligible editorial candidates");
  const weights = items.map((item) => Math.max(0.0001, getWeight(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = unit(seed) * total;
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function recentForAccount(history: SelectionHistory[], accountId: string, field: keyof SelectionHistory, value: string, days: number) {
  return history.some((row) => row.account_id === accountId && String(row[field] ?? "") === value && daysSince(row.created_at) < days);
}

function isStyleReference(hook: EditorialHook) {
  const runtimeUse = String(hook.runtime_use ?? "").toUpperCase();
  const status = String(hook.human_status ?? "").toUpperCase();
  return runtimeUse === "STYLE_REFERENCE" || status === "REFERENCE_SEED";
}

function isConceptHook(hook: EditorialHook) {
  return !isStyleReference(hook) && String(hook.hook_family ?? "").toLowerCase() !== "style_reference";
}

function referenceText(hook: EditorialHook) {
  return String(hook.formula ?? "").trim();
}

export function selectEditorial(input: {
  seed: string;
  accountId: string;
  personaId: string;
  pillarIds: string[];
  formatIds: string[];
  topics: EditorialTopic[];
  hooks: EditorialHook[];
  ctas: EditorialCta[];
  history: SelectionHistory[];
  accountTopicCooldownDays?: number;
  accountHookCooldownDays?: number;
  networkTopicCooldownHours?: number;
  networkHookCooldownHours?: number;
  pillarWeights?: Record<string, number>;
  formatWeights?: Record<string, number>;
  learningWeights?: LearningWeights;
  strategy?: string;
}) {
  const {
    seed, accountId, personaId, pillarIds, formatIds, topics, hooks, ctas, history,
    accountTopicCooldownDays = 14, accountHookCooldownDays = 7,
    networkTopicCooldownHours = 48,
    pillarWeights = {}, formatWeights = {}, learningWeights, strategy = "PROVEN",
  } = input;

  const eligibleTopics = topics.filter((topic) =>
    topic.active !== false &&
    pillarIds.includes(topic.pillar_id) &&
    includesToken(topic.eligible_personas, personaId) &&
    formatIds.some((format) => includesToken(topic.eligible_formats, format)) &&
    !recentForAccount(history, accountId, "topic_id", topic.topic_id, Number(topic.cooldown_days ?? accountTopicCooldownDays))
  );

  const topic = weightedPick(
    eligibleTopics,
    (x) => Number(x.weight ?? 1)
      * Math.max(0.05, Number(pillarWeights[x.pillar_id] ?? 1))
      * learningMultiplier(learningWeights?.topic, x.topic_id, strategy)
      * learningMultiplier(learningWeights?.pillar, x.pillar_id, strategy),
    `${seed}:topic`,
  );

  const compatibleFormats = formatIds.filter((id) => includesToken(topic.eligible_formats, id));
  const formatId = compatibleFormats.length
    ? weightedPick(
        compatibleFormats,
        (id) => Math.max(0.05, Number(formatWeights[id] ?? 1))
          * learningMultiplier(learningWeights?.format, id, strategy),
        `${seed}:format`,
      )
    : undefined;
  if (!formatId) throw new Error(`No compatible format for ${topic.topic_id}`);

  const eligibleConceptHooks = hooks.filter((hook) =>
    hook.active !== false &&
    isConceptHook(hook) &&
    includesToken(hook.compatible_formats, formatId) &&
    (includesToken(hook.compatible_pillars, topic.pillar_id) || split(hook.compatible_pillars).includes("all")) &&
    includesToken(hook.persona_fit, personaId) &&
    !recentForAccount(history, accountId, "hook_id", hook.hook_id, Number(hook.cooldown_days ?? accountHookCooldownDays))
  );

  const hook = weightedPick(
    eligibleConceptHooks,
    (x) => Number(x.weight ?? 1) * learningMultiplier(learningWeights?.hook, x.hook_id, strategy),
    `${seed}:hook-family`,
  );

  const hookReferences: HookStyleReference[] = hooks
    .filter((candidate) =>
      candidate.active !== false &&
      isStyleReference(candidate) &&
      includesToken(candidate.compatible_formats, formatId) &&
      referenceText(candidate).length > 0
    )
    .map((candidate) => ({
      candidate,
      score: unit(`${seed}:hook-reference:${candidate.hook_id}`),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ candidate }) => ({
      id: candidate.hook_id,
      text: referenceText(candidate),
      humanStatus: candidate.human_status ? String(candidate.human_status) : undefined,
      version: candidate.version === null || candidate.version === undefined ? undefined : String(candidate.version),
    }));

  const eligibleCtas = ctas.filter((cta) => cta.active !== false && includesToken(cta.compatible_formats, formatId));
  const cta = weightedPick(
    eligibleCtas.length ? eligibleCtas : ctas.filter((x) => x.active !== false),
    (x) => Number(x.weight ?? 1),
    `${seed}:cta`,
  );

  const comboKey = crypto.createHash("sha1")
    .update([topic.topic_id, hook.hook_family, formatId, cta.cta_id].join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    topic,
    hook,
    hookFamily: hook.hook_family,
    hookReferences,
    cta,
    formatId,
    comboKey,
    // Kept only so older callers fail safe instead of receiving interpolated legacy copy.
    finalHook: "",
  };
}
