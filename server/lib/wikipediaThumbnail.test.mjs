import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWikipediaThumbnailUrl } from './wikipediaThumbnail.js';

test('fetchWikipediaThumbnailUrl returns null for non-wiki URL', async () => {
  const r = await fetchWikipediaThumbnailUrl('https://example.com/', async () => {
    throw new Error('should not fetch');
  });
  assert.equal(r, null);
});

test('fetchWikipediaThumbnailUrl parses thumbnail from REST summary', async () => {
  const good = 'https://upload.wikimedia.org/w/thumb/x.png/220px-x.png';
  const fetchFn = async (url) => {
    assert.ok(String(url).includes('api/rest_v1/page/summary'));
    return {
      ok: true,
      async json() {
        return {
          thumbnail: { source: good },
        };
      },
    };
  };
  const r = await fetchWikipediaThumbnailUrl(
    'https://en.wikipedia.org/wiki/Climate_change',
    fetchFn
  );
  assert.equal(r, good);
});

test('fetchWikipediaThumbnailUrl returns null when no thumbnail in response', async () => {
  const fetchFn = async () => ({
    ok: true,
    async json() {
      return { title: 'X' };
    },
  });
  const r = await fetchWikipediaThumbnailUrl(
    'https://en.wikipedia.org/wiki/X',
    fetchFn
  );
  assert.equal(r, null);
});
