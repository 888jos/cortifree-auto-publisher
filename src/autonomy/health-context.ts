import { dataBackend } from "../../app/lib/data-backend";

export type HealthSourceContext = {
  sourceId: string;
  topic: string;
  organization: string | null;
  title: string;
  url: string;
  evidenceLevel: string | null;
  allowedClaims: string | null;
};

export type HealthClaimRuleContext = {
  ruleId: string;
  topic: string;
  riskLevel: string;
  claimType: string | null;
  allowedWording: string | null;
  avoidWording: string | null;
  exampleSafe: string | null;
  requiresSource: boolean;
  sourceIds: string[];
};

export type HealthGuardrails = {
  sources: HealthSourceContext[];
  rules: HealthClaimRuleContext[];
};

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export async function loadHealthGuardrails(): Promise<HealthGuardrails> {
  const [sourceRows, ruleRows] = await Promise.all([
    rows("content_health_sources?active=eq.true&select=source_id,topic,organization,title,url,evidence_level,allowed_claims&limit=100"),
    rows("content_claim_rules?active=eq.true&select=rule_id,topic,risk_level,claim_type,allowed_wording,avoid_wording,example_safe,requires_source,source_ids&limit=200"),
  ]);
  return {
    sources: sourceRows.map((row) => ({
      sourceId: String(row.source_id ?? ""),
      topic: String(row.topic ?? ""),
      organization: row.organization ? String(row.organization) : null,
      title: String(row.title ?? ""),
      url: String(row.url ?? ""),
      evidenceLevel: row.evidence_level ? String(row.evidence_level) : null,
      allowedClaims: row.allowed_claims ? String(row.allowed_claims) : null,
    })).filter((row) => row.sourceId && row.url),
    rules: ruleRows.map((row) => ({
      ruleId: String(row.rule_id ?? ""),
      topic: String(row.topic ?? ""),
      riskLevel: String(row.risk_level ?? "medium"),
      claimType: row.claim_type ? String(row.claim_type) : null,
      allowedWording: row.allowed_wording ? String(row.allowed_wording) : null,
      avoidWording: row.avoid_wording ? String(row.avoid_wording) : null,
      exampleSafe: row.example_safe ? String(row.example_safe) : null,
      requiresSource: row.requires_source === true,
      sourceIds: Array.isArray(row.source_ids) ? row.source_ids.map(String) : [],
    })).filter((row) => row.ruleId),
  };
}
