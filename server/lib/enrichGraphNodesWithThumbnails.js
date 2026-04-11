import { fetchWikipediaThumbnailUrl } from './wikipediaThumbnail.js';

/**
 * Add optional {@code thumbnailUrl} on each node that has {@code wikiUrl} by calling
 * the Wikipedia REST summary API (see {@link ./wikipediaThumbnail.js}).
 * Skips nodes that already have {@code thumbnailUrl}. Runs sequentially to reduce rate-limit risk.
 *
 * @param {{ nodes?: unknown[] }} graphData
 * @param {typeof fetch} [fetchFn=globalThis.fetch]
 */
export async function enrichGraphNodesWithThumbnails(
  graphData,
  fetchFn = globalThis.fetch
) {
  if (!graphData || !Array.isArray(graphData.nodes) || graphData.nodes.length === 0) {
    return graphData;
  }

  const out = [];

  for (const node of graphData.nodes) {
    if (!node || typeof node !== 'object') {
      out.push(node);
      continue;
    }
    if (node.thumbnailUrl) {
      out.push(node);
      continue;
    }
    const wikiUrl =
      typeof node.wikiUrl === 'string'
        ? node.wikiUrl.trim()
        : typeof node.wikipediaUrl === 'string'
          ? node.wikipediaUrl.trim()
          : '';
    if (!wikiUrl || !wikiUrl.startsWith('https://')) {
      out.push(node);
      continue;
    }
    try {
      const thumb = await fetchWikipediaThumbnailUrl(wikiUrl, fetchFn);
      out.push(thumb ? { ...node, thumbnailUrl: thumb } : node);
    } catch (err) {
      console.error('enrichGraphNodesWithThumbnails: node failed', node?.id, err);
      out.push(node);
    }
  }

  return { ...graphData, nodes: out };
}
