import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accountSchema, carouselSpecSchema, personaConfigSchema } from '../src/domain.js';
import { validateTemplateConstraints } from '../src/templates/registry.js';
import { goldenCarousel } from '../src/carousels/golden.js';
import { assertCortiFreeAccountId, assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from '../app/lib/workspace.js';

const persona = { id: 'P01', name: 'Emma', age: 22, background: 'fictional', physical: { skin: 'fair', hair: 'brown', eyes: 'brown', face: 'oval', build: 'slim' }, situation: 'wellness', visual_style: 'natural', signature_scene: 'kitchen', image_generation: { master_prompt: 'master', identity_reference_prompt: 'identity', negative_prompt: 'negative' }, content: { primary_topics: ['sleep'], voice: 'soft', cta_style: 'soft', medical_guardrails: ['no diagnosis'] } };
describe('schemas and constraints', () => {
  it('validates persona and account shapes', () => { assert.equal(personaConfigSchema.parse(persona).id, 'P01'); assert.equal(accountSchema.parse({ id: 'CF_EN_01', name: 'Test', persona_id: 'P01', language: 'en', market: 'US', timezone: 'America/New_York', platforms: ['tiktok'], daily_target: 1, posting_slots: ['11:30'], enabled: true }).enabled, true); });
  it('rejects unsafe template overflow', () => { assert.throws(() => validateTemplateConstraints({ position: 1, template_id: 'T01_FULLSCREEN_HOOK', headline: 'x'.repeat(73), subheadline: null }), /exceeds/); });
  it('creates a strict seven-slide golden carousel', () => { const spec = carouselSpecSchema.parse(goldenCarousel('CF_EN_01', 'P01')); assert.equal(spec.slides.length, 7); assert.equal(spec.language, 'en'); });
  it('rejects identifiers from another product workspace', () => {
    assert.equal(CORTIFREE_WORKSPACE_ID, 'cortifree');
    assert.doesNotThrow(() => assertCortiFreeCarouselId('CF_TEST_001'));
    assert.doesNotThrow(() => assertCortiFreeAccountId('CF_EN_01'));
    assert.throws(() => assertCortiFreeCarouselId('COCORISE_VIDEO_001'), /Invalid CortiFree/);
    assert.throws(() => assertCortiFreeAccountId('cocorise-main'), /Invalid CortiFree/);
  });
});
