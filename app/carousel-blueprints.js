import { referenceCarousels } from "./reference-carousels.js";
import { getSlideGeometry } from "./lib/layout-geometry.js";

const profiles = {
  "navzsm-glowup": { family: "Cover hero + numbered tips", image: "full-bleed", coverText: "center", bodyText: "lower-third", rhythm: "HOOK → TIP ×4 → CTA" },
  "thatgirl-challenge": { family: "Challenge cards", image: "full-bleed", coverText: "center", bodyText: "center-card", rhythm: "HOOK → DAY/STEP ×2 → CTA" },
  "girlsonly-habits": { family: "Numbered lifestyle stack", image: "full-bleed", coverText: "top-center", bodyText: "lower-third", rhythm: "HOOK → HABIT ×5 → CTA" },
  "motion-hope": { family: "Editorial quote", image: "full-bleed", coverText: "center", bodyText: "center", rhythm: "HOOK → REFLECTION ×4 → CTA" },
  "lower-cortisol": { family: "Saveable checklist", image: "full-bleed", coverText: "top-left", bodyText: "center-card", rhythm: "HOOK → CHECKLIST ×4 → CTA" },
  "medgirl-confidence": { family: "Statement + proof", image: "full-bleed", coverText: "center", bodyText: "lower-third", rhythm: "HOOK → PROOF/TIP ×4 → CTA" },
  "thatgirlstore-hormone": { family: "Long educational list", image: "image-top", coverText: "center", bodyText: "text-bottom", rhythm: "HOOK → FACT/STEP ×10 → CTA" },
  "siuela-symptoms": { family: "Symptom map", image: "full-bleed", coverText: "top-center", bodyText: "center-card", rhythm: "HOOK → SIGN/REFRAME ×5 → CTA" },
  "thomas-hormone": { family: "Educational split", image: "image-left", coverText: "center", bodyText: "text-right", rhythm: "HOOK → FACT/FIX ×8 → CTA" },
  "rhea-hormones": { family: "Bold education", image: "full-bleed", coverText: "center", bodyText: "center-card", rhythm: "HOOK → FACT ×3 → CTA" },
  "herfeminineedge-happy-hormones": { family: "Numbered education", image: "full-bleed", coverText: "top-center", bodyText: "lower-third", rhythm: "HOOK → FACT/TIP ×4 → CTA" },
  "amina-morning-routine": { family: "Routine timeline", image: "full-bleed", coverText: "center", bodyText: "lower-third", rhythm: "HOOK → ROUTINE STEP ×9 → CTA" },
};

function roleFor(id, index, count) {
  if (index === 0) return "HOOK";
  if (index === count - 1) return "CTA";
  if (id.includes("challenge") || id.includes("routine")) return "STEP";
  if (id.includes("symptom")) return index % 2 ? "CONTEXT" : "TAKEAWAY";
  if (id.includes("hormone") || id.includes("happy")) return index % 3 === 0 ? "TAKEAWAY" : "FACT";
  if (id.includes("hope") || id.includes("confidence")) return "TAKEAWAY";
  if (id.includes("cortisol")) return "CHECKLIST";
  return "TIP";
}

export const carouselBlueprints = referenceCarousels.map((carousel) => {
  const profile = profiles[carousel.id] ?? profiles["navzsm-glowup"];
  return {
    id: carousel.id,
    title: carousel.title,
    sourceUrl: carousel.sourceUrl,
    family: profile.family,
    rhythm: profile.rhythm,
    slideCount: carousel.slides.length,
    slides: carousel.slides.map((image, index) => {
      const slide = {
        position: index + 1,
        role: roleFor(carousel.id, index, carousel.slides.length),
        image,
        imagePlacement: profile.image,
        textPlacement: index === 0 ? profile.coverText : index === carousel.slides.length - 1 ? "center" : profile.bodyText,
        textAlign: profile.coverText.includes("center") || profile.bodyText.includes("center") ? "center" : "left",
        imageFit: "contain",
      };
      return { ...slide, geometry: getSlideGeometry(slide, index === 0, index === carousel.slides.length - 1) };
    }),
  };
});

export function getCarouselBlueprint(id) {
  return carouselBlueprints.find((blueprint) => blueprint.id === id);
}
