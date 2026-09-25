import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  batchGenerationCount,
  assertGenerationBudget,
  buildImagePrompt,
  generatedAssetName,
  personaAssetFolder,
  withImageRetry,
} from '../src/image-generation/core.js';
import {
  deterministicReferenceName,
  scanVisualReferences,
  searchVisualReferences,
  scoreVisualReferenceForScene,
  visualReferenceSchema,
} from '../src/visual-references/index.js';
import { chooseAssets, selectAssetOrGeneration, type JitSelectableAsset } from '../app/lib/asset-selector.js';
import { LocalDriveAssetStorage } from '../src/storage/asset-storage.js';
import type { PersonaConfig } from '../src/domain.js';

const persona: PersonaConfig = {
  id: 'P02', name: 'Lily', age: 24, background: 'fictional',
  physical: { skin: 'fair', hair: 'blonde', eyes: 'blue', face: 'oval', build: 'slim' },
  situation: 'wellness', visual_style: 'natural', signature_scene: 'morning kitchen',
  image_generation: { master_prompt: 'master', identity_reference_prompt: 'identity', negative_prompt: 'negative' },
  content: { primary_topics: ['sleep'], voice: 'soft', cta_style: 'soft', medical_guardrails: ['no diagnosis'] },
};

const reference = visualReferenceSchema.parse({
  id: 'MORNING_HOME_001', category: 'morning_home', source_platform: 'pinterest',
  source_url: 'https://www.pinterest.com/pin/1/', pose: 'standing by a window', framing: 'waist-up',
  outfit: 'white pajamas', environment: 'bedroom', lighting: 'soft sunrise', tags: ['morning'], good_for: ['routine'],
});

