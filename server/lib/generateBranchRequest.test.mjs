import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGenerateBranchRequest,
  pathHasGraphEdges,
  buildGenerateBranchDryRunPreview
} from './generateBranchRequest.js';

const nodes = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' }
];
const links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' }
];

test('pathHasGraphEdges true for valid path', () => {
  assert.equal(pathHasGraphEdges(['a', 'b', 'c'], links), true);
});

test('pathHasGraphEdges false when edge missing', () => {
  assert.equal(pathHasGraphEdges(['a', 'c'], links), false);
});

test('validateGenerateBranchRequest rejects unknown path node', () => {
  const r = validateGenerateBranchRequest({
    existingGraphNodes: nodes,
    existingGraphLinks: links,
    branch: { pathNodeIds: ['a', 'x'] },
    iterations: 1,
    memoryK: 2,
    nodesPerIteration: 1
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BRANCH_PATH_UNKNOWN_NODE');
});

test('validateGenerateBranchRequest rejects disconnected path', () => {
  const r = validateGenerateBranchRequest({
    existingGraphNodes: nodes,
    existingGraphLinks: links,
    branch: { pathNodeIds: ['a', 'c'] },
    iterations: 1,
    memoryK: 2,
    nodesPerIteration: 1
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BRANCH_PATH_NOT_CONNECTED');
});

test('validateGenerateBranchRequest ok and dryRun preview', () => {
  const r = validateGenerateBranchRequest({
    existingGraphNodes: nodes,
    existingGraphLinks: links,
    branch: { pathNodeIds: ['a', 'b', 'c'] },
    iterations: 2,
    memoryK: 2,
    nodesPerIteration: 2,
    crossLinksPerIteration: 1,
    dryRun: true
  });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  const p = buildGenerateBranchDryRunPreview(r);
  assert.equal(p.iterations, 2);
  assert.equal(p.totalNewNodesUpperBound, 4);
  assert.equal(p.pathNodeIds.join(','), 'a,b,c');
});

test('validateGenerateBranchRequest rejects iterations over cap', () => {
  const r = validateGenerateBranchRequest({
    existingGraphNodes: nodes,
    existingGraphLinks: links,
    branch: { pathNodeIds: ['a', 'b'] },
    iterations: 99,
    memoryK: 2,
    nodesPerIteration: 1
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ITERATIONS_OVER_CAP');
});

test('validateGenerateBranchRequest rejects total new nodes over cap', () => {
  const r = validateGenerateBranchRequest({
    existingGraphNodes: nodes,
    existingGraphLinks: links,
    branch: { pathNodeIds: ['a', 'b'] },
    iterations: 10,
    memoryK: 2,
    nodesPerIteration: 5
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BRANCH_TOTAL_NEW_NODES_OVER_CAP');
});
