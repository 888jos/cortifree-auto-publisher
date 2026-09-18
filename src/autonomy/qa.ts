import { validateTemplateConstraints } from '../templates/registry';
import type { CarouselSpec } from '../domain';

export type ClaimRule = {
  topic: string; risk_level: string; avoid_wording?: string | null; source_ids?: string | null; active?: boolean | null;
};
export type QaIssue = { level: 'FAIL' | 'WARN'; code: string; message: string; slide?: number };

function phrases(value: unknown) {
  return String(value ?? '').split(';').map((x) => x.trim()).filter(Boolean);
}
export function qaCarousel(spec: CarouselSpec, claimRules: ClaimRule[] = []) {
  const issues: QaIssue[] = [];
  if (/\{[^}]+\}/.test(spec.caption)) issues.push({ level: 'FAIL', code: 'UNRESOLVED_PLACEHOLDER', message: 'Caption contains an unresolved placeholder.' });
  if (!spec.caption.trim()) issues.push({ level: 'FAIL', code: 'EMPTY_CAPTION', message: 'Caption is empty.' });
  for (const slide of spec.slides) {
    try {
      const template = validateTemplateConstraints(slide);
      if (template.requires_image && !slide.asset_id) issues.push({ level: 'FAIL', code: 'MISSING_ASSET', message: 'Required final asset is missing.', slide: slide.position });
    } catch (error) {
      issues.push({ level: 'FAIL', code: 'TEMPLATE_CONSTRAINT', message: error instanceof Error ? error.message : String(error), slide: slide.position });
    }
    const copy = [slide.headline, slide.subheadline, slide.body, ...(slide.items ?? [])].filter(Boolean).join(' ');
    if (/\{[^}]+\}/.test(copy)) issues.push({ level: 'FAIL', code: 'UNRESOLVED_PLACEHOLDER', message: 'Slide contains an unresolved placeholder.', slide: slide.position });
    for (const rule of claimRules.filter((r) => r.active !== false)) {
      for (const phrase of phrases(rule.avoid_wording)) {
        if (phrase.length >= 4 && copy.toLowerCase().includes(phrase.toLowerCase())) {
          issues.push({ level: 'FAIL', code: 'CLAIM_BLOCKED', message: `Blocked wording: "${phrase}"`, slide: slide.position });
        }
      }
      if (String(rule.risk_level).toUpperCase() === 'HIGH' && (!rule.source_ids || rule.source_ids === 'REVIEW_REQUIRED')) {
        const topicMentioned = copy.toLowerCase().includes(String(rule.topic).toLowerCase());
        if (topicMentioned) issues.push({ level: 'WARN', code: 'HIGH_RISK_SOURCE_REVIEW', message: `High-risk topic "${rule.topic}" needs reviewed source mapping.`, slide: slide.position });
      }
    }
  }
  return { ok: !issues.some((x) => x.level === 'FAIL'), issues };
}
