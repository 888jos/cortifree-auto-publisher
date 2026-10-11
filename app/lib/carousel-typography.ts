export const ROTATING_BODY_FONTS = ["TikTok Sans","Instrument Sans","Manrope","Inter Tight","DM Sans","Plus Jakarta Sans","Space Grotesk","Bricolage Grotesque","Archivo","Urbanist"] as const;

// Operator rule: white text plus ONE pastel accent (yellow, pink, green or
// blue), varied from one carousel to the next.
export const PASTEL_ACCENTS = ["#FFE873", "#FFB8D6", "#B9F0C2", "#B5DCFF"] as const;

export function typographyForCarousel(carouselId: string) {
  const hash = [...carouselId].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 7);
  const bodyIndex = hash % ROTATING_BODY_FONTS.length;
  const bodyFontFamily = ROTATING_BODY_FONTS[bodyIndex] ?? "TikTok Sans";
  const hookFontFamily = bodyFontFamily === "Bricolage Grotesque" ? "TikTok Sans" : "Bricolage Grotesque";
  // Shifted so the accent does not follow the font rotation.
  const accentColor = PASTEL_ACCENTS[Math.floor(hash / ROTATING_BODY_FONTS.length) % PASTEL_ACCENTS.length] ?? PASTEL_ACCENTS[0];
  return { hookFontFamily, bodyFontFamily, accentColor, hookSize: 44, titleSize: 52, bodySize: 28, maxDistinctSizes: 3 };
}
