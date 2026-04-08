import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRandomExpansionLinks,
  RANDOM_EXPANSION_RELATIONSHIP
} from './randomExpansionLinks.js';

test('buildRandomExpansionLinks uses growing pool in batch order', () => {
  let i = 0;
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.9, 0.1, 0.2];
  const rng = () => seq[i++ % seq.length];

  const links = buildRandomExpansionLinks(
    ['a', 'b'],
    ['x', 'y', 'z'],
    2,
    rng
  );

  assert.equal(links.length, 4);
  const aLinks = links.filter(l => l.source === 'a');
  assert.equal(aLinks.length, 2);
  assert.ok(aLinks.every(l => ['x', 'y', 'z'].includes(l.target)));
  assert.ok(aLinks.every(l => l.relationship === RANDOM_EXPANSION_RELATIONSHIP));

  const bLinks = links.filter(l => l.source === 'b');
  assert.equal(bLinks.length, 2);
  const bTargets = new Set(bLinks.map(l => l.target));
  assert.ok(!bTargets.has('b'));
  assert.equal(bTargets.size, 2);
});

test('buildRandomExpansionLinks throws when pool too small', () => {
  assert.throws(
    () => buildRandomExpansionLinks(['a'], ['x'], 2, () => 0.5),
    /Not enough nodes to attach/
  );
});
