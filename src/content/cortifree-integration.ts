import crypto from 'node:crypto';

// CortiFree is mentioned natively in every active format: one slide where the
// persona uses the app as part of the habit, plus one casual line in the
// caption. Patterns (07_BRAND_INTEGRATIONS) and official screenshots
// (app_screenshot assets) come from the Sheet/Drive; this module only decides
// where each format puts the mention and which pattern/screenshot it uses.

type Row = Record<string, unknown>;

export type CortifreeIntegrationPlan = {
  required: boolean;
  mention: string;
  screenshot_required: boolean;
  integration_type?: string;
  slide?: string;
  intensity?: number;
  app_screen_category?: string;
  app_screen_asset_id?: string | null;
  copy_bank_seed_id?: string | null;
  placement?: string;
};

/** What the app really does, from the official screenshots. Nothing else may be claimed. */
export const CORTIFREE_APP_FEATURES = [
  'guided breathing sessions (slow breathing, box breathing, 4-7-8, triangle breathing)',
  'guided meditations',
  'relaxing sounds',
  'Milo, the in-app coach that suggests a wind down, a breathing exercise, a relaxing sound or a journal check-in',
] as const;

type FormatIntegration = {
  /** 07_BRAND_INTEGRATIONS types that fit the format's structure. */
  types: string[];
  /** Default type when the Sheet has no matching active pattern. */
  fallbackType: string;
  slide: string;
  /** The format has a photo slot that can hold an official screenshot. */
  screenshot: boolean;
  placement: string;
};

export const CORTIFREE_FORMAT_INTEGRATION: Record<string, FormatIntegration> = {
  F01_LIFESTYLE_GUIDE: {
    types: ['HABIT_IN_LIST', 'BTW_ASIDE', 'TOOL_I_ACTUALLY_USE', 'PROBLEM_TO_APP'],
    fallbackType: 'HABIT_IN_LIST',
    slide: 'slide_3|slide_4|slide_5',
    screenshot: true,
    placement: 'One body slide (never the cover, never the last slide) is a habit where she uses cortifree, written like her other habits: the headline names the habit, the body says how she does it in first person (e.g. headline "5 min of slow breathing before bed", body "i put on the slow breathing session in cortifree with the lights off").',
  },
  F03_ROUTINE_TIMELINE: {
    types: ['ROUTINE_STEP'],
    fallbackType: 'ROUTINE_STEP',
    slide: 'slide_3|slide_4|slide_5',
    screenshot: true,
    placement: 'One timed routine step (never the cover, never the first step) is her using cortifree, in the same "start - end · action" headline as the other steps (e.g. "10:05 - 10:10 · box breathing in cortifree").',
  },
  F04_AESTHETIC_EDUCATIONAL: {
    types: ['HABIT_IN_LIST', 'TOOL_I_ACTUALLY_USE'],
    fallbackType: 'HABIT_IN_LIST',
    slide: 'slide_3|slide_4',
    screenshot: true,
    placement: 'One bullet of one body slide says how she does that step with cortifree (e.g. "i follow the 4-7-8 breathing in cortifree"). The cover and every headline stay about the topic, never the app.',
  },
  F05_INTERACTIVE_CHECKLIST: {
    types: ['HABIT_IN_LIST'],
    fallbackType: 'HABIT_IN_LIST',
    slide: 'slide_2|slide_3|slide_4',
    // The Notes card covers most of the background photo.
    screenshot: false,
    placement: 'Exactly one Notes item, on a body Note, is a habit with cortifree, as short as the other items and under 70 characters (e.g. "5 min slow breathing in cortifree (lights off)"). Never the cover thought, never a Note title.',
  },
  F07_RANKING: {
    types: ['HABIT_IN_LIST', 'TOOL_I_ACTUALLY_USE'],
    fallbackType: 'HABIT_IN_LIST',
    slide: 'slide_5|slide_6',
    // Tier slides are text only.
    screenshot: false,
    placement: 'One ranked item is a habit she does with cortifree (e.g. "A · box breathing in cortifree"). The ranking goes from worst to best, so it sits in the better half (A, S or SS), never a low tier, with the same honest one-line reason as the other items. Never the cover.',
  },
  F08_2X2: {
    types: ['BEFORE_AFTER', 'HABIT_IN_LIST'],
    fallbackType: 'BEFORE_AFTER',
    slide: 'slide_3|slide_4|slide_5',
    screenshot: true,
    placement: 'On one body slide, the "now:" side (the habit she kept) uses cortifree (e.g. "now: 5 min slow breathing in cortifree before bed"). Never the cover, never the "before:" side.',
  },
};

