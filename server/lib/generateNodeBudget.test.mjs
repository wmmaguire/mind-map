import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGenerateNodeRequest,
  buildGenerateNodeDryRunPreview,
  MAX_GENERATION_CONTEXT_CHARS
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
  assert.ok(Array.isArray(r.existingGraphNodes));
  assert.equal(r.existingGraphNodes.length, 0);
});

test('validateGenerateNodeRequest rejects invalid existingGraphNodes', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }],
    existingGraphNodes: 'bad'
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_EXISTING_GRAPH_NODES');
});

test('validateGenerateNodeRequest accepts existingGraphNodes', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }],
    existingGraphNodes: [
      { id: '1', label: 'One', description: 'd', wikiUrl: 'https://en.wikipedia.org/wiki/X' }
    ]
  });
  assert.equal(r.ok, true);
  assert.equal(r.existingGraphNodes.length, 1);
});

test('validateGenerateNodeRequest accepts generationContext', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }],
    generationContext: ' Prefer short labels. '
  });
  assert.equal(r.ok, true);
  assert.equal(r.generationContext, 'Prefer short labels.');
});

test('validateGenerateNodeRequest rejects generationContext too long', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }],
    generationContext: 'x'.repeat(MAX_GENERATION_CONTEXT_CHARS + 1)
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'GENERATION_CONTEXT_TOO_LONG');
});

test('validateGenerateNodeRequest rejects non-string generationContext', () => {
  const r = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }],
    generationContext: 123
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_GENERATION_CONTEXT');
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

test('validateGenerateNodeRequest rejects anchorStrategy out of range', () => {
  const v = validateGenerateNodeRequest({
    expansionAlgorithm: 'randomizedGrowth',
    dryRun: true,
    numNodes: 1,
    connectionsPerNewNode: 2,
    numCycles: 1,
    anchorStrategy: 2,
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'INVALID_ANCHOR_STRATEGY');
});

test('validateGenerateNodeRequest prune graph too small', () => {
  const v = validateGenerateNodeRequest({
    expansionAlgorithm: 'randomizedGrowth',
    numNodes: 1,
    connectionsPerNewNode: 3,
    existingGraphNodeIds: ['a', 'b', 'c', 'd'],
    enableDeletions: true,
    deletionsPerCycle: 3,
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'PRUNE_GRAPH_TOO_SMALL');
});

test('validateGenerateNodeRequest accepts anchorStrategy and dry-run preview', () => {
  const v = validateGenerateNodeRequest({
    expansionAlgorithm: 'randomizedGrowth',
    dryRun: true,
    numNodes: 2,
    connectionsPerNewNode: 2,
    numCycles: 2,
    anchorStrategy: -0.5,
    existingGraphLinks: [{ source: 'a', target: 'b' }],
  });
  assert.equal(v.ok, true);
  assert.equal(v.anchorStrategy, -0.5);
  assert.equal(v.deleteStrategy, 0.5);
  const p = buildGenerateNodeDryRunPreview(v);
  assert.equal(p.anchorStrategy, -0.5);
  assert.equal(p.deleteStrategy, 0.5);
  assert.equal(p.existingGraphLinksIncluded, true);
});

test('validateGenerateNodeRequest explicit deleteStrategy overrides invert', () => {
  const v = validateGenerateNodeRequest({
    expansionAlgorithm: 'randomizedGrowth',
    dryRun: true,
    numNodes: 1,
    connectionsPerNewNode: 2,
    anchorStrategy: 0.9,
    deleteStrategy: 0.2,
  });
  assert.equal(v.ok, true);
  assert.equal(v.anchorStrategy, 0.9);
  assert.equal(v.deleteStrategy, 0.2);
});

/** Manual single-anchor constraint (#76 follow-up: requiredAnchorId + requiredRelationshipLabel). */
test('validateGenerateNodeRequest manual accepts requiredAnchorId + label', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    numNodes: 2,
    requiredAnchorId: 'a',
    requiredRelationshipLabel: '  is an example of  ',
  });
  assert.equal(v.ok, true);
  assert.equal(v.expansionAlgorithm, 'manual');
  assert.equal(v.requiredAnchorId, 'a');
  assert.equal(v.requiredRelationshipLabel, 'is an example of');
});

test('validateGenerateNodeRequest manual rejects requiredAnchorId not in selectedNodes', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }, { id: 'b' }],
    numNodes: 1,
    requiredAnchorId: 'not-selected',
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'REQUIRED_ANCHOR_NOT_SELECTED');
  assert.equal(v.details.requiredAnchorId, 'not-selected');
});

