import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanAssets } from '../src/assets/scanner.js';
import { chooseAssets, deriveVisualIntent, visualPersonaIdFor, type SelectableAsset } from '../app/lib/asset-selector';
import { isAutomaticVisualReference } from '../src/visual-references';
import { isBrowserRenderableAssetUrl } from '../app/lib/asset-public-url';
import { isCanonicalPersonaRootFolder } from '../app/lib/sync/drive';

describe('Drive persona root filtering', () => {
  it('keeps canonical persona folders and ignores legacy visual-pool archives', () => {
    assert.equal(isCanonicalPersonaRootFolder('AVA'), true);
    assert.equal(isCanonicalPersonaRootFolder('P06_AVA'), true);
    assert.equal(isCanonicalPersonaRootFolder('ZZ_LEGACY_VISUAL_POOLS_2026-10-01'), false);
    assert.equal(isCanonicalPersonaRootFolder('00_VISUAL_POOLS'), false);
    assert.equal(isCanonicalPersonaRootFolder('99_QUARANTINE_IDENTITY'), false);
  });
});

describe('asset scanner', () => {
  it('maps sixteen accounts onto eight stable visual identities', () => {
    assert.equal(visualPersonaIdFor('P01'), 'P01');
    assert.equal(visualPersonaIdFor('P04'), 'P01');
    assert.equal(visualPersonaIdFor('P02'), 'P06');
    assert.equal(visualPersonaIdFor('P11'), 'P06');
    assert.equal(visualPersonaIdFor('P07'), 'P03');
    assert.equal(visualPersonaIdFor('P16'), 'P05');
    assert.equal(visualPersonaIdFor('P14'), 'P08');
    assert.equal(visualPersonaIdFor('P15'), 'P08');
    assert.equal(visualPersonaIdFor('P12'), 'P09');
    assert.equal(visualPersonaIdFor('P10'), 'P10');
    assert.equal(visualPersonaIdFor('P13'), 'P13');
  });

  it('never mixes faces inside a shared visual pool', () => {
    const base = (id: string, persona_id: string): SelectableAsset => ({
      id, filename: `${id}.jpg`, category: 'home', subcategory: 'home', orientation: 'portrait',
      framing: 'medium', activity: 'morning routine', mood: 'natural', colors: [], tags: ['bedroom'],
      public_url: `https://example.com/${id}.jpg`, use_count: 0, last_used_at: null,
      source_type: 'persona_generated', persona_id, visual_description: 'woman sitting in bedroom in soft daylight',
      visible_objects: ['bed'], visible_actions: ['sitting'], setting: 'bedroom', people_visibility: 'full_person',
      body_parts_visible: ['face'], composition: 'person_activity_scene', camera_angle: 'eye_level',
      lighting: 'soft_window_daylight', dominant_colors: [], text_in_image: '', specific_details: 'bedroom morning',
    });
    const [selected] = chooseAssets({
      carouselType: 'F01_LIFESTYLE_GUIDE',
      personaId: 'P04',
      assets: [base('emma-canonical', 'P01'), base('nora-old-pool-face', 'P04')],
      slides: [{ position: 1, role: 'HOOK', headline: 'slow morning', body: '', assetType: 'persona', assetQuery: 'woman in bedroom morning', visualIntent: 'woman in bedroom in soft morning daylight' }],
    });
    assert.equal(selected?.asset.persona_id, 'P01');
  });

  it('rescues a weak stock-designated slot with the same canonical visual persona when the scene is materially better', () => {
    const visualIntent = 'woman preparing a simple breakfast at a kitchen counter in morning light';
    const weakStock: SelectableAsset = {
      id: 'weak-stock-rescue', filename: 'weak-stock.jpg', category: 'misc', subcategory: 'misc', orientation: 'portrait',
      framing: 'medium', activity: '', mood: '', colors: [], tags: [], public_url: 'https://example.com/weak-stock.jpg',
      use_count: 0, last_used_at: null, source_type: 'stock',
      visual_description: 'plain empty indoor wall', visible_objects: [], visible_actions: [], setting: 'indoor_room',
      people_visibility: 'no_person', body_parts_visible: [], composition: 'wide_empty_scene',
      camera_angle: 'eye_level', lighting: 'indoor_light', dominant_colors: [], text_in_image: '', specific_details: '',
      visual_tagging_schema: 'observable_v2', visual_review_status: 'IMAGE_INSPECTED_V2', visual_reviewed_at: '2026-10-01T00:00:00.000Z',
    };
    const matchingPersona: SelectableAsset = {
      id: 'emma-breakfast', filename: 'EMMA_FOOD_001.jpg', category: 'food', subcategory: 'food', orientation: 'portrait',
      framing: 'medium', activity: visualIntent, mood: 'natural', colors: [], tags: ['breakfast','kitchen'],
      public_url: 'https://example.com/emma-breakfast.jpg', use_count: 0, last_used_at: null,
      source_type: 'persona_generated', persona_id: 'P01', scene: visualIntent,
      visual_description: visualIntent, visible_objects: ['food','bowl'], visible_actions: ['preparing_food'],
      setting: 'kitchen', people_visibility: 'full_person', body_parts_visible: ['face'], composition: 'person_activity_scene',
      camera_angle: 'eye_level', lighting: 'morning_light', dominant_colors: [], text_in_image: '', specific_details: 'simple breakfast',
    };
    const [selected] = chooseAssets({
      carouselType: 'F03_ROUTINE_TIMELINE',
      personaId: 'P04',
      assets: [weakStock, matchingPersona],
      slides: [{ position: 5, role: 'STEP', headline: '7:15 - 7:25 · eat the easiest breakfast', body: '', assetType: 'stock', assetQuery: visualIntent, visualIntent }],
    });
    assert.equal(selected?.asset.id, 'emma-breakfast');
    assert.equal(selected?.asset.persona_id, 'P01');
  });

  it('rejects stock below the explicit fallback confidence floor', () => {
    const weak: SelectableAsset = {
      id: 'weak-stock', filename: 'weak.jpg', category: 'misc', subcategory: 'misc', orientation: 'portrait',
      framing: 'medium', activity: '', mood: '', colors: [], tags: [], public_url: 'https://example.com/weak.jpg',
      use_count: 0, last_used_at: null, source_type: 'stock',
      visual_description: 'plain empty indoor wall', visible_objects: [], visible_actions: [], setting: 'indoor_room',
      people_visibility: 'no_person', body_parts_visible: [], composition: 'wide_empty_scene',
      camera_angle: 'eye_level', lighting: 'indoor_light', dominant_colors: [], text_in_image: '', specific_details: '',
      visual_tagging_schema: 'observable_v2', visual_review_status: 'IMAGE_INSPECTED_V2', visual_reviewed_at: '2026-10-01T00:00:00.000Z',
    };
    assert.throws(() => chooseAssets({
      carouselType: 'F05_INTERACTIVE_CHECKLIST',
      personaId: 'P01',
      assets: [weak],
      slides: [{ position: 2, role: 'CHECKLIST', headline: 'Take a real break', body: 'step outside for a few minutes', assetType: 'stock', assetQuery: 'woman walking outdoors in daylight', visualIntent: 'person walking outside on a sunny path' }],
    }), /LOW_CONFIDENCE_ASSET/);
  });

  it('rejects legacy drive URLs from browser-rendered asset surfaces', () => {
    assert.equal(isBrowserRenderableAssetUrl('drive://1abc'), false);
    assert.equal(isBrowserRenderableAssetUrl('file:///tmp/test.jpg'), false);
    assert.equal(isBrowserRenderableAssetUrl('https://example.com/image.jpg'), true);
    assert.equal(isBrowserRenderableAssetUrl('http://localhost/image.jpg'), true);
  });

  it('references curated font files that actually exist', async () => {
    const css = await fs.readFile(path.join(process.cwd(), 'app/fonts.css'), 'utf8');
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((match) => match[1]).filter((url) => url.startsWith('/fonts/curated/'));
    assert.ok(urls.length >= 30);
    for (const url of urls) {
      const relative = decodeURIComponent(url.replace(/^\//, ''));
      await fs.access(path.join(process.cwd(), 'public', relative.replace(/^fonts\//, 'fonts/')));
    }
  });

  it('indexes stock and persona image metadata with canonical persona IDs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cortifree-scan-'));
    await fs.mkdir(path.join(root, '01_STOCK_ASSETS ', 'morning'), { recursive: true });
    await fs.mkdir(path.join(root, '02_PERSONAS ', 'AVA', '02_HOME'), { recursive: true });
    await fs.mkdir(path.join(root, '03_TEMPLATES'), { recursive: true });
    await fs.mkdir(path.join(root, '10_PERSONA_CONFIG'), { recursive: true });

    const stockImage = path.join(root, '01_STOCK_ASSETS ', 'morning', 'hero.png');
    await sharp({ create: { width: 240, height: 320, channels: 4, background: '#abc' } }).png().toFile(stockImage);
    const personaImage = path.join(root, '02_PERSONAS ', 'AVA', '02_HOME', 'ava.jpg');
    await sharp({ create: { width: 300, height: 400, channels: 4, background: '#def' } }).jpeg().toFile(personaImage);

    const result = await scanAssets(root);
    assert.equal(result.assets.length, 2);
    assert.equal(result.added, 2);

    const stock = result.assets.find((asset) => asset.source_type === 'stock');
    const personaAsset = result.assets.find((asset) => asset.source_type === 'persona_generated');
    assert.equal(stock?.category, 'morning');
    assert.equal(stock?.width, 240);
    assert.equal(personaAsset?.persona_id, 'P06');
    assert.equal(personaAsset?.category, 'home');

    const second = await scanAssets(root, result.assets);
    assert.equal(second.assets.length, 2);
    assert.equal(second.added, 0);
    assert.equal(second.updated, 2);
  });

  it('treats explicit bedroom journaling as a required bedroom scene', () => {
    const intent = deriveVisualIntent({
      headline: 'Journal in bed before sleep',
      body: 'Write a quick brain dump from bed.',
      assetQuery: 'journaling in bed',
      visualIntent: 'woman writing in a notebook in her bedroom bed',
    });
    assert.ok(intent.required_actions.includes('writing'));
    assert.ok(intent.required_objects.includes('notebook'));
    assert.ok(intent.required_settings.includes('bedroom'));
  });

  it('treats explicit home Pilates as an indoor-home scene instead of a studio synonym', () => {
    const intent = deriveVisualIntent({
      headline: '10 min home Pilates',
      body: 'A simple Pilates workout at home.',
      assetQuery: 'home Pilates workout',
      visualIntent: 'woman doing Pilates at home in a living room',
    });
    assert.ok(intent.required_settings.includes('indoor_room'));
  });

  it('rejects a sauna for an outfit-preparation slide instead of selecting the highest text score', () => {
    const assets = [
      { id: 'sauna', filename: 'sauna_room_warm_floor_lights.jpeg', category: 'self_care', subcategory: 'self_care', orientation: 'portrait', framing: 'wide', activity: 'steam room', mood: 'warm', colors: [], tags: ['sauna', 'steam room'], public_url: 'https://example.com/sauna.jpg', use_count: 0, last_used_at: null, source_type: 'stock' },
      { id: 'outfit', filename: 'MAYA_HOME_001.jpg', category: 'home', subcategory: 'outfit', orientation: 'portrait', framing: 'medium', activity: 'steaming an outfit', mood: 'natural', colors: [], tags: ['outfit', 'steamer'], public_url: 'https://example.com/outfit.jpg', use_count: 0, last_used_at: null, source_type: 'persona_generated', persona_id: 'P03' },
    ];
    const selected = chooseAssets({ carouselType: 'C05_GLOW_UP', personaId: 'P03', assets, slides: [{ position: 3, role: 'TIP', headline: 'Steam the outfit you actually wear', body: 'Prepare tomorrow\'s clothes tonight.', assetType: 'persona', assetQuery: 'Maya steaming an outfit with a clothing rack', visualIntent: 'A woman visibly steaming a real outfit; no sauna or steam room.' }] });
    assert.equal(selected[0]?.asset.id, 'outfit');
  });

  it('excludes duplicate, review, and multi-person visual references from automation', () => {
    assert.equal(isAutomaticVisualReference({ enabled: true, metadata: {} }), true);
    assert.equal(isAutomaticVisualReference({ enabled: false, metadata: {} }), false);
    assert.equal(isAutomaticVisualReference({ enabled: true, metadata: { review_status: 'DUPLICATE' } }), false);
    assert.equal(isAutomaticVisualReference({ enabled: true, metadata: { review_status: 'REVIEW' } }), false);
    assert.equal(isAutomaticVisualReference({ enabled: true, metadata: { qa_flag: 'MULTI_PERSON_AUTO_DISABLED' } }), false);
    assert.equal(isAutomaticVisualReference({ enabled: true, metadata: { review_status: 'APPROVED' } }), true);
  });

  it('ranks observable visual content above category labels', () => {
    const base = (id: string, category: string, visual_description: string, visible_objects: string[], visible_actions: string[] = [], setting = 'indoor_room'): SelectableAsset => ({
      id, filename: `${id}.jpg`, category, subcategory: category, orientation: 'portrait', framing: 'medium', activity: '', mood: '', colors: [], tags: [], public_url: `https://example.com/${id}.jpg`, use_count: 0, last_used_at: null, source_type: 'stock', visual_description, visible_objects, visible_actions, setting, people_visibility: 'no_person', body_parts_visible: [], composition: 'equipment_layout', camera_angle: 'top_down_or_high_angle', lighting: 'natural', dominant_colors: [], text_in_image: '', specific_details: '', visual_tagging_schema: 'observable_v1', visual_review_status: 'IMAGE_INSPECTED_V1', visual_reviewed_at: '2026-09-22T00:00:00.000Z',
    });
    const cases = [
      [{ headline: 'Recovery day', body: 'Easy movement without making it a whole production.', assetQuery: 'pilates mat and foam roller', visualIntent: 'pilates mat and foam roller on the floor', }, [base('fitness-mat', 'fitness', 'pink exercise mat on the floor with a foam roller and tablet nearby', ['exercise_mat', 'foam_roller', 'tablet'])], 'fitness-mat'],
      [{ headline: 'Brain dump before bed', body: 'Write down the next thought before turning out the light.', assetQuery: 'notebook and pen on bed', visualIntent: 'open notebook on bed with hand writing', }, [base('morning-journal', 'morning', 'open notebook and pen on a bed with a hand writing', ['journal', 'pen', 'bed'], ['writing'], 'bedroom')], 'morning-journal'],
      [{ headline: 'Stop checking your phone', body: 'Leave it on the bed while you wake up.', assetQuery: 'phone on bed bedside scene', visualIntent: 'phone on bed in morning light', }, [base('morning-phone', 'morning', 'mobile phone resting on a bed beside a pillow', ['phone', 'bed'])], 'morning-phone'],
      [{ headline: 'Easy food', body: "A simple bowl when I can't be bothered.", assetQuery: 'simple bowl meal', visualIntent: 'simple bowl and plate of food', }, [base('food-bowl', 'food', 'simple bowl of food on a kitchen table', ['bowl', 'food'], ['preparing_food'])], 'food-bowl'],
      [{ headline: 'Five minutes of movement', body: 'A mat, dumbbells, and a little space is enough.', assetQuery: 'exercise mat dumbbells stretching setup', visualIntent: 'exercise mat and dumbbells on the floor', }, [base('movement-setup', 'fitness', 'exercise mat with dumbbells and a stretching setup', ['exercise_mat', 'dumbbells'])], 'movement-setup'],
    ];
    for (const testCase of cases) {
      const slide = testCase[0] as { headline: string; body: string; assetQuery: string; visualIntent: string };
      const assets = testCase[1] as SelectableAsset[];
      const expected = testCase[2] as string;
      const [selected] = chooseAssets({ carouselType: 'C06_POV_RELATABLE', assets, personaId: 'P01', slides: [{ position: 2, role: 'TIP', assetType: 'stock', ...slide }] });
      assert.equal(selected?.asset.id, expected);
      assert.ok(selected?.visualIntent?.desired_objects.length);
      assert.equal(selected?.topCandidates?.[0]?.asset_id, expected);
    }
  });

  it('normalizes legacy V1 action, object, and setting variants before hard constraints', () => {
    const asset = (id: string, description: string, objects: string[], actions: string[], setting: string): SelectableAsset => ({
      id,
      filename: `${id}.jpg`,
      category: 'legacy',
      subcategory: 'legacy',
      orientation: 'portrait',
      framing: 'medium',
      activity: actions.join(' '),
      mood: 'natural',
      colors: [],
      tags: [],
      public_url: `https://example.com/${id}.jpg`,
      use_count: 0,
      last_used_at: null,
      source_type: 'stock',
      visual_description: description,
      visible_objects: objects,
      visible_actions: actions,
      setting,
      people_visibility: 'partial_person',
      body_parts_visible: ['hands'],
      composition: 'person_activity_scene',
      camera_angle: 'eye_level',
      lighting: 'natural_daylight',
      dominant_colors: [],
      text_in_image: 'none',
      specific_details: description,
      visual_tagging_schema: 'observable_v1',
      visual_review_status: 'IMAGE_INSPECTED_V1',
      visual_reviewed_at: '2026-09-22T00:00:00.000Z',
    });

    const cases = [
      {
        slide: { headline: '10 minute walk outside', body: 'A quick walk before work.', assetQuery: 'walking outdoors on a path', visualIntent: 'woman walking outside on an outdoor path' },
        candidate: asset('walk', 'woman walking outdoors on a leafy path in daylight', ['sneakers'], ['walking'], 'outdoor_path'),
      },
      {
        slide: { headline: 'Treadmill workout', body: 'A short treadmill run.', assetQuery: 'treadmill POV in gym', visualIntent: 'running on treadmill in commercial gym' },
        candidate: asset('treadmill', 'first person view using a treadmill in a gym cardio area', ['treadmill'], ['walking_or_running'], 'gym_cardio_area'),
      },
      {
        slide: { headline: 'Grocery shopping', body: 'Grab produce for the week.', assetQuery: 'shopping for produce', visualIntent: 'woman grocery shopping in produce aisle' },
        candidate: asset('grocery', 'woman reaching for produce while grocery shopping', ['produce', 'shopping_cart'], ['reaching_for_produce'], 'grocery_store_produce_aisle'),
      },
      {
        slide: { headline: 'Journal before bed', body: 'Write one page.', assetQuery: 'open notebook in bed', visualIntent: 'writing in an open notebook in bedroom' },
        candidate: asset('journal', 'hand writing in an open notebook while sitting in bed', ['open_notebook', 'pen', 'bed'], ['writing'], 'bedroom_by_window'),
      },
    ];

    for (const { slide, candidate } of cases) {
      const [selected] = chooseAssets({
        carouselType: 'C06_POV_RELATABLE',
        personaId: 'P01',
        assets: [candidate],
        slides: [{ position: 2, role: 'TIP', assetType: 'stock', ...slide }],
      });
      assert.equal(selected?.asset.id, candidate.id);
    }
  });

  it('normalizes V2 outdoor settings and nested observable arrays before hard constraints', () => {
    const settings = [
      'outdoor_sidewalk', 'rural_or_suburban_path', 'outdoor_autumn_path', 'rural_tree_lined_path',
      'barcelona_city_street', 'new_york_city_street', 'paris_intersection', 'open_field_near_woods',
      'woodland_autumn_path', 'park_or_greenway_path', 'outdoor_grass_and_dirt_path', 'sunny_outdoor_trail',
      'woodland_greenway',
    ];
    for (const [index, setting] of settings.entries()) {
      const candidate: SelectableAsset = {
        id: `walk-v2-${index}`, filename: `walk-v2-${index}.jpg`, category: 'outdoors', subcategory: 'outdoors',
        orientation: 'portrait', framing: 'first_person_pov', activity: 'walking', mood: 'casual', colors: [],
        tags: ['walking', 'outdoors'], public_url: `https://example.com/walk-v2-${index}.jpg`, use_count: 0, last_used_at: null,
        source_type: 'stock', visual_description: 'person walking outside on a path in daylight',
        visible_objects: ['white_sneakers', 'paved_path'], visible_actions: ['walking'], setting,
        people_visibility: 'partial_body', body_parts_visible: ['legs', 'feet'], composition: 'first_person_activity',
        camera_angle: 'first_person_downward', lighting: 'bright_daylight', dominant_colors: [], text_in_image: 'none',
        specific_details: 'sunny path with visible footsteps', visual_tagging_schema: 'observable_v2',
        visual_review_status: 'IMAGE_INSPECTED_V2', visual_reviewed_at: '2026-09-24T00:00:00.000Z',
        metadata: { asset_name: `OUTDOOR_WALK_V2_${index}` },
      };
      const [selected] = chooseAssets({
        carouselType: 'C06_POV_RELATABLE', assets: [candidate], personaId: 'P01',
        slides: [{ position: 2, role: 'TIP', assetType: 'stock', headline: '10 minute walk outside', body: 'A quick walk before work.', assetQuery: 'walking outdoors on a path', visualIntent: 'person walking outside on an outdoor path' }],
      });
      assert.equal(selected?.asset.id, candidate.id);
    }
  });

  it('uses pixel-derived asset_name only as a weak tie-breaker', () => {
    const base: SelectableAsset = {
      id: 'base', filename: 'legacy_001.jpg', category: 'outdoors', subcategory: 'outdoors', orientation: 'portrait',
      framing: 'first_person_pov', activity: 'walking', mood: 'casual', colors: [], tags: [], public_url: 'https://example.com/base.jpg',
      use_count: 0, last_used_at: null, source_type: 'stock', visual_description: 'POV of a person walking outside in daylight.',
      visible_objects: ['sneakers'], visible_actions: ['walking'], setting: 'outdoor_path', people_visibility: 'legs_only',
      body_parts_visible: ['legs', 'feet'], composition: 'first_person_activity', camera_angle: 'downward', lighting: 'bright_daylight',
      dominant_colors: [], text_in_image: 'none', specific_details: 'paved path and long shadow',
      visual_tagging_schema: 'observable_v2', visual_review_status: 'IMAGE_INSPECTED_V2', visual_reviewed_at: '2026-09-24T00:00:00.000Z',
    };
    const generic = { ...base, id: 'generic', public_url: 'https://example.com/generic.jpg', metadata: { asset_name: 'OUTDOOR_WALK_GENERIC_POV' } };
    const precise = { ...base, id: 'precise', public_url: 'https://example.com/precise.jpg', metadata: { asset_name: 'OUTDOOR_WALK_SIDEWALK_SHADOW_POV' } };
    const [selected] = chooseAssets({
      carouselType: 'C06_POV_RELATABLE',
      assets: [generic, precise],
      personaId: 'P01',
      slides: [{ position: 2, role: 'TIP', assetType: 'stock', headline: 'Morning sidewalk walk', body: 'Ten minutes outside.', assetQuery: 'sidewalk shadow POV', visualIntent: 'walking outside on a sidewalk with a visible shadow' }],
    });
    assert.equal(selected?.asset.id, 'precise');
  });

  it('requires reviewed observable stock and derives physical intent', () => {
    const reviewed = {
      id: 'reviewed', filename: 'reviewed.jpg', category: 'fitness', subcategory: 'fitness', orientation: 'portrait', framing: 'medium', activity: '', mood: '', colors: [], tags: [], public_url: 'https://example.com/reviewed.jpg', use_count: 0, last_used_at: null, source_type: 'stock', visual_description: 'open notebook on a bed with a pen', visible_objects: ['notebook', 'bed', 'pen'], visible_actions: ['writing'], setting: 'bedroom', people_visibility: 'no_person', body_parts_visible: [], composition: 'bedroom_scene', camera_angle: 'high_angle', lighting: 'soft_indoor_natural_light', dominant_colors: [], text_in_image: '', specific_details: 'handwritten_pages', visual_tagging_schema: 'observable_v1', visual_review_status: 'IMAGE_INSPECTED_V1', visual_reviewed_at: '2026-09-22T00:00:00.000Z',
    } satisfies SelectableAsset;
    const stale = { ...reviewed, id: 'stale', filename: 'stale.jpg', visual_review_status: '' } satisfies SelectableAsset;
    const intent = deriveVisualIntent({ headline: 'Brain dump before bed', body: 'Write it down.', assetQuery: 'notebook and pen on bed', visualIntent: 'open notebook on bed with hand writing' });
    assert.deepEqual(intent.desired_objects, ['notebook', 'pen', 'bed']);
    assert.ok(intent.desired_actions.includes('writing'));
    assert.ok(intent.desired_settings.includes('bedroom'));
    const [selected] = chooseAssets({ carouselType: 'C06_POV_RELATABLE', assets: [stale, reviewed], personaId: 'P01', slides: [{ position: 2, role: 'TIP', assetType: 'stock', headline: 'Brain dump before bed', body: 'Write it down.', assetQuery: 'notebook and pen on bed', visualIntent: 'open notebook on bed with hand writing' }] });
    assert.equal(selected?.asset.id, 'reviewed');
  });
});