const NO_INTEGRATION: CortifreeIntegrationPlan = { required: false, mention: '', screenshot_required: false };

function unit(seed: string) {
  return crypto.createHash('sha1').update(seed).digest().readUInt32BE(0) / 0xffffffff;
}

function pick<T>(items: T[], seed: string): T | undefined {
  return items.length ? items[Math.floor(unit(seed) * items.length) % items.length] : undefined;
}

function isActive(row: Row) {
  return row.active !== false && String(row.active ?? 'TRUE').trim().toUpperCase() !== 'FALSE';
}

/** breathing / library / milo, from the official screenshot's filename or subcategory. */
export function appScreenCategory(row: Row) {
  const value = `${String(row.subcategory ?? '')} ${String(row.filename ?? '')}`.toLowerCase();
  if (/breathing/.test(value)) return 'breathing';
  if (/library|meditation/.test(value)) return 'library';
  if (/milo|coach/.test(value)) return 'milo';
  return '';
}

function clampRatio(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : fallback;
}

/**
 * The CortiFree integration of one carousel. Active by default on every
 * active format; `integrationRatio` (autonomy rule cortifree_integration_ratio,
 * default 1) can lower it from the Sheet, and `screenshotRatio`
 * (cortifree_screenshot_ratio, default 0.35) decides how often a format with a
 * photo slot also shows an official screenshot.
 */
