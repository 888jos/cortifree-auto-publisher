import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanAssets } from '../src/assets/scanner.js';

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
});
