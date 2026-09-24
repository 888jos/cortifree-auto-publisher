import { renderCarousel } from "../app/lib/render-carousel.js";
import { dataBackend } from "../app/lib/data-backend";

type Slide = {
  position: number;
  role: string;
  layout: string;
  headline: string;
  body: string;
  assetQuery: string;
  visualIntent: string;
  assetType: string;
};

type Scenario = {
  key: string;
  personaId: string;
  carouselType: string;
  layout: string;
  slides: Slide[];
};

const runId = Date.now();

const scenarios: Scenario[] = [
  {
    key: "STOCK",
    personaId: "P01",
    carouselType: "F01_LIFESTYLE_GUIDE",
    layout: "single-image",
    slides: [
      { position: 1, role: "HOOK", layout: "single-image", headline: "A softer morning starts outside", body: "A short walk before the day gets loud.", assetType: "stock", assetQuery: "outdoor morning walk POV", visualIntent: "first person outdoor walking scene on a path in natural daylight" },
      { position: 2, role: "STEP", layout: "single-image", headline: "Make groceries obvious", body: "Put the easy options where you can see them.", assetType: "stock", assetQuery: "grocery shopping produce basket", visualIntent: "grocery store basket with fresh produce, realistic shopping scene" },
      { position: 3, role: "CTA", layout: "single-image", headline: "Keep breakfast simple", body: "Something easy is better than waiting for perfect.", assetType: "stock", assetQuery: "healthy breakfast yogurt fruit eggs", visualIntent: "simple healthy breakfast in natural morning light" },
    ],
  },
  {
    key: "GYM",
    personaId: "P06",
    carouselType: "F03_STEP_SEQUENCE",
    layout: "cover-hero",
    slides: [
      { position: 1, role: "HOOK", layout: "cover-hero", headline: "The cardio reset I actually repeat", body: "Nothing heroic. Just enough movement.", assetType: "stock", assetQuery: "treadmill POV walking gym", visualIntent: "first person walking on treadmill in a commercial gym" },
      { position: 2, role: "STEP", layout: "cover-hero", headline: "Then I slow down", body: "A quieter finish makes the routine easier to repeat.", assetType: "stock", assetQuery: "sauna self care warm wood", visualIntent: "warm wooden sauna relaxation scene" },
      { position: 3, role: "CTA", layout: "cover-hero", headline: "End the day softer", body: "Low light, book, no performance.", assetType: "stock", assetQuery: "night bedroom book candle", visualIntent: "warm nighttime bedroom with book and soft lighting" },
    ],
  },
  {
    key: "CHLOE",
    personaId: "P07",
    carouselType: "F01_LIFESTYLE_GUIDE",
    layout: "single-image",
    slides: [
      { position: 1, role: "HOOK", layout: "single-image", headline: "My five-minute brain dump", body: "I write it down before I try to fix it.", assetType: "persona", assetQuery: "young woman journaling in bed before sleep", visualIntent: "same persona writing in an open notebook while sitting in bed in her bedroom, natural candid photo" },
      { position: 2, role: "STEP", layout: "single-image", headline: "Make the room quieter", body: "One lamp and a book is enough.", assetType: "stock", assetQuery: "nighttime bedroom bedside lamp book", visualIntent: "cozy bedroom at night with bedside lamp and open book" },
      { position: 3, role: "CTA", layout: "single-image", headline: "Tomorrow can stay simple", body: "Breakfast first. Decisions later.", assetType: "stock", assetQuery: "healthy breakfast oatmeal berries", visualIntent: "simple breakfast bowl with fruit in soft morning light" },
    ],
  },
  {
    key: "HOME",
    personaId: "P13",
    carouselType: "F04_HABIT_RESET",
    layout: "single-image",
    slides: [
      { position: 1, role: "HOOK", layout: "single-image", headline: "Ten minutes at home counts", body: "The point is starting, not turning the living room into a studio.", assetType: "stock", assetQuery: "home Pilates workout living room exercise mat", visualIntent: "Pilates workout at home in a living room with exercise mat" },
      { position: 2, role: "STEP", layout: "single-image", headline: "Write the next thing down", body: "One line is enough to make tomorrow clearer.", assetType: "stock", assetQuery: "journal desk writing", visualIntent: "hand writing in an open journal beside a desk in natural light" },
      { position: 3, role: "CTA", layout: "single-image", headline: "Prep the easy food", body: "Visible beats complicated.", assetType: "stock", assetQuery: "grocery basket fresh produce", visualIntent: "first person grocery basket with fresh produce" },
    ],
  },
  {
    key: "GRID",
    personaId: "P06",
    carouselType: "F08_2X2",
    layout: "grid-2x2",
    slides: [
      { position: 1, role: "HOOK", layout: "grid-2x2", headline: "The tiny reset I repeat", body: "A few ordinary moments, not a reinvention.", assetType: "persona", assetQuery: "young woman at home morning routine", visualIntent: "same persona at home in soft morning light, candid lifestyle photo" },
      { position: 2, role: "STEP", layout: "grid-2x2", headline: "Make the basics visible", body: "Water, clothes, notebook, then move.", assetType: "persona", assetQuery: "young woman home routine water notebook", visualIntent: "same persona in a realistic home routine, simple objects and natural light" },
      { position: 3, role: "CTA", layout: "grid-2x2", headline: "Keep it easy enough to repeat", body: "The boring version is allowed to work.", assetType: "persona", assetQuery: "young woman relaxed at home evening", visualIntent: "same persona relaxed at home in a calm candid lifestyle scene" },
    ],
  },
];

