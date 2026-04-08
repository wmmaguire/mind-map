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
  assert.equal(p.numNodes, 2);
  assert.equal(p.selectedCount, 2);
  assert.equal(p.estimatedNewLinks, 4);
  assert.equal(p.caps.maxNewNodes, 5);
  assert.equal(p.caps.maxSelected, 12);
});
