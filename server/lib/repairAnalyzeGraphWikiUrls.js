/**
 * Normalize and validate English Wikipedia URLs on analyze graphs; repair broken
 * URLs via opensearch when possible.
 */

import { fetchWikipediaExtract, titleFromEnWikiUrl } from './wikipediaExtract.js';

const DEFAULT_UA =
  'mind-map/1.0 (https://github.com/wmmaguire/mind-map; contact via repo)';

/**
 * Best-effort normalization: https, canonical host, trim.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeEnWikiUrlString(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    if (s.startsWith('//')) s = `https:${s}`;
    else if (/^en\.wikipedia\.org/i.test(s)) s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (!u.hostname.endsWith('wikipedia.org')) return s;
    if (u.hostname.toLowerCase() === 'en.m.wikipedia.org') {
      u.hostname = 'en.wikipedia.org';
    }
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return s;
  }
}

/**
 * @param {string} search
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<string|null>} First matching article URL or null
 */
export async function wikipediaOpensearchFirstUrl(search, fetchFn = globalThis.fetch) {
  if (typeof search !== 'string' || !search.trim() || typeof fetchFn !== 'function') {
    return null;
  }
  const q = search.trim().slice(0, 280);
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
    q
  )}&limit=5&namespace=0&format=json`;
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : undefined;
    const res = await fetchFn(apiUrl, {
      headers: { 'User-Agent': DEFAULT_UA },
      ...(signal ? { signal } : {})
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 4) return null;
    const urls = data[3];
    if (!Array.isArray(urls) || urls.length === 0) return null;
    const first = urls[0];
    return typeof first === 'string' && first.includes('en.wikipedia.org/wiki/')
      ? normalizeEnWikiUrlString(first)
      : null;
  } catch {
    return null;
  }
}

function fallbackUrlFromLabel(label) {
  if (typeof label !== 'string') return '';
  const t = label.trim().slice(0, 200);
  if (!t) return '';
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/\s+/g, '_'))}`;
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchFn
 * @returns {Promise<boolean>} True if REST summary returns usable content
 */
async function wikiUrlLooksValid(url, fetchFn) {
  if (!url || !titleFromEnWikiUrl(url)) return false;
  const r = await fetchWikipediaExtract(url, fetchFn);
  return Boolean(
    r &&
      !r.error &&
      typeof r.extract === 'string' &&
      r.extract.length > 0
  );
}

/**
 * @param {object} node
 * @param {typeof fetch} fetchFn
 * @returns {Promise<object>}
 */
async function repairOneNodeWikiUrl(node, fetchFn) {
  const label = typeof node.label === 'string' ? node.label : String(node.id ?? '');
  let candidate = normalizeEnWikiUrlString(
    typeof node.wikiUrl === 'string' ? node.wikiUrl : ''
  );

  if (candidate && (await wikiUrlLooksValid(candidate, fetchFn))) {
    return { ...node, wikiUrl: candidate };
  }

  let fromSearch = await wikipediaOpensearchFirstUrl(label, fetchFn);
  if (fromSearch && (await wikiUrlLooksValid(fromSearch, fetchFn))) {
    return { ...node, wikiUrl: fromSearch };
  }

  const shortLabel = label.split(/[,:]/)[0].trim();
  if (shortLabel.length >= 2 && shortLabel !== label) {
    fromSearch = await wikipediaOpensearchFirstUrl(shortLabel, fetchFn);
    if (fromSearch && (await wikiUrlLooksValid(fromSearch, fetchFn))) {
      return { ...node, wikiUrl: fromSearch };
    }
  }

  const fb = fallbackUrlFromLabel(label);
  if (fb && (await wikiUrlLooksValid(fb, fetchFn))) {
    return { ...node, wikiUrl: fb };
  }

  const resolved =
    (fromSearch && titleFromEnWikiUrl(fromSearch) ? fromSearch : null) ||
    (candidate && titleFromEnWikiUrl(candidate) ? candidate : null) ||
    fb ||
    candidate;
  return { ...node, wikiUrl: resolved || fb };
}

/**
 * Validates and repairs wikiUrl on each node (English Wikipedia).
 * @param {{ nodes?: object[], links?: object[] }} graphData
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ nodes: object[], links: object[] }>}
 */
export async function repairAnalyzeGraphWikiUrls(graphData, fetchFn = globalThis.fetch) {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : [];
  const links = Array.isArray(graphData?.links) ? graphData.links : [];
  const repairedNodes = [];
  for (let i = 0; i < nodes.length; i += 1) {
    repairedNodes.push(await repairOneNodeWikiUrl(nodes[i], fetchFn));
  }
  return { ...graphData, nodes: repairedNodes, links };
}
