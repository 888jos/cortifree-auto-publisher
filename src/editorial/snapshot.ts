import fs from 'node:fs';
import path from 'node:path';

export type EditorialSnapshot = {
  version: string;
  generated_at: string;
  workspace_id: 'cortifree';
  tables: Record<string, Array<Record<string, unknown>>>;
};

function activeV2Territories(snapshot: EditorialSnapshot) {
  return (snapshot.tables?.content_topics ?? []).filter((row) =>
    row.active !== false && String(row.topic_id ?? '').startsWith('T_')
  );
}

export function loadEditorialSnapshot(file = path.resolve('config/editorial/content-db.v3.json')): EditorialSnapshot {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as EditorialSnapshot;
  if (parsed.workspace_id !== 'cortifree') throw new Error('Editorial snapshot must be scoped to cortifree');
  if (!parsed.tables?.content_ctas?.length) throw new Error('Editorial snapshot is incomplete: content_ctas is missing');
  if (!activeV2Territories(parsed).length) {
    throw new Error('Editorial snapshot is legacy: V2 content territories are missing. Sync 05_CONTENT_TERRITORIES before enabling JSON fallback.');
  }
  return parsed;
}

export function autonomyValue(snapshot: EditorialSnapshot, key: string, fallback: number): number {
  const row = snapshot.tables.autonomy_rules?.find((item) => String(item.key) === key);
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : fallback;
}
