import crypto from "node:crypto";
import { dataBackend } from "../data-backend";
import { loadRuntimeAccounts, loadRuntimeEditorial, loadRuntimePersonaConfigs } from "../../../src/runtime/config";
import { selectEditorial, type SelectionHistory } from "../../../src/autonomy/selection";
import type { EditorialContext } from "../ai/types";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(`CANONICAL_CONTEXT_READ_FAILED:${resource}:${await response.text()}`);
  return await response.json() as Row[];
}

const split = (value: unknown) => String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);

function accountPillars(account: Row) {
  const mix = account.pillar_mix && typeof account.pillar_mix === "object" ? Object.keys(account.pillar_mix as object) : [];
  const configured = mix.filter((id) => id.startsWith("PILLAR_"));
  return configured.length ? configured : [account.primary_pillar_id, ...((account.secondary_pillar_ids as string[] | undefined) ?? [])].filter((id): id is string => Boolean(id));
}

function accountFormats(account: Row, requested: string) {
  const mix = account.format_mix && typeof account.format_mix === "object" ? Object.keys(account.format_mix as object) : [];
  const configured = mix.filter((id) => /^C\d{2}_/.test(id));
  return [requested, ...configured, "C01_MORNING_ROUTINE", "C02_CHECKLIST", "C09_LIST"].filter((id, index, all) => all.indexOf(id) === index);
}

function seed(accountId: string, personaId: string, formatId: string) {
  return crypto.createHash("sha256").update(`${accountId}:${personaId}:${formatId}:canonical`).digest("hex");
}

export async function resolveCanonicalEditorialContext(input: {
  accountId: string;
  personaId: string;
  formatId: string;
  language: "en" | "fr";
  market: string;
  references: Array<{ id: string; title: string }>;
  preferredHook?: string;
}): Promise<{
  topicId: string;
  hookId: string;
  formatId: string;
  personaId: string;
  accountId: string;
  preferredHook: string;
  editorialContext: EditorialContext;
}> {
  if (input.language !== "en" || input.market.toUpperCase() !== "US") {
    throw new Error("CANONICAL_CONTEXT_UNAVAILABLE:GENZ_GIRLY_US currently requires US English");
  }
  let editorial: Awaited<ReturnType<typeof loadRuntimeEditorial>>;
  let accounts: Awaited<ReturnType<typeof loadRuntimeAccounts>>;
  let personas: Awaited<ReturnType<typeof loadRuntimePersonaConfigs>>;
  let formats: Row[];
  let historyRows: Row[];
  try {
    [editorial, accounts, personas, formats, historyRows] = await Promise.all([
      loadRuntimeEditorial(), loadRuntimeAccounts(), loadRuntimePersonaConfigs(),
      rows("content_formats?limit=200"), rows("carousel_ideas?order=created_at.desc&limit=2000").catch(() => []),
    ]);
  } catch (error) {
    throw new Error(`CANONICAL_CONTEXT_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`);
  }
  const { topics, hooks, ctas } = editorial;
  const account = accounts.find((row) => row.id === input.accountId) as unknown as Row | undefined;
  const persona = personas.find((row) => row.id === input.personaId) as unknown as Row | undefined;
  if (!account) throw new Error(`CANONICAL_CONTEXT_UNAVAILABLE:account ${input.accountId}`);
  if (!persona) throw new Error(`CANONICAL_CONTEXT_UNAVAILABLE:persona ${input.personaId}`);
  if (account.enabled === false) throw new Error(`CANONICAL_CONTEXT_UNAVAILABLE:account ${input.accountId} is disabled`);
  const format = formats.find((row) => String(row.format_id) === input.formatId && row.active !== false);
  if (!format) throw new Error(`CANONICAL_CONTEXT_UNAVAILABLE:format ${input.formatId}`);

  const history: SelectionHistory[] = historyRows.map((row) => ({
    account_id: String(row.account_id ?? ""), topic_id: row.topic_id ? String(row.topic_id) : undefined,
    hook_id: row.hook_id ? String(row.hook_id) : undefined, final_hook: row.final_hook ? String(row.final_hook) : undefined,
    combo_key: row.combo_key ? String(row.combo_key) : undefined, created_at: row.created_at ? String(row.created_at) : undefined,
  }));
  let selected = selectEditorial({
    seed: seed(input.accountId, input.personaId, input.formatId), accountId: input.accountId, personaId: input.personaId,
    pillarIds: accountPillars(account), formatIds: [input.formatId], topics, hooks, ctas, history,
    accountTopicCooldownDays: 14, accountHookCooldownDays: 7, networkTopicCooldownHours: 48, networkHookCooldownHours: 48,
  });
  for (let attempt = 1; attempt <= 12 && selected.finalHook.length > 72; attempt += 1) {
    selected = selectEditorial({
      seed: `${seed(input.accountId, input.personaId, input.formatId)}:hook:${attempt}`, accountId: input.accountId, personaId: input.personaId,
      pillarIds: accountPillars(account), formatIds: [input.formatId], topics, hooks, ctas, history,
      accountTopicCooldownDays: 14, accountHookCooldownDays: 7, networkTopicCooldownHours: 48, networkHookCooldownHours: 48,
    });
  }
  if (selected.finalHook.length > 72) throw new Error("CANONICAL_CONTEXT_UNAVAILABLE:no mobile-safe canonical hook for selected topic/format");
  const topic = selected.topic;
  const hook = selected.hook;
  const canonicalHook = selected.finalHook;
  if (input.preferredHook && input.preferredHook !== canonicalHook) {
    // A UI hook is a suggestion only. Never let it sever the canonical hook link.
  }
  const primaryKeyword = String(topic.topic);
  const secondaryKeywords = [String(topic.target_problem ?? ""), String(topic.target_emotion ?? "")].filter(Boolean);
  const goldenExampleIds = input.references.map((reference) => reference.id).filter(Boolean);
  if (!goldenExampleIds.length) goldenExampleIds.push(`FORMAT_${input.formatId}`);
  const personaVoice = String((persona as Row).content && typeof (persona as Row).content === "object"
    ? ((persona as Row).content as Row).voice ?? ""
    : (persona as Row).voice ?? "");
  const context: EditorialContext = {
    search_query: `${primaryKeyword} ${secondaryKeywords[0] ?? "wellness routine"}`.trim(),
    primary_keyword: primaryKeyword,
    secondary_keywords: secondaryKeywords,
    language_profile: "GENZ_GIRLY_US",
    language_version: "genz-girly-us-v1",
    trend_terms: [],
    persona_voice: personaVoice || "conversational and practical",
    golden_example_ids: goldenExampleIds,
    topic_id: topic.topic_id, hook_id: hook.hook_id, format_id: input.formatId,
    account_id: input.accountId, persona_id: input.personaId,
    brand_integration: { required: true, mention: "CortiFree", screenshot_required: true },
  };
  return { topicId: topic.topic_id, hookId: hook.hook_id, formatId: input.formatId, personaId: input.personaId, accountId: input.accountId, preferredHook: canonicalHook, editorialContext: context };
}
