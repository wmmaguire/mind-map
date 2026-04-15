import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateNodeIdsInGraph } from './graphNodeIdValidation.js';

test('duplicateNodeIdsInGraph returns empty when all unique', () => {
  assert.deepEqual(
    duplicateNodeIdsInGraph([{ id: 'a' }, { id: 'b' }]),
    []
  );
});

test('duplicateNodeIdsInGraph returns ids that appear more than once', () => {
  const d = duplicateNodeIdsInGraph([
    { id: 'x' },
    { id: 'y' },
    { id: 'x' },
    { id: 'y' },
    { id: 'y' },
  ]);
  assert.ok(d.includes('x'));
  assert.ok(d.includes('y'));
  assert.equal(d.length, 2);
});

test('duplicateNodeIdsInGraph coerces id to string', () => {
  assert.deepEqual(duplicateNodeIdsInGraph([{ id: 1 }, { id: '1' }]), ['1']);
});
