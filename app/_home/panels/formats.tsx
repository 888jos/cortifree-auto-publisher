import { LayoutMockup } from "../components";
import { modelData, type ModelId } from "../data";

// Formats tab: the F01–F08 canonical formats.
export function FormatsPanel({ pickModel }: { pickModel: (modelId: ModelId) => void }) {
  return (
    <section className="modelsBand">
      <div className="panelHead">
        <div>
          <p className="eyebrow">CANONICAL FORMATS</p>
          <h2>F01–F08</h2>
          <p className="muted">Ces formats sont ceux réellement utilisés par le renderer, le worker et l’éditeur.</p>
        </div>
        <span className="modelCount">{modelData.length} formats</span>
      </div>
      <div className="modelGrid">
        {modelData.map((model) => (
          <button className="modelCard" key={model.id} onClick={() => pickModel(model.id)} type="button">
            <LayoutMockup layout={model.layout} reference={model.reference} sample={model.spec.sample} />
            <span>{model.slides}</span>
            <h3>{model.name}</h3>
            <p>{model.format}</p>
            <small>{model.spec.bestFor}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

