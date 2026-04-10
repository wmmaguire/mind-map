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
