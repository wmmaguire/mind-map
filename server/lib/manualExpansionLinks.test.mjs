import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManualExpansionLinks } from './manualExpansionLinks.js';

test('normalizeManualExpansionLinks keeps new->anchor and drops random target', () => {
  const newIds = new Set(['n1']);
  const selIds = new Set(['a1']);
  const links = [
    { source: 'n1', target: 'a1', relationship: 'ok' },
    { source: 'n1', target: 'stranger', relationship: 'bad' }
  ];
  const out = normalizeManualExpansionLinks(links, newIds, selIds);
  assert.equal(out.length, 1);
  assert.equal(out[0].target, 'a1');
});

test('normalizeManualExpansionLinks accepts anchor->new direction', () => {
  const out = normalizeManualExpansionLinks(
    [{ source: 'a1', target: 'n1', relationship: 'rev' }],
    new Set(['n1']),
    new Set(['a1'])
  );
  assert.equal(out[0].source, 'n1');
  assert.equal(out[0].target, 'a1');
});

test('normalizeManualExpansionLinks dedupes same edge', () => {
  const out = normalizeManualExpansionLinks(
    [
      { source: 'n1', target: 'a1', relationship: 'x' },
      { source: 'n1', target: 'a1', relationship: 'y' }
    ],
    new Set(['n1']),
    new Set(['a1'])
  );
  assert.equal(out.length, 1);
});
