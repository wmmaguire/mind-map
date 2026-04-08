import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGenerateNodeRequest,
  buildGenerateNodeDryRunPreview
} from './generateNodeBudget.js';

test('validateGenerateNodeRequest rejects empty selectedNodes', () => {
  const r = validateGenerateNodeRequest({ selectedNodes: [] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MISSING_SELECTED_NODES');
});

test('validateGenerateNodeRequest randomizedGrowth allows empty selectedNodes', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [],
    numNodes: 2,
    expansionAlgorithm: 'randomizedGrowth',
    connectionsPerNewNode: 2,
    numCycles: 1,
    existingGraphNodeIds: ['x', 'y', 'z']
  });
  assert.equal(r.ok, true);
  assert.equal(r.expansionAlgorithm, 'randomizedGrowth');
  assert.equal(r.selectedNodes.length, 0);
});

test('validateGenerateNodeRequest defaults numNodes to 3', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }]
  });
  assert.equal(r.ok, true);
  assert.equal(r.numNodes, 3);
});

test('validateGenerateNodeRequest enforces max new nodes', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 99
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NUM_NODES_OVER_CAP');
});

test('validateGenerateNodeRequest dryRun flag', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'x' }],
    numNodes: 2,
    dryRun: true
  });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
});

test('buildGenerateNodeDryRunPreview estimates links', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }, { id: 'b' }],
    numNodes: 2,
    dryRun: true
  });
  assert.equal(v.ok, true);
  const p = buildGenerateNodeDryRunPreview(v);
  assert.equal(p.expansionAlgorithm, 'manual');
  assert.equal(p.numNodes, 2);
  assert.equal(p.selectedCount, 2);
  assert.equal(p.estimatedNewLinks, 4);
  assert.equal(p.caps.maxNewNodes, 5);
  assert.equal(p.caps.maxSelected, 12);
});

test('validateGenerateNodeRequest randomizedGrowth dry run', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 2,
    dryRun: true,
    expansionAlgorithm: 'randomizedGrowth',
    connectionsPerNewNode: 2,
    numCycles: 3
  });
  assert.equal(v.ok, true);
  assert.equal(v.expansionAlgorithm, 'randomizedGrowth');
  assert.equal(v.numCycles, 3);
  const p = buildGenerateNodeDryRunPreview(v);
  assert.equal(p.estimatedTotalNewNodes, 6);
  assert.equal(p.estimatedNewLinks, 12);
});

test('validateGenerateNodeRequest randomizedGrowth requires existing ids', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 2,
    expansionAlgorithm: 'randomizedGrowth',
    connectionsPerNewNode: 2,
    numCycles: 1
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'MISSING_EXISTING_GRAPH_NODE_IDS');
});

test('validateGenerateNodeRequest randomizedGrowth rejects missing selected in pool', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    expansionAlgorithm: 'randomizedGrowth',
    connectionsPerNewNode: 1,
    existingGraphNodeIds: ['x', 'y']
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'EXISTING_IDS_MISSING_SELECTED');
});