test('validateGenerateNodeRequest manual rejects non-string requiredRelationshipLabel', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    requiredAnchorId: 'a',
    requiredRelationshipLabel: 42,
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'INVALID_REQUIRED_RELATIONSHIP_LABEL');
});

test('validateGenerateNodeRequest manual rejects requiredRelationshipLabel too long', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    requiredAnchorId: 'a',
    requiredRelationshipLabel: 'x'.repeat(201),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'REQUIRED_RELATIONSHIP_LABEL_TOO_LONG');
});

test('validateGenerateNodeRequest randomizedGrowth silently drops requiredAnchorId', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    expansionAlgorithm: 'randomizedGrowth',
    connectionsPerNewNode: 1,
    existingGraphNodeIds: ['a'],
    requiredAnchorId: 'not-selected',
    requiredRelationshipLabel: 'ignored',
  });
  assert.equal(v.ok, true);
  assert.equal(v.requiredAnchorId, undefined);
  assert.equal(v.requiredRelationshipLabel, undefined);
});

test('buildGenerateNodeDryRunPreview reflects single-anchor estimates', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    numNodes: 4,
    dryRun: true,
    requiredAnchorId: 'b',
    requiredRelationshipLabel: 'precedes',
  });
  assert.equal(v.ok, true);
  const p = buildGenerateNodeDryRunPreview(v);
  assert.equal(p.expansionAlgorithm, 'manual');
  assert.equal(p.requiredAnchorId, 'b');
  assert.equal(p.requiredRelationshipLabel, 'precedes');
  /** Required anchor only guarantees one edge per new node (others optional). */
  assert.equal(p.estimatedNewLinks, 4);
});

test('buildGenerateNodeDryRunPreview strict mode estimates edges to all anchors', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    numNodes: 4,
    dryRun: true,
  });
  assert.equal(v.ok, true);
  const p = buildGenerateNodeDryRunPreview(v);
  assert.equal(p.requiredAnchorId, null);
  assert.equal(p.estimatedNewLinks, 12);
});

/** Manual single-anchor CONCEPT constraint (alternative to relationship label). */
test('validateGenerateNodeRequest manual accepts requiredConceptHint', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a', label: 'A' }],
    numNodes: 2,
    requiredAnchorId: 'a',
    requiredConceptHint: '  chaos theory in biology  ',
  });
  assert.equal(v.ok, true);
  assert.equal(v.requiredConceptHint, 'chaos theory in biology');
  assert.equal(v.requiredRelationshipLabel, '');
});

test('validateGenerateNodeRequest manual rejects non-string requiredConceptHint', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    requiredAnchorId: 'a',
    requiredConceptHint: 7,
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'INVALID_REQUIRED_CONCEPT_HINT');
});

test('validateGenerateNodeRequest manual rejects requiredConceptHint too long', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    requiredAnchorId: 'a',
    requiredConceptHint: 'x'.repeat(201),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'REQUIRED_CONCEPT_HINT_TOO_LONG');
});

test('validateGenerateNodeRequest manual rejects both relationship label and concept hint', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    requiredAnchorId: 'a',
    requiredRelationshipLabel: 'is an example of',
    requiredConceptHint: 'chaos theory',
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'CONFLICTING_REQUIRED_CONSTRAINTS');
});

test('validateGenerateNodeRequest randomizedGrowth silently drops requiredConceptHint', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }],
    numNodes: 1,
    expansionAlgorithm: 'randomizedGrowth',
    connectionsPerNewNode: 1,
    existingGraphNodeIds: ['a'],
    requiredConceptHint: 'ignored outside manual',
  });
  assert.equal(v.ok, true);
  assert.equal(v.requiredConceptHint, undefined);
});

test('buildGenerateNodeDryRunPreview reflects concept hint', () => {
  const v = validateGenerateNodeRequest({
    selectedNodes: [{ id: 'a' }, { id: 'b' }],
    numNodes: 3,
    dryRun: true,
    requiredAnchorId: 'a',
    requiredConceptHint: 'Balkan folk music',
  });
  assert.equal(v.ok, true);
  const p = buildGenerateNodeDryRunPreview(v);
  assert.equal(p.requiredAnchorId, 'a');
  assert.equal(p.requiredConceptHint, 'Balkan folk music');
  assert.equal(p.requiredRelationshipLabel, '');
  assert.equal(p.estimatedNewLinks, 3);
});
