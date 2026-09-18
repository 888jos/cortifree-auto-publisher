import { dataBackend } from "./data-backend";
import { DEFAULT_AUTONOMY_POLICY, noveltyPenalty } from "./autonomy-policy";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";

type TopicRow = {
  topic_id: string; pillar_id?: string; topic: string; angle: string; target_problem?: string; target_emotion?: string;
  eligible_formats?: string; eligible_personas?: string; priority?: string; weight?: number; cooldown_days?: number;
  use_count?: number; last_used_at?: string | null; active?: boolean;
};
type HookRow = {
  hook_id: string; hook_family?: string; formula: string; compatible_formats?: string; compatible_pillars?: string;
  weight?: number; cooldown_days?: number; use_count?: number; last_used_at?: string | null; active?: boolean;
};
type CtaRow = {
  cta_id: string; cta_family?: string; text: string; compatible_formats?: string; weight?: number;
  cooldown_days?: number; use_count?: number; last_used_at?: string | null; active?: boolean;
};

export type EditorialPackage = { topic: TopicRow; hook: HookRow; hookText: string; cta: CtaRow };

function includesToken(value: string | undefined, token: string) {
  if (!value || value.toLowerCase() === "all") return true;
  return value.split("|").map((part) => part.trim()).includes(token);
}

function priorityBoost(priority?: string) {
  if (priority === "HIGH") return 18;
  if (priority === "LOW") return -8;
  return 0;
}

function fillHook(formula: string, topic: TopicRow) {
  const vars: Record<string, string> = {
    topic: topic.topic,
    routine: topic.topic,
    problem: topic.target_problem || "your routine feels hard to keep",
    goal: topic.target_emotion ? `feel more ${topic.target_emotion}` : "make it easier to stay consistent",
    result: topic.target_emotion || "grounded",
    time_period: "7 days",
    n: "5",
  };
  const rendered = formula.replace(/\{([a-z_]+)\}/gi, (_, key: string) => vars[key] ?? "");
  return rendered.replace(/\s+/g, " ").trim().slice(0, 90);
}

async function readTable<T>(table: string): Promise<T[]> {
  const response = await dataBackend(`${table}?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&active=eq.true&select=*&limit=5000`);
  if (!response.ok) return [];
  return await response.json() as T[];
}

export async function selectEditorialPackage(input: {
  carouselType: string;
  personaId?: string;
  recentTopics?: string[];
  recentHooks?: string[];
  now?: number;
}): Promise<EditorialPackage | null> {
  const [topics, hooks, ctas] = await Promise.all([
    readTable<TopicRow>("content_topics"),
    readTable<HookRow>("content_hooks"),
    readTable<CtaRow>("content_ctas"),
  ]);
  if (!topics.length || !hooks.length || !ctas.length) return null;
  const now = input.now ?? Date.now();
  const recentTopics = new Set((input.recentTopics ?? []).map((x) => x.toLowerCase()));
  const recentHooks = new Set((input.recentHooks ?? []).map((x) => x.toLowerCase()));

  const topic = topics
    .filter((row) => includesToken(row.eligible_formats, input.carouselType))
    .filter((row) => !input.personaId || includesToken(row.eligible_personas, input.personaId))
    .map((row) => {
      let score = (row.weight ?? 1) * 20 + priorityBoost(row.priority);
      score -= noveltyPenalty(row.last_used_at, row.use_count, row.cooldown_days ?? DEFAULT_AUTONOMY_POLICY.topicCooldownDays, now);
      if (recentTopics.has(row.topic.toLowerCase())) score -= 100;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score || a.row.topic_id.localeCompare(b.row.topic_id))[0]?.row;
  if (!topic) return null;

  const hook = hooks
    .filter((row) => includesToken(row.compatible_formats, input.carouselType))
    .filter((row) => includesToken(row.compatible_pillars, topic.pillar_id ?? ""))
    .map((row) => {
      const hookText = fillHook(row.formula, topic);
      let score = (row.weight ?? 1) * 20;
      score -= noveltyPenalty(row.last_used_at, row.use_count, row.cooldown_days ?? DEFAULT_AUTONOMY_POLICY.hookCooldownDays, now);
      if (recentHooks.has(hookText.toLowerCase())) score -= 120;
      return { row, hookText, score };
    })
    .filter((item) => item.hookText.length >= 8)
    .sort((a, b) => b.score - a.score || a.row.hook_id.localeCompare(b.row.hook_id))[0];
  if (!hook) return null;

  const cta = ctas
    .filter((row) => includesToken(row.compatible_formats, input.carouselType))
    .map((row) => ({
      row,
      score: (row.weight ?? 1) * 20 - noveltyPenalty(row.last_used_at, row.use_count, row.cooldown_days ?? 3, now),
    }))
    .sort((a, b) => b.score - a.score || a.row.cta_id.localeCompare(b.row.cta_id))[0]?.row;
  if (!cta) return null;

  return { topic, hook: hook.row, hookText: hook.hookText, cta };
}

async function mark(table: string, key: string, id: string, useCount = 0) {
  await dataBackend(`${table}?${key}=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ use_count: useCount + 1, last_used_at: new Date().toISOString() }),
  });
}

export async function markEditorialUsage(selected: EditorialPackage) {
  await Promise.all([
    mark("content_topics", "topic_id", selected.topic.topic_id, selected.topic.use_count ?? 0),
    mark("content_hooks", "hook_id", selected.hook.hook_id, selected.hook.use_count ?? 0),
    mark("content_ctas", "cta_id", selected.cta.cta_id, selected.cta.use_count ?? 0),
  ]);
}
