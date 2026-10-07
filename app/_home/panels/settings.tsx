import type { AIStatus, AIUsage, HealthStatus } from "../types";

// Settings tab: integration health, production blockers and OpenAI usage.
export function SettingsPanel({ healthStatus, dryRun, aiStatus, aiUsage }: { healthStatus: HealthStatus | null; dryRun: boolean | null; aiStatus: AIStatus | null; aiUsage: AIUsage | null }) {
  return (
    <section className="panel wide">
      <p className="eyebrow">CONFIGURATION</p>
      <h2>Integrations</h2>
      <div className="settingsList">
        <span>Vercel frontend ✓</span>
        <span>{healthStatus?.backendConfigured ? `${healthStatus.backend ?? "Supabase"} configuré ✓` : "Backend non configuré ✕"}</span>
        <span>{healthStatus?.backendLive ? "Backend ping ✓" : `Backend ping ✕${healthStatus?.backendError ? ` · ${healthStatus.backendError}` : ""}`}</span>
        <span>{healthStatus?.backendDataReady ? "Données runtime ✓" : `Données runtime ✕${healthStatus?.backendDataError ? ` · ${healthStatus.backendDataError}` : ""}`}</span>
        <span>{healthStatus?.editorialReady ? "Banques éditoriales ✓" : "Banques éditoriales incomplètes"}</span>
        <span>{healthStatus?.googleSyncConfigured ? "Google sync configuré ✓" : "Google sync non configuré ✕"}</span>
        <span>{(healthStatus?.productionChecks?.mappedPublishingAccounts?.length ?? 0) > 0 ? `Upload-Post · ${healthStatus?.productionChecks?.mappedPublishingAccounts?.length} profil(s) ✓` : "Upload-Post non mappé"}</span>
        <span>{healthStatus?.productionReady ? "Production gate READY ✓" : `${healthStatus?.productionBlockers?.length ?? "?"} blocker(s) production`}</span>
        <span>{dryRun === false ? "DRY_RUN désactivé · mode réel" : dryRun === true ? "DRY_RUN actif ✓" : "DRY_RUN inconnu"}</span>
      </div>
      {!healthStatus?.productionReady && (healthStatus?.productionBlockers?.length ?? 0) > 0 && (
        <div className="libraryEmpty">Blockers : {healthStatus!.productionBlockers!.join(" · ")}</div>
      )}
      <div className="openaiSettings">
        <div className="panelHead">
          <div>
            <p className="eyebrow">OPENAI</p>
            <h3>{aiStatus ? (aiStatus.configured ? "Configured ✓" : "Not configured") : "Chargement…"}</h3>
          </div>
          <span className={`aiState ${aiStatus?.configured && aiStatus.enabled ? "ready" : "off"}`}>
            {aiStatus?.configured && aiStatus.enabled ? "ACTIVE" : "FALLBACK"}
          </span>
        </div>
        {aiStatus && (
          <div className="aiConfigGrid">
            <div><span>Primary model</span><b>{aiStatus.primaryModel}</b></div>
            <div><span>QA model</span><b>{aiStatus.qaModel}</b></div>
            <div><span>AI generation</span><b>{aiStatus.enabled ? "Enabled" : "Disabled"}</b></div>
            <div><span>QA sampling</span><b>{aiStatus.qaEnabled ? `${Math.round(aiStatus.qaSampleRate * 100)}%` : "Disabled"}</b></div>
          </div>
        )}
        {aiUsage && (
          <div className="usageBlock">
            <div><span>Usage ce mois</span><strong>${aiUsage.costUsd.toFixed(4)} / ${aiUsage.monthlyCapUsd.toFixed(2)}</strong></div>
            <div><span>Calls</span><strong>{aiUsage.calls}</strong></div>
            <div><span>Input tokens</span><strong>{aiUsage.inputTokens.toLocaleString()}</strong></div>
            <div><span>Output tokens</span><strong>{aiUsage.outputTokens.toLocaleString()}</strong></div>
          </div>
        )}
        <p className="keyPrivacy">La clé API reste côté serveur et n’est jamais affichée ici.</p>
      </div>
    </section>
  );
}

