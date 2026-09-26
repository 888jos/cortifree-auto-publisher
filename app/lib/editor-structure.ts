type Slide = Record<string, any> & { position: number; role?: string };
type EditorOverride = Record<string, any>;
export type StructureAction =
  | { action: "reorder"; fromIndex: number; toIndex: number }
  | { action: "duplicate"; index: number }
  | { action: "delete"; index: number };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function roleOf(slide: Slide | undefined) {
  return String(slide?.role ?? "").toUpperCase();
}

export function isProtectedStructureIndex(slides: Slide[], index: number) {
  if (index < 0 || index >= slides.length) return true;
  if (index === 0) return true;
  const role = roleOf(slides[index]);
  if (role === "HOOK" || role === "CTA" || role === "TAKEAWAY") return true;
  if (index === slides.length - 1 && (role === "CTA" || role === "TAKEAWAY")) return true;
  return false;
}

function movableBounds(slides: Slide[]) {
  const min = 1;
  const last = slides.length - 1;
  const max = isProtectedStructureIndex(slides, last) ? last - 1 : last;
  return { min, max };
}

export function applyEditorStructureAction(spec: Record<string, any>, action: StructureAction) {
  const slides = Array.isArray(spec.generated_slides) ? clone(spec.generated_slides) as Slide[] : [];
  if (slides.length < 4 || slides.length > 12) throw new Error("EDITOR_STRUCTURE_INVALID_SLIDE_COUNT");
  const overrides = (spec.editor_overrides && typeof spec.editor_overrides === "object" ? clone(spec.editor_overrides) : {}) as Record<string, EditorOverride>;
  const editorState = (spec.editor_state && typeof spec.editor_state === "object" ? clone(spec.editor_state) : {}) as Record<string, any>;
  const layerStates = (editorState.layers && typeof editorState.layers === "object" ? editorState.layers : {}) as Record<string, Record<string, any>>;
  const entries = slides.map((slide, index) => {
    const oldPosition = String(slide.position ?? index + 1);
    return {
      slide,
      override: overrides[oldPosition] ? clone(overrides[oldPosition]) : undefined,
      layerState: layerStates[oldPosition] ? clone(layerStates[oldPosition]) : undefined,
    };
  });

  if (action.action === "reorder") {
    if (action.fromIndex === action.toIndex) return { spec: clone(spec), activeIndex: action.toIndex };
    if (isProtectedStructureIndex(slides, action.fromIndex)) throw new Error("EDITOR_STRUCTURE_PROTECTED_SOURCE");
    const { min, max } = movableBounds(slides);
    if (action.toIndex < min || action.toIndex > max) throw new Error("EDITOR_STRUCTURE_PROTECTED_TARGET");
    const [moved] = entries.splice(action.fromIndex, 1);
    if (!moved) throw new Error("EDITOR_STRUCTURE_SOURCE_NOT_FOUND");
    entries.splice(action.toIndex, 0, moved);
  } else if (action.action === "duplicate") {
    if (slides.length >= 12) throw new Error("EDITOR_STRUCTURE_MAX_SLIDES");
    if (isProtectedStructureIndex(slides, action.index)) throw new Error("EDITOR_STRUCTURE_PROTECTED_SOURCE");
    const source = entries[action.index];
    if (!source) throw new Error("EDITOR_STRUCTURE_SOURCE_NOT_FOUND");
    entries.splice(action.index + 1, 0, {
      slide: clone(source.slide),
      override: source.override ? clone(source.override) : undefined,
      layerState: source.layerState ? clone(source.layerState) : undefined,
    });
  } else {
    if (slides.length <= 4) throw new Error("EDITOR_STRUCTURE_MIN_SLIDES");
    if (isProtectedStructureIndex(slides, action.index)) throw new Error("EDITOR_STRUCTURE_PROTECTED_SOURCE");
    if (!entries[action.index]) throw new Error("EDITOR_STRUCTURE_SOURCE_NOT_FOUND");
    entries.splice(action.index, 1);
  }

  const nextOverrides: Record<string, EditorOverride> = {};
  const nextLayerStates: Record<string, Record<string, any>> = {};
  const nextSlides = entries.map((entry, index) => {
    const position = index + 1;
    if (entry.override) nextOverrides[String(position)] = entry.override;
    if (entry.layerState) nextLayerStates[String(position)] = entry.layerState;
    return { ...entry.slide, position };
  });
  const { rendered_slides: _rendered, rendered_at: _renderedAt, ...rest } = clone(spec);
  const nextSpec = {
    ...rest,
    slides: nextSlides.length,
    generated_slides: nextSlides,
    editor_overrides: nextOverrides,
    editor_state: { ...editorState, layers: nextLayerStates },
    editor_structure_dirty: true,
    editor_structure_changed_at: new Date().toISOString(),
  };
  const activeIndex = action.action === "delete"
    ? Math.min(action.index, nextSlides.length - 1)
    : action.action === "duplicate"
      ? action.index + 1
      : action.toIndex;
  return { spec: nextSpec, activeIndex };
}
