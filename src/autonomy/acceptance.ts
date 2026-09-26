import { dataBackend } from "../lib/data-backend";

type Row = Record<string, unknown>;

export type AcceptanceGateSnapshot = {
  passed: boolean;
  reviewed: number;
  usable: number;
  batchId: string | null;
  createdAt: string | null;
  notes: string | null;
};

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function write(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export function acceptanceDecision(reviewed: number, usable: number) {
  const normalizedReviewed = Math.max(0, Math.floor(reviewed));
  const normalizedUsable = Math.max(0, Math.min(normalizedReviewed, Math.floor(usable)));
  return {
    reviewed: normalizedReviewed,
    usable: normalizedUsable,
    passed: normalizedReviewed >= 20 && normalizedUsable >= 15,
  };
}

export function acceptanceSnapshotFromSystemLog(row: Row | null | undefined): AcceptanceGateSnapshot {
  const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const reviewed = Number(metadata.reviewed ?? 0);
  const usable = Number(metadata.usable ?? 0);
  const passed = metadata.passed === true || String(metadata.passed ?? "").toLowerCase() === "true";
  return {
    passed,
    reviewed: Number.isFinite(reviewed) ? reviewed : 0,
    usable: Number.isFinite(usable) ? usable : 0,
    batchId: metadata.batch_id ? String(metadata.batch_id) : null,
    createdAt: row?.created_at ? String(row.created_at) : null,
    notes: metadata.notes ? String(metadata.notes) : null,
  };
}

export async function acceptanceGateStatus() {
  const latest = (await rows(
    "system_logs?workspace_id=eq.cortifree&stage=eq.ACCEPTANCE_GATE&order=created_at.desc&limit=1",
  ))[0] ?? null;
  return acceptanceSnapshotFromSystemLog(latest);
}

export async function recordAcceptanceGate(input: {
  reviewed: number;
  usable: number;
  batchId?: string;
  notes?: string;
}) {
  const { reviewed, usable, passed } = acceptanceDecision(input.reviewed, input.usable);
  const createdAt = new Date().toISOString();
  const metadata = {
    event: "ACCEPTANCE_GATE",
    reviewed,
    usable,
    passed,
    batch_id: input.batchId ?? null,
    notes: input.notes ?? null,
  };
  const inserted = await write("system_logs", {
    workspace_id: "cortifree",
    stage: "ACCEPTANCE_GATE",
    status: passed ? "SUCCESS" : "FAILED",
    metadata,
    created_at: createdAt,
  });
  return {
    ...acceptanceSnapshotFromSystemLog(inserted[0] ?? { created_at: createdAt, metadata }),
    metadata,
  };
}
