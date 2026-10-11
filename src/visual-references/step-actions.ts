// The visible action of a routine step ("6:20 - 6:35 · make dinner"), so an
// F03 photo shows what the step says. Live F03s showed a girl brushing her
// teeth for "walk around the block" and a girl at her laptop for "eat at the
// table": nothing required the photo to show the action.

export type StepActionFamily = {
  key: string;
  /** Weak families (laptop, phone, bed, couch) only decide when no strong one is present. */
  weak?: boolean;
  /** Matches the step's main action. */
  step: RegExp;
  /** Matches an image's observed actions, objects and description. */
  asset: RegExp;
  /** Matches a Pinterest reference's pose, tags and environment. */
  reference: RegExp;
};

export const STEP_ACTION_FAMILIES: StepActionFamily[] = [
  { key: "brushing_teeth", step: /\bbrush(?:ing)? (?:my )?teeth\b|\bfloss/, asset: /toothbrush|brushing (?:her )?teeth/, reference: /brushing teeth|toothbrush/ },
  { key: "skincare", step: /\bwash(?:ing)? (?:my |her )?face\b|skin ?care|moisturi[sz]|cleanser|serum|sunscreen|\bspf\b|face mask|sheet mask|lip balm/, asset: /wash(?:ing|es)? (?:her )?face|skin ?care|applying (?:cream|serum|moisturi|lotion|skincare|sunscreen|lip|mask)|moisturi|cleanser|serum|sheet mask|face mask|splashing water|patting (?:her )?face/, reference: /skincare|hygiene|sheet mask|face mask/ },
  { key: "showering", step: /\bshower|\bbath\b/, asset: /(?:under|beneath) (?:a |the )?(?:running |falling )?(?:stream of )?(?:shower )?water|running shower|showering|in the shower|wrapped in (?:a |her )?(?:white )?(?:bath )?towel|towel (?:wrapped )?(?:on|around) (?:her|their) (?:head|hair)|wet hair|(?:in|taking|soaking in) (?:a |the )?bath(?:tub)?\b/, reference: /shower|towel|\bbath/ },
  { key: "cooking", step: /\b(?:cook|cooking|bake|baking|meal prep|prep|chop|stir)\b|\bmake (?:a |an |my |some |the )?(?:[a-z+]+ ){0,4}(?:dinner|lunch|breakfast|meal|bowl|salad|pasta|toast|eggs|oats|soup|wrap|sandwich|plate)\b/, asset: /\bcook|stirring|chopping|cutting (?:vegetables|food|bread)|preparing (?:food|a meal|dinner|lunch|breakfast)|stove|cooktop|\bpan\b|skillet|baking|meal prep/, reference: /cooking|baking|kitchen prep/ },
  { key: "eating", step: /\beat(?:ing)?\b|\b(?:dinner|lunch|breakfast|snack|meal)\b/, asset: /\beat(?:s|ing)?\b|\bbite\b|biting|chewing|holding (?:a |an |the )?(?:bowl|plate|fork|spoon|food|sandwich|toast|snack|fruit|banana|apple|salad|meal)|\bfork\b|\bspoon\b|\bbowl\b|\bplate\b|\bmeal\b|\bfood\b|breakfast|lunch|dinner|\bsnack|salad|sandwich|pasta|yogurt|oats|oatmeal|granola/, reference: /eating|holding or eating food|meal bowl|snack/ },
  { key: "drinking", step: /\b(?:drink|drinking|sip|sipping|tea|water|coffee|matcha|latte|electrolytes)\b/, asset: /\bdrink(?:s|ing)?\b|sipping|\bmug\b|cup of|glass of|\btea\b|coffee|water bottle|matcha|latte|holding (?:a |an |the |her )?(?:[a-z-]+ ){0,2}(?:cup|mug|glass|bottle|drink)/, reference: /drink|coffee|matcha|\btea\b|water|bottle|smoothie/ },
  { key: "walking", step: /\bwalk(?:ing)?\b|\bstroll|around the block|(?:go|step|get) outside|fresh air|get (?:some )?(?:sun|daylight)/, asset: /\bwalk(?:s|ing)?\b(?!.?in closet)|strolling|\bhiking\b|mid-stride|striding/, reference: /walking|hiking|outdoor movement|\bwalk\b/ },
  { key: "stretching", step: /stretch|\byoga\b|pilates|workout|work out|exercise|mobility|foam roll/, asset: /stretch|\byoga\b|pilates|exercise mat|yoga mat|workout|exercis|lunge|plank/, reference: /gym or pilates|pilates|yoga|stretch|workout/ },
  { key: "running", step: /\brun\b|running|\bjog|treadmill|cardio/, asset: /\brun(?:s|ning)?\b|\bjog|treadmill/, reference: /running|cardio/ },
  { key: "writing", step: /\bwrit(?:e|ing)\b|journal|brain dump|to-?do|\blist\b|plan (?:tomorrow|my)/, asset: /\bwrit(?:e|es|ing)\b|journaling|holding (?:a |her )?pen(?! (?:in|between|near) (?:(?:her|their|the) )?(?:mouth|lips|teeth))|pen (?:on|over) (?:a |an |the |her )?(?:open )?(?:notebook|journal|paper|planner)/, reference: /journal|writing|notebook/ },
  { key: "reading", step: /\bread(?:ing)?\b|\bbook\b/, asset: /\breading\b|\bbook\b/, reference: /reading|\bbook/ },
  { key: "changing", step: /\bchange (?:into|clothes|my clothes|out of)|pajamas|\bpjs\b|get dressed|comfy clothes|\bput on\b/, asset: /changing (?:clothes|into|out)|getting dressed|(?:putting|pulling) on (?:a |an |her )?(?:[a-z-]+ )?(?:hoodie|sweater|sweatshirt|pajamas?|shirt|top|pants|clothes|cardigan)|folding clothes|wardrobe|closet|hanger/, reference: /\brobe\b|pajama|outfit/ },
  { key: "tidying", step: /\btidy|\bclean\b|cleaning|\bwipe|dishes|declutter|make (?:my |the )?bed|reset (?:my |the )?(?:desk|room|kitchen|space)|laundry|put away/, asset: /\btidy|cleaning|wiping|washing dishes|\bdishes\b|organi[sz]|folding|making (?:the |her )?bed|laundry|putting away/, reference: /cleaning|tidy|reset ritual/ },
  { key: "packing", step: /\bpack(?:ing)?\b|\b(?:put|place)\b.*\b(?:in|into) (?:my |the )?(?:work |gym |tote )?bag\b/, asset: /\bpack(?:s|ing)\b|(?:putting|placing|sliding|zipping) [a-z ]{0,40}(?:into|in) (?:a |an |her |the )?(?:[a-z-]+ )?(?:bag|tote|backpack|suitcase)|zipping (?:a |her |the )?(?:bag|backpack|suitcase)/, reference: /packing|\bbag\b|suitcase/ },
  { key: "phone_down", weak: true, step: /\bphone\b|airplane mode|do not disturb|charger/, asset: /\bphone\b|smartphone|charger|charging/, reference: /\bphone\b/ },
  { key: "bed", weak: true, step: /\bin bed\b|(?:get|got) (?:in|into) bed|lights off|\bsleep|lie down|under the covers/, asset: /\bbed\b|lying|sleep|pillow|duvet|blanket/, reference: /\bbed\b|duvet|sleep/ },
  { key: "laptop", weak: true, step: /laptop|\bemails?\b|log off|shut down|close (?:my )?tabs|save my work|\bwork\b/, asset: /laptop|computer|typing/, reference: /laptop|desk|study/ },
  { key: "resting", weak: true, step: /\bsofa\b|\bcouch\b|episode|\bshow\b|unwind|relax|sit (?:quietly|down|still)/, asset: /\bsofa\b|\bcouch\b|lounging|relaxing|reclining|resting|sitting/, reference: /\bsofa\b|\bcouch\b|relaxed pose|lounging/ },
  { key: "lighting", weak: true, step: /candle|dim (?:the )?lights?|\blamp\b/, asset: /candle|\blamp\b|dim/, reference: /candle|\blamp\b|cozy/ },
];

