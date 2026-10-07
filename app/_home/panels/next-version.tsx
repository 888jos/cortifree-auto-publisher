import type { ProductVersion } from "../data";

// Placeholder for the "Nouvelle" product version.
export function NextVersionPanel({ changeProductVersion }: { changeProductVersion: (version: ProductVersion) => void }) {
  return (
    <section className="nextVersion">
      <p className="eyebrow">CORTIFREE · NOUVELLE VERSION</p>
      <h1>Un espace neuf, prêt pour ton prochain prompt.</h1>
      <p>Cette version est isolée de l’interface actuelle. Les données CortiFree restent isolées dans Supabase et l’infrastructure dédiée.</p>
      <div className="nextVersionStatus">
        <div><span>Données</span><b>Séparées et conservées</b></div>
        <div><span>Interface</span><b>À définir</b></div>
        <div><span>Publication</span><b>Non activée ici</b></div>
      </div>
      <button className="secondary" onClick={() => changeProductVersion("current")} type="button">Revenir à la version actuelle</button>
    </section>
  );
}

