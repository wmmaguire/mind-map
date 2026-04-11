/**
 * Resolve a lead image URL for English Wikipedia article links via the REST summary
 * API (same origin as {@link ./wikipediaExtract.js} — no HTML scraping).
 */

import { titleFromEnWikiUrl } from './wikipediaExtract.js';

const DEFAULT_UA =
  'mind-map/1.0 (https://github.com/wmmaguire/mind-map; contact via repo)';

/**
 * @param {string} wikiUrl
 * @param {typeof fetch} [fetchFn=globalThis.fetch]
 * @returns {Promise<string|null>} HTTPS thumbnail URL or null
 */
export async function fetchWikipediaThumbnailUrl(wikiUrl, fetchFn = globalThis.fetch) {
  const title = titleFromEnWikiUrl(wikiUrl);
  if (!title || typeof fetchFn !== 'function') return null;

  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, '_')
  )}`;

  try {
    const signal =
      typeof AbortSignal !== 'undefined' &&
      typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : undefined;
    const res = await fetchFn(apiUrl, {
      headers: { 'User-Agent': DEFAULT_UA },
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const src = data?.thumbnail?.source;
    if (typeof src !== 'string' || !src.startsWith('https://')) return null;
    return src;
  } catch {
    return null;
  }
}