const summary: Array<Record<string, unknown>> = [];

for (const scenario of scenarios) {
  const id = `CF_E2E_${scenario.key}_${runId}`;
  const spec = {
    carousel_type: scenario.carouselType,
    model_id: scenario.layout,
    references: [],
    e2e_probe: true,
    e2e_run_id: runId,
    generated_slides: scenario.slides,
  };
  const save = await dataBackend("carousels?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id,
      workspace_id: "cortifree",
      account_id: "CF_EN_01",
      persona_id: scenario.personaId,
      language: "en",
      content_type: scenario.carouselType,
      topic: `E2E render probe ${scenario.key}`,
      angle: "production pipeline verification",
      caption: "E2E render probe",
      cta_type: "save",
      status: "DRAFT",
      spec,
    }),
  });
  if (!save.ok) throw new Error(`${id}: save failed: ${await save.text()}`);

  try {
    const rendered = await renderCarousel({
      id,
      carouselType: scenario.carouselType,
      layout: scenario.layout,
      slides: scenario.slides,
      personaId: scenario.personaId,
      spec,
    });
    const row = {
      id,
      scenario: scenario.key,
      personaId: scenario.personaId,
      layout: scenario.layout,
      rendered: rendered.length,
      uniqueAssets: new Set(rendered.flatMap((slide) => slide.assetIds)).size,
      urlsReady: rendered.every((slide) => slide.url.startsWith("https://")),
      assets: rendered.map((slide) => ({
        position: slide.position,
        id: slide.assetId,
        filename: slide.assetFilename,
        score: slide.score,
        sourceTypes: slide.assetSourceTypes,
      })),
    };
    summary.push(row);
    console.log("E2E_PASS", JSON.stringify(row));
  } catch (error) {
    const row = {
      id,
      scenario: scenario.key,
      personaId: scenario.personaId,
      layout: scenario.layout,
      error: error instanceof Error ? error.message : String(error),
    };
    summary.push(row);
    console.error("E2E_FAIL", JSON.stringify(row));
  }
}

const failures = summary.filter((item) => item.error);
console.log("E2E_SUMMARY", JSON.stringify({ runId, total: summary.length, passed: summary.length - failures.length, failed: failures.length, summary }));
if (failures.length) process.exit(1);
