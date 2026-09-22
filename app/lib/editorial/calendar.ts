export type EditorialRecord = {
  key?: unknown;
  data?: unknown;
  active?: unknown;
};

export type CalendarAccountSource = {
  id: string;
  name: string;
  persona_id: string;
  timezone: string;
  enabled: boolean;
  posting_enabled: boolean;
  daily_target: number;
};

type CalendarRow = {
  slot_id: string;
  account_id: string;
  persona_id: string;
  username: string;
  date: string;
  local_time: string;
  timezone: string;
  platform: string;
  status: string;
  carousel_type: string;
  topic: string;
  angle: string;
  phase: string;
  content_mode: string;
  topic_id: string;
  hook_id: string;
  pillar_id: string;
  app_screen_status: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalize(record: EditorialRecord): CalendarRow | null {
  if (record.active === false || !record.data || typeof record.data !== "object" || Array.isArray(record.data)) return null;
  const data = record.data as Record<string, unknown>;
  const date = text(data.date);
  const accountId = text(data.account_id);
  if (!DATE.test(date) || !accountId.startsWith("CF_")) return null;
  const localTime = TIME.test(text(data.local_time)) ? text(data.local_time) : "00:00";
  return {
    slot_id: text(data.slot_id) || text(record.key) || `${date}_${accountId}_${localTime.replace(":", "")}`,
    account_id: accountId,
    persona_id: text(data.persona_id),
    username: text(data.username),
    date,
    local_time: localTime,
    timezone: text(data.timezone) || "America/New_York",
    platform: text(data.platform) || "tiktok",
    status: text(data.status) || "PLANNED",
    carousel_type: text(data.carousel_type) || "C05_GLOW_UP",
    topic: text(data.topic),
    angle: text(data.angle),
    phase: text(data.phase) || "PLANNED",
    content_mode: text(data.content_mode) || "NEW",
    topic_id: text(data.topic_id),
    hook_id: text(data.hook_id),
    pillar_id: text(data.pillar_id),
    app_screen_status: text(data.app_screen_status),
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export const calendarLabels: Record<string, string> = {
  C01_MORNING_ROUTINE: "Morning routine", C02_CHECKLIST: "Checklist", C03_THINGS_I_STOPPED: "Things I stopped",
  C04_THINGS_I_STARTED: "Things I started", C05_GLOW_UP: "Glow-up", C06_POV_RELATABLE: "POV relatable",
  C07_MISTAKES: "Mistakes", C08_MY_REALISTIC: "My realistic", C09_LIST: "List", C10_BEFORE_AFTER: "Before / after",
  C11_HORMONE_EDUCATION: "Hormone education", C12_NIGHT_ROUTINE: "Night routine", C13_EDUCATIONAL_EXPLAINER: "Educational",
  C14_STORY_TRANSFORMATION: "Story transformation",
};

export function buildCanonicalCalendar(input: {
  records: EditorialRecord[];
  accounts: CalendarAccountSource[];
  days: number;
  now?: Date;
  start?: string | null;
}) {
  const rows = input.records.map(normalize).filter((row): row is CalendarRow => Boolean(row))
    .sort((left, right) => `${left.date}:${left.local_time}:${left.account_id}`.localeCompare(`${right.date}:${right.local_time}:${right.account_id}`));
  const availableDates = [...new Set(rows.map((row) => row.date))];
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  const requestedStart = input.start && DATE.test(input.start) ? input.start : null;
  const startDate = requestedStart ?? availableDates.find((date) => date >= today) ?? availableDates[0] ?? today;
  const endDate = addDays(startDate, Math.max(1, input.days) - 1);
  const selected = rows.filter((row) => row.date >= startDate && row.date <= endDate);
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  const selectedAccountIds = [...new Set(selected.map((row) => row.account_id))].sort();

  const accounts = selectedAccountIds.map((accountId) => {
    const configured = accountById.get(accountId);
    const accountRows = selected.filter((row) => row.account_id === accountId);
    const slots = [...new Set(accountRows.map((row) => row.local_time))];
    const dailyTarget = Math.max(0, ...availableDates.map((date) => rows.filter((row) => row.account_id === accountId && row.date === date).length));
    return {
      id: accountId,
      name: configured?.name || accountRows[0]?.username || accountId,
      persona_id: configured?.persona_id || accountRows[0]?.persona_id || "",
      timezone: configured?.timezone || accountRows[0]?.timezone || "America/New_York",
      enabled: configured?.enabled ?? true,
      posting_enabled: configured?.posting_enabled ?? false,
      daily_target: configured?.daily_target ?? dailyTarget,
      slots,
      entries: accountRows.map((row) => ({
        id: row.slot_id,
        account_id: row.account_id,
        account_name: configured?.name || row.username || row.account_id,
        persona_id: row.persona_id,
        date: row.date,
        slot: row.local_time,
        timezone: row.timezone,
        platform: row.platform,
        status: row.status,
        content_type: row.carousel_type,
        content_type_label: calendarLabels[row.carousel_type] ?? row.carousel_type,
        topic: row.topic,
        angle: row.angle,
        phase: row.phase,
        content_mode: row.content_mode,
        topic_id: row.topic_id,
        hook_id: row.hook_id,
        pillar_id: row.pillar_id,
        app_screen_status: row.app_screen_status,
        source: "sheet_calendar",
      })),
    };
  });

  const dates = Array.from({ length: Math.max(1, input.days) }, (_, index) => addDays(startDate, index));
  const dailyTotals = dates.map((date) => {
    const entries = accounts.flatMap((account) => account.entries.filter((entry) => entry.date === date));
    return {
      date,
      total: entries.length,
      byStatus: entries.reduce<Record<string, number>>((out, entry) => {
        out[entry.status] = (out[entry.status] ?? 0) + 1;
        return out;
      }, {}),
    };
  });
  const phaseCounts = selected.reduce<Record<string, number>>((out, row) => {
    out[row.phase] = (out[row.phase] ?? 0) + 1;
    return out;
  }, {});
  const totalSlots = selected.length;
  const activeDays = dailyTotals.filter((day) => day.total > 0);

  return {
    source: "15_CONTENT_CALENDAR",
    startDate,
    endDate,
    accounts,
    dailyTotals,
    summary: {
      accountCount: accounts.length,
      postsPerDay: dailyTotals[0]?.total ?? 0,
      averagePostsPerDay: activeDays.length ? totalSlots / activeDays.length : 0,
      maxPostsPerDay: Math.max(0, ...dailyTotals.map((day) => day.total)),
      totalSlots,
      phaseCounts,
    },
  };
}
