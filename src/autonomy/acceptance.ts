import { dataBackend } from "../lib/data-backend";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function write(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export async function acceptanceGateStatus() {
  const latest = (await rows("system_logs?event=eq.ACCEPTANCE_GATE&order=created_at.desc&limit=1"))[0] ?? null;
  return {
    passed: Boolean(latest && (latest.passed === true || String(latest.passed).toLowerCase() === "true")),
    reviewed: Number(latest?.reviewed ?? 0),
    usable: Number(latest?.usable ?? 0),
    batchId: latest?.batch_id ? String(latest.batch_id) : null,
    createdAt: latest?.created_at ? String(latest.created_at) : null,
    notes: latest?.notes ? String(latest.notes) : null,
  };
}

export async function recordAcceptanceGate(input: {
  reviewed: number;
  usable: number;
  batchId?: string;
  notes?: string;
}) {
  const reviewed = Math.max(0, Math.floor(input.reviewed));
  const usable = Math.max(0, Math.min(reviewed, Math.floor(input.usable)));
  const passed = reviewed >= 20 && usable >= 15;
  const row = {
    id: `ACCEPTANCE_GATE_${Date.now()}`,
    workspace_id: "cortifree",
    event: "ACCEPTANCE_GATE",
    reviewed,
    usable,
    passed,
    batch_id: input.batchId ?? null,
    notes: input.notes ?? null,
    created_at: new Date().toISOString(),
  };
  await write("system_logs", row);
  return row;
}
