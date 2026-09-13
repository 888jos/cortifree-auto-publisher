import { renderCarousel } from "../app/lib/render-carousel.js";
import { dataBackend } from "../app/lib/data-backend";

const id = process.argv[2] ?? `CF_RENDER_VERIFY_${Date.now()}`;
const slides = [
  { position: 1, role: "HOOK", layout: "cover-hero", headline: "My realistic low-stress morning", body: "Small habits that help the day feel softer.", assetQuery: "warm bedroom morning sunlight calm woman", visualIntent: "portrait lifestyle image with negative space and warm natural light" },
  { position: 2, role: "TIP", layout: "cover-hero", headline: "Light before scrolling", body: "Open the curtains and give your brain a quieter first signal.", assetQuery: "window sunlight curtains morning", visualIntent: "calm morning room, portrait framing" },
  { position: 3, role: "TIP", layout: "cover-hero", headline: "Breakfast that keeps me steady", body: "Protein, fibre and something I genuinely enjoy.", assetQuery: "healthy breakfast eggs fruit plate", visualIntent: "fresh nourishing breakfast close up" },
  { position: 4, role: "CTA", layout: "cover-hero", headline: "Save this for tomorrow", body: "Pick one habit. You do not need a perfect routine.", assetQuery: "journal tea calm morning", visualIntent: "soft lifestyle image with clear text space" },
];
const spec = { carousel_type: "C01_MORNING_ROUTINE", model_id: "cover-hero", references: [], generated_slides: slides };
const save = await dataBackend("carousels?on_conflict=id", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ id, account_id: "CF_EN_01", persona_id: "P01", language: "en", content_type: "C01_MORNING_ROUTINE", topic: "render pipeline verification", angle: "automatic asset matching", caption: "Pipeline verification", cta_type: "save", status: "DRAFT", spec }),
});
if (!save.ok) throw new Error(`Verification carousel save failed: ${await save.text()}`);
const rendered = await renderCarousel({ id, carouselType: "C01_MORNING_ROUTINE", layout: "cover-hero", slides, spec });
console.log(JSON.stringify({ id, rendered: rendered.length, uniqueAssets: new Set(rendered.map((slide) => slide.assetId)).size, urlsReady: rendered.every((slide) => slide.url.startsWith("https://")) }));
