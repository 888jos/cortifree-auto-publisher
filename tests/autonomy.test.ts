import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fillHook, selectEditorial } from '../src/autonomy/selection.js';
import { personaIdFromFolder } from '../src/personas/identity.js';

const topic = {
  topic_id: 'TOPIC_0001',
  pillar_id: 'PILLAR_MORNING',
  topic: 'getting morning light',
  angle: 'a realistic morning light routine',
  target_problem: 'chaotic mornings',
  target_emotion: 'calm',
  eligible_formats: 'F03_ROUTINE_TIMELINE | F05_INTERACTIVE_CHECKLIST',
  eligible_personas: 'P01 | P06',
  weight: 1,
  cooldown_days: 14,
  active: true,
};
const hook = {
  hook_id: 'HOOK_0001',
  hook_family: 'routine',
  formula: 'My {time_period} reset for {goal}: {routine}',
  compatible_formats: 'F03_ROUTINE_TIMELINE | F01_LIFESTYLE_GUIDE',
  compatible_pillars: 'PILLAR_MORNING',
  persona_fit: 'ALL',
  weight: 1,
  cooldown_days: 7,
  active: true,
};
const cta = { cta_id: 'CTA_001', cta_family: 'save', text: 'Save this.', compatible_formats: 'all', weight: 1, active: true };

describe('autonomy selection', () => {
  it('maps persona folders to canonical IDs', () => {
    assert.equal(personaIdFromFolder('AVA'), 'P06');
    assert.equal(personaIdFromFolder('emma'), 'P01');
    assert.throws(() => personaIdFromFolder('UNKNOWN'), /Unknown persona/);
  });

  it('fills every supported hook placeholder', () => {
    const text = fillHook(hook.formula, topic, { time_period: '7-day', goal: 'calm mornings', routine: 'morning routine' });
    assert.equal(text, 'My 7-day reset for calm mornings: morning routine');
    assert.doesNotMatch(text, /\{[^}]+\}/);
  });

  it('selects a compatible canonical topic, hook, format and CTA', () => {
    const selected = selectEditorial({
      seed: 'fixed-seed',
      accountId: 'CF_EN_01',
      personaId: 'P06',
      pillarIds: ['PILLAR_MORNING'],
      formatIds: ['F03_ROUTINE_TIMELINE'],
      topics: [topic],
      hooks: [hook],
      ctas: [cta],
      history: [],
    });
    assert.equal(selected.topic.topic_id, 'TOPIC_0001');
    assert.equal(selected.hook.hook_id, 'HOOK_0001');
    assert.equal(selected.formatId, 'F03_ROUTINE_TIMELINE');
    assert.equal(selected.cta.cta_id, 'CTA_001');
  });

  it('enforces per-account topic cooldowns', () => {
    assert.throws(() => selectEditorial({
      seed: 'fixed-seed',
      accountId: 'CF_EN_01',
      personaId: 'P06',
      pillarIds: ['PILLAR_MORNING'],
      formatIds: ['F03_ROUTINE_TIMELINE'],
      topics: [topic],
      hooks: [hook],
      ctas: [cta],
      history: [{ account_id: 'CF_EN_01', topic_id: 'TOPIC_0001', created_at: new Date().toISOString() }],
    }), /No eligible editorial candidates/);
  });

  it('enforces network topic cooldowns across accounts', () => {
    assert.throws(() => selectEditorial({
      seed: 'fixed-seed',
      accountId: 'CF_EN_02',
      personaId: 'P01',
      pillarIds: ['PILLAR_MORNING'],
      formatIds: ['F03_ROUTINE_TIMELINE'],
      topics: [topic],
      hooks: [hook],
      ctas: [cta],
      history: [{ account_id: 'CF_EN_01', topic_id: 'TOPIC_0001', created_at: new Date().toISOString() }],
    }), /No eligible editorial candidates/);
  });
});
