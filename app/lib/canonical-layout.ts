export function canonicalLayoutFor(contentType: string | null | undefined, fallback = "single-image") {
  switch (String(contentType ?? "")) {
    case "F01_LIFESTYLE_GUIDE": return "lifestyle-3stack";
    case "F02_EDITORIAL_COLLAGE": return "editorial-asym-hero";
    case "F03_ROUTINE_TIMELINE": return "routine-timeline";
    case "F04_AESTHETIC_EDUCATIONAL": return "three-rect-educational";
    case "F05_INTERACTIVE_CHECKLIST": return "interactive-checklist";
    case "F06_PERSONA_EXPLAINER": return "persona-explainer";
    case "F07_RANKING": return "ranking";
    case "F08_2X2": return "grid-2x2";
    default: return fallback || "single-image";
  }
}
