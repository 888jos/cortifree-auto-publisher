import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanAssets } from '../src/assets/scanner.js';

describe('asset scanner', () => {
  it('indexes image metadata and classifies trailing-space folders', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cortifree-scan-'));
    await fs.mkdir(path.join(root, '01_STOCK_ASSETS ', 'morning'), { recursive: true });
    await fs.mkdir(path.join(root, '02_PERSONAS ', 'AVA', '02_HOME'), { recursive: true });
    await fs.mkdir(path.join(root, '03_TEMPLATES'), { recursive: true }); await fs.mkdir(path.join(root, '10_PERSONA_CONFIG'), { recursive: true });
    const image = path.join(root, '01_STOCK_ASSETS ', 'morning', 'hero.png');
    await sharp({ create: { width: 240, height: 320, channels: 4, background: '#abc' } }).png().toFile(image);
    const result = await scanAssets(root);
    assert.equal(result.assets.length, 1); assert.equal(result.assets[0]?.source_type, 'stock'); assert.equal(result.assets[0]?.category, 'morning'); assert.equal(result.assets[0]?.width, 240); assert.equal(result.added, 1);
    const second = await scanAssets(root, result.assets); assert.equal(second.assets.length, 1); assert.equal(second.added, 0); assert.equal(second.updated, 1);
  });
});
