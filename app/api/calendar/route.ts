import { loadAccounts as loadJsonAccounts } from "../../../src/config/accounts";
import { loadRuntimeAccounts } from "../../../src/runtime/config";
import { dataBackend } from "../../lib/data-backend";

export const runtime = "nodejs";

const labels: Record<string, string> = {
  C01_MORNING_ROUTINE: "Morning routine", C02_CHECKLIST: "Checklist", C03_THINGS_I_STOPPED: "Things I stopped",
  C04_THINGS_I_STARTED: "Things I started", C05_GLOW_UP: "Glow-up", C06_POV_RELATABLE: "POV relatable",
  C07_MISTAKES: "Mistakes", C08_MY_REALISTIC: "My realistic", C09_LIST: "List", C10_BEFORE_AFTER: "Before / after",
  C11_HORMONE_EDUCATION: "Hormone education", C12_NIGHT_ROUTINE: "Night routine", C13_EDUCATIONAL_EXPLAINER: "Educational", C14_STORY_TRANSFORMATION: "Story transformation",
};

type Row = Record<string, unknown>;
async function rows(resource: string) {
  const response = await dataBackend(resource);
  return response.ok ? await response.json() as Row[] : [];
}

function pickFormat(mix: Record<string, number>, index: number) {
  const formats = Object.entries(mix).filter(([key, value]) => /^C\d{2}_/.test(key) && Number(value) > 0).sort(([a], [b]) => a.localeCompare(b));
  return formats[index % Math.max(1, formats.length)]?.[0] ?? "C05_GLOW_UP";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
  const accounts = await loadRuntimeAccounts().catch(() => loadJsonAccounts());
  const [ideas, publishJobs] = await Promise.all([
    rows("carousel_ideas?workspace_id=eq.cortifree&order=created_at.asc&limit=2000"),
    rows("publish_jobs?workspace_id=eq.cortifree&select=*&order=scheduled_at.asc&limit=2000"),
  ]);
  const now = new Date();
  const dailyTotals: Array<{ date: string; total: number; byStatus: Record<string, number> }> = [];
  const accountPlans = accounts.map((account) => {
    const slots = account.posting_slots.length ? account.posting_slots : ["11:30", "19:00"];
    const accountIdeas = ideas.filter((idea) => String(idea.account_id) === account.id);
    const entries: Array<Record<string, unknown>> = [];
    for (let day = 0; day < days; day += 1) {
      const localDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day));
      const date = dateKey(localDate);
      slots.slice(0, 2).forEach((slot, slotIndex) => {
        const scheduled = publishJobs.find((job) => String(job.account_id) === account.id && String(job.scheduled_at ?? "").startsWith(date));
        const idea = accountIdeas[(day * slots.length + slotIndex) % Math.max(1, accountIdeas.length)];
        const contentType = String(scheduled?.content_type ?? idea?.content_type ?? pickFormat(account.format_mix, day * 2 + slotIndex));
        const status = scheduled ? String(scheduled.status ?? "SCHEDULED") : idea ? String(idea.status ?? "QUEUED") : "PLANNED";
        entries.push({
          id: String(scheduled?.carousel_id ?? idea?.id ?? `PLAN_${account.id}_${date}_${slot.replace(":", "")}`),
          account_id: account.id, account_name: account.name, persona_id: account.persona_id, date, slot,
          timezone: account.timezone, platform: account.platforms[0] ?? "tiktok", status, content_type: contentType,
          content_type_label: labels[contentType] ?? contentType, topic: String(scheduled?.topic ?? idea?.topic ?? "Editorial slot to generate"),
          angle: String(scheduled?.angle ?? idea?.angle ?? "Concrete, persona-native content"), source: scheduled ? "publish_job" : idea ? "queued_idea" : "planned",
        });
      });
    }
    return { id: account.id, name: account.name, persona_id: account.persona_id, timezone: account.timezone, enabled: account.enabled, posting_enabled: account.posting_enabled, daily_target: Math.max(account.daily_target, slots.length), slots, entries };
  });
  for (let day = 0; day < days; day += 1) {
    const date = dateKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day)));
    const entries = accountPlans.flatMap((account) => account.entries.filter((entry) => entry.date === date));
    dailyTotals.push({ date, total: entries.length, byStatus: entries.reduce<Record<string, number>>((out, entry) => { const status = String(entry.status); out[status] = (out[status] ?? 0) + 1; return out; }, {}) });
  }
  return Response.json({ generated_at: new Date().toISOString(), days, accounts: accountPlans, dailyTotals, summary: { accountCount: accountPlans.length, postsPerDay: accountPlans[0]?.entries.length ? accountPlans.reduce((sum, account) => sum + account.entries.filter((entry) => entry.date === dailyTotals[0]?.date).length, 0) : 0, totalSlots: accountPlans.reduce((sum, account) => sum + account.entries.length, 0) } });
}
