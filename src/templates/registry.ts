import { templateConstraintSchema, type TemplateConstraint } from '../domain.js';
const definitions: TemplateConstraint[] = [
  { id: 'T01_FULLSCREEN_HOOK', requires_image: true, supports_subheadline: true, max_headline_chars: 72, max_body_chars: 120, max_items: 0, allowed_slide_positions: [1] },
  { id: 'T02_PHOTO_TEXT', requires_image: true, supports_subheadline: true, max_headline_chars: 54, max_body_chars: 140, max_items: 0, allowed_slide_positions: [2, 3, 4, 5, 6] },
  { id: 'T03_CHECKLIST', requires_image: true, supports_subheadline: false, max_headline_chars: 48, max_body_chars: 0, max_items: 6, allowed_slide_positions: [2, 3, 4, 5, 6] },
  { id: 'T04_ROUTINE', requires_image: true, supports_subheadline: true, max_headline_chars: 48, max_body_chars: 120, max_items: 0, allowed_slide_positions: [2, 3, 4, 5, 6] },
  { id: 'T05_NOTES', requires_image: false, supports_subheadline: true, max_headline_chars: 48, max_body_chars: 180, max_items: 0, allowed_slide_positions: [2, 3, 4, 5, 6] },
  { id: 'T06_STORY', requires_image: true, supports_subheadline: true, max_headline_chars: 54, max_body_chars: 160, max_items: 0, allowed_slide_positions: [2, 3, 4, 5, 6] },
  { id: 'T07_CTA', requires_image: true, supports_subheadline: true, max_headline_chars: 54, max_body_chars: 140, max_items: 0, allowed_slide_positions: [7, 8] }
];
export const templateRegistry = new Map(definitions.map((item) => [item.id, templateConstraintSchema.parse(item)]));
export function validateTemplateConstraints(slide: { position: number; template_id: string; headline: string; subheadline: string | null; body?: string | null; items?: string[] }) {
  const template = templateRegistry.get(slide.template_id); if (!template) throw new Error(`Unknown template ${slide.template_id}`);
  if (!template.allowed_slide_positions.includes(slide.position)) throw new Error(`${slide.template_id} cannot be used at slide position ${slide.position}`);
  if (slide.headline.length > template.max_headline_chars) throw new Error(`${slide.template_id} headline exceeds ${template.max_headline_chars} characters`);
  if (!template.supports_subheadline && slide.subheadline) throw new Error(`${slide.template_id} does not support a subheadline`);
  if ((slide.body?.length ?? 0) > template.max_body_chars) throw new Error(`${slide.template_id} body exceeds ${template.max_body_chars} characters`);
  if ((slide.items?.length ?? 0) > template.max_items) throw new Error(`${slide.template_id} supports at most ${template.max_items} items`);
  return template;
}
