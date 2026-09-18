import fs from 'node:fs';
import path from 'node:path';

export type EditorialSnapshot = {
  version: string;
  generated_at: string;
  workspace_id: 'cortifree';
  tables: Record<string, Array<Record<string, unknown>>>;
};

export function loadEditorialSnapshot(file = path.resolve('config/editorial/content-db.v3.json')): EditorialSnapshot {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as EditorialSnapshot;
  if (parsed.workspace_id !== 'cortifree') throw new Error('Editorial snapshot must be scoped to cortifree');
  if (!parsed.tables?.content_topics?.length || !parsed.tables?.content_hooks?.length) throw new Error('Editorial snapshot is incomplete');
  return parsed;
}

export function autonomyValue(snapshot: EditorialSnapshot, key: string, fallback: number): number {
  const row = snapshot.tables.autonomy_rules?.find((item) => String(item.key) === key);
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : fallback;
}
