import crypto from 'node:crypto';
import type { Account } from '../domain';
import { dataBackend } from '../lib/data-backend';
import { loadRuntimeAccounts, loadRuntimeEditorial, autonomyRuleValue } from '../runtime/config';
import { selectEditorial, type EditorialTopic, type EditorialHook, type EditorialCta, type SelectionHistory } from './selection';

type AnyRow = Record<string, unknown>;

async function rows(resource: string): Promise<AnyRow[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as AnyRow[];
}
async function write(resource: string, body: unknown) {
  const response = await dataBackend(resource, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
}
function seed(accountId: string, index: number) {
  return crypto.createHash('sha1').update(`${accountId}:${new Date().toISOString().slice(0, 10)}:${index}`).digest('hex');
}
function strategy(index: number) {
  const slot = index % 10;
  return slot < 7 ? 'PROVEN' : slot < 9 ? 'ADJACENT' : 'EXPERIMENT';
}
function formatIds(account: Account) {
  const configured = Object.keys(account.format_mix ?? {}).filter((key) => /^F0[1-8]_/.test(key) || key === 'F08_2X2');
  return configured.length ? configured : [
    'F01_LIFESTYLE_GUIDE',
    'F02_EDITORIAL_COLLAGE',
    'F03_ROUTINE_TIMELINE',
    'F04_AESTHETIC_EDUCATIONAL',
    'F05_INTERACTIVE_CHECKLIST',
    'F06_PERSONA_EXPLAINER',
    'F07_RANKING',
    'F08_2X2',
  ];
}
function pillarIds(account: Account) {
  const configured = Object.keys(account.pillar_mix ?? {}).filter((key) => key.startsWith('PILLAR_'));
  return configured.length ? configured : [account.primary_pillar_id, ...(account.secondary_pillar_ids ?? [])].filter(Boolean) as string[];
}

export async function runScheduler() {
  const [{ topics, hooks, ctas, autonomyRules }, accounts] = await Promise.all([
    loadRuntimeEditorial(),
    loadRuntimeAccounts(),
  ]);
  const accountTopicCooldownDays = autonomyRuleValue(autonomyRules, 'account_topic_cooldown_days', 14);
  const accountHookCooldownDays = autonomyRuleValue(autonomyRules, 'account_hook_cooldown_days', 7);
  const networkTopicCooldownHours = autonomyRuleValue(autonomyRules, 'network_topic_cooldown_hours', 48);
  const networkHookCooldownHours = autonomyRuleValue(autonomyRules, 'network_final_hook_cooldown_hours', 48);
  const report: Array<Record<string, unknown>> = [];
  const networkIdeas = await rows('carousel_ideas?order=created_at.desc&limit=2000');
  const networkHistory: SelectionHistory[] = networkIdeas.map((row) => ({
    account_id: String(row.account_id ?? ''),
    topic_id: row.topic_id ? String(row.topic_id) : undefined,
    hook_id: row.hook_id ? String(row.hook_id) : undefined,
    final_hook: row.final_hook ? String(row.final_hook) : undefined,
    visual_ref_id: row.visual_ref_id ? String(row.visual_ref_id) : undefined,
    combo_key: row.combo_key ? String(row.combo_key) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));

  for (const account of accounts) {
    if (!account.enabled || ['PAUSED','ERROR'].includes(account.warmup_status)) {
      report.push({ account_id: account.id, action: 'SKIP_DISABLED' });
      continue;
    }
    const existingIdeas = await rows(`carousel_ideas?account_id=eq.${encodeURIComponent(account.id)}&limit=500`);
    const readyCarousels = await rows(`carousels?account_id=eq.${encodeURIComponent(account.id)}&limit=500`);
    const bufferedCarousels = readyCarousels.filter((row) => ['DRAFT','READY_FOR_REVIEW','APPROVED','SCHEDULED'].includes(String(row.status)));
    const queuedIdeas = existingIdeas.filter((row) => ['QUEUED','GENERATING'].includes(String(row.status)));
    // posting_slots are candidate windows, not the number of posts to create.
    // Warm-up accounts can legitimately have two available slots while targeting only one post/day.
    const dailyCadence = Math.max(account.daily_target, 1);
    const target = Math.max(1, dailyCadence * (account.ready_buffer_days ?? 3));
    const missing = Math.max(0, target - bufferedCarousels.length - queuedIdeas.length);
    const history: SelectionHistory[] = [...networkHistory];

    let created = 0;
    for (let index = 0; index < missing; index += 1) {
      let picked: ReturnType<typeof selectEditorial> | null = null;
      let selectedSeed = '';
      for (let attempt = 0; attempt < 12 && !picked; attempt += 1) {
        selectedSeed = seed(account.id, index * 20 + attempt);
        try {
          picked = selectEditorial({
            seed: selectedSeed, accountId: account.id, personaId: account.persona_id,
            pillarIds: pillarIds(account), formatIds: formatIds(account), topics, hooks, ctas, history,
            accountTopicCooldownDays, accountHookCooldownDays, networkTopicCooldownHours, networkHookCooldownHours,
          });
        } catch {
          // Try another deterministic seed before conceding that the eligible pool is exhausted.
        }
      }
      if (!picked) break;
      const dayKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const id = `CF_IDEA_${account.id.replace(/[^A-Z0-9]/gi, '')}_${dayKey}_${picked.comboKey}`;
      const row = {
        id, workspace_id: 'cortifree', account_id: account.id, persona_id: account.persona_id,
        pillar_id: picked.topic.pillar_id, content_type: picked.formatId,
        topic_id: picked.topic.topic_id, topic: picked.topic.topic, angle: picked.topic.angle,
        hook_id: picked.hook.hook_id, hook_formula: picked.hook.formula, final_hook: picked.finalHook,
        cta_id: picked.cta.cta_id, cta_text: picked.cta.text, combo_key: picked.comboKey,
        strategy: strategy(index), status: 'QUEUED', seed: selectedSeed, created_at: new Date().toISOString(),
      };
      await write('carousel_ideas?on_conflict=id', row);
      history.push(row as SelectionHistory);
      networkHistory.push(row as SelectionHistory);
      created += 1;
    }
    report.push({ account_id: account.id, target, buffered: bufferedCarousels.length, queued: queuedIdeas.length, created });
  }
  return report;
}

export async function createAcceptanceSample(input: { batchId?: string; limit?: number } = {}) {
  const [{ topics, hooks, ctas, autonomyRules }, allAccounts] = await Promise.all([
    loadRuntimeEditorial(),
    loadRuntimeAccounts(),
  ]);
  const batchId = input.batchId?.trim() || `E2E_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const limit = Math.max(1, Math.min(16, input.limit ?? 16));
  const accounts = allAccounts
    .filter((account) => account.enabled && !['PAUSED', 'ERROR'].includes(account.warmup_status))
    .filter((account, index, source) => source.findIndex((candidate) => candidate.persona_id === account.persona_id) === index)
    .slice(0, limit);
  const historyRows = await rows('carousel_ideas?order=created_at.desc&limit=2000');
  const history: SelectionHistory[] = historyRows.map((row) => ({
    account_id: String(row.account_id ?? ''), topic_id: row.topic_id ? String(row.topic_id) : undefined,
    hook_id: row.hook_id ? String(row.hook_id) : undefined, final_hook: row.final_hook ? String(row.final_hook) : undefined,
    visual_ref_id: row.visual_ref_id ? String(row.visual_ref_id) : undefined, combo_key: row.combo_key ? String(row.combo_key) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));
  const formatCycle = ['F01_LIFESTYLE_GUIDE','F02_EDITORIAL_COLLAGE','F03_ROUTINE_TIMELINE','F04_AESTHETIC_EDUCATIONAL','F05_INTERACTIVE_CHECKLIST','F06_PERSONA_EXPLAINER','F07_RANKING','F08_2X2'];
  const report: AnyRow[] = [];
  for (const [index, account] of accounts.entries()) {
    const formatId = formatCycle[index % formatCycle.length]!;
    let picked: ReturnType<typeof selectEditorial> | null = null;
    let selectedSeed = '';
    for (let attempt = 0; attempt < 20 && !picked; attempt += 1) {
      selectedSeed = crypto.createHash('sha1').update(`${batchId}:${account.id}:${attempt}`).digest('hex');
      try {
        picked = selectEditorial({
          seed: selectedSeed, accountId: account.id, personaId: account.persona_id,
          pillarIds: pillarIds(account), formatIds: [formatId], topics, hooks, ctas, history,
          accountTopicCooldownDays: autonomyRuleValue(autonomyRules, 'account_topic_cooldown_days', 14),
          accountHookCooldownDays: autonomyRuleValue(autonomyRules, 'account_hook_cooldown_days', 7),
          networkTopicCooldownHours: autonomyRuleValue(autonomyRules, 'network_topic_cooldown_hours', 48),
          networkHookCooldownHours: autonomyRuleValue(autonomyRules, 'network_final_hook_cooldown_hours', 48),
        });
      } catch { /* try the next deterministic seed */ }
    }
    if (!picked) {
      report.push({ account_id: account.id, persona_id: account.persona_id, format_id: formatId, status: 'NO_ELIGIBLE_EDITORIAL' });
      continue;
    }
    const id = `CF_E2E_IDEA_${batchId}_${account.persona_id}_${formatId.slice(0, 3)}`.replace(/[^A-Z0-9_]/gi, '').slice(0, 120);
    const row = {
      id, workspace_id: 'cortifree', account_id: account.id, persona_id: account.persona_id,
      pillar_id: picked.topic.pillar_id, content_type: formatId, topic_id: picked.topic.topic_id,
      topic: picked.topic.topic, angle: picked.topic.angle, hook_id: picked.hook.hook_id,
      hook_formula: picked.hook.formula, final_hook: picked.finalHook, cta_id: picked.cta.cta_id,
      cta_text: picked.cta.text, combo_key: picked.comboKey, strategy: strategy(index), status: 'QUEUED',
      seed: selectedSeed, acceptance_batch_id: batchId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    await write('carousel_ideas?on_conflict=id', row);
    history.push(row as SelectionHistory);
    report.push({ id, account_id: account.id, persona_id: account.persona_id, format_id: formatId, status: 'QUEUED' });
  }
  return { batchId, requested: limit, created: report.filter((item) => item.status === 'QUEUED').length, ideas: report };
}
