import crypto from 'node:crypto';
import { learningMultiplier, type LearningWeights } from './learning';

export const DYNAMIC_HOOK_ID = 'DYNAMIC';

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
  return items[items.length - 1]!;
}
function recentForAccount(history: SelectionHistory[], accountId: string, field: keyof SelectionHistory, value: string, days: number) {
  return history.some((row) => row.account_id === accountId && String(row[field] ?? '') === value && daysSince(row.created_at) < days);
}

/**
 * Legacy helper kept only so archived data/tests can still be interpreted.
 * Production selection no longer interpolates hook formulas.
 */
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

function dynamicHook(): EditorialHook {
  return {
    hook_id: DYNAMIC_HOOK_ID,
    hook_family: 'dynamic',
    formula: '',
    compatible_formats: 'all',
    compatible_pillars: 'all',
    persona_fit: 'ALL',
    weight: 1,
    cooldown_days: 0,
    active: true,
  };
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
    seed, accountId, personaId, pillarIds, formatIds, topics, ctas, history,
    accountTopicCooldownDays = 7,
    pillarWeights = {}, formatWeights = {}, learningWeights, strategy = 'PROVEN',
  } = input;

  // A territory is deliberately broad and may be used by different accounts on
  // the same day. Diversity is enforced by per-account territory cooldowns,
  // recent generated copy, and the model/QA layer, not a network-wide territory lock.
  const eligibleTopics = topics.filter((topic) =>
    topic.active !== false &&
    pillarIds.includes(topic.pillar_id) &&
    includesToken(topic.eligible_personas, personaId) &&
    formatIds.some((format) => includesToken(topic.eligible_formats, format)) &&
    !recentForAccount(history, accountId, 'topic_id', topic.topic_id, Number(topic.cooldown_days ?? accountTopicCooldownDays))
  );
  const topic = weightedPick(
    eligibleTopics,
    (x) => Number(x.weight ?? 1)
      * Math.max(0.05, Number(pillarWeights[x.pillar_id] ?? 1))
      * learningMultiplier(learningWeights?.topic, x.topic_id, strategy)
      * learningMultiplier(learningWeights?.pillar, x.pillar_id, strategy),
    `${seed}:territory`,
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

  const eligibleCtas = ctas.filter((cta) => cta.active !== false && includesToken(cta.compatible_formats, formatId));
  const fallbackCtas = ctas.filter((cta) => cta.active !== false);
  const cta = weightedPick(eligibleCtas.length ? eligibleCtas : fallbackCtas, (x) => Number(x.weight ?? 1), `${seed}:cta`);
  const hook = dynamicHook();
  const comboKey = crypto.createHash('sha1').update([topic.topic_id, formatId, cta.cta_id].join('|')).digest('hex').slice(0, 16);

  // finalHook stays empty here on purpose. The generator creates it together
  // with the concept/body so the hook is coherent instead of formula-filled.
  return { topic, hook, finalHook: '', cta, formatId, comboKey };
}