describe('persona image infrastructure', () => {
  it('never overwrites deterministic reference or generated asset names', () => {
    assert.equal(deterministicReferenceName('morning_home', ['MORNING_HOME_001.JPG']), 'MORNING_HOME_002.jpg');
    assert.equal(generatedAssetName('Lily', 'self_care', ['LILY_SELFCARE_001.JPG']), 'LILY_SELFCARE_002.jpg');
    assert.equal(personaAssetFolder('fitness'), '03_FITNESS');
  });

  it('enforces batch limits and variation bounds', () => {
    assert.equal(batchGenerationCount(2, 3, 2), 12);
    assert.throws(() => batchGenerationCount(16, 4, 2), /100 images/);
    assert.throws(() => batchGenerationCount(1, 1, 4), /Invalid batch/);
    assert.throws(() => assertGenerationBudget({ spentTodayUsd: 0, unitCostUsd: 0.04, dailyCapUsd: 0 }), /spending is disabled/);
    assert.throws(() => assertGenerationBudget({ spentTodayUsd: 0.09, unitCostUsd: 0.02, dailyCapUsd: 0.1 }), /cap reached/);
    assert.doesNotThrow(() => assertGenerationBudget({ spentTodayUsd: 0.04, unitCostUsd: 0.02, dailyCapUsd: 0.1 }));
  });

  it('reuses persona, then stock, before choosing the JIT generation fallback', () => {
    const base: JitSelectableAsset = {
      id: 'a1', filename: 'LILY_HOME_001.jpg', category: 'home', subcategory: 'morning', orientation: 'portrait',
      framing: 'medium', activity: 'opening curtains', mood: 'calm', colors: [], tags: ['morning', 'window'],
      public_url: 'https://example.com/a.jpg', use_count: 0, last_used_at: null,
    };
    const personaDecision = selectAssetOrGeneration({ assets: [{ ...base, source_type: 'persona_generated', persona_id: 'P02' }], personaId: 'P02', category: 'home', visualIntent: 'morning window' });
    assert.equal(personaDecision.action, 'reuse_persona');
    const stockDecision = selectAssetOrGeneration({ assets: [{ ...base, source_type: 'stock', persona_id: null }], personaId: 'P02', category: 'home', visualIntent: 'morning window' });
    assert.equal(stockDecision.action, 'reuse_stock');
    assert.equal(selectAssetOrGeneration({ assets: [], personaId: 'P02', category: 'home', visualIntent: 'morning window' }).action, 'generate');
  });

  it('keeps MASTER identity separate from visual-reference instructions', () => {
    const prompt = buildImagePrompt(persona, reference, {
      persona_id: 'P02', master_asset_id: 'master-1', visual_reference_id: reference.id,
      scene: 'opening the curtains', category: 'home', framing: 'full body',
    });
    assert.match(prompt, /Image 1 defines the exact identity/);
    assert.match(prompt, /Image 2 is only the visual reference/);
    assert.match(prompt, /face-swap exactly one person/);
    assert.match(prompt, /Never face-swap, merge, duplicate or alter the second person's face/);
    assert.match(prompt, /Do not copy the identity/);
    assert.match(prompt, /No text\. No logos\. No watermark/);
    assert.match(prompt, /full body/);
  });

  it('retries transient failures only and stops after success', async () => {
    let attempts = 0;
    const result = await withImageRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('429 temporary');
      return 'ok';
    }, { sleep: async () => undefined });
    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
    await assert.rejects(() => withImageRetry(async () => { throw new Error('invalid prompt'); }), /invalid prompt/);
  });

  it('scans image metadata, deduplicates bytes and searches semantic fields', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cortifree-refs-'));
    const refsRoot = path.join(root, '09_VISUAL_REFERENCES');
    const category = path.join(refsRoot, 'morning_home');
    await fs.mkdir(category, { recursive: true });
    await fs.writeFile(path.join(refsRoot, 'visual_references.json'), JSON.stringify([reference]));
    const image = await sharp({ create: { width: 300, height: 500, channels: 3, background: '#ccddee' } }).jpeg().toBuffer();
    await fs.writeFile(path.join(category, 'MORNING_HOME_001.jpg'), image);
    await fs.writeFile(path.join(category, 'duplicate.jpg'), image);
    const records = await scanVisualReferences(root);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.width, 300);
    assert.equal(records[0]?.orientation, 'portrait');
    assert.deepEqual(searchVisualReferences(records, 'sunrise bedroom').map((item) => item.id), ['MORNING_HOME_001']);
  });

  it('accepts canonical runtime visual-reference IDs and evolved categories', () => {
    const parsed = visualReferenceSchema.parse({
      id: 'VR134',
      category: 'food_energy',
      source_platform: 'manual',
      pose: 'cooking / baking / kitchen prep',
      framing: 'lifestyle_scene',
      outfit: 'casual_neutral',
      environment: 'kitchen',
      tags: ['cooking', 'food_energy', 'kitchen'],
      good_for: ['PILLAR_FOOD'],
      enabled: true,
      metadata: { review_status: 'OK' },
    });
    assert.equal(parsed.id, 'VR134');
    assert.equal(parsed.category, 'food_energy');
  });

  it('ranks scene-compatible evolved refs above unrelated categories', () => {
    const kitchen = visualReferenceSchema.parse({
      id: 'VR134', category: 'food_energy', source_platform: 'manual',
      pose: 'cooking / baking / kitchen prep', framing: 'lifestyle_scene',
      outfit: 'casual_neutral', environment: 'kitchen', tags: ['cooking', 'food_energy', 'kitchen'],
      good_for: ['PILLAR_FOOD'], enabled: true, metadata: { review_status: 'OK' },
    });
    const car = visualReferenceSchema.parse({
      id: 'VR059', category: 'on_the_go_lifestyle', source_platform: 'manual',
      pose: 'front camera portrait', framing: 'closeup_selfie',
      outfit: 'casual_neutral', environment: 'car', tags: ['car', 'selfie', 'on_the_go_lifestyle'],
      good_for: ['PILLAR_OUTDOORS'], enabled: true, metadata: { review_status: 'OK' },
    });
    const scene = {
      category: 'food',
      scene_description: 'preparing breakfast in a kitchen',
      recommended_reference_categories: ['food_grocery', 'kitchen'],
      recommended_framing: 'lifestyle_scene',
      recommended_outfit: 'casual_neutral',
    };
    assert.ok(scoreVisualReferenceForScene(kitchen, scene) > scoreVisualReferenceForScene(car, scene));
    assert.ok(scoreVisualReferenceForScene(kitchen, scene) >= 6);
  });

  it('penalizes scene-incompatible and non-human refs with the canonical scorer', () => {
    const outdoor = visualReferenceSchema.parse({
      id: 'VR_OUTDOOR', category: 'outdoors_walk', source_platform: 'manual',
      pose: 'walking full body', framing: 'full body', outfit: 'casual',
      environment: 'city sidewalk park', lighting: 'daylight',
      tags: ['walking', 'outdoor', 'street'], good_for: ['outdoors_walk'], enabled: true,
      metadata: { review_status: 'OK' },
    });
    const emptyRoom = visualReferenceSchema.parse({
      id: 'VR_EMPTY', category: 'hero_misc', source_platform: 'manual',
      pose: 'none', framing: 'wide', outfit: '',
      environment: 'empty room', lighting: 'daylight',
      tags: ['environment reference', 'no_person'], good_for: ['room'], enabled: true,
      metadata: { review_status: 'OK' },
    });
    const scene = {
      category: 'outdoors',
      scene_description: 'young woman walking outside on a city sidewalk in daylight',
      recommended_reference_categories: ['outdoors_walk'],
    };
    assert.ok(scoreVisualReferenceForScene(outdoor, scene) > scoreVisualReferenceForScene(emptyRoom, scene));
    assert.ok(scoreVisualReferenceForScene(emptyRoom, scene) < 0);
  });

  it('uses only official CortiFree app screens when a slide explicitly requests real UI', () => {
    const stock: JitSelectableAsset = {
      id: 'stock-1', filename: 'PHONE_ON_DESK.jpg', category: 'work_study', subcategory: 'desk',
      orientation: 'portrait', framing: 'medium', activity: 'phone on desk', mood: 'calm',
      colors: [], tags: ['phone'], public_url: 'https://example.com/stock.jpg', use_count: 0, last_used_at: null,
      source_type: 'stock', persona_id: null, visual_tagging_schema: 'observable_v2',
      visual_review_status: 'IMAGE_INSPECTED_V2', visual_reviewed_at: new Date().toISOString(),
      visual_description: 'phone on a cream desk', visible_objects: ['phone'], visible_actions: [],
      setting: 'work_study', metadata: { visual_tagging_schema: 'observable_v2', visual_review_status: 'IMAGE_INSPECTED_V2', visual_reviewed_at: new Date().toISOString() },
    };
    const appScreen: JitSelectableAsset = {
      id: 'app-1', filename: 'CF_APP_SCREEN_03_LIBRARY_OVERVIEW_01.jpeg', category: 'app_ui', subcategory: 'library_overview',
      orientation: 'portrait', framing: 'app_screen', activity: 'app_ui', mood: 'calm',
      colors: [], tags: ['cortifree', 'app', 'screenshot', 'official', 'library_overview'],
      good_for: ['cortifree', 'app_ui', 'library_overview'],
      public_url: 'drive://drive-1', drive_file_id: 'drive-1', use_count: 0, last_used_at: null,
      source_type: 'app_screenshot', persona_id: null,
      visual_description: 'Official CortiFree app screenshot library overview',
      visible_objects: ['phone_ui', 'app_screen'], visible_actions: [], setting: 'app_ui',
      people_visibility: 'no_person', composition: 'app_screen', camera_angle: 'front',
      text_in_image: 'official_cortifree_ui',
    };
    const slide = {
      position: 4, role: 'BODY', headline: 'save the cue', body: '',
      assetQuery: 'official real CortiFree app screenshot shown on a smartphone; do not recreate the app UI',
      visualIntent: 'authentic CortiFree app interface only', assetType: 'stock',
    };
    const result = chooseAssets({ assets: [stock, appScreen], carouselType: 'F04_AESTHETIC_EDUCATIONAL', slides: [slide] });
    assert.equal(result[0]?.asset.source_type, 'app_screenshot');
    assert.equal(result[0]?.asset.id, 'app-1');

    assert.throws(
      () => chooseAssets({ assets: [stock], carouselType: 'F04_AESTHETIC_EDUCATIONAL', slides: [slide] }),
      /CORTIFREE_APP_SCREEN_REQUIRED/,
    );
  });

  it('accepts broad-domain persona hook imagery without requiring an exact fitness micro-scene', () => {
    const fitnessPersona: JitSelectableAsset = {
      id: 'p06-fitness', filename: 'P06_PILATES_01.jpg', category: 'fitness', subcategory: 'pilates',
      orientation: 'portrait', framing: 'full_body', activity: 'pilates', mood: 'focused',
      colors: [], tags: ['fitness', 'pilates', 'sportswear', 'indoor'], good_for: ['fitness_pilates', 'workout'],
      public_url: 'https://example.com/p06-fit.jpg', use_count: 0, last_used_at: null,
      source_type: 'persona_generated', persona_id: 'P06',
      visual_description: 'young woman in sportswear doing Pilates in a bright fitness studio',
      visible_objects: ['exercise_mat'], visible_actions: ['movement'], setting: 'pilates_studio',
      people_visibility: 'full_body', composition: 'person_activity_scene', camera_angle: 'eye_level',
      lighting: 'bright_daylight', metadata: {},
    };
    const beautyPersona: JitSelectableAsset = {
      ...fitnessPersona,
      id: 'p06-beauty', filename: 'P06_BEAUTY_01.jpg', category: 'self_care', subcategory: 'skincare',
      tags: ['skincare', 'bathroom', 'beauty'], good_for: ['self_care'],
      visual_description: 'young woman applying moisturizer in a bathroom mirror',
      visible_objects: ['moisturizer', 'mirror'], visible_actions: ['skincare'], setting: 'bathroom',
    };
    const hook = {
      position: 1, role: 'HOOK', headline: 'my after-work fitness reset', body: '',
      assetQuery: 'P06 young woman on a treadmill in a commercial gym',
      visualIntent: 'same P06 identity, fitness vibe, active sportswear scene',
      assetType: 'persona',
    };
    const result = chooseAssets({ assets: [beautyPersona, fitnessPersona], carouselType: 'F01', personaId: 'P06', slides: [hook] });
    assert.equal(result[0]?.asset.id, 'p06-fitness');
    assert.equal(result[0]?.threshold, 42);
    assert.ok((result[0]?.score ?? 0) >= 42);
  });

  it('scores broad fitness visual references above unrelated hook references', () => {
    const fitness = visualReferenceSchema.parse({
      id: 'FITNESS_HOOK', category: 'fitness_pilates', source_platform: 'manual',
      pose: 'standing after workout', framing: 'full body', outfit: 'sportswear',
      environment: 'pilates studio', lighting: 'daylight',
      tags: ['fitness', 'pilates', 'workout'], good_for: ['fitness_pilates'], enabled: true,
      metadata: { review_status: 'OK' },
    });
    const beauty = visualReferenceSchema.parse({
      id: 'BEAUTY_HOOK', category: 'self_care', source_platform: 'manual',
      pose: 'mirror skincare', framing: 'waist up', outfit: 'robe',
      environment: 'bathroom', lighting: 'soft indoor',
      tags: ['skincare', 'beauty', 'bathroom'], good_for: ['self_care'], enabled: true,
      metadata: { review_status: 'OK' },
    });
    const scene = {
      category: 'fitness',
      scene_description: 'woman on treadmill in a commercial gym',
      recommended_reference_categories: ['fitness_pilates'],
      broad_match_only: true,
    };
    assert.ok(scoreVisualReferenceForScene(fitness, scene) > scoreVisualReferenceForScene(beauty, scene));
    assert.ok(scoreVisualReferenceForScene(fitness, scene) >= 8);
  });

  it('stores local assets without overwrite and refuses MASTER writes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cortifree-storage-'));
    const storage = new LocalDriveAssetStorage(root);
    const first = await storage.putIfAbsent({ storagePath: '02_PERSONAS/LILY/02_HOME/LILY_HOME_001.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    const second = await storage.putIfAbsent({ storagePath: '02_PERSONAS/LILY/02_HOME/LILY_HOME_001.jpg', bytes: new Uint8Array([9]), contentType: 'image/jpeg' });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.deepEqual([...await fs.readFile(first.publicUrl)], [1, 2, 3]);
    await assert.rejects(() => storage.putIfAbsent({ storagePath: '02_PERSONAS/LILY/00_MASTER/LILY_MASTER.jpg', bytes: new Uint8Array([1]), contentType: 'image/jpeg' }), /MASTER writes are prohibited/);
  });
});
