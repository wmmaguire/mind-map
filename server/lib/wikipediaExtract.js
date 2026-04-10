/**
 * Fetch a short plain-text summary for an English Wikipedia article URL.
 * Used to ground graph expansion prompts in article content (not just titles).
 */

const DEFAULT_UA =
  'mind-map/1.0 (https://github.com/wmmaguire/mind-map; contact via repo)';

export function titleFromEnWikiUrl(url) {
  if (typeof url !== 'string') return null;
  const s = url.trim();
  try {
    const u = new URL(s);
    if (!u.hostname.endsWith('wikipedia.org')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const wikiIdx = parts.indexOf('wiki');
    if (wikiIdx === -1 || wikiIdx === parts.length - 1) return null;
    const encoded = parts.slice(wikiIdx + 1).join('/');
    return decodeURIComponent(encoded.replace(/_/g, ' '));
  } catch {
    return null;
  }
}

/**
 * @param {string} wikiUrl
 * @param {typeof fetch} [fetchFn=globalThis.fetch]
 * @returns {Promise<{ extract: string, title?: string } | { extract: '', error: string }>}
 */
export async function fetchWikipediaExtract(wikiUrl, fetchFn = globalThis.fetch) {
  const title = titleFromEnWikiUrl(wikiUrl);
  if (!title) {
    return { extract: '', error: 'not_a_wikipedia_url' };
  }
  if (typeof fetchFn !== 'function') {
    return { extract: '', error: 'fetch_unavailable' };
  }
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
      ...(signal ? { signal } : {})
    });
    if (!res.ok) {
      return { extract: '', error: `http_${res.status}` };
    }
    const data = await res.json();
    const extract =
      typeof data.extract === 'string'
        ? data.extract.trim()
        : typeof data.description === 'string'
          ? data.description.trim()
          : '';
    const resolvedTitle =
      typeof data.title === 'string' ? data.title : title;
    return { extract, title: resolvedTitle };
  } catch (e) {
    return {
      extract: '',
      error: e?.message || 'fetch_failed'
    };
  }
}

export function normalizeConceptLabel(label) {
  if (typeof label !== 'string') return '';
  return label.toLowerCase().trim().replace(/\s+/g, ' ');
}
