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
  "persona-explainer": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "persona-explainer" },
  "ranking": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "ranking" },
  "lifestyle-3stack": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "lifestyle-3stack" },
};

const textFrames = {
  "single-image": { x: 88, y: 860, width: 904, align: "left" },
  "routine-timeline": { x: 170, y: 585, width: 740, align: "center" },
  "three-rect-educational": { x: 74, y: 104, width: 640, align: "left" },
  "grid-2x2": { x: 88, y: 840, width: 904, align: "center" },
  "editorial-collage": { x: 82, y: 930, width: 916, align: "left" },
  "editorial-asym-hero": { x: 78, y: 960, width: 620, align: "left" },
  "interactive-checklist": { x: 124, y: 360, width: 832, align: "left" },
  "persona-explainer": { x: 92, y: 770, width: 820, align: "left" },
  "ranking": { x: 110, y: 930, width: 860, align: "left" },
  "lifestyle-3stack": { x: 70, y: 650, width: 700, align: "left" },
};

function routineTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 92, y: 330, width: 896, align: "center",
      headlineY: 330, bodyY: 605,
      headlineSize: 76, bodySize: 32, hookSize: 76,
      headlineWeight: 800, bodyWeight: 600,
      maxHeadlineLines: 3, maxBodyLines: 1,
      routineKickerX: 230, routineKickerY: 270, routineKickerWidth: 620, routineKickerSize: 44,
      routineContextY: 605,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Inter Tight",
    };
  }
  if (isFinal) {
    return {
      x: 90, y: 390, width: 900, align: "center",
      headlineY: 390, bodyY: 535,
      headlineSize: 52, bodySize: 34, hookSize: 52,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 2, maxBodyLines: 2,
      routineTimeX: 90, routineTimeY: 320, routineTimeWidth: 900, routineTimeSize: 42,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Inter Tight",
    };
  }
  // Step text centred on the slide at phone-readable sizes (30px in a
  // left-shifted 560px box was illegible on a phone).
  return {
    x: 90, y: 360, width: 900, align: "center",
    headlineY: 360, bodyY: 500,
    headlineSize: 52, bodySize: 34, hookSize: 52,
    headlineWeight: 700, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 2,
    routineTimeX: 90, routineTimeY: 290, routineTimeWidth: 900, routineTimeSize: 42,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Inter Tight",
  };
}


function educationalThreeRectTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      // Title starts below the top-right photo (ends at y 480); the subtitle
      // stacks under the measured title, above the bottom-left photo (y 880).
      x: 190, y: 505, width: 700, align: "center",
      headlineY: 505, bodyY: 720,
      headlineSize: 68, bodySize: 28, hookSize: 68,
      headlineWeight: 800, bodyWeight: 600,
      maxHeadlineLines: 3, maxBodyLines: 1,
      eduBodyX: 240, eduBodyY: 735, eduBodyWidth: 600,
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
      x: 95, y: 650, width: 890, align: "center",
      headlineY: 650, bodyY: 930,
      headlineSize: 50, bodySize: 26, hookSize: 50,
      headlineWeight: 700, bodyWeight: 500,
      maxHeadlineLines: 4, maxBodyLines: 1,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "TikTok Sans",
    };
  }
  return {
    x: 187, y: 330, width: 706, align: "left",
    headlineY: 330, bodyY: 435,
    headlineSize: 52, bodySize: 40, hookSize: 50,
    headlineWeight: 700, bodyWeight: 400,
    maxHeadlineLines: 2, maxBodyLines: 6,
    checklistPanelX: 151, checklistPanelY: 205, checklistPanelWidth: 778, checklistPanelHeight: 940,
    checklistChoicesX: 187, checklistChoicesY: 440, checklistChoicesWidth: 706, checklistChoiceGap: 72,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "TikTok Sans",
  };
}

function lifestyleThreeStackTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 90, y: 690, width: 760, align: "left",
      headlineY: 690, bodyY: 865,
      headlineSize: 58, bodySize: 27, hookSize: 58,
      headlineWeight: 700, bodyWeight: 550,
      maxHeadlineLines: 3, maxBodyLines: 2,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 70, y: 655, width: 690, align: "left",
    headlineY: 655, bodyY: 735,
    headlineSize: 43, bodySize: 27, hookSize: 43,
    headlineWeight: 700, bodyWeight: 550,
    maxHeadlineLines: 2, maxBodyLines: 4,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}

function personaExplainerTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 92, y: 760, width: 840, align: "left",
      headlineY: 760, bodyY: 1010,
      headlineSize: 62, bodySize: 27, hookSize: 62,
      headlineWeight: 800, bodyWeight: 550,
      maxHeadlineLines: 3, maxBodyLines: 3,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 110, y: 720, width: 800, align: "left",
      headlineY: 720, bodyY: 900,
      headlineSize: 50, bodySize: 28, hookSize: 50,
      headlineWeight: 800, bodyWeight: 550,
      maxHeadlineLines: 3, maxBodyLines: 4,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  return {
    x: 96, y: 705, width: 820, align: "left",
    headlineY: 705, bodyY: 825,
    headlineSize: 42, bodySize: 27, hookSize: 42,
    headlineWeight: 800, bodyWeight: 550,
    maxHeadlineLines: 2, maxBodyLines: 5,
    fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
    hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
  };
}

function rankingTextFrame(isCover, isFinal, typography) {
  if (isCover) {
    return {
      x: 90, y: 120, width: 900, align: "center",
      headlineY: 120, bodyY: 285,
      headlineSize: 62, bodySize: 36, hookSize: 62,
      headlineWeight: 700, bodyWeight: 600,
      maxHeadlineLines: 3, maxBodyLines: 2,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  if (isFinal) {
    return {
      x: 150, y: 390, width: 780, align: "center",
      headlineY: 390, bodyY: 600,
      headlineSize: 64, bodySize: 40, hookSize: 64,
      headlineWeight: 800, bodyWeight: 500,
      maxHeadlineLines: 3, maxBodyLines: 5,
      fontFamily: typography.bodyFontFamily ?? "TikTok Sans",
      hookFontFamily: typography.hookFontFamily ?? "Bricolage Grotesque",
    };
  }
  // Tier, item and reason sit as one block in the middle of the slide, at
  // phone-readable sizes (42/28px left two thirds of the slide empty).
  return {
    x: 75, y: 470, width: 930, align: "center",
    headlineY: 470, bodyY: 640,
    headlineSize: 58, bodySize: 40, hookSize: 58,
    headlineWeight: 800, bodyWeight: 500,
    maxHeadlineLines: 2, maxBodyLines: 5,
    rankingScoreX: 75, rankingScoreY: 320, rankingScoreWidth: 930, rankingScoreSize: 96,
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
        bodyColor: "#f5f5f5",
        accentColor: typography.accentColor ?? "#FFE873",
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

  if (layout === "lifestyle-3stack") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...lifestyleThreeStackTextFrame(isCover, isFinal, typography),
        headlineColor: "#fff3a8",
        bodyColor: "#fff3a8",
        accentColor: "#fff3a8",
      },
      overlay: { color: "#111111", opacity: 0 },
      chrome: {
        panel: false,
        editorial: false,
        lifestyleStack: true,
        ranking: false,
        final: Boolean(isFinal),
        cover: Boolean(isCover),
      },
    };
  }

  if (layout === "persona-explainer") {
    return {
      canvas: CANVAS,
      safeZone: SAFE_ZONE,
      image,
      text: {
        ...personaExplainerTextFrame(isCover, isFinal, typography),
        headlineColor: "#fffaf8",
        bodyColor: "#fffaf8",
        accentColor: "#ffd7e6",
      },
      overlay: { color: "#12100f", opacity: 0.34 },
      chrome: {
        panel: false,
        editorial: false,
        personaExplainer: true,
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
        headlineColor: "#282828",
        bodyColor: "#3b3b3b",
        accentColor: "#b8b8b8",
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
