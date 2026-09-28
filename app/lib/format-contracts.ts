import type { CarouselTypeId } from "./ai/types";

export type CanonicalLayoutId =
  | "lifestyle-3stack"
  | "editorial-asym-hero"
  | "routine-timeline"
  | "three-rect-educational"
  | "interactive-checklist"
  | "persona-explainer"
  | "ranking"
  | "grid-2x2";

export type FormatContract = {
  id: CarouselTypeId;
  layout: CanonicalLayoutId;
  hook: { maxChars: number; maxWords: number; maxLines: number };
  body: { maxChars?: number; maxLines: number };
  checklistItems?: number;
  rankingTiers?: readonly string[];
  requiresTimeline?: boolean;
  forceContrast?: boolean;
};

export const FORMAT_CONTRACTS: Record<CarouselTypeId, FormatContract> = {
  F01_LIFESTYLE_GUIDE: {
    id: "F01_LIFESTYLE_GUIDE",
    layout: "lifestyle-3stack",
    hook: { maxChars: 90, maxWords: 14, maxLines: 3 },
    body: { maxChars: 180, maxLines: 4 },
  },
  F02_EDITORIAL_COLLAGE: {
    id: "F02_EDITORIAL_COLLAGE",
    layout: "editorial-asym-hero",
    hook: { maxChars: 90, maxWords: 14, maxLines: 3 },
    body: { maxChars: 150, maxLines: 4 },
  },
  F03_ROUTINE_TIMELINE: {
    id: "F03_ROUTINE_TIMELINE",
    layout: "routine-timeline",
    hook: { maxChars: 90, maxWords: 14, maxLines: 3 },
    body: { maxChars: 110, maxLines: 3 },
    requiresTimeline: true,
  },
  F04_AESTHETIC_EDUCATIONAL: {
    id: "F04_AESTHETIC_EDUCATIONAL",
    layout: "three-rect-educational",
    hook: { maxChars: 80, maxWords: 13, maxLines: 3 },
    body: { maxChars: 190, maxLines: 5 },
  },
  F05_INTERACTIVE_CHECKLIST: {
    id: "F05_INTERACTIVE_CHECKLIST",
    layout: "interactive-checklist",
    hook: { maxChars: 90, maxWords: 14, maxLines: 3 },
    body: { maxChars: 180, maxLines: 5 },
    checklistItems: 5,
  },
  F06_PERSONA_EXPLAINER: {
    id: "F06_PERSONA_EXPLAINER",
    layout: "persona-explainer",
    hook: { maxChars: 90, maxWords: 14, maxLines: 3 },
    body: { maxChars: 190, maxLines: 4 },
  },
  F07_RANKING: {
    id: "F07_RANKING",
    layout: "ranking",
    hook: { maxChars: 80, maxWords: 12, maxLines: 3 },
    body: { maxChars: 260, maxLines: 4 },
    rankingTiers: ["F", "D", "C", "B", "A", "S", "SS+"],
  },
  F08_2X2: {
    id: "F08_2X2",
    layout: "grid-2x2",
    hook: { maxChars: 90, maxWords: 14, maxLines: 3 },
    body: { maxChars: 150, maxLines: 2 },
    forceContrast: false,
  },
};

export function formatContractFor(formatId: string): FormatContract {
  const contract = FORMAT_CONTRACTS[formatId as CarouselTypeId];
  if (!contract) throw new Error(`UNKNOWN_FORMAT_CONTRACT:${formatId}`);
  return contract;
}

export function formatContractForLayout(layout: string): FormatContract | undefined {
  return Object.values(FORMAT_CONTRACTS).find((contract) => contract.layout === layout);
}

export function formatContractPrompt(formatId: string) {
  const contract = formatContractFor(formatId);
  return {
    id: contract.id,
    layout: contract.layout,
    hook: contract.hook,
    body: contract.body,
    checklistItems: contract.checklistItems ?? null,
    rankingTiers: contract.rankingTiers ?? null,
    requiresTimeline: contract.requiresTimeline ?? false,
    forceContrast: contract.forceContrast ?? null,
  };
}
