import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRelationshipSynthesisEnabled,
  getRelationshipSynthesisModel
} from './relationshipSynthesisConfig.js';

test('isRelationshipSynthesisEnabled defaults true', () => {
  const prev = process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS;
  delete process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS;
  assert.equal(isRelationshipSynthesisEnabled(), true);
  process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS = prev;
});

test('isRelationshipSynthesisEnabled respects off', () => {
  const prev = process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS;
  process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS = '0';
  assert.equal(isRelationshipSynthesisEnabled(), false);
  process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS = prev;
});

test('getRelationshipSynthesisModel defaults to mini', () => {
  const prev = process.env.OPENAI_RELATIONSHIP_SYNTHESIS_MODEL;
  delete process.env.OPENAI_RELATIONSHIP_SYNTHESIS_MODEL;
  assert.equal(getRelationshipSynthesisModel(), 'gpt-4o-mini');
  process.env.OPENAI_RELATIONSHIP_SYNTHESIS_MODEL = prev;
});