export function planCortifreeIntegration(input: {
  seed: string;
  formatId: string;
  patterns?: Row[];
  appScreens?: Row[];
  integrationRatio?: number;
  screenshotRatio?: number;
}): CortifreeIntegrationPlan {
  const format = CORTIFREE_FORMAT_INTEGRATION[input.formatId];
  if (!format) return { ...NO_INTEGRATION };
  if (unit(`${input.seed}:cortifree`) >= clampRatio(input.integrationRatio, 1)) return { ...NO_INTEGRATION };

  const patterns = (input.patterns ?? [])
    .map((row) => row.data && typeof row.data === 'object' ? row.data as Row : row)
    .filter(isActive)
    .filter((row) => format.types.includes(String(row.integration_type ?? '')));
  const weighted = patterns.map((row) => ({ row, weight: Math.max(0.1, Number(row.weight_pct ?? 1) || 1) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = unit(`${input.seed}:integration`) * total;
  let picked: Row | undefined;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) { picked = item.row; break; }
  }
  picked ??= weighted.at(-1)?.row;

  const integrationType = String(picked?.integration_type ?? format.fallbackType);
  const patternScreens = String(picked?.allowed_screen_categories ?? '').split('|').map((value) => value.trim()).filter(Boolean);
  const screens = (input.appScreens ?? [])
    .map((row) => ({ row, category: appScreenCategory(row) }))
    .filter((item) => item.category && String(item.row.id ?? '').trim());
  // A pattern's screen list narrows the choice only when one of its
  // categories actually has a screenshot.
  const narrowed = screens.filter((item) => patternScreens.includes(item.category));
  const screenPool = narrowed.length ? narrowed : screens;
  const wantsScreenshot = format.screenshot
    && screenPool.length > 0
    && unit(`${input.seed}:screenshot`) < clampRatio(input.screenshotRatio, 0.35);
  const screen = wantsScreenshot ? pick(screenPool, `${input.seed}:screen-asset`) : undefined;

  return {
    required: true,
    mention: 'cortifree',
    screenshot_required: Boolean(screen),
    integration_type: integrationType,
    slide: pick(format.slide.split('|'), `${input.seed}:slide`) ?? '',
    intensity: Number(picked?.intensity ?? 1) || 1,
    app_screen_category: screen?.category ?? '',
    app_screen_asset_id: screen ? String(screen.row.id) : null,
    copy_bank_seed_id: null,
    placement: format.placement,
  };
}

const BRAND = /cortifree/i;
const SALESY = /\b(?:download|link in (?:my )?bio|use (?:my )?code|discount|promo code|sponsored|free trial|best app|must[- ]have app|go get it)\b/i;
const TIER = /^\s*(SS|[SABCDF][+-]?)\s*·/i;

/**
 * Checks a draft against its CortiFree plan: one body slide mentions the app
 * (never the hook), the caption mentions it once, no sales wording, and on
 * F07 the item sits in the better half of the worst-to-best ranking.
 * Returns readable reasons for the rewrite pass; empty means it is fine.
 */
export function cortifreeIntegrationIssues(
  spec: { hook: string; caption: string; slides: Array<{ position: number; role: string; headline: string; body: string }> },
  plan: Pick<CortifreeIntegrationPlan, 'required'> | undefined,
  formatId?: string,
): string[] {
  if (!plan?.required) return [];
  const issues: string[] = [];
  const cover = spec.slides[0];
  if (BRAND.test(spec.hook) || (cover && BRAND.test(`${cover.headline} ${cover.body}`))) {
    issues.push('the hook/cover mentions cortifree; keep the cover about the topic');
  }
  const mentions = spec.slides.slice(1).filter((slide) => BRAND.test(`${slide.headline} ${slide.body}`));
  if (!mentions.length) issues.push('no body slide mentions cortifree; add it on one slide as the placement says');
  if (mentions.length > 1) issues.push(`cortifree appears on ${mentions.length} slides; keep it on exactly one`);
  if (!BRAND.test(spec.caption)) issues.push('the caption does not mention cortifree once, casually');
  const salesy = [spec.caption, ...mentions.map((slide) => `${slide.headline} ${slide.body}`)].find((text) => BRAND.test(text) && SALESY.test(text));
  if (salesy) issues.push(`the cortifree mention sounds like an ad ("${salesy.match(SALESY)?.[0]}"); say what she does in the app, nothing to buy or download`);
  if (formatId === 'F07_RANKING') {
    const low = mentions.find((slide) => /^[FDC]/i.test(slide.headline.match(TIER)?.[1] ?? ''));
    if (low) issues.push('the cortifree item is in a low tier; the ranking goes from worst to best, put it in A, S or SS');
  }
  return issues;
}

/** Outcome words that must never sit next to the app name (content_claim_rules). */
const BRAND_OUTCOME = /\b(?:cortisol|hormones?|anxiety|insomnia|burnout|depression|panic|cure[sd]?|heal(?:s|ed)?|treat(?:s|ed|ment)?|clinically|proven|guarantee[sd]?|(?:fix|lower|reduce|balance)(?:s|d|ed|es)?\s+(?:my|your|the)\s+(?:cortisol|stress|hormones?|sleep|anxiety|nervous system))\b/i;

/**
 * A line that names CortiFree and also a health outcome is a product health
 * claim. The app is only ever described by what she does in it.
 */
export function cortifreeClaimReason(text: string) {
  for (const line of text.split(/[.!?\n|]+/)) {
    if (BRAND.test(line) && BRAND_OUTCOME.test(line)) return 'cortifree mention tied to a health outcome';
  }
  return null;
}
