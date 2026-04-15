import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExplodeNodeRequest,
  ensureExplosionTopology,
  resolveExplosionWikipediaContext,
} from './explodeNode.js';

const sampleExisting = [
  { id: 'a1', label: 'Alpha', description: '', wikiUrl: 'https://en.wikipedia.org/wiki/Alpha' },
  { id: 'b2', label: 'Beta', description: '', wikiUrl: '' },
];

test('validateExplodeNodeRequest rejects missing target', () => {
  const r = validateExplodeNodeRequest({
    existingGraphNodes: sampleExisting,
  });
  assert.equal(r.ok, false);
  assert.equal(r.payload.code, 'MISSING_TARGET_NODE');
});

test('validateExplodeNodeRequest rejects unknown target id', () => {
  const r = validateExplodeNodeRequest({
    targetNodeId: 'nope',
    existingGraphNodes: sampleExisting,
  });
  assert.equal(r.ok, false);
  assert.equal(r.payload.code, 'UNKNOWN_TARGET_NODE');
});

test('validateExplodeNodeRequest defaults numNodes to 5', () => {
  const r = validateExplodeNodeRequest({
    targetNodeId: 'a1',
    existingGraphNodes: sampleExisting,
  });
  assert.equal(r.ok, true);
  assert.equal(r.numNodes, 5);
});

test('validateExplodeNodeRequest rejects numNodes out of range', () => {
  const r = validateExplodeNodeRequest({
    targetNodeId: 'a1',
    existingGraphNodes: sampleExisting,
    numNodes: 3,
  });
  assert.equal(r.ok, false);
  assert.equal(r.payload.code, 'NUM_NODES_OUT_OF_RANGE');
});

test('ensureExplosionTopology adds clique and anchor bridges', () => {
  const ts = 42;
  const newData = {
    nodes: [
      { id: 't_1', label: 'N1' },
      { id: 't_2', label: 'N2' },
      { id: 't_3', label: 'N3' },
    ],
    links: [],
  };
  const out = ensureExplosionTopology(newData, 'anchor', ts);
  assert.equal(out.links.length, 6);
  const keys = new Set(
    out.links.map((l) => {
      const a = String(l.source);
      const b = String(l.target);
      return a < b ? `${a}__${b}` : `${b}__${a}`;
    })
  );
  assert.equal(keys.size, 6);
});

test('resolveExplosionWikipediaContext uses fetch mock', async () => {
  const fetchFn = async (url) => {
    if (String(url).includes('api/rest_v1/page/summary')) {
      return {
        ok: true,
        json: async () => ({
          extract: 'Mock extract about testing.',
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const ctx = await resolveExplosionWikipediaContext(
    {
      label: 'Unit testing',
      wikiUrl: 'https://en.wikipedia.org/wiki/Unit_testing',
    },
    fetchFn
  );
  assert.match(ctx.extract, /Mock extract/);
});
