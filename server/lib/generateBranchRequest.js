/**
 * Validation + dry-run for POST /api/generate-branch (GitHub #82).
 */

import {
  MAX_GENERATION_CONTEXT_CHARS,
  getGenerateNodeCaps
} from './generateNodeBudget.js';

function clampInt(raw, min, max, fallback) {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getGenerateBranchCaps() {
  const nodeCaps = getGenerateNodeCaps();
  const maxIterations = clampInt(
    process.env.GENERATE_BRANCH_MAX_ITERATIONS,
    1,
    20,
    10
  );
  const maxTotalNewNodes = clampInt(
    process.env.GENERATE_BRANCH_MAX_TOTAL_NEW_NODES,
    1,
    80,
    Math.min(40, maxIterations * nodeCaps.maxNewNodes)
  );
  return {
    maxIterations,
    maxNodesPerIteration: nodeCaps.maxNewNodes,
    maxTotalNewNodes,
    maxMemoryK: 40,
    maxCrossLinksPerIteration: 6
  };
}

function linkEndpointIds(l) {
  const s =
    l && typeof l.source === 'object' && l.source != null
      ? String(l.source.id)
      : String(l?.source ?? '');
  const t =
    l && typeof l.target === 'object' && l.target != null
      ? String(l.target.id)
      : String(l?.target ?? '');
  return { s, t };
}

/** True if each consecutive pair in pathNodeIds has at least one undirected edge in links. */
export function pathHasGraphEdges(pathNodeIds, links) {
  if (!Array.isArray(links) || links.length === 0) return false;
  for (let i = 0; i < pathNodeIds.length - 1; i += 1) {
    const a = String(pathNodeIds[i]);
    const b = String(pathNodeIds[i + 1]);
    const ok = links.some(l => {
      const { s, t } = linkEndpointIds(l);
      return (s === a && t === b) || (s === b && t === a);
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * @returns {{ ok: true, ...validated fields, caps } | { ok: false, status, code, error, details? }}
 */
export function validateGenerateBranchRequest(body) {
  const caps = getGenerateBranchCaps();

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
  if (!Array.isArray(body.existingGraphNodes)) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_EXISTING_GRAPH_NODES',
      error: 'existingGraphNodes must be a non-empty array'
    };
  }
  if (body.existingGraphNodes.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_EXISTING_GRAPH_NODES',
      error: 'existingGraphNodes must be a non-empty array'
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
    if (!n || typeof n !== 'object' || n.id == null) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_EXISTING_GRAPH_NODE',
        error: `existingGraphNodes[${i}] must be an object with id`
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

  const idSet = new Set(existingGraphNodes.map(n => String(n.id)));

  let existingGraphLinks = [];
  if (body.existingGraphLinks != null) {
    if (!Array.isArray(body.existingGraphLinks)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_EXISTING_GRAPH_LINKS',
        error: 'existingGraphLinks must be an array when provided'
      };
    }
    for (let i = 0; i < body.existingGraphLinks.length; i += 1) {
      const e = body.existingGraphLinks[i];
      if (!e || typeof e !== 'object') {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_EXISTING_GRAPH_LINK',
          error: `existingGraphLinks[${i}] must be an object`
        };
      }
      if (e.source == null || e.target == null) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_EXISTING_GRAPH_LINK',
          error: `existingGraphLinks[${i}] must have source and target`
        };
      }
    }
    existingGraphLinks = body.existingGraphLinks;
  }

  const branch = body.branch;
  if (!branch || typeof branch !== 'object') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BRANCH',
      error: 'branch must be an object with pathNodeIds'
    };
  }
  if (!Array.isArray(branch.pathNodeIds) || branch.pathNodeIds.length < 2) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BRANCH_PATH',
      error: 'branch.pathNodeIds must be an array of at least two node ids (ordered along edges)'
    };
  }
  const pathNodeIds = branch.pathNodeIds.map(id => String(id));
  for (const id of pathNodeIds) {
    if (!idSet.has(id)) {
      return {
        ok: false,
        status: 400,
        code: 'BRANCH_PATH_UNKNOWN_NODE',
        error: `branch path references unknown node id: ${id}`,
        details: { id }
      };
    }
  }
  if (!pathHasGraphEdges(pathNodeIds, existingGraphLinks)) {
    return {
      ok: false,
      status: 400,
      code: 'BRANCH_PATH_NOT_CONNECTED',
      error:
        'Each consecutive pair in branch.pathNodeIds must be linked in existingGraphLinks (undirected)',
      details: { pathNodeIds }
    };
  }

  let iterations = body.iterations;
  if (iterations === undefined || iterations === null || iterations === '') {
    iterations = 2;
  }
  const iterN = parseInt(iterations, 10);
  if (!Number.isFinite(iterN) || iterN < 1) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ITERATIONS',
      error: 'iterations must be an integer >= 1'
    };
  }
  if (iterN > caps.maxIterations) {
    return {
      ok: false,
      status: 400,
      code: 'ITERATIONS_OVER_CAP',
      error: `iterations cannot exceed ${caps.maxIterations}`,
      details: { max: caps.maxIterations }
    };
  }

  let memoryK = body.memoryK;
  if (memoryK === undefined || memoryK === null || memoryK === '') {
    memoryK = Math.min(4, pathNodeIds.length);
  }
  const memN = parseInt(memoryK, 10);
  if (!Number.isFinite(memN) || memN < 1) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_MEMORY_K',
      error: 'memoryK must be an integer >= 1'
    };
  }
  if (memN > caps.maxMemoryK) {
    return {
      ok: false,
      status: 400,
      code: 'MEMORY_K_OVER_CAP',
      error: `memoryK cannot exceed ${caps.maxMemoryK}`,
      details: { max: caps.maxMemoryK }
    };
  }

  let nodesPerIteration = body.nodesPerIteration;
  if (
    nodesPerIteration === undefined ||
    nodesPerIteration === null ||
    nodesPerIteration === ''
  ) {
    nodesPerIteration = 2;
  }
  const npi = parseInt(nodesPerIteration, 10);
  if (!Number.isFinite(npi) || npi < 1) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_NODES_PER_ITERATION',
      error: 'nodesPerIteration must be an integer >= 1'
    };
  }
  if (npi > caps.maxNodesPerIteration) {
    return {
      ok: false,
      status: 400,
      code: 'NODES_PER_ITERATION_OVER_CAP',
      error: `nodesPerIteration cannot exceed ${caps.maxNodesPerIteration}`,
      details: { max: caps.maxNodesPerIteration }
    };
  }

  let crossLinksPerIteration = body.crossLinksPerIteration;
  if (
    crossLinksPerIteration === undefined ||
    crossLinksPerIteration === null ||
    crossLinksPerIteration === ''
  ) {
    crossLinksPerIteration = 0;
  }
  const cli = parseInt(crossLinksPerIteration, 10);
  if (!Number.isFinite(cli) || cli < 0) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CROSS_LINKS',
      error: 'crossLinksPerIteration must be a non-negative integer'
    };
  }
  if (cli > caps.maxCrossLinksPerIteration) {
    return {
      ok: false,
      status: 400,
      code: 'CROSS_LINKS_OVER_CAP',
      error: `crossLinksPerIteration cannot exceed ${caps.maxCrossLinksPerIteration}`,
      details: { max: caps.maxCrossLinksPerIteration }
    };
  }

  const totalNew = iterN * npi;
  if (totalNew > caps.maxTotalNewNodes) {
    return {
      ok: false,
      status: 400,
      code: 'BRANCH_TOTAL_NEW_NODES_OVER_CAP',
      error: `iterations × nodesPerIteration (${totalNew}) exceeds cap ${caps.maxTotalNewNodes}`,
      details: { maxTotalNewNodes: caps.maxTotalNewNodes, iterations: iterN, nodesPerIteration: npi }
    };
  }

  let generationContext = '';
  if (body.generationContext != null) {
    if (typeof body.generationContext !== 'string') {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_GENERATION_CONTEXT',
        error: 'generationContext must be a string when provided'
      };
    }
    generationContext = body.generationContext.trim();
    if (generationContext.length > MAX_GENERATION_CONTEXT_CHARS) {
      return {
        ok: false,
        status: 400,
        code: 'GENERATION_CONTEXT_TOO_LONG',
        error: `generationContext cannot exceed ${MAX_GENERATION_CONTEXT_CHARS} characters`,
        details: { max: MAX_GENERATION_CONTEXT_CHARS }
      };
    }
  }

  return {
    ok: true,
    dryRun,
    existingGraphNodes,
    existingGraphLinks,
    pathNodeIds,
    iterations: iterN,
    memoryK: memN,
    nodesPerIteration: npi,
    crossLinksPerIteration: cli,
    generationContext,
    caps
  };
}

export function buildGenerateBranchDryRunPreview(validated) {
  return {
    iterations: validated.iterations,
    memoryK: validated.memoryK,
    nodesPerIteration: validated.nodesPerIteration,
    crossLinksPerIteration: validated.crossLinksPerIteration,
    pathNodeIds: validated.pathNodeIds,
    totalNewNodesUpperBound: validated.iterations * validated.nodesPerIteration,
    caps: validated.caps,
    generationContextIncluded: Boolean(validated.generationContext)
  };
}
