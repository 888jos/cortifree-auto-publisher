import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanAssets } from '../src/assets/scanner.js';
import { chooseAssets } from '../app/lib/asset-selector';

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
});
