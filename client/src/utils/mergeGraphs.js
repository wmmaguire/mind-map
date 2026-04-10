/**
 * Multi-file analyze merge — client contract with the backend
 *
 * The server runs **one** `POST /api/analyze` per selected file. Each response is a
 * standalone graph `{ nodes[], links[] }` whose node `id` values are only unique
 * *within that response* (OpenAI often uses small integers or repeated patterns).
 *
 * To combine several responses in the UI, this module **namespaces** every id
 * per source file **before** unioning nodes and links, so graphs from different
 * files never collide. This matches backend semantics: each call gets its own
 * `GraphTransform` / `sourceFiles` linkage; the merged view is a **client-only**
 * aggregate for visualization.
 */

/**
 * @param {object} file - Library file row (`GET /api/files`): may include `filename`, `_id`, `originalName`
 * @returns {string} stable ASCII namespace segment for id remapping
 */
export function buildAnalyzeNamespace(file) {
  if (!file || typeof file !== 'object') {
    return 'file';
  }
  const raw =
    file._id != null && String(file._id).trim() !== ''
      ? String(file._id)
      : String(file.filename ?? file.originalName ?? 'file');
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * @param {string} namespace - from {@link buildAnalyzeNamespace}
 * @param {string|number} id - raw node id from analyze JSON
 * @returns {string}
 */
export function namespacedNodeId(namespace, id) {
  return `${namespace}__${String(id)}`;
}

/**
 * Remap one analyze graph so all node ids and link endpoints are unique under `namespace`.
 *
 * @param {{ nodes?: object[], links?: object[] }} graph
 * @param {string} namespace
 * @returns {{ nodes: object[], links: object[] }}
 */
export function namespaceGraph(graph, namespace) {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rawLinks = Array.isArray(graph?.links) ? graph.links : [];

  const nodes = rawNodes.map((node) => ({
    ...node,
    id: namespacedNodeId(namespace, node.id),
  }));

  const mapEndpoint = (endpoint) => namespacedNodeId(namespace, endpoint);

  const links = rawLinks.map((link) => ({
    ...link,
    source: mapEndpoint(link.source),
    target: mapEndpoint(link.target),
  }));

  return { nodes, links };
}

/**
 * Union graphs that already use disjoint id spaces (e.g. after {@link namespaceGraph}).
 *
 * @param {{ nodes?: object[], links?: object[] }[]} graphs
 * @returns {{ nodes: object[], links: object[] }}
 */
export function unionGraphs(graphs) {
  const nodes = [];
  const links = [];
  for (const g of graphs) {
    if (!g) continue;
    if (Array.isArray(g.nodes)) nodes.push(...g.nodes);
    if (Array.isArray(g.links)) links.push(...g.links);
  }
  return { nodes, links };
}

/**
 * Merge several per-file analyze results into one graph for the library UI.
 *
 * @param {Array<{ namespace: string, graph: { nodes?: object[], links?: object[] } }>} items
 * @returns {{ nodes: object[], links: object[] }}
 */
export function mergeAnalyzedGraphs(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { nodes: [], links: [] };
  }

  /** One clock value for the whole library "Apply" / analyze step so playback treats the batch as a single edit. */
  const batchTime = Date.now();

  const nodes = [];
  const links = [];
  for (const { namespace, graph } of items) {
    const ng = namespaceGraph(graph, namespace);
    for (const node of ng.nodes) {
      nodes.push({ ...node, createdAt: batchTime, timestamp: batchTime });
    }
    for (const link of ng.links) {
      links.push({ ...link, createdAt: batchTime, timestamp: batchTime });
    }
  }
  return { nodes, links };
}
