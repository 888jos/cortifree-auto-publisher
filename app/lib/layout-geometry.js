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
      x: 78, y: 150, width: 575, align: "left",
      headlineY: 150, bodyY: 365,
      headlineSize: 64, bodySize: 26, hookSize: 64,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 2,
      routineKickerX: 78, routineKickerY: 96, routineKickerWidth: 430, routineKickerSize: 20,
      routineContextY: 365,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 140, y: 300, width: 800, align: "center",
      headlineY: 300, bodyY: 475,
      headlineSize: 58, bodySize: 30, hookSize: 58,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 3,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 170, y: 585, width: 740, align: "center",
    headlineY: 585, bodyY: 715,
    headlineSize: 54, bodySize: 26, hookSize: 54,
    headlineWeight: 700, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 2,
    routineTimeX: 390, routineTimeY: 110, routineTimeWidth: 300, routineTimeSize: 30,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}


function educationalThreeRectTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 74, y: 110, width: 610, align: "left",
      headlineY: 110, bodyY: 1000,
      headlineSize: 58, bodySize: 30, hookSize: 58,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 3,
      eduBodyX: 155, eduBodyY: 1000, eduBodyWidth: 770,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 74, y: 104, width: 600, align: "left",
      headlineY: 104, bodyY: 995,
      headlineSize: 48, bodySize: 30, hookSize: 48,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 2, maxBodyLines: 3,
      eduBodyX: 155, eduBodyY: 995, eduBodyWidth: 770,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 74, y: 104, width: 620, align: "left",
    headlineY: 104, bodyY: 960,
    headlineSize: 38, bodySize: 32, hookSize: 38,
    headlineWeight: 700, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 4,
    eduBodyX: 155, eduBodyY: 960, eduBodyWidth: 770,
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
      x: 74, y: 105, width: 700, align: "left",
      headlineY: 105, bodyY: 285,
      headlineSize: 60, bodySize: 26, hookSize: 60,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 2,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 600, y: 340, width: 390, align: "left",
      headlineY: 340, bodyY: 505,
      headlineSize: 48, bodySize: 28, hookSize: 48,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 4,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 620, y: 395, width: 350, align: "left",
    headlineY: 395, bodyY: 530,
    headlineSize: 42, bodySize: 28, hookSize: 42,
    headlineWeight: 700, bodyWeight: 500,
    maxHeadlineLines: 3, maxBodyLines: 5,
    rankingScoreX: 620, rankingScoreY: 170, rankingScoreWidth: 350, rankingScoreSize: 96,
    rankingKickerX: 620, rankingKickerY: 132, rankingKickerWidth: 260, rankingKickerSize: 18,
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
