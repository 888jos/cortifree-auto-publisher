import crypto from 'node:crypto';
import type { Account } from '../domain';
import { dataBackend } from '../lib/data-backend';
import { loadRuntimeAccounts, loadRuntimeEditorial, autonomyRuleValue } from '../runtime/config';
import { selectEditorial, type SelectionHistory } from './selection';
import { ACTIVE_FORMAT_IDS } from '../content/formats';
import { loadLearningWeights } from './learning';
import { claimContentSlot, ensureRollingSlots, syncContentSlotsFromCalendar } from './slots';

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
const ACTIVE_FORMAT_SET = new Set<string>(ACTIVE_FORMAT_IDS);
function formatIds(account: Account) {
  const configured = Object.keys(account.format_mix ?? {}).filter((key) => ACTIVE_FORMAT_SET.has(key));
  return configured.length ? configured : [...ACTIVE_FORMAT_IDS];
}
function pillarIds(account: Account) {
  const configured = Object.keys(account.pillar_mix ?? {}).filter((key) => key.startsWith('PILLAR_'));
  return configured.length ? configured : [account.primary_pillar_id, ...(account.secondary_pillar_ids ?? [])].filter(Boolean) as string[];
}

export async function runScheduler() {
  const [{ topics, ctas, autonomyRules }, accounts, learningWeights] = await Promise.all([
    loadRuntimeEditorial(),
    loadRuntimeAccounts(),
    loadLearningWeights(),
  ]);

  const calendarSync = await syncContentSlotsFromCalendar();
  const rolling = await ensureRollingSlots(accounts);
  const accountTopicCooldownDays = autonomyRuleValue(autonomyRules, 'account_topic_cooldown_days', 7);
  const report: Array<Record<string, unknown>> = [];

  const [networkIdeas, slotRows] = await Promise.all([
    rows('carousel_ideas?order=created_at.desc&limit=2000'),
    rows('content_slots?workspace_id=eq.cortifree&status=eq.OPEN&scheduled_for=gte.' + encodeURIComponent(new Date().toISOString()) + '&select=*&order=scheduled_for.asc&limit=2000'),
  ]);
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

    const horizon = Date.now() + Math.max(1, account.ready_buffer_days ?? 3) * 86_400_000;
    const demand = slotRows
      .filter((slot) => String(slot.account_id ?? '') === account.id)
      .filter((slot) => !slot.idea_id && Date.parse(String(slot.scheduled_for ?? '')) <= horizon)
      .sort((a,b) => Date.parse(String(a.scheduled_for ?? '')) - Date.parse(String(b.scheduled_for ?? '')));
    const history: SelectionHistory[] = [...networkHistory];
    let created = 0;
    const failures: Array<{ slot_id: string; reason: string }> = [];

    for (const [index, slot] of demand.entries()) {
      const slotId = String(slot.id);
      const slotStrategy = String(slot.strategy ?? strategy(index));
      const rawPreferredTopicId = String(slot.topic_id ?? '').trim();
      const preferredTopicId = /^T_/.test(rawPreferredTopicId) ? rawPreferredTopicId : '';
      const preferredPillarId = String(slot.pillar_id ?? '').trim();
      let picked: ReturnType<typeof selectEditorial> | null = null;
      let selectedSeed = '';

      for (let attempt = 0; attempt < 30 && !picked; attempt += 1) {
        selectedSeed = crypto.createHash('sha1').update(`${slotId}:${attempt}`).digest('hex');

        // Preserve the calendar intent first. When its topic/pillar/persona
        // eligibility is internally inconsistent, relax in controlled stages:
        // exact topic -> same pillar -> any configured account pillar.
        const topicPool = preferredTopicId && attempt < 10
          ? topics.filter((topic) => topic.topic_id === preferredTopicId)
          : topics;
        const allowedPillars = preferredPillarId && attempt < 18
          ? [preferredPillarId]
          : pillarIds(account);
        if (!topicPool.length || !allowedPillars.length) continue;
        try {
          picked = selectEditorial({
            seed: selectedSeed,
            accountId: account.id,
            personaId: account.persona_id,
            pillarIds: allowedPillars,
            formatIds: formatIds(account),
            topics: topicPool,
            hooks: [],
            ctas,
            history,
            accountTopicCooldownDays,
            pillarWeights: account.pillar_mix ?? {},
            formatWeights: account.format_mix ?? {},
            learningWeights,
            strategy: slotStrategy,
          });
        } catch {
          // Next deterministic attempt progressively relaxes stale calendar
          // constraints, never the account's configured editorial universe.
        }
      }

      if (!picked) {
        failures.push({ slot_id: slotId, reason: 'NO_ELIGIBLE_EDITORIAL' });
        continue;
      }

      const safeSlot = slotId.replace(/[^A-Z0-9]/gi,'').slice(-50);
      const id = `CF_IDEA_SLOT_${safeSlot}_${picked.comboKey}`;
      const row = {
        id,
        workspace_id: 'cortifree',
        account_id: account.id,
        persona_id: account.persona_id,
        slot_id: slotId,
        concept_id: slot.concept_id ?? null,
        pillar_id: picked.topic.pillar_id,
        content_type: picked.formatId,
        topic_id: picked.topic.topic_id,
        topic: picked.topic.topic,
        angle: picked.topic.angle,
        hook_id: picked.hook.hook_id,
        hook_formula: null,
        final_hook: null,
        cta_id: picked.cta.cta_id,
        cta_text: picked.cta.text,
        combo_key: picked.comboKey,
        strategy: slotStrategy,
        status: 'QUEUED',
        seed: selectedSeed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await write('carousel_ideas?on_conflict=id', row);
      await claimContentSlot(slotId, id, picked.formatId);
      history.push(row as unknown as SelectionHistory);
      networkHistory.push(row as unknown as SelectionHistory);
      created += 1;
    }

    report.push({
      account_id: account.id,
      source: 'content_slots',
      demand: demand.length,
      created,
      failures,
      ready_buffer_days: account.ready_buffer_days ?? 3,
    });
  }

  return {
    calendarSync,
    rollingSlots: rolling,
    accounts: report,
    mode: 'SLOT_FIRST',
  };
}

