import { displayLabel } from "../components";
import { modelData } from "../data";
import type { AssetTab } from "../types";
import type { AssetLibrary } from "../use-asset-library";
import type { ImageGeneration } from "../use-image-generation";

// Asset library tab, headline counters (rendered above the panel grid).
export function AssetLibraryStats({ library }: { library: AssetLibrary }) {
  const { assetPreviews } = library;
  return (
    <div className="stats">
      <div>
        <span>Assets indexes</span>
        <strong>{assetPreviews.length}</strong>
        <em>Assets chargés</em>
      </div>
      <div>
        <span>Modeles design</span>
        <strong>{modelData.length}</strong>
        <em>Layouts editables</em>
      </div>
      <div>
        <span>Publications</span>
        <strong>0</strong>
        <em>Mode securise actif</em>
      </div>
      <div>
        <span>Comptes connectes</span>
        <strong>1</strong>
        <em>Reseaux a connecter</em>
      </div>
    </div>
  );
}



// Asset library tab: assets by source, visual references and the batch entry point.
export function AssetLibraryPanel({ library, images }: { library: AssetLibrary; images: ImageGeneration }) {
  const { assetTab, setAssetTab, assetQuery, setAssetQuery, referenceCategory, setReferenceCategory, visualReferences, visibleAssetGroups, filteredAssetPreviews, filteredVisualReferences, visualGroups, groupFilter, setGroupFilter, assetsByGroup } = library;
  const personaTab = assetTab === "Persona Generated" || assetTab === "Masters";
  const nameOf = (personaId: string) => library.personas.find((persona) => persona.id === personaId)?.name ?? personaId;
  const { setBatchConfirmed, setBatchModalOpen } = images;
  return (
    <section className="panel wide">
      <div className="panelHead">
        <div>
          <p className="eyebrow">LIBRARY</p>
          <h2>Asset library</h2>
        </div>
        <button className="batchButton" onClick={() => { setBatchConfirmed(false); setBatchModalOpen(true); }} type="button">Batch personas</button>
      </div>
      <div className="assetTabs" role="tablist" aria-label="Type d’asset">
        {(["All Assets", "Stock", "Persona Generated", "Masters", "Visual References"] as AssetTab[]).map((tab) => (
          <button aria-selected={assetTab === tab} className={assetTab === tab ? "selected" : ""} key={tab} onClick={() => setAssetTab(tab)} role="tab" type="button">{tab}</button>
        ))}
      </div>
      <div className="assetFilters">
        <label><span>Recherche</span><input onChange={(event) => setAssetQuery(event.target.value)} placeholder="full body mirror casual bedroom" type="search" value={assetQuery} /></label>
        {assetTab !== "Visual References" && assetTab !== "Stock" && visualGroups.length > 0 && (
          <label><span>Groupe</span><select onChange={(event) => setGroupFilter(event.target.value)} value={groupFilter}><option value="all">Tous les groupes</option>{visualGroups.map((group) => <option key={group.id} value={group.id}>{group.id} · {group.label} · master {nameOf(group.master)}</option>)}</select></label>
        )}
        {assetTab === "Visual References" && (
          <label><span>Catégorie</span><select onChange={(event) => setReferenceCategory(event.target.value)} value={referenceCategory}><option value="all">Toutes</option>{[...new Set(visualReferences.map((reference) => reference.category))].map((category) => <option key={category} value={category}>{displayLabel(category)}</option>)}</select></label>
        )}
      </div>
      {assetTab !== "Visual References" && (assetTab === "All Assets" || assetTab === "Stock") && <div className="assetList">
        {visibleAssetGroups.map(({ category, count }) => (
          <div className="asset" key={category}>
            <div className="assetIcon">{category.charAt(0).toUpperCase()}</div>
            <div className="assetText">
              <b>{displayLabel(category)}</b>
              <small>Images Drive synchronisées</small>
            </div>
            <strong>{count}</strong>
          </div>
        ))}
      </div>}
      {assetTab !== "Visual References" && (
        <div className="assetLibraryMeta"><b>{filteredAssetPreviews.length}</b> image{filteredAssetPreviews.length > 1 ? "s" : ""} · {assetTab}</div>
      )}
      {personaTab && assetsByGroup.map(({ group, faces }) => (
        <section className="assetGroup" key={group.id}>
          <header><b>{group.id} · {group.label}</b><span>master {nameOf(group.master)} ({group.master}) · comptes {group.members.map(nameOf).join(", ")}</span></header>
          {faces.map((face) => (
            <div className="assetFace" key={face.personaId}>
              <h4>{nameOf(face.personaId)} <small>{face.personaId} · {face.assets.length} image{face.assets.length > 1 ? "s" : ""}{face.isMaster ? " · master du groupe" : " · anciennes images"}</small></h4>
              <div className="assetPreviewGrid">
                {face.assets.map((asset) => (
                  <figure key={asset.id}>
                    <img alt={asset.filename} loading="lazy" src={asset.public_url} />
                    <figcaption><b>{asset.source_type === "persona_master" ? "MASTER · " : ""}{displayLabel(asset.metadata?.asset_name || asset.subcategory, asset.filename)}</b><span>{displayLabel(asset.category)}</span></figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      {!personaTab && assetTab !== "Visual References" && filteredAssetPreviews.length > 0 && (
        <div className="assetPreviewGrid">
          {filteredAssetPreviews.map((asset) => (
            <figure key={asset.id}>
              <img alt={asset.filename} loading="lazy" src={asset.public_url} />
              <figcaption>
                <b>{asset.source_type === "persona_master" ? "MASTER · " : ""}{displayLabel(asset.metadata?.asset_name || asset.subcategory, asset.filename)}</b>
                <span>{asset.persona_id ? asset.persona_id + " · " : ""}{displayLabel(asset.category)} · {displayLabel(asset.orientation, "unknown orientation")} · {displayLabel(asset.framing, "unknown framing")}</span>
                {asset.visual_description && <small className="assetSemanticDescription">{asset.visual_description}</small>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {assetTab !== "Visual References" && !filteredAssetPreviews.length && <div className="libraryEmpty">Aucun asset correspondant dans le stockage Supabase.</div>}
      {assetTab === "Visual References" && (
        <div className="visualReferenceGrid">
          {filteredVisualReferences.map((reference) => (
            <article key={reference.id}>
              {reference.thumbnail_url ? <img alt={reference.id} loading="lazy" referrerPolicy="no-referrer" src={reference.thumbnail_url} /> : <div className="referencePlaceholder">Référence URL</div>}
              <div><span>{displayLabel(reference.category)}</span><h3>{reference.id}</h3><p>{reference.pose || reference.environment}</p><small>{reference.framing} · {reference.lighting}</small><a href={reference.source_url ?? "#"} rel="noreferrer" target="_blank">Source Pinterest</a></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

