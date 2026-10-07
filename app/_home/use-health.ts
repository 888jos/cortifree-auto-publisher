import { useState } from "react";
import type { HealthStatus } from "./types";
import { getJson, useApi } from "./use-api";

// Infrastructure health shown in the notice bar and Settings.
export function useHealth(setNotice: (notice: string) => void) {
  const [dryRun, setDryRun] = useState<boolean | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  useApi(true, [], async () => {
    const data = await getJson<HealthStatus>("/api/health");
    setHealthStatus(data);
    setDryRun(typeof data.dryRun === "boolean" ? data.dryRun : null);
    if (data.productionReady) {
      setNotice("Production gate READY · infrastructure CortiFree opérationnelle.");
    } else if (!data.backendConfigured) {
      setNotice("BLOCKED · le backend Supabase n’est pas configuré sur ce déploiement.");
    } else if (!data.backendLive) {
      setNotice("BLOCKED · Supabase est configuré mais le ping runtime échoue.");
    } else if (!data.backendDataReady) {
      setNotice("BLOCKED · Supabase répond, mais les données runtime ne sont pas lisibles.");
    } else if (!data.googleSyncConfigured) {
      setNotice("BLOCKED · Google Sheet / Drive sync n’est pas configuré en production.");
    } else {
      const count = data.productionBlockers?.length ?? 0;
      setNotice(`BLOCKED · production gate : ${count} blocker(s). Consulte Settings.`);
    }
  }, () => {
    setDryRun(null);
    setNotice("ERREUR · impossible de vérifier l’état de l’infrastructure CortiFree.");
  });

  return { dryRun, healthStatus };
}
