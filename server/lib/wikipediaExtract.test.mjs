import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchWikipediaExtract,
  normalizeConceptLabel,
  titleFromEnWikiUrl
} from './wikipediaExtract.js';

test('normalizeConceptLabel collapses case and spaces', () => {
  assert.equal(normalizeConceptLabel('  Foo   Bar '), 'foo bar');
});

test('titleFromEnWikiUrl parses en.wikipedia path', () => {
  assert.equal(
    titleFromEnWikiUrl('https://en.wikipedia.org/wiki/Document_Object_Model'),
    'Document Object Model'
  );
});

test('fetchWikipediaExtract uses summary extract', async () => {
  const fakeFetch = async url => {
    assert.ok(String(url).includes('/api/rest_v1/page/summary/'));
    return {
      ok: true,
      json: async () => ({
        title: 'Test',
        extract: 'Hello world summary'
      })
    };
  };
  const r = await fetchWikipediaExtract(
    'https://en.wikipedia.org/wiki/Test',
    fakeFetch
  );
  assert.equal(r.extract, 'Hello world summary');
});

test('fetchWikipediaExtract returns empty for non-wiki URL', async () => {
  const r = await fetchWikipediaExtract('https://example.com', async () => ({}));
  assert.equal(r.extract, '');
  assert.ok(r.error);
});
