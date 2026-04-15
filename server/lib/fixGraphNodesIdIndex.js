import Graph from '../models/graph.js';

/**
 * Mongo previously used `unique: true` on sub-schema `nodes.id`, which created a
 * multikey **unique** index — the same node id could not exist on two different
 * saved graphs (E11000 on save). Drop that index if present; then align indexes
 * with the current schema (non-unique `nodes.id` for queries).
 */
export async function fixGraphNodesIdUniqueIndex() {
  const coll = Graph.collection;
  const indexes = await coll.indexes();
  for (const idx of indexes) {
    const key = idx.key || {};
    if (key['nodes.id'] === 1 && idx.unique) {
      await coll.dropIndex(idx.name);
      console.log(
        `[graphs] Dropped unique index "${idx.name}" on nodes.id (ids are unique per graph only)`
      );
    }
  }
  await Graph.syncIndexes();
}
