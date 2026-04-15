/**
 * GitHub #38 — Discovery & navigation: label search helpers (keyword match, not embeddings).
 */

import { zoomIdentity } from 'd3';

/**
 * @param {string} s
 * @returns {string}
 */
export function normalizeGraphLabel(s) {
  if (typeof s !== 'string') return '';
  return s.toLowerCase().trim();
}

/**
 * @param {Array<{ id: string|number, label?: string }>} nodes
 * @param {string} query
 * @returns {Array<{ id: string|number, label?: string }>}
 */
export function nodesMatchingLabelQuery(nodes, query) {
  if (!Array.isArray(nodes) || !query) return [];
  const q = normalizeGraphLabel(query);
  if (!q) return [];
  return nodes.filter(n => normalizeGraphLabel(n.label || '').includes(q));
}

function graphCoordOrFallback(node, fallbackX, fallbackY) {
  const x = node?.x;
  const y = node?.y;
  const xf = typeof x === 'number' && Number.isFinite(x);
  const yf = typeof y === 'number' && Number.isFinite(y);
  if (xf && yf && !(x === 0 && y === 0)) {
    return { x, y };
  }
  return { x: fallbackX, y: fallbackY };
}

/**
 * Map a matched graph node to the coordinates used for “Focus next”.
 * The force layout runs on **community** datums; base `data.nodes` may keep (0,0) placeholders,
 * so we prefer the community that currently contains the node.
 *
 * @param {{ id: string|number, x?: number, y?: number }|null|undefined} node
 * @param {Map<unknown, { nodes?: Array<{ id?: string|number }>, x?: number, y?: number }>|null|undefined} communitiesMap
 * @param {number} fallbackX
 * @param {number} fallbackY
 */
export function discoveryFocusPoint(node, communitiesMap, fallbackX, fallbackY) {
  if (!node) return { x: fallbackX, y: fallbackY };
  const tid = String(node.id);
  if (communitiesMap && typeof communitiesMap.values === 'function') {
    for (const c of communitiesMap.values()) {
      if (!c) continue;
      const inner = c.nodes;
      if (
        Array.isArray(inner) &&
        inner.some((n) => n && String(n.id) === tid)
      ) {
        return graphCoordOrFallback(c, fallbackX, fallbackY);
      }
    }
  }
  return graphCoordOrFallback(node, fallbackX, fallbackY);
}

/**
 * d3.zoomIdentity transform that centers graph point (nx, ny) in the viewport.
 * @param {number} nx
 * @param {number} ny
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {number} scale
 */
export function createFocusZoomTransform(nx, ny, viewportWidth, viewportHeight, scale) {
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1.2;
  const w = viewportWidth > 0 ? viewportWidth : 800;
  const h = viewportHeight > 0 ? viewportHeight : 600;
  return zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-nx, -ny);
}
