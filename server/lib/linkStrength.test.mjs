import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLinkStrength, ensureGraphLinkStrength } from './linkStrength.js';

test('scoreLinkStrength clamps to [0,1] and is deterministic', () => {
  const a = { id: 'a', label: 'Notion', description: 'A productivity app' };
  const b = { id: 'b', label: 'Database', description: 'Structured data' };
  const s1 = scoreLinkStrength({
    sourceNode: a,
    targetNode: b,
    relationship: 'Notion uses databases to organize information',
  });
  const s2 = scoreLinkStrength({
    sourceNode: a,
    targetNode: b,
    relationship: 'Notion uses databases to organize information',
  });
  assert.ok(s1 >= 0 && s1 <= 1);
  assert.equal(s1, s2);
});

test('ensureGraphLinkStrength preserves and clamps existing strength', () => {
  const g = ensureGraphLinkStrength({
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    links: [{ source: 'a', target: 'b', relationship: 'rel', strength: 2 }],
  });
  assert.equal(g.links[0].strength, 1);
});

test('ensureGraphLinkStrength fills missing strength', () => {
  const g = ensureGraphLinkStrength({
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    links: [{ source: 'a', target: 'b', relationship: 'rel' }],
  });
  assert.equal(typeof g.links[0].strength, 'number');
  assert.ok(g.links[0].strength >= 0 && g.links[0].strength <= 1);
});

