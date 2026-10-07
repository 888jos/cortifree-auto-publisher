import { hookCategories, hookLibrary } from "../../hook-library.js";
import type { HookLibrary } from "../use-hook-library";
import type { Studio } from "../use-studio";

// Hook library tab: search the hook bank, pick a hook or generate them all.
export function HookLibraryPanel({ hooks, studio }: { hooks: HookLibrary; studio: Studio }) {
  const { hookQuery, setHookQuery, hookCategory, setHookCategory, filteredHooks, isBatchGenerating, batchProgress, generateAllHooks } = hooks;
  const { selectedHook, isCreating, useHook } = studio;
  return (
    <section className="hookLibraryPanel">
      <div className="panelHead">
        <div>
          <p className="eyebrow">HOOK BANK</p>
          <h2>{hookLibrary.length} hooks prêts à utiliser</h2>
        </div>
        <div className="panelHeadActions">
          {selectedHook && <span className="modelCount">1 hook actif</span>}
          <button className="primary" disabled={isCreating || isBatchGenerating} onClick={generateAllHooks} type="button">
            {isBatchGenerating ? `Génération ${batchProgress.done}/${batchProgress.total}` : "Générer tous les hooks"}
          </button>
        </div>
      </div>

      {isBatchGenerating && (
        <div className="batchProgress" role="status">
          <div><b>{batchProgress.done}/{batchProgress.total}</b> carrousels générés · {batchProgress.failed} échec{batchProgress.failed > 1 ? "s" : ""}</div>
          <progress max={batchProgress.total} value={batchProgress.done + batchProgress.failed} />
          <small>Chaque hook est envoyé à OpenAI, sauvegardé, rendu en PNG puis envoyé en review humaine.</small>
        </div>
      )}

      <div className="hookToolbar">
        <label>
          <span>Rechercher</span>
          <input onChange={(event) => setHookQuery(event.target.value)} placeholder="stress, morning, glow up…" type="search" value={hookQuery} />
        </label>
        <label>
          <span>Catégorie</span>
          <select onChange={(event) => setHookCategory(event.target.value)} value={hookCategory}>
            {hookCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
      </div>

      <div className="hookResultsMeta">{filteredHooks.length} résultat{filteredHooks.length > 1 ? "s" : ""}</div>
      <div className="hookGrid">
        {filteredHooks.map((hook) => (
          <article className={selectedHook === hook.text ? "selected" : ""} key={hook.id}>
            <span>{hook.category}</span>
            <h3>{hook.text}</h3>
            <button onClick={() => useHook(hook.text)} type="button">{selectedHook === hook.text ? "Sélectionné ✓" : "Utiliser ce hook"}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

