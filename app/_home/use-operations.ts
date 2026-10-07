import { useState } from "react";
import type { View } from "./data";
import type { AIStatus, AIUsage, CalendarData, OpsOverview } from "./types";
import { getJson, getJsonOk, useApi } from "./use-api";

// Data for the Overview, Calendar and Settings tabs, each loaded when its tab opens.

export function useOpsOverview(active: View, setNotice: (notice: string) => void) {
  const [opsOverview, setOpsOverview] = useState<OpsOverview | null>(null);
  const opsLoading = useApi(active === "Overview", [active], async () => {
    setOpsOverview(await getJsonOk("/api/ops/overview"));
  }, () => setNotice("Impossible de charger le dashboard d’exploitation."));
  return { opsOverview, opsLoading };
}

export function useCalendar(active: View, setNotice: (notice: string) => void) {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [calendarDays, setCalendarDays] = useState(7);
  const calendarLoading = useApi(active === "Calendar", [active, calendarDays], async () => {
    setCalendarData(await getJsonOk(`/api/calendar?days=${calendarDays}`));
  }, () => setNotice("Impossible de charger le calendrier détaillé."));
  return { calendarData, calendarDays, setCalendarDays, calendarLoading };
}

export function useAiSettings(active: View, setNotice: (notice: string) => void) {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsage | null>(null);
  useApi(active === "Settings", [active], async () => {
    const [status, usage] = await Promise.all([getJson("/api/ai/status"), getJson("/api/ai/usage")]);
    setAiStatus(status);
    setAiUsage(usage);
  }, () => setNotice("Impossible de charger le statut OpenAI."));
  return { aiStatus, aiUsage };
}
