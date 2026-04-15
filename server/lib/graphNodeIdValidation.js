/**
 * Node ids must be unique within a single saved graph; the same id string may appear
 * in different Graph documents (e.g. merged analyze namespaces).
 *
 * @param {{ id: unknown }[]} nodes
 * @returns {string[]} duplicate ids (stable order, each id listed once)
 */
export function duplicateNodeIdsInGraph(nodes) {
  if (!Array.isArray(nodes)) return [];
  const seen = new Set();
  const dups = new Set();
  for (const n of nodes) {
    const id = String(n?.id ?? '');
    if (id === '') continue;
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return [...dups];
}
