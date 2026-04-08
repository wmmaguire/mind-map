/**
 * Merge POST /api/generate-node `data` into the current graph (positions + link objects).
 */

export function mergeGenerateNodeResponse(currentData, generatedPatch, width, height) {
  const nodeMap = new Map();

  currentData.nodes.forEach(node => {
    const stringId = String(node.id);
    nodeMap.set(stringId, { ...node, id: stringId });
  });

  const baseX = currentData.nodes[0]?.x ?? width / 2;
  const baseY = currentData.nodes[0]?.y ?? height / 2;
  const mergeTimestamp = Date.now();

  generatedPatch.nodes.forEach(node => {
    const processedNode = {
      ...node,
      x: baseX + (Math.random() - 0.5) * 200,
      y: baseY + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      timestamp: node.timestamp ?? mergeTimestamp
    };
    nodeMap.set(String(node.id), processedNode);
  });

  const processedLinks = currentData.links.map(link => {
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
  });

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
      processedLinks.push({
        source: sourceNode,
        target: targetNode,
        relationship: link.relationship,
        timestamp: link.timestamp ?? mergeTimestamp
      });
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    links: processedLinks
  };
}
