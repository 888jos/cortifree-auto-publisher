import type { CalendarData } from "../types";

// Calendar tab: per-account publishing plan from 15_CONTENT_CALENDAR.
export function CalendarPanel({ calendarData, calendarDays, setCalendarDays, calendarLoading }: { calendarData: CalendarData | null; calendarDays: number; setCalendarDays: (days: number) => void; calendarLoading: boolean }) {
  return (
    <section className="panel wide calendarPanel">
      <div className="panelHead">
        <div><p className="eyebrow">PUBLISHING CALENDAR</p><h2>Vue détaillée par compte</h2><p className="muted">Planning canonique de l’onglet 15_CONTENT_CALENDAR : warm-up, jours de repos, horaires New York et montée en cadence sont respectés.</p></div>
        <label className="calendarDays">Horizon
          <select value={calendarDays} onChange={(event) => setCalendarDays(Number(event.target.value))}><option value={3}>3 jours</option><option value={7}>7 jours</option><option value={14}>14 jours</option></select>
        </label>
      </div>
      {calendarLoading && <div className="libraryEmpty">Chargement du planning…</div>}
      {calendarData && <>
        <div className="calendarSummary">
          <div><span>Comptes</span><strong>{calendarData.summary.accountCount}</strong></div>
          <div><span>Moy. posts / jour</span><strong>{calendarData.summary.averagePostsPerDay.toFixed(1)}</strong></div>
          <div><span>Slots affichés</span><strong>{calendarData.summary.totalSlots}</strong></div>
          <div><span>Pic journalier</span><strong>{calendarData.summary.maxPostsPerDay}</strong></div>
        </div>
        <div className="calendarDaysStrip">{calendarData.dailyTotals.map((day) => <div key={day.date}><b>{new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</b><strong>{day.total}</strong><small>{Object.entries(day.byStatus).map(([status, count]) => `${status} ${count}`).join(" · ")}</small></div>)}</div>
        <div className="calendarAccounts">
          {calendarData.accounts.map((account) => <article className="calendarAccount" key={account.id}>
            <div className="calendarAccountHead"><div><span className="eyebrow">{account.id} · {account.persona_id}</span><h3>{account.name}</h3></div><div className="calendarAccountState"><b>{account.entries.length / Math.max(1, calendarData.dailyTotals.length)} / jour</b><small>{account.timezone} · {account.enabled ? "enabled" : "disabled"}</small></div></div>
            <div className="calendarTable"><div className="calendarRow calendarHeader"><span>Date</span><span>Heure</span><span>Type de contenu</span><span>Topic / angle</span><span>Statut</span></div>
              {account.entries.map((entry) => <div className="calendarRow" key={entry.id + entry.date + entry.slot}><span>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span><span>{entry.slot}</span><span><b>{entry.content_type_label}</b><small>{entry.content_type} · {entry.phase}</small></span><span><b>{entry.topic}</b><small>{entry.angle}</small></span><span><i className={`calendarStatus status-${entry.status.toLowerCase()}`}>{entry.status}</i><small>{entry.source}</small></span></div>)}
            </div>
          </article>)}
        </div>
      </>}
    </section>
  );
}

