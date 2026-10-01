export const contentFormats = [
  { id: 'F01_LIFESTYLE_GUIDE', description: 'Native lifestyle advice carousel with stacked candid images', concepts: ['BEAUTY_WELLNESS_HACKS','THINGS_CHANGED','MORNING_ROUTINE','NIGHT_ROUTINE','GLOW_UP','STARTED_STOPPED'], min_slides: 5, max_slides: 8, copy_voice: 'casual/lifestyle', visual_mode: 'lifestyle-3stack', structure: 'full-screen lifestyle hook -> practical habit slides using cohesive lifestyle imagery -> optional saveable takeaway' },
  { id: 'F03_ROUTINE_TIMELINE', description: 'Photo-first day-in-the-life / morning / night routine', concepts: ['MORNING_ROUTINE','NIGHT_ROUTINE','DAY_IN_LIFE'], min_slides: 5, max_slides: 8, copy_voice: 'minimal/diary-like', visual_mode: 'routine-timeline', structure: 'routine cover -> chronological action-led photo slides -> final routine step or optional soft CTA' },
  { id: 'F04_AESTHETIC_EDUCATIONAL', description: 'Beauty/wellness educational board with concise saveable copy', concepts: ['EDUCATIONAL_HOW_TO','THINGS_CHANGED','GLOW_UP'], min_slides: 5, max_slides: 8, copy_voice: 'educational/saveable', visual_mode: 'three-rect-educational', structure: 'visual title cover -> one clear subject per slide with short scannable points and supporting visuals' },
  { id: 'F05_INTERACTIVE_CHECKLIST', description: 'Native TikTok + Notes-style saveable checklist', concepts: ['INTERACTIVE_CHECKLIST','EDUCATIONAL_HOW_TO','BEAUTY_WELLNESS_HACKS','GLOW_UP'], min_slides: 5, max_slides: 8, copy_voice: 'list/saveable', visual_mode: 'interactive-checklist', structure: 'human belief/observation hook -> contextual lifestyle backgrounds + compact checklist cards -> useful final category; CTA optional' },
  { id: 'F07_RANKING', description: 'Creator-like evidence-aware tier list', concepts: ['RANKING_RATING','BEAUTY_WELLNESS_HACKS','THINGS_CHANGED'], min_slides: 6, max_slides: 9, copy_voice: 'factual/creator-like', visual_mode: 'ranking', structure: 'simple tier-list cover -> one item per slide with concise reasoning -> optional saveable outro' },
  { id: 'F08_2X2', description: 'Diagonal 2-image contrast carousel', concepts: ['BEFORE_AFTER','STARTED_STOPPED','EDUCATIONAL_HOW_TO','SIGNS_WHY'], min_slides: 5, max_slides: 8, copy_voice: 'contrast/punchy', visual_mode: 'grid-2x2', structure: 'short human hook -> contrast-driven body slides using two cohesive images -> optional takeaway' },
] as const;

export const activeContentFormatIds = contentFormats.map((format) => format.id);

/**
 * F02 and F06 remain supported by the renderer for legacy carousels, but are
 * intentionally excluded from new generation while the six active formats
 * are stabilised.
 */
export const legacyRenderableFormatIds = ['F02_EDITORIAL_COLLAGE', 'F06_PERSONA_EXPLAINER'] as const;
