import { loadAccounts as loadJsonAccounts } from "../../../src/config/accounts";
import { loadRuntimeAccounts } from "../../../src/runtime/config";
import { dataBackend } from "../../lib/data-backend";
import { buildCanonicalCalendar, type EditorialRecord } from "../../lib/editorial/calendar";

export const runtime = "nodejs";

async function calendarRecords() {
  const response = await dataBackend("editorial_records?kind=eq.content_calendar&active=eq.true&order=key.asc&limit=5000");
  if (!response.ok) throw new Error(`CANONICAL_CALENDAR_READ_FAILED:${await response.text()}`);
  return await response.json() as EditorialRecord[];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
    const [records, accounts] = await Promise.all([
      calendarRecords(),
      loadRuntimeAccounts().catch(() => loadJsonAccounts()),
    ]);
    if (!records.length) {
      return Response.json({ error: "Canonical Sheet calendar is empty" }, { status: 503 });
    }
    const calendar = buildCanonicalCalendar({ records, accounts, days, start: url.searchParams.get("start") });
    return Response.json({ generated_at: new Date().toISOString(), days, ...calendar });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Calendar unavailable" }, { status: 503 });
  }
}