/** "6:20 - 6:35 · walk around the block before dinner" → "walk around the block". */
export function routineStepAction(headline: string) {
  const source = String(headline ?? "").toLowerCase();
  const afterTime = source.includes("·")
    ? source.slice(source.indexOf("·") + 1)
    : source.replace(/^\s*(?:(?:[01]?\d|2[0-3])(?:[:h.][0-5]\d)?\s*(?:am|pm)?\s*(?:-|–|—|→|to)?\s*){1,2}[:|•]?\s*/, "");
  // The clause after "before/after/then" is context, not what the photo shows.
  return afterTime.split(/\b(?:before|after|until|so that|so|then|while|instead of|without)\b/)[0]!.replace(/[,.;:!]+$/g, "").trim();
}

function plain(value: string) {
  return value.toLowerCase().replace(/[_|]+/g, " ").replace(/\s+/g, " ");
}

/** The families a step's main action needs to see; weak ones only when nothing stronger is said. */
export function stepActionFamilies(headline: string) {
  const action = plain(routineStepAction(headline));
  if (!action) return [];
  const matched = STEP_ACTION_FAMILIES.filter((family) => family.step.test(action));
  const strong = matched.filter((family) => !family.weak);
  return strong.length ? strong : matched;
}

export function assetShowsStepAction(families: StepActionFamily[], assetText: string) {
  if (!families.length) return true;
  const text = plain(assetText);
  return families.some((family) => family.asset.test(text));
}

/** How many of the step's actions and places (strong or weak) the image shows: ranks images that all pass. */
export function stepActionMatchCount(headline: string, assetText: string) {
  const action = plain(routineStepAction(headline));
  const text = plain(assetText);
  return STEP_ACTION_FAMILIES.filter((family) => family.step.test(action) && family.asset.test(text)).length;
}

export function referenceShowsStepAction(families: StepActionFamily[], referenceText: string) {
  if (!families.length) return true;
  const text = plain(referenceText);
  return families.some((family) => family.reference.test(text));
}

/** Objects the copy says are put away ("laptop and work bag away", "phone in her bag") are not wanted in the photo. */
export function withoutNegatedMentions(text: string) {
  return String(text ?? "")
    .replace(/\b(?:without|no|away from|instead of|not)\s+(?:(?:a|an|the|my|her|any)\s+)?[a-z-]+(?:\s+(?:and|or)\s+(?:(?:a|an|the|my|her)\s+)?[a-z-]+)?/gi, " ")
    .replace(/\b(?:(?:the|her|my|a)\s+)?[a-z-]+(?:\s+(?:and|or)\s+(?:(?:the|her|my|a)\s+)?[a-z-]+(?:\s+[a-z-]+)?)?\s+(?:(?:is|are|kept|left|put|stays?)\s+)?(?:away|out of reach|out of sight|put away|closed|face ?down|in (?:(?:her|my|a|the) )?bag|in another room)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
