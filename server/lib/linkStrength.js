/**
 * Link strength scoring (GitHub #80).
 *
 * v1 heuristic: cheap, deterministic, no OpenAI calls.
 * - Uses relationship text length and token overlap between relationship and node label/description.
 * - Always clamps to [0,1].
 */

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
  'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it',
  'its', 'of', 'on', 'or', 'that', 'the', 'their', 'to',
  'was', 'were', 'with', 'within', 'without',
]);

function clamp01(x) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

function tokenize(s) {
  if (!s || typeof s !== 'string') return [];
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOP.has(t));
}

function linkEndpointId(x) {
  if (x && typeof x === 'object') return String(x.id ?? x);
  return String(x);
}

export function scoreLinkStrength({ sourceNode, targetNode, relationship }) {
  const rel = typeof relationship === 'string' ? relationship.trim() : '';
  const relTokens = new Set(tokenize(rel));

  const aText = `${sourceNode?.label || ''} ${sourceNode?.description || ''}`;
  const bText = `${targetNode?.label || ''} ${targetNode?.description || ''}`;
  const abTokens = new Set([...tokenize(aText), ...tokenize(bText)]);

  let overlap = 0;
  for (const t of relTokens) {
    if (abTokens.has(t)) overlap += 1;
  }
  const overlapScore =
    relTokens.size === 0 ? 0 : Math.min(1, overlap / Math.min(6, relTokens.size));

  const relLenScore = Math.min(1, rel.length / 80); // 0..1
  const hasDescScore =
    (typeof sourceNode?.description === 'string' && sourceNode.description.trim())
      || (typeof targetNode?.description === 'string' && targetNode.description.trim())
      ? 1
      : 0;

  // Base + weighted features. Keep baseline away from 0/1 extremes.
  const raw = 0.18 + 0.36 * overlapScore + 0.34 * relLenScore + 0.12 * hasDescScore;
  return clamp01(raw);
}

/**
 * Ensure every link in graph has numeric strength in [0,1].
 * If a link already has a finite numeric strength, it is clamped and preserved.
 */
export function ensureGraphLinkStrength(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph?.links) ? graph.links : [];
  const nodeById = new Map(nodes.map(n => [String(n.id), n]));

  const outLinks = links.map((l) => {
    const s = linkEndpointId(l?.source);
    const t = linkEndpointId(l?.target);
    const sourceNode = nodeById.get(s);
    const targetNode = nodeById.get(t);

    const existing = l?.strength;
    const strength =
      typeof existing === 'number' && Number.isFinite(existing)
        ? clamp01(existing)
        : scoreLinkStrength({
          sourceNode,
          targetNode,
          relationship: l?.relationship,
        });

    return {
      ...l,
      strength,
    };
  });

  return { ...graph, links: outLinks };
}

