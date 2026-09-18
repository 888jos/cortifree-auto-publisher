import crypto from 'node:crypto';

export type EditorialTopic = {
  topic_id: string; pillar_id: string; topic: string; angle: string; target_problem?: string | null;
  target_emotion?: string | null; eligible_formats: string; eligible_personas: string; weight?: number | null;
  cooldown_days?: number | null; active?: boolean | null;
};
export type EditorialHook = {
  hook_id: string; hook_family: string; formula: string; compatible_formats: string; compatible_pillars: string;
  persona_fit: string; weight?: number | null; cooldown_days?: number | null; active?: boolean | null;
};
export type EditorialCta = {
  cta_id: string; cta_family: string; text: string; compatible_formats: string; weight?: number | null; active?: boolean | null;
};
export type SelectionHistory = {
  account_id: string; topic_id?: string; hook_id?: string; final_hook?: string; visual_ref_id?: string;
  combo_key?: string; created_at?: string;
};

const split = (value: unknown) => String(value ?? '').split('|').map((x) => x.trim()).filter(Boolean);
const includesToken = (value: unknown, token: string) => {
  const values = split(value);
  return values.includes('all') || values.includes('ALL') || values.includes(token);
};
const daysSince = (iso?: string) => iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Number.POSITIVE_INFINITY;
const hoursSince = (iso?: string) => iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : Number.POSITIVE_INFINITY;

function unit(seed: string) {
  const digest = crypto.createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}
function weightedPick<T>(items: T[], getWeight: (item: T) => number, seed: string): T {
  if (!items.length) throw new Error('No eligible editorial candidates');
  const weights = items.map((item) => Math.max(0.0001, getWeight(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = unit(seed) * total;
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}
function recentForAccount(history: SelectionHistory[], accountId: string, field: keyof SelectionHistory, value: string, days: number) {
  return history.some((row) => row.account_id === accountId && String(row[field] ?? '') === value && daysSince(row.created_at) < days);
}
function recentNetwork(history: SelectionHistory[], field: keyof SelectionHistory, value: string, hours: number) {
  return history.some((row) => String(row[field] ?? '') === value && hoursSince(row.created_at) < hours);
}

export function fillHook(formula: string, topic: EditorialTopic, vars: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    topic: topic.topic,
    problem: topic.target_problem || 'this keeps happening',
    goal: vars.goal || topic.target_emotion || 'feel better',
    routine: vars.routine || topic.topic,
    time_period: vars.time_period || '7 days',
    result: vars.result || topic.target_emotion || 'grounded',
    n: vars.n || '5',
  };
  const out = formula.replace(/\{([a-z_]+)\}/gi, (_, key: string) => defaults[key] ?? vars[key] ?? '');
  if (/\{[^}]+\}/.test(out)) throw new Error(`Unresolved hook placeholder: ${out}`);
  return out;
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
}) {
  const {
    seed, accountId, personaId, pillarIds, formatIds, topics, hooks, ctas, history,
    accountTopicCooldownDays = 14, accountHookCooldownDays = 7,
    networkTopicCooldownHours = 48, networkHookCooldownHours = 48,
  } = input;
  const eligibleTopics = topics.filter((topic) =>
    topic.active !== false &&
    pillarIds.includes(topic.pillar_id) &&
    includesToken(topic.eligible_personas, personaId) &&
    formatIds.some((format) => includesToken(topic.eligible_formats, format)) &&
    !recentForAccount(history, accountId, 'topic_id', topic.topic_id, Number(topic.cooldown_days ?? accountTopicCooldownDays)) &&
    !recentNetwork(history, 'topic_id', topic.topic_id, networkTopicCooldownHours)
  );
  const topic = weightedPick(eligibleTopics, (x) => Number(x.weight ?? 1), `${seed}:topic`);
  const compatibleFormats = formatIds.filter((id) => includesToken(topic.eligible_formats, id));
  const formatId = compatibleFormats[Math.floor(unit(`${seed}:format`) * compatibleFormats.length)] ?? compatibleFormats[0];
  if (!formatId) throw new Error(`No compatible format for ${topic.topic_id}`);

  const eligibleHooks = hooks.filter((hook) =>
    hook.active !== false &&
    includesToken(hook.compatible_formats, formatId) &&
    (includesToken(hook.compatible_pillars, topic.pillar_id) || split(hook.compatible_pillars).includes('all')) &&
    includesToken(hook.persona_fit, personaId) &&
    !recentForAccount(history, accountId, 'hook_id', hook.hook_id, Number(hook.cooldown_days ?? accountHookCooldownDays))
  );
  const hook = weightedPick(eligibleHooks, (x) => Number(x.weight ?? 1), `${seed}:hook`);
  const finalHook = fillHook(hook.formula, topic);
  if (recentNetwork(history, 'final_hook', finalHook, networkHookCooldownHours)) {
    throw new Error(`Network hook cooldown collision: ${finalHook}`);
  }

  const eligibleCtas = ctas.filter((cta) => cta.active !== false && includesToken(cta.compatible_formats, formatId));
  const cta = weightedPick(eligibleCtas.length ? eligibleCtas : ctas.filter((x) => x.active !== false), (x) => Number(x.weight ?? 1), `${seed}:cta`);
  const comboKey = crypto.createHash('sha1').update([topic.topic_id, hook.hook_id, formatId, cta.cta_id].join('|')).digest('hex').slice(0, 16);
  return { topic, hook, finalHook, cta, formatId, comboKey };
}
