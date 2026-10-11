export const ROTATING_BODY_FONTS = ["TikTok Sans","Instrument Sans","Manrope","Inter Tight","DM Sans","Plus Jakarta Sans","Space Grotesk","Bricolage Grotesque","Archivo","Urbanist"] as const;

// One pastel accent per carousel, beside white text (operator rule: white plus
// a pastel accent).
export const PASTEL_ACCENTS = ["#ffc8dd", "#ffe89a", "#d9c8ff", "#bdf0d6", "#bfe3ff", "#ffd3b6"] as const;

export function typographyForCarousel(carouselId: string) {
  const hash = [...carouselId].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 7);
  const bodyIndex = hash % ROTATING_BODY_FONTS.length;
  const bodyFontFamily = ROTATING_BODY_FONTS[bodyIndex] ?? "TikTok Sans";
  const hookFontFamily = bodyFontFamily === "Bricolage Grotesque" ? "TikTok Sans" : "Bricolage Grotesque";
  const accentColor = PASTEL_ACCENTS[Math.floor(hash / ROTATING_BODY_FONTS.length) % PASTEL_ACCENTS.length] ?? PASTEL_ACCENTS[0];
  return { hookFontFamily, bodyFontFamily, accentColor, hookSize: 44, titleSize: 52, bodySize: 28, maxDistinctSizes: 3 };
}
