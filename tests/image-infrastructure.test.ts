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
  visualReferenceSchema,
} from '../src/visual-references/index.js';
import { selectAssetOrGeneration, type JitSelectableAsset } from '../app/lib/asset-selector.js';
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
