import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanAssets } from '../src/assets/scanner.js';
import { chooseAssets, deriveVisualIntent, type SelectableAsset } from '../app/lib/asset-selector';
import { isAutomaticVisualReference } from '../src/visual-references';

describe('asset scanner', () => {
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
    const base = (id: string, category: string, visual_description: string, visible_objects: string[], visible_actions: string[] = []): SelectableAsset => ({
      id, filename: `${id}.jpg`, category, subcategory: category, orientation: 'portrait', framing: 'medium', activity: '', mood: '', colors: [], tags: [], public_url: `https://example.com/${id}.jpg`, use_count: 0, last_used_at: null, source_type: 'stock', visual_description, visible_objects, visible_actions, setting: 'indoor_room', people_visibility: 'no_person', body_parts_visible: [], composition: 'equipment_layout', camera_angle: 'top_down_or_high_angle', lighting: 'natural', dominant_colors: [], text_in_image: '', specific_details: '', visual_tagging_schema: 'observable_v1', visual_review_status: 'IMAGE_INSPECTED_V1', visual_reviewed_at: '2026-09-22T00:00:00.000Z',
    });
    const cases = [
      [{ headline: 'Recovery day', body: 'Easy movement without making it a whole production.', assetQuery: 'pilates mat and foam roller', visualIntent: 'pilates mat and foam roller on the floor', }, [base('fitness-mat', 'fitness', 'pink exercise mat on the floor with a foam roller and tablet nearby', ['exercise_mat', 'foam_roller', 'tablet'])], 'fitness-mat'],
      [{ headline: 'Brain dump before bed', body: 'Write down the next thought before turning out the light.', assetQuery: 'notebook and pen on bed', visualIntent: 'open notebook on bed with hand writing', }, [base('morning-journal', 'morning', 'open notebook and pen on a bed with a hand writing', ['journal', 'pen', 'bed'], ['writing'])], 'morning-journal'],
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
  it('normalizes specific observable tags before hard constraints', () => {
    const base = (id: string, description: string, visible_objects: string[], visible_actions: string[], setting: string): SelectableAsset => ({
      id, filename: `${id}.jpg`, category: 'legacy', subcategory: 'legacy', orientation: 'portrait', framing: 'medium',
      activity: visible_actions.join(' '), mood: 'natural', colors: [], tags: [], public_url: `https://example.com/${id}.jpg`,
      use_count: 0, last_used_at: null, source_type: 'stock', visual_description: description,
      visible_objects, visible_actions, setting, people_visibility: 'person', body_parts_visible: [],
      composition: 'person_activity_scene', camera_angle: 'eye_level', lighting: 'natural_daylight',
      dominant_colors: [], text_in_image: '', specific_details: description,
      visual_tagging_schema: 'observable_v1', visual_review_status: 'IMAGE_INSPECTED_V1',
      visual_reviewed_at: '2026-09-22T00:00:00.000Z',
    });

    const cases = [
      {
        id: 'walk',
        slide: { headline: 'Outdoor morning walk', body: 'Walk outside for ten minutes.', assetQuery: 'woman walking outdoors', visualIntent: 'woman walking on an outdoor path in morning light' },
        asset: base('walk', 'woman walking on a leafy outdoor path in morning light', ['sneakers'], ['walking'], 'outdoor_path'),
      },
      {
        id: 'journal',
        slide: { headline: 'Journal in bed', body: 'Write a quick brain dump.', assetQuery: 'open notebook on bed', visualIntent: 'hand writing in an open notebook on bed' },
        asset: base('journal', 'hand writing in an open notebook while sitting on a bed', ['open_notebook', 'pen', 'bed'], ['writing'], 'bed_or_soft_surface'),
      },
      {
        id: 'treadmill',
        slide: { headline: 'Treadmill POV', body: 'Easy cardio session.', assetQuery: 'running on treadmill at gym', visualIntent: 'person running on a treadmill in a commercial gym' },
        asset: base('treadmill', 'person running on treadmill in a gym cardio area', ['treadmill'], ['walking_or_running'], 'gym_cardio_area'),
      },
      {
        id: 'grocery',
        slide: { headline: 'Grocery reset', body: 'Shop for simple produce.', assetQuery: 'grocery shopping produce aisle', visualIntent: 'woman grocery shopping and reaching for produce' },
        asset: base('grocery', 'woman grocery shopping and reaching for produce in a produce aisle', ['produce', 'shopping_cart'], ['reaching_for_produce'], 'grocery_store_produce_aisle'),
      },
    ];

    for (const testCase of cases) {
      const [selected] = chooseAssets({
        carouselType: 'C06_POV_RELATABLE',
        assets: [testCase.asset],
        personaId: 'P01',
        slides: [{ position: 2, role: 'TIP', assetType: 'stock', ...testCase.slide }],
      });
      assert.equal(selected.asset.id, testCase.id);
      assert.equal(selected.fallbackPath === 'primary' || selected.fallbackPath === 'explicit_noncritical_fallback', true);
    }
  });

});
