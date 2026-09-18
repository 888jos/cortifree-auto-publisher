import crypto from "node:crypto";
import type { Account } from "../domain";
import { dataBackend } from "../lib/data-backend";
import { loadRuntimeAccounts, loadRuntimeEditorial, autonomyRuleValue } from "../runtime/config";
import { selectEditorial, type SelectionHistory } from "./selection";
import { processQueuedIdeas } from "./processor";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function write(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
}
function formats(account: Account) {
  const configured = Object.keys(account.format_mix ?? {}).filter((key) => /^C\d{2}/.test(key));
  return configured.length ? configured : [
    "C01_MORNING_ROUTINE","C02_CHECKLIST","C05_GLOW_UP","C08_MY_REALISTIC",
    "C09_LIST","C12_NIGHT_ROUTINE","C13_EDUCATIONAL_EXPLAINER"
  ];
}
function pillars(account: Account) {
  const configured = Object.keys(account.pillar_mix ?? {}).filter((key) => key.startsWith("PILLAR_"));
  return configured.length ? configured : [account.primary_pillar_id, ...(account.secondary_pillar_ids ?? [])].filter(Boolean) as string[];
}
function seeded(batchId: string, index: number, attempt: number) {
  return crypto.createHash("sha256").update(`${batchId}:${index}:${attempt}`).digest("hex");
}

export async function runAcceptanceBatch(input: { accountId?: string; count?: number } = {}) {
  const accountId = input.accountId ?? process.env.ACCEPTANCE_ACCOUNT_ID ?? "CF_EN_01";
  const count = Math.max(1, Math.min(20, input.count ?? 20));
  const [{ topics, hooks, ctas, autonomyRules }, accounts] = await Promise.all([
    loadRuntimeEditorial(),
    loadRuntimeAccounts(),
  ]);
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`Acceptance account ${accountId} not found`);
  if (!account.enabled) throw new Error(`Acceptance account ${accountId} is not enabled for generation`);

  const batchId = `ACC_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${accountId}`;
  const existingIdeas = await rows("carousel_ideas?order=created_at.desc&limit=3000");
  const history: SelectionHistory[] = existingIdeas.map((row) => ({
    account_id: String(row.account_id ?? ""),
    topic_id: row.topic_id ? String(row.topic_id) : undefined,
    hook_id: row.hook_id ? String(row.hook_id) : undefined,
    final_hook: row.final_hook ? String(row.final_hook) : undefined,
    combo_key: row.combo_key ? String(row.combo_key) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));

  const topicDays = autonomyRuleValue(autonomyRules, "account_topic_cooldown_days", 14);
  const hookDays = autonomyRuleValue(autonomyRules, "account_hook_cooldown_days", 7);
  const topicHours = autonomyRuleValue(autonomyRules, "network_topic_cooldown_hours", 48);
  const hookHours = autonomyRuleValue(autonomyRules, "network_final_hook_cooldown_hours", 48);

  const created: string[] = [];
  for (let index = 0; index < count; index += 1) {
    let picked: ReturnType<typeof selectEditorial> | null = null;
    let seed = "";
    for (let attempt = 0; attempt < 60 && !picked; attempt += 1) {
      seed = seeded(batchId, index, attempt);
      try {
        picked = selectEditorial({
          seed,
          accountId,
          personaId: account.persona_id,
          pillarIds: pillars(account),
          formatIds: formats(account),
          topics,
          hooks,
          ctas,
          history,
          accountTopicCooldownDays: topicDays,
          accountHookCooldownDays: hookDays,
          networkTopicCooldownHours: topicHours,
          networkHookCooldownHours: hookHours,
        });
      } catch {
        // Keep searching for a non-colliding deterministic combination.
      }
    }
    if (!picked) throw new Error(`Acceptance selection pool exhausted after ${created.length} ideas`);
    const id = `CF_ACC_${batchId}_${String(index + 1).padStart(2, "0")}_${picked.comboKey}`;
    const row = {
      id,
      workspace_id: "cortifree",
      account_id: account.id,
      persona_id: account.persona_id,
      pillar_id: picked.topic.pillar_id,
      content_type: picked.formatId,
      topic_id: picked.topic.topic_id,
      topic: picked.topic.topic,
      angle: picked.topic.angle,
      hook_id: picked.hook.hook_id,
      hook_formula: picked.hook.formula,
      final_hook: picked.finalHook,
      cta_id: picked.cta.cta_id,
      cta_text: picked.cta.text,
      combo_key: picked.comboKey,
      strategy: "ACCEPTANCE",
      acceptance_batch_id: batchId,
      status: "QUEUED",
      seed,
      created_at: new Date().toISOString(),
    };
    await write("carousel_ideas?on_conflict=id", row);
    history.push(row as SelectionHistory);
    created.push(id);
  }

  const processed = await processQueuedIdeas(count, { acceptanceBatchId: batchId });
  return {
    batchId,
    accountId,
    requested: count,
    seeded: created.length,
    ideas: created,
    processed,
    readyForManualReview: processed.filter((row) => ["READY_FOR_REVIEW","APPROVED"].includes(String(row.status))).length,
  };
}
