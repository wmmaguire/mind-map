/**
 * Growth budgets + dry-run preview for POST /api/generate-node (GitHub #37, #62).
 */

const DEFAULT_MAX_EXPANSION_CYCLES = 10;
const DEFAULT_MAX_CONNECTIONS_PER_NEW_NODE = 12;

/** Optional user guidance string on POST /api/generate-node (step 1 + step 2 prompts). */
export const MAX_GENERATION_CONTEXT_CHARS = 2000;

export function getRandomizedExpansionCaps() {
  const maxCycles = clampInt(
    process.env.GENERATE_NODE_MAX_EXPANSION_CYCLES,
    1,
    50,
    DEFAULT_MAX_EXPANSION_CYCLES
  );
  const maxConnectionsPerNewNode = clampInt(
    process.env.GENERATE_NODE_MAX_CONNECTIONS_PER_NEW_NODE,
    1,
    30,
    DEFAULT_MAX_CONNECTIONS_PER_NEW_NODE
  );
  return { maxCycles, maxConnectionsPerNewNode };
}

export function getGenerateNodeCaps() {
  const maxNewNodes = clampInt(
    process.env.GENERATE_NODE_MAX_NEW_NODES,
    1,
    20,
    5
  );
  const maxSelected = clampInt(
    process.env.GENERATE_NODE_MAX_SELECTED,
    1,
    50,
    12
  );
  return { maxNewNodes, maxSelected };
}

