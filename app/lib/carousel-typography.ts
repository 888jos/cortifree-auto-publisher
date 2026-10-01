export const ROTATING_BODY_FONTS = ["TikTok Sans","Instrument Sans","Manrope","Inter Tight","DM Sans","Plus Jakarta Sans","Space Grotesk","Bricolage Grotesque","Archivo","Urbanist"] as const;

export function typographyForCarousel(carouselId: string) {
  const hash = [...carouselId].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 7);
  const bodyIndex = hash % ROTATING_BODY_FONTS.length;
  const bodyFontFamily = ROTATING_BODY_FONTS[bodyIndex] ?? "TikTok Sans";
  const hookFontFamily = bodyFontFamily === "Bricolage Grotesque" ? "TikTok Sans" : "Bricolage Grotesque";
  return { hookFontFamily, bodyFontFamily, hookSize: 44, titleSize: 52, bodySize: 28, maxDistinctSizes: 3 };
}
