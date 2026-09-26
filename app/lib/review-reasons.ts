export const REVIEW_REASONS = [
  { code: "COPY_AI", label: "Texte trop IA / peu naturel" },
  { code: "HOOK_WEAK", label: "Hook faible" },
  { code: "IMAGES_BAD", label: "Mauvais choix d’images" },
  { code: "PERSONA_MISMATCH", label: "Persona incohérent" },
  { code: "IMAGES_REPETITIVE", label: "Images trop répétitives" },
  { code: "FORMAT_BAD", label: "Format / layout mauvais" },
  { code: "GENERIC", label: "Contenu trop générique" },
  { code: "CONCEPT_BAD", label: "Concept à rejeter" },
  { code: "OTHER", label: "Autre" },
] as const;

export type ReviewReasonCode = (typeof REVIEW_REASONS)[number]["code"];
export type RejectionAction = "ARCHIVE" | "REVISION";

export function reviewReasonLabel(code: string | null | undefined) {
  return REVIEW_REASONS.find((reason) => reason.code === code)?.label ?? "Autre";
}
