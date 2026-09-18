import { loadAccounts } from '../src/config/accounts.js';
import { dataBackend, convexConfigured } from '../src/lib/data-backend.js';
import { loadEditorialSnapshot } from '../src/editorial/snapshot.js';

const keyByTable: Record<string, string> = {
  content_config: 'key',
  personas: 'persona_id',
  content_formats: 'format_id',
  content_pillars: 'pillar_id',
  content_topics: 'topic_id',
  content_hooks: 'hook_id',
  content_ctas: 'cta_id',
  content_claim_rules: 'rule_id',
  content_sources: 'source_id',
  autonomy_rules: 'rule_id',
  template_specs: 'template_id',
};

async function upsert(table: string, rows: Array<Record<string, unknown>>, key: string) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({ ...row, id: row.id ?? row[key], workspace_id: 'cortifree' }));
  const response = await dataBackend(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${table} bootstrap failed: ${await response.text()}`);
  return payload.length;
}

async function main() {
  if (!convexConfigured()) throw new Error('Convex server credentials are required');
  const snapshot = loadEditorialSnapshot();
  const counts: Record<string, number> = {};
  for (const [table, key] of Object.entries(keyByTable)) {
    const rows = snapshot.tables[table] ?? [];
    counts[table] = await upsert(table, rows, key);
  }
  counts.accounts = await upsert('accounts', loadAccounts() as unknown as Array<Record<string, unknown>>, 'id');
  console.log(JSON.stringify({ version: snapshot.version, workspace: 'cortifree', counts }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
