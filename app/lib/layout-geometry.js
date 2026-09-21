export const CANVAS = { width: 1080, height: 1350 };
export const SAFE_ZONE = { x: 64, y: 64, width: 952, height: 1222 };

const imageFrames = {
  "single-image": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "single" },
  "grid-2x2": { x: 0, y: 0, width: 1080, height: 1350, fit: "cover", mode: "grid-2x2" },
};

const textFrames = {
  "single-image": { x: 88, y: 860, width: 904, align: "left" },
  "grid-2x2": { x: 88, y: 840, width: 904, align: "center" },
};

export function getSlideGeometry(slide, isCover = false, isFinal = false) {
  const layout = slide.layout === "grid-2x2" ? "grid-2x2" : "single-image";
  const image = imageFrames[layout];
  const text = textFrames[layout];
  return {
    canvas: CANVAS,
    safeZone: SAFE_ZONE,
    image,
    text: {
      ...text,
      headlineY: text.y,
      bodyY: text.y + (isCover ? 210 : 150),
      headlineSize: isCover ? 82 : isFinal ? 68 : 60,
      bodySize: isCover ? 35 : 31,
      headlineWeight: 700,
      bodyWeight: 500,
      headlineColor: "#fffaf8",
      bodyColor: "#fff4b8",
      accentColor: layout === "grid-2x2" ? "#ffd86b" : "#ffb6c8",
      fontFamily: "sans-serif",
      shadow: "0 3px 18px rgba(0,0,0,.42)",
      maxHeadlineLines: isCover ? 4 : 3,
      maxBodyLines: 5,
    },
    overlay: { color: "#122019", opacity: 0 },
  };
}
