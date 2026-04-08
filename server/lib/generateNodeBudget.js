/**
 * Growth budgets + dry-run preview for POST /api/generate-node (GitHub #37).
 */

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

  const { selectedNodes } = body;
  if (!Array.isArray(selectedNodes) || selectedNodes.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_SELECTED_NODES',
      error: 'selectedNodes must be a non-empty array'
    };
  }
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

  return {
    ok: true,
    dryRun,
    numNodes: parsed,
    selectedNodes,
    caps
  };
}

export function buildGenerateNodeDryRunPreview(v) {
  const { numNodes, selectedNodes, caps } = v;
  const selectedCount = selectedNodes.length;
  return {
    numNodes,
    selectedCount,
    estimatedNewLinks: numNodes * selectedCount,
    caps: {
      maxNewNodes: caps.maxNewNodes,
      maxSelected: caps.maxSelected
    }
  };
}
