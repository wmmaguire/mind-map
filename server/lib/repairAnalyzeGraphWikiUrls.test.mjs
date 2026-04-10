import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeEnWikiUrlString,
  wikipediaOpensearchFirstUrl,
  repairAnalyzeGraphWikiUrls
} from './repairAnalyzeGraphWikiUrls.js';

test('normalizeEnWikiUrlString upgrades http and mobile host', () => {
  assert.equal(
    normalizeEnWikiUrlString('http://en.wikipedia.org/wiki/Foo_bar'),
    'https://en.wikipedia.org/wiki/Foo_bar'
  );
  assert.equal(
    normalizeEnWikiUrlString('https://en.m.wikipedia.org/wiki/Hello'),
    'https://en.wikipedia.org/wiki/Hello'
  );
});

test('wikipediaOpensearchFirstUrl parses opensearch JSON', async () => {
  const fetchFn = async url => {
    assert.ok(String(url).includes('action=opensearch'));
    return {
      ok: true,
      json: async () => [
        'test',
        ['Test'],
        [''],
        ['https://en.wikipedia.org/wiki/Test']
      ]
    };
  };
  const u = await wikipediaOpensearchFirstUrl('test query', fetchFn);
  assert.equal(u, 'https://en.wikipedia.org/wiki/Test');
});

test('repairAnalyzeGraphWikiUrls keeps valid wikiUrl', async () => {
  const good = 'https://en.wikipedia.org/wiki/Earth';
  const fetchFn = async url => {
    if (String(url).includes('rest_v1/page/summary')) {
      return {
        ok: true,
        json: async () => ({
          extract: 'Planet',
          title: 'Earth'
        })
      };
    }
    throw new Error('unexpected fetch ' + url);
  };
  const out = await repairAnalyzeGraphWikiUrls(
    {
      nodes: [{ id: '1', label: 'Earth', description: 'Planet', wikiUrl: good }],
      links: []
    },
    fetchFn
  );
  assert.equal(out.nodes[0].wikiUrl, good);
});

test('repairAnalyzeGraphWikiUrls replaces bad URL via opensearch', async () => {
  const fetchFn = async url => {
    const s = String(url);
    if (s.includes('rest_v1/page/summary/Not_Real_Page_Xyz')) {
      return { ok: false, status: 404 };
    }
    if (s.includes('rest_v1/page/summary/Climate_change')) {
      return {
        ok: true,
        json: async () => ({
          extract: 'Long-term statistical weather patterns',
          title: 'Climate change'
        })
      };
    }
    if (s.includes('action=opensearch')) {
      return {
        ok: true,
        json: async () => [
          'Climate change',
          ['Climate change'],
          [''],
          ['https://en.wikipedia.org/wiki/Climate_change']
        ]
      };
    }
    throw new Error('unexpected fetch ' + url);
  };
  const out = await repairAnalyzeGraphWikiUrls(
    {
      nodes: [
        {
          id: '1',
          label: 'Climate change',
          description: 'Topic',
          wikiUrl: 'https://en.wikipedia.org/wiki/Not_Real_Page_Xyz'
        }
      ],
      links: []
    },
    fetchFn
  );
  assert.ok(out.nodes[0].wikiUrl.includes('Climate_change'));
});