export async function createAcceptanceSample(input: { batchId?: string; limit?: number; formatIds?: string[] } = {}) {
  const [{ topics, ctas, autonomyRules }, allAccounts] = await Promise.all([
    loadRuntimeEditorial(),
    loadRuntimeAccounts(),
  ]);
  const batchId = input.batchId?.trim() || `E2E_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const defaultFormatCycle = [...ACTIVE_FORMAT_IDS];
  const requestedFormatIds = [...new Set((input.formatIds ?? [])
    .map((value) => String(value).trim())
    .filter((value) => ACTIVE_FORMAT_SET.has(value)))];
  const formatCycle = requestedFormatIds.length ? requestedFormatIds : defaultFormatCycle;
  const strictRequestedFormats = requestedFormatIds.length > 0;
  const defaultLimit = strictRequestedFormats ? requestedFormatIds.length : 20;
  const limit = Math.max(1, Math.min(20, input.limit ?? defaultLimit));
  // Acceptance is an offline QA sample, not a publishing run. Include every
  // configured persona (even when its account is intentionally disabled for
  // posting) so a 16-item sample really means one carousel per persona.
  const accounts = allAccounts
    .filter((account, index, source) => source.findIndex((candidate) => candidate.persona_id === account.persona_id) === index)
    .sort((left, right) => left.persona_id.localeCompare(right.persona_id, undefined, { numeric: true }));
  if (!accounts.length) return { batchId, requested: limit, created: 0, ideas: [] };
  const historyRows = await rows('carousel_ideas?order=created_at.desc&limit=2000');
  const history: SelectionHistory[] = historyRows.map((row) => ({
    account_id: String(row.account_id ?? ''), topic_id: row.topic_id ? String(row.topic_id) : undefined,
    hook_id: row.hook_id ? String(row.hook_id) : undefined, final_hook: row.final_hook ? String(row.final_hook) : undefined,
    visual_ref_id: row.visual_ref_id ? String(row.visual_ref_id) : undefined, combo_key: row.combo_key ? String(row.combo_key) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));
  const report: AnyRow[] = [];
  const plannedRows: AnyRow[] = [];
  const acceptanceHistory: SelectionHistory[] = [];
  for (let index = 0; index < limit; index += 1) {
    const account = accounts[index % accounts.length]!;
    let picked: ReturnType<typeof selectEditorial> | null = null;
    let selectedSeed = '';
    let requestedFormatId = formatCycle[index % formatCycle.length]!;
    let selectedFormatId = requestedFormatId;
    const formatAttempts = strictRequestedFormats ? 1 : formatCycle.length;
    for (let formatOffset = 0; formatOffset < formatAttempts && !picked; formatOffset += 1) {
      const formatId = formatCycle[(index + formatOffset) % formatCycle.length]!;
      for (let attempt = 0; attempt < 40 && !picked; attempt += 1) {
        selectedSeed = crypto.createHash('sha1').update(`${batchId}:${account.id}:${formatId}:${attempt}`).digest('hex');
        try {
          // First preserve normal production cooldowns. If the historical pool
          // is exhausted, relax only old-history cooldowns while retaining
          // uniqueness inside this acceptance batch.
          const selectionHistory = attempt < 20 ? [...history, ...acceptanceHistory] : acceptanceHistory;
          picked = selectEditorial({
            seed: selectedSeed, accountId: account.id, personaId: account.persona_id,
            pillarIds: pillarIds(account), formatIds: [formatId], topics, hooks: [], ctas, history: selectionHistory,
            accountTopicCooldownDays: attempt < 20 ? autonomyRuleValue(autonomyRules, 'account_topic_cooldown_days', 7) : 0,
          });
          if (picked) selectedFormatId = formatId;
        } catch { /* try another seed or the next compatible format */ }
      }
    }
    if (!picked) {
      throw new Error(`Acceptance sample incomplete: no eligible editorial for ${account.persona_id} in requested format ${requestedFormatId}`);
    }
    const id = `CF_E2E_IDEA_${batchId}_${String(index + 1).padStart(2, "0")}_${account.persona_id}_${selectedFormatId.slice(0, 3)}`.replace(/[^A-Z0-9_]/gi, '').slice(0, 120);
    const row = {
      id, workspace_id: 'cortifree', account_id: account.id, persona_id: account.persona_id,
      pillar_id: picked.topic.pillar_id, content_type: selectedFormatId, topic_id: picked.topic.topic_id,
      topic: picked.topic.topic, angle: picked.topic.angle, hook_id: picked.hook.hook_id,
      hook_formula: null, final_hook: null, cta_id: picked.cta.cta_id,
      cta_text: picked.cta.text, combo_key: picked.comboKey, strategy: strategy(index), status: 'QUEUED',
      seed: selectedSeed, acceptance_batch_id: batchId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    plannedRows.push(row);
    acceptanceHistory.push(row as unknown as SelectionHistory);
    report.push({
      id,
      account_id: account.id,
      persona_id: account.persona_id,
      requested_format_id: requestedFormatId,
      format_id: selectedFormatId,
      format_fallback: selectedFormatId !== requestedFormatId,
      status: 'QUEUED',
    });
  }
  for (const row of plannedRows) await write('carousel_ideas?on_conflict=id', row);
  return { batchId, requested: limit, created: report.filter((item) => item.status === 'QUEUED').length, ideas: report };
}
