export const CANVAS = { width: 1080, height: 1350 };
export const SAFE_ZONE = { x: 64, y: 64, width: 952, height: 1222 };

const imageFrames = {
  "single-image": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "single" },
  "routine-timeline": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "routine-timeline" },
  "three-rect-educational": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "three-rect-educational" },
  "grid-2x2": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "grid-2x2" },
  "editorial-collage": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "editorial-collage" },
  "editorial-asym-hero": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "editorial-asym-hero" },
  "interactive-checklist": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "interactive-checklist" },
  "ranking": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "ranking" },
};

const textFrames = {
  "single-image": { x: 88, y: 860, width: 904, align: "left" },
  "routine-timeline": { x: 170, y: 585, width: 740, align: "center" },
  "three-rect-educational": { x: 74, y: 104, width: 640, align: "left" },
  "grid-2x2": { x: 88, y: 840, width: 904, align: "center" },
  "editorial-collage": { x: 82, y: 930, width: 916, align: "left" },
  "editorial-asym-hero": { x: 78, y: 960, width: 620, align: "left" },
  "interactive-checklist": { x: 124, y: 360, width: 832, align: "left" },
  "ranking": { x: 110, y: 930, width: 860, align: "left" },
};

function routineTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 90, y: 360, width: 900, align: "center",
      headlineY: 360, bodyY: 650,
      headlineSize: 92, bodySize: 34, hookSize: 92,
      headlineWeight: 800, bodyWeight: 650,
      maxHeadlineLines: 2, maxBodyLines: 1,
      routineKickerX: 220, routineKickerY: 295, routineKickerWidth: 640, routineKickerSize: 28,
      routineContextY: 650,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 140, y: 420, width: 800, align: "center",
      headlineY: 420, bodyY: 580,
      headlineSize: 52, bodySize: 28, hookSize: 52,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 3,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 140, y: 355, width: 620, align: "center",
    headlineY: 355, bodyY: 455,
    headlineSize: 36, bodySize: 24, hookSize: 36,
    headlineWeight: 700, bodyWeight: 550,
    maxHeadlineLines: 2, maxBodyLines: 3,
    routineTimeX: 140, routineTimeY: 300, routineTimeWidth: 620, routineTimeSize: 31,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}


function educationalThreeRectTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 190, y: 455, width: 700, align: "center",
      headlineY: 455, bodyY: 720,
      headlineSize: 72, bodySize: 22, hookSize: 72,
      headlineWeight: 800, bodyWeight: 600,
      maxHeadlineLines: 3, maxBodyLines: 1,
      eduBodyX: 390, eduBodyY: 735, eduBodyWidth: 300,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 155, y: 635, width: 770, align: "center",
    headlineY: 635, bodyY: 165,
    headlineSize: isFinal ? 54 : 58, bodySize: 25, hookSize: isFinal ? 54 : 58,
    headlineWeight: 800, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 6,
    eduBodyX: 610, eduBodyY: 170, eduBodyWidth: 390,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}

function editorialAsymTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 74, y: 115, width: 560, align: "left",
      headlineY: 115, bodyY: 990,
      headlineSize: 58, bodySize: 26, hookSize: 58,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 3,
      editorialKickerX: 74, editorialKickerY: 90, editorialKickerWidth: 300, editorialKickerSize: 18,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 78, y: 960, width: 620, align: "left",
    headlineY: 960, bodyY: 1075,
    headlineSize: isFinal ? 46 : 44, bodySize: 26, hookSize: isFinal ? 46 : 44,
    headlineWeight: 700, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 4,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}

function checklistTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 138, y: 785, width: 804, align: "left",
      headlineY: 785, bodyY: 1015,
      headlineSize: 58, bodySize: 27, hookSize: 58,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 2,
      checklistPanelX: 90, checklistPanelY: 720, checklistPanelWidth: 900, checklistPanelHeight: 500,
      checklistKickerX: 138, checklistKickerY: 760, checklistKickerWidth: 300, checklistKickerSize: 18,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 138, y: 430, width: 804, align: "left",
      headlineY: 430, bodyY: 635,
      headlineSize: 52, bodySize: 30, hookSize: 52,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 4,
      checklistPanelX: 90, checklistPanelY: 330, checklistPanelWidth: 900, checklistPanelHeight: 700,
      checklistKickerX: 138, checklistKickerY: 382, checklistKickerWidth: 300, checklistKickerSize: 18,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 138, y: 340, width: 804, align: "left",
    headlineY: 340, bodyY: 585,
    headlineSize: 46, bodySize: 28, hookSize: 46,
    headlineWeight: 700, bodyWeight: 500,
    maxHeadlineLines: 3, maxBodyLines: 4,
    checklistPanelX: 90, checklistPanelY: 245, checklistPanelWidth: 900, checklistPanelHeight: 930,
    checklistKickerX: 138, checklistKickerY: 295, checklistKickerWidth: 300, checklistKickerSize: 18,
    checklistChoicesX: 138, checklistChoicesY: 610, checklistChoicesWidth: 804, checklistChoiceGap: 96,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}

function rankingTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 120, y: 120, width: 840, align: "center",
      headlineY: 120, bodyY: 305,
      headlineSize: 68, bodySize: 29, hookSize: 68,
      headlineWeight: 800, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 2,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 150, y: 390, width: 780, align: "center",
      headlineY: 390, bodyY: 600,
      headlineSize: 58, bodySize: 31, hookSize: 58,
      headlineWeight: 800, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 5,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 100, y: 335, width: 880, align: "center",
    headlineY: 335, bodyY: 505,
    headlineSize: 42, bodySize: 27, hookSize: 42,
    headlineWeight: 800, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 7,
    rankingScoreX: 100, rankingScoreY: 105, rankingScoreWidth: 880, rankingScoreSize: 94,
    rankingKickerX: 100, rankingKickerY: 72, rankingKickerWidth: 880, rankingKickerSize: 18,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}

export function getSlideGeometry(slide, isCover = false, isFinal = false, typography = {}) {
  const requested = String(slide.layout ?? "single-image");
  const layout = imageFrames[requested] ? requested : "single-image";
  const image = imageFrames[layout];

  if (layout === "routine-timeline") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...routineTextFrame(isCover, isFinal, typography),
        headlineColor: "#fffaf8",
        bodyColor: "#fffaf8",
        accentColor: "#fffaf8",
      },
      overlay: { color: "#0b0b0b", opacity: 0 },
      chrome: {
        panel: false,
        editorial: false,
        ranking: false,
        routine: true,
        final: Boolean(isFinal),
        cover: Boolean(isCover),
      },
    };
  }

  if (layout === "three-rect-educational") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...educationalThreeRectTextFrame(isCover, isFinal, typography),
        headlineColor: "#2b2725",
        bodyColor: "#2b2725",
        accentColor: "#8a6659",
      },
      overlay: { color: "#f7f3eb", opacity: 0 },
      chrome: {
        panel: false,
        editorial: true,
        educational: true,
        ranking: false,
        final: Boolean(isFinal),
        cover: Boolean(isCover),
      },
    };
  }

  if (layout === "editorial-asym-hero") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...editorialAsymTextFrame(isCover, isFinal, typography),
        headlineColor: "#241f1c",
        bodyColor: "#3f3631",
        accentColor: "#7c554c",
      },
      overlay: { color: "#f5efe7", opacity: 0 },
      chrome: {
        panel: false,
        editorial: true,
        asymmetric: true,
        ranking: false,
        final: Boolean(isFinal),
        cover: Boolean(isCover),
      },
    };
  }

  if (layout === "ranking") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...rankingTextFrame(isCover, isFinal, typography),
        headlineColor: "#261f22",
        bodyColor: "#4c3f43",
        accentColor: "#7d4e62",
      },
      overlay: { color: "#f7f1e8", opacity: 0 },
      chrome: {
        panel: false,
        editorial: true,
        ranking: true,
        final: Boolean(isFinal),
        cover: Boolean(isCover),
      },
    };
  }

  if (layout === "interactive-checklist") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...checklistTextFrame(isCover, isFinal, typography),
        headlineColor: "#241f1f",
        bodyColor: "#4f4542",
        accentColor: "#9a6674",
      },
      overlay: { color: "#f7f1e8", opacity: 0 },
      chrome: {
        panel: true,
        editorial: true,
        checklist: true,
        ranking: false,
        final: Boolean(isFinal),
        cover: Boolean(isCover),
      },
    };
  }

  const text = textFrames[layout];
  const isChecklist = layout === "interactive-checklist";
  const isEditorial = layout === "editorial-collage";
  const isRanking = layout === "ranking";
  return {
    canvas: CANVAS,
    safeZone: SAFE_ZONE,
    image,
    text: {
      ...text,
      headlineY: text.y,
      bodyY: text.y + (isChecklist ? 128 : 150),
      headlineSize: isEditorial ? 58 : isRanking ? 56 : 52,
      bodySize: isChecklist ? 30 : 28,
      headlineWeight: 700,
      bodyWeight: 500,
      headlineColor: "#fffaf8",
      bodyColor: "#fff4b8",
      accentColor: layout === "grid-2x2" ? "#ffd86b" : "#ffb6c8",
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
      hookSize: typography.hookSize ?? 44,
      maxHeadlineLines: isEditorial ? 2 : 3,
      maxBodyLines: isChecklist ? 6 : 5,
    },
    overlay: { color: "#122019", opacity: 0 },
    chrome: {
      panel: isChecklist,
      editorial: isEditorial,
      ranking: isRanking,
      final: Boolean(isFinal),
      cover: Boolean(isCover),
    },
  };
}