function clampInt(raw, min, max, fallback) {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @returns {{ ok: true, dryRun: boolean, numNodes: number, selectedNodes: object[], caps: object } | { ok: false, status: number, code: string, error: string, details?: object }}
 */
export function validateGenerateNodeRequest(body) {
  const caps = getGenerateNodeCaps();

  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      error: 'Request body required'
    };
  }

  const dryRun =
    body.dryRun === true ||
    body.dryRun === 1 ||
    body.dryRun === '1' ||
    body.dryRun === 'true';

  let existingGraphNodes = [];
  if (body.existingGraphNodes !== undefined && body.existingGraphNodes !== null) {
    if (!Array.isArray(body.existingGraphNodes)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_EXISTING_GRAPH_NODES',
        error: 'existingGraphNodes must be an array'
      };
    }
    if (body.existingGraphNodes.length > 2000) {
      return {
        ok: false,
        status: 400,
        code: 'EXISTING_GRAPH_NODES_TOO_LARGE',
        error: 'existingGraphNodes cannot exceed 2000 entries',
        details: { max: 2000 }
      };
    }
    for (let i = 0; i < body.existingGraphNodes.length; i += 1) {
      const n = body.existingGraphNodes[i];
      if (!n || typeof n !== 'object') {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_EXISTING_GRAPH_NODE',
          error: `existingGraphNodes[${i}] must be an object`
        };
      }
      if (n.id === undefined || n.id === null) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_EXISTING_GRAPH_NODE',
          error: `existingGraphNodes[${i}] must have an id`
        };
      }
      if (typeof n.label !== 'string') {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_EXISTING_GRAPH_NODE',
          error: `existingGraphNodes[${i}] must have a string label`
        };
      }
    }
    existingGraphNodes = body.existingGraphNodes;
  }

  let generationContext = '';
  if (body.generationContext !== undefined && body.generationContext !== null) {
    if (typeof body.generationContext !== 'string') {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_GENERATION_CONTEXT',
        error: 'generationContext must be a string'
      };
    }
    const trimmed = body.generationContext.trim();
    if (trimmed.length > MAX_GENERATION_CONTEXT_CHARS) {
      return {
        ok: false,
        status: 400,
        code: 'GENERATION_CONTEXT_TOO_LONG',
        error: `generationContext cannot exceed ${MAX_GENERATION_CONTEXT_CHARS} characters`,
        details: { max: MAX_GENERATION_CONTEXT_CHARS }
      };
    }
    generationContext = trimmed;
  }

  const expansionAlgorithm =
    body.expansionAlgorithm === 'randomizedGrowth'
      ? 'randomizedGrowth'
      : 'manual';

  // Manual mode expands from highlighted anchors (required).
  // Randomized growth mode can run without highlights (optional).
  const selectedNodesRaw = body.selectedNodes;
  const selectedNodes =
    Array.isArray(selectedNodesRaw) ? selectedNodesRaw : [];

  if (expansionAlgorithm === 'manual') {
    if (!Array.isArray(selectedNodesRaw) || selectedNodes.length === 0) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_SELECTED_NODES',
        error: 'selectedNodes must be a non-empty array'
      };
    }
  }

  if (selectedNodes.length > 0) {
    if (selectedNodes.length > caps.maxSelected) {
      return {
        ok: false,
        status: 400,
        code: 'TOO_MANY_SELECTED',
        error: `At most ${caps.maxSelected} highlighted nodes allowed for generation`,
        details: { max: caps.maxSelected }
      };
    }

    for (let i = 0; i < selectedNodes.length; i += 1) {
      const n = selectedNodes[i];
      if (!n || typeof n !== 'object' || n.id === undefined || n.id === null) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_SELECTED_NODE',
          error: 'Each selected node must be an object with an id'
        };
      }
    }
  }

  let numNodes = body.numNodes;
  if (numNodes === undefined || numNodes === null || numNodes === '') {
    numNodes = 3;
  }
  const parsed = parseInt(numNodes, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_NUM_NODES',
      error: 'numNodes must be an integer >= 1'
    };
  }
  if (parsed > caps.maxNewNodes) {
    return {
      ok: false,
      status: 400,
      code: 'NUM_NODES_OVER_CAP',
      error: `numNodes cannot exceed ${caps.maxNewNodes}`,
      details: { max: caps.maxNewNodes }
    };
  }

  const expCaps = getRandomizedExpansionCaps();

  let connectionsPerNewNode = null;
  let numCycles = null;
  let existingGraphNodeIds = null;
  let anchorStrategy = 0;
  let enableDeletions = false;
  let deletionsPerCycle = 0;
  let deleteStrategy = 0;
  let existingGraphLinks = [];

  if (expansionAlgorithm === 'randomizedGrowth') {
    const cpn = parseInt(body.connectionsPerNewNode, 10);
    if (!Number.isFinite(cpn) || cpn < 1) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_CONNECTIONS_PER_NEW_NODE',
        error: `connectionsPerNewNode must be an integer between 1 and ${expCaps.maxConnectionsPerNewNode}`,
        details: { max: expCaps.maxConnectionsPerNewNode }
      };
    }
    if (cpn > expCaps.maxConnectionsPerNewNode) {
      return {
        ok: false,
        status: 400,
        code: 'CONNECTIONS_PER_NODE_OVER_CAP',
        error: `connectionsPerNewNode cannot exceed ${expCaps.maxConnectionsPerNewNode}`,
        details: { max: expCaps.maxConnectionsPerNewNode }
      };
    }
    connectionsPerNewNode = cpn;

    let nc = body.numCycles;
    if (nc === undefined || nc === null || nc === '') {
      nc = 1;
    } else {
      nc = parseInt(nc, 10);
    }
    if (!Number.isFinite(nc) || nc < 1 || nc > expCaps.maxCycles) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_NUM_CYCLES',
        error: `numCycles must be an integer between 1 and ${expCaps.maxCycles}`,
        details: { max: expCaps.maxCycles }
      };
    }
    numCycles = nc;

    const rawStrat = Number(body.anchorStrategy);
    if (body.anchorStrategy !== undefined && body.anchorStrategy !== null && body.anchorStrategy !== '') {
      if (!Number.isFinite(rawStrat) || rawStrat < -1 || rawStrat > 1) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_ANCHOR_STRATEGY',
          error: 'anchorStrategy must be a number between -1 and 1',
        };
      }
      anchorStrategy = rawStrat;
    }

    enableDeletions =
      body.enableDeletions === true ||
      body.enableDeletions === 1 ||
      body.enableDeletions === '1' ||
      body.enableDeletions === 'true';

    if (enableDeletions) {
      const dpc = parseInt(body.deletionsPerCycle, 10);
      if (!Number.isFinite(dpc) || dpc < 1 || dpc > 8) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_DELETIONS_PER_CYCLE',
          error: 'deletionsPerCycle must be an integer between 1 and 8 when enableDeletions is true',
        };
      }
      deletionsPerCycle = dpc;
    }

    const rawDelStrat = body.deleteStrategy;
    if (
      rawDelStrat !== undefined &&
      rawDelStrat !== null &&
      rawDelStrat !== ''
    ) {
      const ds = Number(rawDelStrat);
      if (!Number.isFinite(ds) || ds < -1 || ds > 1) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_DELETE_STRATEGY',
          error: 'deleteStrategy must be a number between -1 and 1',
        };
      }
      deleteStrategy = ds;
    } else {
      /** Inverted from attachment (#68): hub-biased attach → leaf-biased prune, and vice versa. */
      deleteStrategy = -anchorStrategy;
    }

    if (body.existingGraphLinks !== undefined && body.existingGraphLinks !== null) {
      if (!Array.isArray(body.existingGraphLinks)) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_EXISTING_GRAPH_LINKS',
          error: 'existingGraphLinks must be an array',
        };
      }
      if (body.existingGraphLinks.length > 20000) {
        return {
          ok: false,
          status: 400,
          code: 'EXISTING_GRAPH_LINKS_TOO_LARGE',
          error: 'existingGraphLinks cannot exceed 20000 entries',
        };
      }
      for (let i = 0; i < body.existingGraphLinks.length; i += 1) {
        const l = body.existingGraphLinks[i];
        if (!l || typeof l !== 'object') {
          return {
            ok: false,
            status: 400,
            code: 'INVALID_EXISTING_GRAPH_LINK',
            error: `existingGraphLinks[${i}] must be an object with source and target`,
          };
        }
        const s =
          typeof l.source === 'object' && l.source != null
            ? l.source.id
            : l.source;
        const t =
          typeof l.target === 'object' && l.target != null
            ? l.target.id
            : l.target;
        if (s == null || t == null || String(s) === '' || String(t) === '') {
          return {
            ok: false,
            status: 400,
            code: 'INVALID_EXISTING_GRAPH_LINK',
            error: `existingGraphLinks[${i}] must have non-empty source and target`,
          };
        }
      }
      existingGraphLinks = body.existingGraphLinks;
    }

    if (!dryRun) {
      const ids = body.existingGraphNodeIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        return {
          ok: false,
          status: 400,
          code: 'MISSING_EXISTING_GRAPH_NODE_IDS',
          error:
            'existingGraphNodeIds must be a non-empty array when using randomizedGrowth'
        };
      }
      existingGraphNodeIds = ids.map(id => String(id));
      const idSet = new Set(existingGraphNodeIds);
      for (let i = 0; i < selectedNodes.length; i += 1) {
        const sid = String(selectedNodes[i].id);
        if (!idSet.has(sid)) {
          return {
            ok: false,
            status: 400,
            code: 'EXISTING_IDS_MISSING_SELECTED',
            error:
              'existingGraphNodeIds must include every highlighted (selected) node id',
            details: { missingSelectedId: sid }
          };
        }
      }
      if (existingGraphNodeIds.length < connectionsPerNewNode) {
        return {
          ok: false,
          status: 400,
          code: 'INSUFFICIENT_GRAPH_FOR_ATTACHMENT',
          error: `Need at least ${connectionsPerNewNode} graph nodes to satisfy connectionsPerNewNode`,
          details: { minNodes: connectionsPerNewNode }
        };
      }

      const minNodesAfterPrune = Math.max(connectionsPerNewNode + 2, 4);
      if (enableDeletions) {
        if (existingGraphNodeIds.length - deletionsPerCycle < minNodesAfterPrune) {
          return {
            ok: false,
            status: 400,
            code: 'PRUNE_GRAPH_TOO_SMALL',
            error: `Graph is too small to delete ${deletionsPerCycle} node(s) per cycle (need at least ${minNodesAfterPrune} nodes after pruning; currently ${existingGraphNodeIds.length})`,
            details: { minNodesAfterPrune, current: existingGraphNodeIds.length }
          };
        }
        const anchorCount = new Set(selectedNodes.map((n) => String(n.id))).size;
        const deletable = existingGraphNodeIds.length - anchorCount;
        if (deletable < deletionsPerCycle) {
          return {
            ok: false,
            status: 400,
            code: 'INSUFFICIENT_NODES_FOR_PRUNE',
            error: 'Not enough non-anchor nodes to satisfy deletionsPerCycle',
            details: { deletable, deletionsPerCycle }
          };
        }
      }
    }
  }

  return {
    ok: true,
    dryRun,
    numNodes: parsed,
    selectedNodes,
    caps,
    expansionAlgorithm,
    existingGraphNodes,
    generationContext,
    ...(expansionAlgorithm === 'randomizedGrowth'
      ? {
          connectionsPerNewNode,
          numCycles,
          anchorStrategy,
          enableDeletions,
          deletionsPerCycle,
          deleteStrategy,
          existingGraphLinks,
          ...(existingGraphNodeIds ? { existingGraphNodeIds } : {})
        }
      : {})
  };
}

