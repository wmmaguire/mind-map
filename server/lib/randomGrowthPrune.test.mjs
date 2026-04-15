import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRandomGrowthDeletes } from './randomGrowthPrune.js';

test('pickRandomGrowthDeletes never picks anchors or new batch', () => {
  const deleted = pickRandomGrowthDeletes({
    existingIds: ['a', 'b', 'c', 'd'],
    anchorIds: ['a'],
    newBatchIds: ['n1'],
    undirectedEdges: [
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ],
    count: 2,
    deleteStrategy: 0,
    random: () => 0.5,
    minNodesAfterDelete: 2,
  });
  assert.equal(deleted.length, 2);
  assert.ok(!deleted.includes('a'));
  assert.ok(!deleted.includes('n1'));
});

test('pickRandomGrowthDeletes throws when not enough candidates', () => {
  assert.throws(
    () =>
      pickRandomGrowthDeletes({
        existingIds: ['a', 'b', 'c', 'd', 'e'],
        anchorIds: ['a', 'b'],
        newBatchIds: ['n1'],
        undirectedEdges: [],
        count: 4,
        deleteStrategy: 0,
        random: () => 0.5,
        minNodesAfterDelete: 1,
      }),
    /Not enough deletable nodes/
  );
});
