/**
 * Merge POST /api/generate-node `data` into the current graph (positions + link objects).
 */

/**
 * @param {{ deletedNodeIds?: string[] }} [opts]
 */
export function mergeGenerateNodeResponse(
  currentData,
  generatedPatch,
  width,
  height,
  opts = {}
) {
  const deleted = new Set((opts.deletedNodeIds || []).map(String));

  const nodeMap = new Map();

  currentData.nodes.forEach(node => {
    const stringId = String(node.id);
    if (deleted.has(stringId)) return;
    nodeMap.set(stringId, { ...node, id: stringId });
  });

  const baseX = currentData.nodes[0]?.x ?? width / 2;
  const baseY = currentData.nodes[0]?.y ?? height / 2;
  let seq = Date.now();
  const bump = () => {
    seq += 1;
    return seq;
  };

  generatedPatch.nodes.forEach(node => {
    const ts =
      (typeof node.createdAt === 'number' && Number.isFinite(node.createdAt))
        ? node.createdAt
        : (typeof node.timestamp === 'number' && Number.isFinite(node.timestamp))
          ? node.timestamp
          : bump();
    const processedNode = {
      ...node,
      x: baseX + (Math.random() - 0.5) * 200,
      y: baseY + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      createdAt: ts,
      timestamp: ts,
    };
    nodeMap.set(String(node.id), processedNode);
  });

  const processedLinks = currentData.links
    .filter(link => {
      const sourceId =
        typeof link.source === 'object'
          ? String(link.source.id)
          : String(link.source);
      const targetId =
        typeof link.target === 'object'
          ? String(link.target.id)
          : String(link.target);
      return !deleted.has(sourceId) && !deleted.has(targetId);
    })
    .map(link => {
      const sourceId =
        typeof link.source === 'object'
          ? String(link.source.id)
          : String(link.source);
      const targetId =
        typeof link.target === 'object'
          ? String(link.target.id)
          : String(link.target);

      return {
        ...link,
        source: nodeMap.get(sourceId),
        target: nodeMap.get(targetId)
      };
    })
    .filter(link => link.source && link.target);

  generatedPatch.links.forEach(link => {
    const sourceId =
      typeof link.source === 'object'
        ? String(link.source.id)
        : String(link.source);
    const targetId =
      typeof link.target === 'object'
        ? String(link.target.id)
        : String(link.target);

    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    if (sourceNode && targetNode) {
      const ts =
        (typeof link.createdAt === 'number' && Number.isFinite(link.createdAt))
          ? link.createdAt
          : (typeof link.timestamp === 'number' && Number.isFinite(link.timestamp))
            ? link.timestamp
            : bump();
      processedLinks.push({
        source: sourceNode,
        target: targetNode,
        relationship: link.relationship,
        ...(typeof link.strength === 'number' && Number.isFinite(link.strength)
          ? { strength: Math.max(0, Math.min(1, link.strength)) }
          : {}),
        createdAt: ts,
        timestamp: ts,
      });
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    links: processedLinks
  };
}