export function buildGenerateNodeDryRunPreview(v) {
  const { numNodes, selectedNodes, caps } = v;
  const selectedCount = selectedNodes.length;

  if (v.expansionAlgorithm === 'randomizedGrowth') {
    const nc = v.numCycles ?? 1;
    const cpn = v.connectionsPerNewNode;
    const expCaps = getRandomizedExpansionCaps();
    return {
      generationContextIncluded: Boolean(v.generationContext),
      generationContextMaxChars: MAX_GENERATION_CONTEXT_CHARS,
      expansionAlgorithm: 'randomizedGrowth',
      numNodesPerCycle: numNodes,
      numCycles: nc,
      connectionsPerNewNode: cpn,
      anchorStrategy: v.anchorStrategy ?? 0,
      enableDeletions: Boolean(v.enableDeletions),
      deletionsPerCycle: v.enableDeletions ? (v.deletionsPerCycle ?? 0) : 0,
      deleteStrategy: v.deleteStrategy ?? -(v.anchorStrategy ?? 0),
      existingGraphLinksIncluded: Array.isArray(v.existingGraphLinks) && v.existingGraphLinks.length > 0,
      selectedCount,
      estimatedTotalNewNodes: numNodes * nc,
      estimatedNewLinks: numNodes * nc * cpn,
      attachmentRule:
        (v.anchorStrategy ?? 0) === 0
          ? 'Uniform random attachment to nodes present before each new node’s links (same batch grows the pool in API response order).'
          : 'Degree-biased attachment (send existingGraphLinks for local degree; slider -1 = low-degree bias, +1 = high-degree bias).',
      caps: {
        maxNewNodes: caps.maxNewNodes,
        maxSelected: caps.maxSelected,
        maxCycles: expCaps.maxCycles,
        maxConnectionsPerNewNode: expCaps.maxConnectionsPerNewNode
      }
    };
  }

  return {
    generationContextIncluded: Boolean(v.generationContext),
    generationContextMaxChars: MAX_GENERATION_CONTEXT_CHARS,
    expansionAlgorithm: 'manual',
    numNodes,
    selectedCount,
    estimatedNewLinks: numNodes * selectedCount,
    caps: {
      maxNewNodes: caps.maxNewNodes,
      maxSelected: caps.maxSelected
    }
  };
}
