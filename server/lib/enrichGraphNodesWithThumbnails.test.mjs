import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichGraphNodesWithThumbnails } from './enrichGraphNodesWithThumbnails.js';

test('enrichGraphNodesWithThumbnails adds thumbnailUrl from wikiUrl', async () => {
  const thumb = 'https://upload.wikimedia.org/w/a.png';
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return { thumbnail: { source: thumb } };
      },
    };
  };
  const out = await enrichGraphNodesWithThumbnails(
    {
      nodes: [
        {
          id: '1',
          label: 'A',
          wikiUrl: 'https://en.wikipedia.org/wiki/Alpha',
        },
      ],
      links: [],
    },
    fetchFn
  );
  assert.equal(out.nodes[0].thumbnailUrl, thumb);
  assert.equal(calls, 1);
});

test('enrichGraphNodesWithThumbnails skips when thumbnailUrl already set', async () => {
  const existing = 'https://upload.wikimedia.org/w/existing.png';
  const fetchFn = async () => {
    throw new Error('should not fetch');
  };
  const out = await enrichGraphNodesWithThumbnails(
    {
      nodes: [
        {
          id: '1',
          label: 'A',
          wikiUrl: 'https://en.wikipedia.org/wiki/Alpha',
          thumbnailUrl: existing,
        },
      ],
      links: [],
    },
    fetchFn
  );
  assert.equal(out.nodes[0].thumbnailUrl, existing);
});

test('enrichGraphNodesWithThumbnails leaves graph unchanged when empty nodes', async () => {
  const g = { nodes: [], links: [] };
  const out = await enrichGraphNodesWithThumbnails(g, async () => ({}));
  assert.deepEqual(out, g);
});
