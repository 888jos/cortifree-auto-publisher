export const CANVAS = { width: 1080, height: 1350 };
export const SAFE_ZONE = { x: 64, y: 64, width: 952, height: 1222 };

const imageFrames = {
  "full-bleed": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover" },
  "image-top": { x: 54, y: 54, width: 972, height: 670, fit: "cover" },
  "image-left": { x: 54, y: 54, width: 510, height: 1242, fit: "cover" },
};

const textFrames = {
  center: { x: 110, y: 360, width: 860, align: "center" },
  "top-center": { x: 90, y: 115, width: 900, align: "center" },
  "top-left": { x: 82, y: 116, width: 820, align: "left" },
  "lower-third": { x: 82, y: 820, width: 916, align: "left" },
  "center-card": { x: 120, y: 390, width: 840, align: "center" },
  "text-bottom": { x: 86, y: 790, width: 908, align: "left" },
  "text-right": { x: 610, y: 190, width: 390, align: "left" },
};

export function getSlideGeometry(slide, isCover = false, isFinal = false) {
  const image = imageFrames[slide.imagePlacement] ?? imageFrames["full-bleed"];
  const text = textFrames[slide.textPlacement] ?? textFrames.center;
  const fullBleed = slide.imagePlacement === "full-bleed";
  return {
    canvas: CANVAS,
    safeZone: SAFE_ZONE,
    image,
    text: {
      ...text,
      headlineY: text.y,
      bodyY: text.y + (isCover ? 210 : 150),
      headlineSize: isCover ? 78 : isFinal ? 66 : 58,
      bodySize: isCover ? 34 : 31,
      headlineWeight: 700,
      bodyWeight: 500,
      headlineColor: fullBleed ? "#fffdf8" : "#24312c",
      bodyColor: fullBleed ? "#f7f4ed" : "#5f6d66",
      shadow: fullBleed ? "0 3px 18px rgba(0,0,0,.42)" : "none",
      maxHeadlineLines: isCover ? 4 : 3,
      maxBodyLines: 5,
    },
    overlay: fullBleed ? { color: "#122019", opacity: isCover ? 0.36 : 0.27 } : { color: "#f7f3eb", opacity: 1 },
  };
}
