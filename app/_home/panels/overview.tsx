import { referenceCarousels } from "../../reference-carousels.js";
import { carouselTypes, modelData, type CarouselTypeId } from "../data";
import type { OpsOverview } from "../types";

// Overview tab: production health metrics and the editorial concept grid.
export function OverviewPanel({ opsOverview, opsLoading, openType }: { opsOverview: OpsOverview | null; opsLoading: boolean; openType: (typeId: CarouselTypeId) => void }) {
  return (
    <section className="typeBand opsDashboard">
      <div className="panelHead">
        <div><p className="eyebrow">OPERATIONS</p><h2>État réel de la production</h2></div>
        <span className="modelCount">{opsLoading ? "actualisation…" : opsOverview?.checkedAt ? new Date(opsOverview.checkedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "indisponible"}</span>
      </div>
      <div className="opsMetrics">
        <article><span>Planifiés aujourd’hui</span><strong>{opsOverview?.posts.today ?? "—"}</strong><small>{opsOverview?.posts.publishedToday ?? 0} publiés · {opsOverview?.posts.failedToday ?? 0} failed</small></article>
        <article><span>Succès 7 jours</span><strong>{opsOverview?.posts.successRate7d == null ? "—" : `${opsOverview.posts.successRate7d}%`}</strong><small>{opsOverview?.analytics.views7d.toLocaleString("fr-FR") ?? 0} vues</small></article>
        <article><span>Worker</span><strong>{opsOverview?.worker.heartbeatAgeSeconds != null && opsOverview.worker.heartbeatAgeSeconds < 600 ? "OK" : "ALERTE"}</strong><small>{opsOverview?.worker.latest?.version ?? "aucune version"} · file {opsOverview?.worker.activeQueue ?? 0}</small></article>
        <article><span>Alertes</span><strong>{opsOverview?.alerts.length ?? "—"}</strong><small>{opsOverview?.accountsInError.length ?? 0} compte(s) en erreur</small></article>
      </div>
      <div className="opsGrid">
        <article className="opsPanel"><h3>Alertes actives</h3>{opsOverview?.alerts.length ? <ul>{opsOverview.alerts.slice(0,8).map((alert,index)=><li className={`ops-${alert.severity}`} key={`${alert.code}-${index}`}><b>{alert.code}</b><span>{alert.message}</span></li>)}</ul> : <p className="muted">Aucune alerte active.</p>}</article>
        <article className="opsPanel"><h3>Buffer par compte</h3><ul>{opsOverview?.buffers.slice(0,16).map(item=><li key={item.accountId}><b>{item.accountId}</b><span>{item.days} j / cible {item.targetDays} · {item.ready} prêts</span></li>)}</ul></article>
        <article className="opsPanel"><h3>Assets persona sous seuil</h3>{opsOverview?.personaAssetsUnderThreshold.length ? <ul>{opsOverview.personaAssetsUnderThreshold.map(item=><li key={item.personaId}><b>{item.personaId}</b><span>{item.count} / {item.threshold}</span></li>)}</ul> : <p className="muted">Toutes les personas dépassent le seuil.</p>}</article>
        <article className="opsPanel"><h3>Top carrousels · 7 jours</h3>{opsOverview?.analytics.topCarousels.length ? <ul>{opsOverview.analytics.topCarousels.map(item=><li key={item.carouselId}><b>{item.carouselId}</b><span>{item.views.toLocaleString("fr-FR")} vues</span></li>)}</ul> : <p className="muted">Pas encore de statistiques.</p>}<p className="opsCosts">Coûts 7 j · {Object.entries(opsOverview?.costs7d ?? {}).map(([provider,cost])=>`${provider}: $${cost.toFixed(2)}`).join(" · ") || "$0.00"}</p></article>
      </div>
      <div className="panelHead">
        <div>
          <p className="eyebrow">EDITORIAL CONCEPTS</p>
          <h2>Concepts</h2>
        </div>
        <span className="modelCount">clic = voir les carrousels</span>
      </div>

      <div className="typeGrid">
        {carouselTypes.map((type) => {
          const refs = type.refIds
            .map((refId) => referenceCarousels.find((carousel) => carousel.id === refId))
            .filter(Boolean);
          const needs = Math.max(0, 3 - refs.length);

          return (
            <button className={`typeCard ${needs ? "needsRefs" : "readyType"}`} key={type.id} onClick={() => openType(type.id)} type="button">
              <div className="typeTop">
                <span>{type.id}</span>
                <b>{needs ? `+${needs} ref` : "OK"}</b>
              </div>
              <h3>{type.name}</h3>
              <p>{type.note}</p>

              <div className="typeModels">
                {type.modelIds.map((modelId) => {
                  const model = modelData.find((item) => item.id === modelId);
                  if (!model) return null;

                  return (
                    <span key={model.id}>
                      {model.name}
                    </span>
                  );
                })}
              </div>

              <div className="typeMeta">
                <span>{refs.length} refs liées</span>
                <strong>Ouvrir →</strong>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

