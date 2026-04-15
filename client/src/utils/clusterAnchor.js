import { isSafeThumbnailUrlForTooltip } from './safeThumbnailUrl';

function linkEndpointId(x) {
  if (x && typeof x === 'object') return String(x.id ?? x);
  return String(x);
}

/**
 * Pick an “anchor node” to represent a community/cluster.
 * Default heuristic: highest degree centrality within the community (count links where both
 * endpoints are in the community). Tie-breakers: has thumbnail, then shorter label, then id.
 *
 * @param {{ nodes?: Array<{ id: string, label?: string, thumbnailUrl?: string }> }} community
 * @param {Array<{ source: any, target: any }>} links
 * @returns {{ node: any | null, degreeMap: Map<string, number> }}
 */
export function pickCommunityAnchorNode(community, links) {
  const nodes = Array.isArray(community?.nodes) ? community.nodes : [];
  if (!nodes.length) return { node: null, degreeMap: new Map() };

  const idSet = new Set(nodes.map((n) => String(n.id)));
  const deg = new Map();
  for (const id of idSet) deg.set(id, 0);

  const edgeList = Array.isArray(links) ? links : [];
  for (const l of edgeList) {
    const s = linkEndpointId(l?.source);
    const t = linkEndpointId(l?.target);
    if (!idSet.has(s) || !idSet.has(t)) continue;
    deg.set(s, (deg.get(s) || 0) + 1);
    deg.set(t, (deg.get(t) || 0) + 1);
  }

  const sorted = [...nodes].sort((a, b) => {
    const aid = String(a.id);
    const bid = String(b.id);
    const da = deg.get(aid) || 0;
    const db = deg.get(bid) || 0;
    if (db !== da) return db - da;

    const aThumb = isSafeThumbnailUrlForTooltip(a.thumbnailUrl) ? 1 : 0;
    const bThumb = isSafeThumbnailUrlForTooltip(b.thumbnailUrl) ? 1 : 0;
    if (bThumb !== aThumb) return bThumb - aThumb;

    const al = String(a.label || '').trim().length;
    const bl = String(b.label || '').trim().length;
    if (al !== bl) return al - bl;

    return aid.localeCompare(bid);
  });

  return { node: sorted[0] || null, degreeMap: deg };
}

